"use client";
import { useEffect, useRef, useState } from "react";
import {
  LayoutDashboard,
  ScanLine,
  Files,
  UploadCloud,
  Settings as SettingsIcon,
  ScrollText,
  Info,
  Search,
  ChevronRight,
  ArrowUpRight,
  Plus,
  FileText,
  Check,
  Clock,
  ArrowRight,
  HardDrive,
  RotateCw,
  RotateCcw,
  Trash2,
  ZoomIn,
  ZoomOut,
  GripVertical,
  RefreshCw,
  Download,
  X,
  Menu,
  LogOut,
  ShieldCheck,
  FolderOpen,
  Layers,
  AlertCircle,
  Printer,
  Crop,
  ArrowLeft,
  Wifi,
  CheckCircle2,
} from "lucide-react";
import {
  Doc,
  Audit,
  Page,
  Settings,
  defaultSettings,
  Status,
  Role,
} from "../lib/types";
import { LoginScreen } from "../components/login-screen";
import { PaperSizeSelect } from "../components/paper-size-select";
import { CatalogSelect } from "../components/catalog-select";
import {
  request,
  restoreSession,
  ApiError,
  clearToken,
  getSessionRevision,
  scannerHeaders,
} from "../lib/api";
import { importPages, rasterize, generatePdf } from "../lib/imaging";
const navigation = [
  ["Dashboard", LayoutDashboard],
  ["Scan", ScanLine],
  ["Documents", Files],
  ["Upload Queue", UploadCloud],
  ["Settings", SettingsIcon],
  ["Logs", ScrollText],
  ["About", Info],
] as const;
const statuses: Record<string, string> = {
  UPLOADED: "Uploaded",
  IN_REVIEW: "In review",
  APPROVED: "Approved",
  ARCHIVED: "Archived",
};
const human = (s: string) =>
  s
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^./, (c) => c.toUpperCase());
const bytes = (n: number) =>
  n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`;
const date = (s: string) =>
  new Date(s).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
type QueueItem = {
  id: string;
  title: string;
  file: Blob;
  checksum: string;
  ocrText: string;
  status: "Pending" | "Uploading" | "Completed" | "Failed";
  progress: number;
  error?: string;
  metadata: any;
  attempts: number;
  documentId?: string;
  sessionId?: string;
};
const emptyMeta = {
  title: "",
  description: "",
  documentType: "201 Files",
  documentNumber: "",
  department: "Human Resources",
  confidentiality: "Internal",
  documentDate: new Date().toISOString().slice(0, 10),
  tags: "",
};
export default function Home() {
  const [view, setView] = useState("Dashboard"),
    [mobile, setMobile] = useState(false),
    [settings, setSettings] = useState<Settings>(defaultSettings),
    [authError, setAuthError] = useState(""),
    [docs, setDocs] = useState<Doc[]>([]),
    [audits, setAudits] = useState<Audit[]>([]),
    [user, setUser] = useState<{ name: string; role: Role } | null>(null),
    [connected, setConnected] = useState(false),
    [scanner, setScanner] = useState(false),
    [toast, setToast] = useState(""),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("All documents"),
    [department, setDepartment] = useState("All departments"),
    [selected, setSelected] = useState<Doc | null>(null),
    [login, setLogin] = useState(false),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [pages, setPages] = useState<Page[]>([]),
    [pageIndex, setPageIndex] = useState(0),
    [zoom, setZoom] = useState(1),
    [ocrProgress, setOcrProgress] = useState(0),
    [ocrRunning, setOcrRunning] = useState(false),
    [ocrStatus, setOcrStatus] = useState(""),
    [ocrTextView, setOcrTextView] = useState("page"),
    [queue, setQueue] = useState<QueueItem[]>([]),
    [metadataOpen, setMetadataOpen] = useState(false),
    [meta, setMeta] = useState(emptyMeta),
    [cropOpen, setCropOpen] = useState(false),
    [crop, setCrop] = useState({ x: 5, y: 5, width: 90, height: 90 }),
    [logQuery, setLogQuery] = useState(""),
    [stats, setStats] = useState<any>(null),
    [users, setUsers] = useState<any[]>([]),
    [documentTypes, setDocumentTypes] = useState<{id: string; name: string}[]>([]),
    [departments, setDepartments] = useState<string[]>([]),
    [newDocumentType, setNewDocumentType] = useState(""),
    [savingDocumentType, setSavingDocumentType] = useState(false),
    [newUser, setNewUser] = useState({
      name: "",
      email: "",
      password: "",
      role: "ENCODER",
    });
  const [editingQueue, setEditingQueue] = useState<string | null>(null),
    [editingDoc, setEditingDoc] = useState<string | null>(null),
    [outputFormat, setOutputFormat] = useState("PDF");
  const fileInput = useRef<HTMLInputElement>(null),
    replaceInput = useRef<HTMLInputElement>(null),
    uploadInput = useRef<HTMLInputElement>(null),
    worker = useRef<any>(null),
    cancelOcr = useRef(false),
    queueBusy = useRef(new Set<string>()),
    localFiles = useRef(new Map<string, Blob>()),
    versionTarget = useRef<string | undefined>(undefined),
    ocrGeneration = useRef(0);
  const notify = (message: string) => setToast(message);
  const [storageConfigured, setStorageConfigured] = useState<boolean | null>(null);
  const [scannerError, setScannerError] = useState("");
  const [reviewingQueue, setReviewingQueue] = useState<string | null>(null);
  const reviewBackup = useRef<{pages: Page[]; index: number} | null>(null);
  async function reviewQueueItem(item: QueueItem) {
    if (busy || ocrRunning || reviewingQueue || !canEncode) return;
    setBusy(true);
    const revision = getSessionRevision();
    try {
      const imported = await importPages(new File([item.file], item.metadata.originalName || "document.pdf", {type:item.file.type}));
      if (revision !== getSessionRevision()) return;
      if (!imported.length) throw new Error("No pages could be opened.");
      reviewBackup.current = {pages, index:pageIndex};
      setPages(imported); setPageIndex(0); setReviewingQueue(item.id);
      setOcrProgress(0); setOcrStatus("");
      go("Scan");
    } catch (error: any) { notify(error.message); }
    finally { setBusy(false); }
  }
  function closePageReview() {
    setPages(reviewBackup.current?.pages || []);
    setPageIndex(reviewBackup.current?.index || 0);
    reviewBackup.current = null;
    setReviewingQueue(null);
    setOcrProgress(0); setOcrStatus("");
    go("Upload Queue");
  }
  async function savePageReview() {
    if (!reviewingQueue || !pages.length || busy || ocrRunning) return;
    const item = queue.find(q => q.id === reviewingQueue);
    if (!item) return;
    setBusy(true);
    const revision = getSessionRevision();
    try {
      const result = await generatePdf(pages, settings.pageSize);
      if (revision !== getSessionRevision()) return;
      if (result.blob.size > settings.maxFileMb * 1048576) throw new Error("Updated PDF exceeds the configured file-size limit.");
      updateQueue(item.id, {file:result.blob, checksum:result.checksum, ocrText:result.ocrText,
        sessionId:undefined, error:undefined, status:"Pending", progress:0, attempts:0,
        metadata:{...item.metadata,originalName:`${item.title}.pdf`,pageCount:pages.length,pdfaValidated:false}});
      closePageReview();
      notify("Updated PDF saved to the queue. Review it before uploading.");
    } catch (error: any) { notify(error.message); }
    finally { setBusy(false); }
  }
  const [restoringSession, setRestoringSession] = useState(true);
  const demo = false;
  const role = user?.role;
  const canEncode = role === "ADMIN" || role === "ENCODER";
  const canReview = role === "ADMIN" || role === "REVIEWER";
  useEffect(() => {
    if (!metadataOpen || !user) return;
    let active = true;
    const revision = getSessionRevision();
    void Promise.all([
      request(settings.apiUrl, "/document-types"),
      request(settings.apiUrl, "/departments"),
    ]).then(([types, names]) => {
      if (!active || revision !== getSessionRevision()) return;
      setDocumentTypes(types);
      setDepartments(names);
    }).catch(() => {
      if (active && revision === getSessionRevision())
        notify("Could not refresh dropdown choices. Close Document details and reopen to retry.");
    });
    return () => { active = false; };
  }, [metadataOpen, user, settings.apiUrl]);
  useEffect(() => {
    let active = true;
    let initialSettings = defaultSettings;
    try {
      const saved = localStorage.getItem("folio-settings");
      if (saved) initialSettings = { ...defaultSettings, ...JSON.parse(saved) };
    } catch {}
    setSettings(initialSettings);
    void (async () => {
      try {
        const lastActivity = Number(sessionStorage.getItem("folio-last-activity"));
        if (lastActivity && Date.now() - lastActivity >= 15 * 60 * 1000) return;
        const data = await restoreSession(initialSettings.apiUrl);
        if (!active) return;
        setUser(data.user);
        try { await refresh(initialSettings.apiUrl); }
        catch { if (active) notify("Signed in. Use Refresh to retry loading document data."); }
      } catch (error) {
        if (active && !(error instanceof ApiError && error.status === 401))
          setAuthError("Could not restore your session. Check the API connection and reload, or sign in again.");
      } finally { if (active) setRestoringSession(false); }
    })();
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 7000);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (!user) return;
    let timeout: ReturnType<typeof setTimeout>;
    const reset = () => {
      try { sessionStorage.setItem("folio-last-activity", String(Date.now())); } catch {}
      clearTimeout(timeout);
      timeout = setTimeout(
        () => {
          void logout();
          notify("Your session expired after 15 minutes of inactivity.");
        },
        15 * 60 * 1000,
      );
    };
    reset();
    window.addEventListener("pointerdown", reset);
    window.addEventListener("keydown", reset);
    window.addEventListener("pointermove", reset, { passive: true });
    window.addEventListener("scroll", reset, { passive: true, capture: true });
    return () => {
      clearTimeout(timeout);
      window.removeEventListener("pointerdown", reset);
      window.removeEventListener("keydown", reset);
      window.removeEventListener("pointermove", reset);
      window.removeEventListener("scroll", reset, true);
    };
  }, [user]);
  useEffect(
    () => () => {
      cancelOcr.current = true;
      void worker.current?.terminate();
    },
    [],
  );
  useEffect(() => {
    if (!selected && !login && !metadataOpen && !cropOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const overlays = document.querySelectorAll<HTMLElement>(".overlay");
    const overlay = overlays[overlays.length - 1];
    const focusables = () =>
      Array.from(
        overlay?.querySelectorAll<HTMLElement>(
          "button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]",
        ) || [],
      );
    focusables()[0]?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (cropOpen) setCropOpen(false);
        else if (metadataOpen) setMetadataOpen(false);
        else if (login) setLogin(false);
        else setSelected(null);
      }
      if (event.key === "Tab") {
        const list = focusables(),
          first = list[0],
          last = list[list.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, [!!selected, login, metadataOpen, cropOpen]);
  useEffect(() => {
    const expire = () => {
      clearToken();
      setUser(null);
      setDocs([]);
      setAudits([]);
      setPages([]);
      setQueue([]);
    setReviewingQueue(null); reviewBackup.current = null;
      setUsers([]);
      setSelected(null);
      setStats(null);
      localFiles.current.clear();
      setPassword("");
      setAuthError(
        "Your session expired or your role changed. Please sign in again.",
      );
      cancelOcr.current = true;
      ocrGeneration.current++;
      void worker.current?.terminate();
      setNewUser({ name: "", email: "", password: "", role: "ENCODER" });
    };
    window.addEventListener("dms-session-expired", expire);
    return () => window.removeEventListener("dms-session-expired", expire);
  }, []);
  const go = (name: string) => {
    if (["Scan", "Upload Queue"].includes(name) && !canEncode) return;
    setView(name);
    setMobile(false);
  };
  const log = (action: string, details?: unknown) => {
    if (demo)
      setAudits((a) => [
        {
          id: crypto.randomUUID(),
          action,
          createdAt: new Date().toISOString(),
          actor: { name: "Demo administrator" },
          details,
        },
        ...a,
      ]);
    else
      void request(settings.apiUrl, "/logs", {
        method: "POST",
        body: JSON.stringify({ action, details }),
      }).catch((e) =>
        notify(`Audit event could not be recorded: ${e.message}`),
      );
  };
  async function refresh(apiUrl = settings.apiUrl) {
    try {
      const [documents, logs, dashboard, health, types, departmentNames] = await Promise.all([
        request(apiUrl, "/documents"),
        request(apiUrl, "/logs"),
        request(apiUrl, "/dashboard"),
        request(apiUrl, "/health", {}, false),
        request(apiUrl, "/document-types"),
        request(apiUrl, "/departments"),
      ]);
      setStorageConfigured(health.storageConfigured === false ? false : true);
      setDocs(documents);
      setDocumentTypes(types);
      setDepartments(departmentNames);
      setAudits(logs);
      setStats(dashboard);
      setConnected(true);
    } catch (e: any) {
      setConnected(false);
      throw e;
    }
  }
  async function signIn() {
    setAuthError("");
    setBusy(true);
    clearToken();
    try {
      if (!settings.apiUrl)
        throw new Error("Set the DMS API URL in Settings first.");
      const data = await request(settings.apiUrl, "/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: email.trim(), password }),
      });
      setPassword("");
      try {
        localStorage.setItem("folio-settings", JSON.stringify(settings));
      } catch {}
      setUser(data.user);
      setView("Dashboard");

      setDocs([]);
      setAudits([]);
      try {
        await refresh();
      } catch {
        notify(
          "Signed in. Document data could not be loaded; use Refresh to retry.",
        );
      }
      setLogin(false);
      setPassword("");
      notify("Signed in successfully.");
    } catch (e: any) {
      setAuthError(e.message || "Unable to sign in. Check the API connection.");
      setPassword("");
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    setUser(null);
    setBusy(true);
    try {
      if (!demo)
        await request(settings.apiUrl, "/auth/logout", { method: "POST" }, false);
    } catch {}
    clearToken();
    setUser(null);
    setConnected(false);
    setDocs([]);
    setAudits([]);
    setPages([]);
    setQueue([]);
    setReviewingQueue(null); reviewBackup.current = null;
    localFiles.current.clear();
    setSelected(null);
    setStats(null);
    setUsers([]);
    setNewUser({ name: "", email: "", password: "", role: "ENCODER" });
    setPassword("");
    setAuthError("");
    setBusy(false);
    cancelOcr.current = true;
    ocrGeneration.current++;
    void worker.current?.terminate();
  }
  async function testConnection() {
    try {
      if (!settings.apiUrl) throw new Error("Enter the API URL first.");
      const health = await request(settings.apiUrl, "/health", {}, false);
      setStorageConfigured(health.storageConfigured !== false);
      notify(health.storageConfigured === false ? "API connected. File storage needs S3_BUCKET and AWS_REGION; restart the API after configuring them." : "DMS API and storage configuration are ready.");
    } catch (e: any) {
      notify(e.message);
    }
  }
  async function checkScanner() {
    setScannerError("");
    try {
      await request(settings.apiUrl, "/auth/scanner");
      const url = new URL(settings.bridgeUrl);
      if (
        url.protocol !== "https:" ||
        !["localhost", "127.0.0.1"].includes(url.hostname)
      )
        throw new Error("Use an HTTPS loopback scanner bridge URL.");
      const r = await fetch(`${settings.bridgeUrl}/scanners`, {
        headers: scannerHeaders(settings.apiUrl, settings.bridgeUrl),
        signal: AbortSignal.timeout(4000),
      });
      if (!r.ok) { const error = await r.json().catch(() => ({})); throw new Error(error.message || "The scanner bridge rejected the request."); }
      const devices = await r.json();
      const found = devices.some((d: any) => d.name.includes("fi-7180"));
      setScanner(found);
      notify(
        found
          ? "Fujitsu fi-7180 detected."
          : "No fi-7180 was detected by the scanner bridge.",
      );
    } catch (e: any) {
      setScanner(false);
      const message = e instanceof TypeError || e.name === "TimeoutError" ? "Cannot reach the local scanner bridge. Install NAPS2, configure scanner-bridge/.env with a trusted HTTPS certificate, then run npm run scanner:bridge. You can still import exported files." : e.message;
      setScannerError(message);
      notify(message);
    }
  }
  async function importFiles(files: FileList | null, replace = false) {
    const operationSession = getSessionRevision();

    if (!files?.length) return;
    setBusy(true);
    try {
      const additions: Page[] = [];
      for (const file of Array.from(files)) {
        if (file.size > settings.maxFileMb * 1048576)
          throw new Error(`Maximum file size is ${settings.maxFileMb} MB.`);
        if (!/\.(pdf|png|jpe?g|tiff?)$/i.test(file.name))
          throw new Error("Choose PDF, JPG, PNG, or TIFF files.");
        additions.push(...(await importPages(file)));
      }
      const retained = settings.removeBlank
        ? additions.filter((p) => !p.blank)
        : additions;
      if (operationSession !== getSessionRevision()) return;
      setPages((old) =>
        replace
          ? old.flatMap((p, i) => (i === pageIndex ? retained : [p]))
          : [...old, ...retained],
      );
      notify(
        `${retained.length} pages imported. ${additions.length - retained.length} blank pages automatically removed.`,
      );
      go("Scan");
    } catch (e: any) {
      notify(e.message);
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
      if (replaceInput.current) replaceInput.current.value = "";
    }
  }
  async function scan(replace = false) {
    const operationSession = getSessionRevision();

    if (!scanner) {
      await checkScanner();
      return;
    }
    setBusy(true);
    log("SCAN_STARTED");
    try {
      await request(settings.apiUrl, "/auth/scanner");
      if (operationSession !== getSessionRevision()) return;
      const response = await fetch(`${settings.bridgeUrl}/scan`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...scannerHeaders(settings.apiUrl, settings.bridgeUrl),
        },
        body: JSON.stringify({
          scanner: settings.scanner,
          dpi: Number(settings.dpi),
          color: settings.color,
          duplex: settings.duplex,
          pageSize: settings.pageSize,
        }),
        signal: AbortSignal.timeout(180000),
      });
      if (!response.ok)
        throw new Error(
          "Scan failed. Check the paper feeder and scanner bridge.",
        );
      const result = await response.json();
      const additions: Page[] = [];
      for (const p of result.pages) {
        if (!/^data:image\/(png|jpeg);base64,/.test(p.dataUrl))
          throw new Error("The bridge returned an invalid page.");
        const { imagePage } = await import("../lib/imaging");
        additions.push(await imagePage(p.dataUrl));
      }
      const retained = settings.removeBlank
        ? additions.filter((p) => !p.blank)
        : additions;
      if (operationSession !== getSessionRevision()) return;
      setPages((old) =>
        replace
          ? old.flatMap((p, i) => (i === pageIndex ? retained : [p]))
          : [...old, ...retained],
      );
      log("SCAN_COMPLETED", { pages: additions.length });
      notify(`${additions.length} pages scanned.`);
    } catch (e: any) {
      notify(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function runOcr() {
    if (!pages.length || ocrRunning || !canEncode) return;
    if (!/^[a-z]{3}(\+[a-z]{3})*$/.test(settings.language.trim())) {
      notify("Enter a language code such as eng or eng+spa.");
      return;
    }
    setOcrRunning(true);
    setOcrProgress(0);
    setOcrStatus("Loading OCR engine and language data…");
    cancelOcr.current = false;
    const generation = ++ocrGeneration.current;
    let ownedWorker: any;
    try {
      const { createWorker } = await import("tesseract.js");
      let current = 0;
      const w = await createWorker(settings.language.trim(), 1, {
        logger: (m: any) => {
          if (cancelOcr.current || generation !== ocrGeneration.current) return;
          if (m.status === "recognizing text")
            setOcrProgress(
              Math.round(((current + m.progress) / pages.length) * 100),
            );
        },
      });
      ownedWorker = w;
      if (cancelOcr.current || generation !== ocrGeneration.current) return;
      worker.current = w;
      if (cancelOcr.current) {
        await w.terminate();
        return;
      }
      for (let i = 0; i < pages.length; i++) {
        if (cancelOcr.current) break;
        current = i;
        setOcrStatus(`Recognizing page ${i + 1} of ${pages.length}…`);
        const p = await rasterize(pages[i]);
        const { data } = await w.recognize(
          p.url,
          {},
          { text: true, blocks: true },
        );
        if (cancelOcr.current || generation !== ocrGeneration.current) break;
        const words = (data.blocks || [])
          .flatMap((b: any) => b.paragraphs || [])
          .flatMap((p: any) => p.lines || [])
          .flatMap((l: any) => l.words || [])
          .map((w: any) => ({ text: w.text, bbox: w.bbox }));
        setPages((old) =>
          old.map((item) =>
            item.id === pages[i].id
              ? { ...p, id: item.id, text: data.text, words }
              : item,
          ),
        );
        setOcrProgress(Math.round(((i + 1) / pages.length) * 100));
      }
      if (!cancelOcr.current && generation === ocrGeneration.current) {
        setOcrStatus(`Completed ${pages.length} pages. Text is ready for the searchable PDF.`);
        log("OCR_COMPLETED", { pages: pages.length });
        notify("OCR completed for every page.");
      }
    } catch (e: any) {
      if (!cancelOcr.current && generation === ocrGeneration.current) {
        setOcrStatus(`OCR failed: ${e.message}. Completed page text has been kept; retry when ready.`);
        notify(`OCR failed: ${e.message}`);
      }
    } finally {
      await ownedWorker?.terminate().catch(() => {});
      if (worker.current === ownedWorker) worker.current = null;
      if (generation === ocrGeneration.current || cancelOcr.current) setOcrRunning(false);
    }
  }
  const stopOcr = () => {
    cancelOcr.current = true;
    ocrGeneration.current++;
    void worker.current?.terminate().catch(() => {});
    setOcrStatus("OCR cancelled. Completed page text has been kept.");
    notify("OCR cancelled. Completed page text has been kept.");
  };
  const currentPage = pages[pageIndex];
  function rotate(delta: number) {
    setPages((p) =>
      p.map((page, i) =>
        i === pageIndex
          ? {
              ...page,
              rotation: (page.rotation + delta + 360) % 360,
              text: "",
              words: undefined,
            }
          : page,
      ),
    );
  }
  function movePage(delta: number) {
    const next = pageIndex + delta;
    if (next < 0 || next >= pages.length) return;
    setPages((old) => {
      const list = [...old];
      [list[pageIndex], list[next]] = [list[next], list[pageIndex]];
      return list;
    });
    setPageIndex(next);
  }
  async function applyCrop() {
    if (
      crop.x < 0 ||
      crop.y < 0 ||
      crop.width <= 0 ||
      crop.height <= 0 ||
      crop.x + crop.width > 100 ||
      crop.y + crop.height > 100
    ) {
      notify("Crop bounds must fit inside the page.");
      return;
    }
    if (!currentPage) return;
    const result = await rasterize(currentPage, crop);
    setPages((old) =>
      old.map((p, i) => (i === pageIndex ? { ...result, id: p.id } : p)),
    );
    setCropOpen(false);
    notify("Page cropped. Run OCR again for this page.");
  }
  async function makeDocument() {
    if (reviewingQueue) { await savePageReview(); setMetadataOpen(false); return; }
    const operationSession = getSessionRevision();

    if (!meta.title.trim()) {
      notify("Enter a document title.");
      return;
    }
    setBusy(true);
    try {
      if (editingQueue) {
        updateQueue(editingQueue, {
          title: meta.title.trim(),
          metadata: {
            ...queue.find((q) => q.id === editingQueue)?.metadata,
            ...meta,
          },
        });
        setEditingQueue(null);
        setMetadataOpen(false);
        notify("Document metadata saved.");
        return;
      }
      if (editingDoc) {
        const changes = {
          title: meta.title.trim(),
          description: meta.description,
          tags: meta.tags
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean),
          metadata: meta,
        };
        if (demo) {
          setDocs((old) =>
            old.map((d) =>
              d.id === editingDoc
                ? { ...d, ...changes, status: "UPLOADED" }
                : d,
            ),
          );
          log("DOCUMENT_METADATA_UPDATED", { documentId: editingDoc });
        } else {
          await request(settings.apiUrl, "/documents/" + editingDoc, {
            method: "PATCH",
            body: JSON.stringify(changes),
          });
          await refresh();
        }
        setSelected(null);
        setEditingDoc(null);
        setMetadataOpen(false);
        notify("Metadata saved. Document returned to Uploaded for review.");
        return;
      }
      const result = await generatePdf(pages, settings.pageSize);
      if (settings.pdfa || outputFormat !== "PDF") {
        const format = settings.pdfa ? "pdfa" : outputFormat.toLowerCase();
        await request(settings.apiUrl, "/auth/scanner");
        if (operationSession !== getSessionRevision()) return;
        const response = await fetch(settings.bridgeUrl + "/convert", {
          method: "POST",
          headers: {
            "Content-Type": "application/pdf",
            "X-Output-Format": format,
            ...scannerHeaders(settings.apiUrl, settings.bridgeUrl),
          },
          body: result.blob,
          signal: AbortSignal.timeout(240000),
        });
        const converted = await response.json();
        if (!response.ok)
          throw new Error(converted.message || "Bridge conversion failed.");
        if (settings.pdfa && !converted.pdfaValidated)
          throw new Error("PDF/A compliance was not validated.");
        const items: QueueItem[] = converted.files.map((f: any, i: number) => {
          const data = Uint8Array.from(atob(f.base64), (c: string) =>
            c.charCodeAt(0),
          );
          return {
            id: crypto.randomUUID(),
            title:
              converted.files.length > 1
                ? meta.title + " — page " + (i + 1)
                : meta.title,
            file: new Blob([data], { type: f.mimeType }),
            checksum: f.checksum,
            ocrText: format === "jpg" ? pages[i]?.text || "" : result.ocrText,
            status: "Pending",
            progress: 0,
            metadata: {
              ...meta,
              source: "SCANNER",
              originalName: f.name,
              pageCount: format === "jpg" ? 1 : pages.length,
              pdfaValidated: !!converted.pdfaValidated,
            },
            attempts: 0,
          };
        });
        if (items.some((q) => q.file.size > settings.maxFileMb * 1048576))
          throw new Error("Generated file exceeds the configured size limit.");
        if (operationSession !== getSessionRevision()) return;
        setQueue((old) => [...items, ...old]);
        setMetadataOpen(false);
        if (operationSession !== getSessionRevision()) return;
        setPages([]);
        setPageIndex(0);
        go("Upload Queue");
        log("PDF_GENERATED", { format, pages: pages.length });
        if (settings.autoUpload) items.forEach((item) => void upload(item));
        notify("Documents generated and added to the queue.");
        return;
      }
      if (result.blob.size > settings.maxFileMb * 1048576)
        throw new Error("Generated PDF exceeds the configured size limit.");
      log("PDF_GENERATED", { pages: pages.length, checksum: result.checksum });
      const item: QueueItem = {
        id: crypto.randomUUID(),
        title: meta.title,
        file: result.blob,
        checksum: result.checksum,
        ocrText: result.ocrText,
        status: "Pending",
        progress: 0,
        metadata: { ...meta, source: "SCANNER", pageCount: pages.length },
        attempts: 0,
      };
      if (operationSession !== getSessionRevision()) return;
      setQueue((old) => [item, ...old]);
      setMetadataOpen(false);
      if (operationSession !== getSessionRevision()) return;
      setPages([]);
      setPageIndex(0);
      go("Upload Queue");
      if (settings.autoUpload) void upload(item);
      notify("PDF generated and added to the upload queue.");
    } catch (e: any) {
      notify(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function directUpload(files: FileList | null) {
    const operationSession = getSessionRevision();

    if (!files?.length) return;
    setBusy(true);
    try {
      const additions: QueueItem[] = [];
      for (const file of Array.from(files)) {
        if (!/\.(pdf|jpe?g|tiff?)$/i.test(file.name))
          throw new Error("Upload PDF, JPG, or TIFF files.");
        if (file.size > settings.maxFileMb * 1048576)
          throw new Error(`Maximum file size is ${settings.maxFileMb} MB.`);
        const digest = await crypto.subtle.digest(
          "SHA-256",
          await file.arrayBuffer(),
        );
        const checksum = Array.from(new Uint8Array(digest))
          .map((n) => n.toString(16).padStart(2, "0"))
          .join("");
        additions.push({
          id: crypto.randomUUID(),
          title: file.name.replace(/\.[^.]+$/, ""),
          file,
          checksum,
          ocrText: "",
          status: "Pending",
          progress: 0,
          metadata: {
            ...emptyMeta,
            title: file.name.replace(/\.[^.]+$/, ""),
            source: "UPLOAD",
            originalName: file.name,
          },
          attempts: 0,
          documentId: versionTarget.current,
        });
      }
      if (operationSession !== getSessionRevision()) return;
      setQueue((old) => [...additions, ...old]);
      go("Upload Queue");
      setSelected(null);
      if (settings.autoUpload) additions.forEach((item) => void upload(item));
      notify("Files queued. Add metadata before uploading.");
    } catch (e: any) {
      notify(e.message);
    } finally {
      setBusy(false);
      versionTarget.current = undefined;
      if (uploadInput.current) uploadInput.current.value = "";
    }
  }
  const updateQueue = (id: string, patch: Partial<QueueItem>) =>
    setQueue((old) => old.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  async function upload(item: QueueItem) {
    if (reviewingQueue === item.id) { notify("Save or cancel page review before uploading this document."); return; }
    const operationSession = getSessionRevision();

    if (queueBusy.current.has(item.id)) return;
    queueBusy.current.add(item.id);
    updateQueue(item.id, {
      status: "Uploading",
      progress: 10,
      error: undefined,
      attempts: item.attempts + 1,
    });
    try {
      if (demo) {
        const now = new Date().toISOString();
        const id = item.documentId || crypto.randomUUID();
        const document: Doc = {
          id,
          documentNumber:
            item.metadata.documentNumber ||
            `DEMO-${String(docs.length + 1).padStart(5, "0")}`,
          title: item.title,
          description: item.metadata.description || "",
          status: "UPLOADED",
          source: item.metadata.source,
          mimeType: item.file.type,
          fileSize: item.file.size,
          checksum: item.checksum,
          ocrText: item.ocrText,
          tags: item.metadata.tags
            .split(",")
            .map((x: string) => x.trim())
            .filter(Boolean),
          metadata: item.metadata,
          createdAt: now,
          updatedAt: now,
          versions: [{ id: crypto.randomUUID(), version: 1, createdAt: now }],
        };
        if (item.documentId)
          setDocs((old) =>
            old.map((d) =>
              d.id === id
                ? {
                    ...d,
                    checksum: item.checksum,
                    fileSize: item.file.size,
                    status: "UPLOADED",
                    updatedAt: now,
                    versions: [
                      ...(d.versions || []),
                      {
                        id: crypto.randomUUID(),
                        version: (d.versions?.length || 0) + 1,
                        createdAt: now,
                      },
                    ],
                  }
                : d,
            ),
          );
        else setDocs((old) => [document, ...old]);
        localFiles.current.set(id, item.file);
        log("DOCUMENT_UPLOADED", { title: item.title, demo: true });
        updateQueue(item.id, { status: "Completed", progress: 100 });
        return;
      }
      if (!user) throw new Error("Sign in to your DMS before uploading.");
      const health = await request(settings.apiUrl, "/health", {}, false);
      setStorageConfigured(health.storageConfigured !== false);
      if (health.storageConfigured === false) throw new Error("Uploads are unavailable until S3_BUCKET and AWS_REGION are configured. Your file remains in the queue.");
      let sessionId = item.sessionId;
      if (!sessionId) {
        const signed = await request(settings.apiUrl, "/documents/upload-url", {
          method: "POST",
          body: JSON.stringify({
            fileName: item.metadata.originalName || `${item.title}.pdf`,
            mimeType: item.file.type || "application/octet-stream",
            fileSize: item.file.size,
            checksum: item.checksum,
            documentId: item.documentId,
          }),
        });
        const result = await fetch(signed.url, {
          method: "PUT",
          headers: signed.headers,
          body: item.file,
        });
        if (!result.ok) {
          let code = "";
          try {
            const xml = new DOMParser().parseFromString(await result.text(), "application/xml");
            const value = xml.querySelector("Code")?.textContent || "";
            if (/^[A-Za-z0-9]{1,80}$/.test(value)) code = value;
          } catch { /* Keep the HTTP status when the error body is unavailable. */ }
          const hints: Record<string, string> = {
            AccessDenied: "Check IAM and bucket permissions for s3:PutObject under staging/ and any encryption requirements.",
            SignatureDoesNotMatch: "Check the API's AWS credentials, bucket region, and signed request headers.",
            InvalidAccessKeyId: "The API's AWS access key is invalid or inactive.",
            ExpiredToken: "Refresh the API's temporary AWS credentials and restart it.",
            RequestTimeTooSkewed: "Synchronize the API computer's clock.",
          };
          throw new Error(`S3 upload failed (${result.status}${code ? `: ${code}` : ""}). ${hints[code] || "Check the failed PUT response in the browser Network panel."}`);
        }
        sessionId = signed.uploadId;
        updateQueue(item.id, { sessionId, progress: 80 });
      }
      if (operationSession !== getSessionRevision()) return;
      await request(
        settings.apiUrl,
        item.documentId
          ? `/documents/${item.documentId}/versions`
          : "/documents",
        {
          method: "POST",
          body: JSON.stringify({
            uploadId: sessionId,
            title: item.title,
            description: item.metadata.description,
            documentNumber: item.metadata.documentNumber || undefined,
            tags: item.metadata.tags
              .split(",")
              .map((x: string) => x.trim())
              .filter(Boolean),
            ocrText: item.ocrText,
            metadata: item.metadata,
            source: item.metadata.source,
          }),
        },
      );
      updateQueue(item.id, { status: "Completed", progress: 100 });
      try {
        await refresh();
      } catch {
        notify(
          "Upload completed; refresh the document list when the API reconnects.",
        );
      }
    } catch (e: any) {
      updateQueue(item.id, { status: "Failed", error: e.message, progress: 0 });
      log("DOCUMENT_UPLOAD_FAILED", { title: item.title, message: e.message });
    } finally {
      queueBusy.current.delete(item.id);
    }
  }
  async function transition(doc: Doc, status: Status) {
    try {
      if (demo) {
        const updated = { ...doc, status, updatedAt: new Date().toISOString() };
        setDocs((old) => old.map((d) => (d.id === doc.id ? updated : d)));
        setSelected(updated);
        log(`DOCUMENT_${status}`, { title: doc.title });
      } else {
        const updated = await request(settings.apiUrl, `/documents/${doc.id}`, {
          method: "PATCH",
          body: JSON.stringify({ status }),
        });
        setSelected(updated);
        await refresh();
      }
      notify(`Document ${statuses[status].toLowerCase()}.`);
    } catch (e: any) {
      notify(e.message);
    }
  }
  async function openDocument(doc: Doc) {
    if (demo) {
      setSelected(doc);
      return;
    }
    try {
      setSelected(await request(settings.apiUrl, `/documents/${doc.id}`));
    } catch (e: any) {
      notify(e.message);
    }
  }
  async function download(doc: Doc, preview = false) {
    try {
      let url: string;
      if (demo) {
        const file = localFiles.current.get(doc.id);
        if (!file)
          throw new Error(
            "This sample record has no file. Upload your own document to preview or download it.",
          );
        url = URL.createObjectURL(file);
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      } else {
        const data = await request(
          settings.apiUrl,
          `/documents/${doc.id}/download${preview ? "?inline=true" : ""}`,
        );
        url = data.url;
      }
      const a = document.createElement("a");
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      if (!preview)
        a.download = `${doc.documentNumber}.${doc.mimeType === "application/pdf" ? "pdf" : doc.mimeType === "image/tiff" ? "tiff" : "jpg"}`;
      a.click();
    } catch (e: any) {
      notify(e.message);
    }
  }
  async function deleteDoc(doc: Doc) {
    if (
      !window.confirm(
        `Delete “${doc.title}”? This removes the document from active records.`,
      )
    )
      return;
    try {
      if (!demo)
        await request(settings.apiUrl, `/documents/${doc.id}`, {
          method: "DELETE",
        });
      setDocs((old) => old.filter((d) => d.id !== doc.id));
      setSelected(null);
      log("DOCUMENT_DELETED", { title: doc.title });
      notify("Document deleted.");
    } catch (e: any) {
      notify(e.message);
    }
  }
  const filtered = docs.filter(
    (d) =>
      (filter === "All documents" || statuses[d.status] === filter) &&
      (department === "All departments" ||
        d.metadata.department === department) &&
      [
        d.title,
        d.documentNumber,
        d.ocrText,
        d.metadata.documentType,
        d.metadata.documentDate,
        ...d.tags,
      ].some((s) => s?.toLowerCase().includes(query.toLowerCase())),
  );
  const pending = queue.filter(
      (q) => q.status === "Pending" || q.status === "Uploading",
    ).length,
    failed = queue.filter((q) => q.status === "Failed").length;
  const today = docs.filter(
    (d) => new Date(d.createdAt).toDateString() === new Date().toDateString(),
  ).length;
  function documentTable(list: Doc[]) {
    return (
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>DOCUMENT NAME</th>
              <th>DEPARTMENT</th>
              <th>STATUS</th>
              <th>DATE ADDED</th>
              <th>ACTION</th>
            </tr>
          </thead>
          <tbody>
            {list.map((d) => (
              <tr key={d.id}>
                <td>
                  <div className="doc-cell">
                    <div className="file-icon">
                      <FileText size={17} />
                    </div>
                    <div>
                      <button onClick={() => void openDocument(d)}>
                        {d.title}
                      </button>
                      <small>
                        {d.documentNumber}{" "}
                        <span style={{ margin: "0 5px" }}>·</span>{" "}
                        {bytes(d.fileSize)}
                      </small>
                    </div>
                  </div>
                </td>
                <td>
                  {d.metadata.department || "—"}
                </td>
                <td>
                  <span className={`badge ${d.status}`}>
                    {statuses[d.status]}
                  </span>
                </td>
                <td className="muted">{date(d.createdAt)}</td>
                <td>
                  <button
                    className="document-view-button"
                    aria-label={`View document: ${d.title}`}
                    onClick={() => void openDocument(d)}
                  >
                    View document <ChevronRight size={16} aria-hidden="true" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!list.length && (
          <div className="empty">
            <FolderOpen size={32} />
            <h2>No documents found</h2>
            <p>Upload a document or adjust your search.</p>
          </div>
        )}
      </div>
    );
  }
  if (restoringSession)
    return <main className="auth-page"><section className="auth-card" role="status">Restoring your session…</section></main>;
  if (!user)
    return (
      <LoginScreen
        email={email}
        password={password}
        apiUrl={settings.apiUrl}
        busy={busy}
        error={authError}
        onEmail={setEmail}
        onPassword={setPassword}
        onApiUrl={(apiUrl) => setSettings({ ...settings, apiUrl })}
        onSubmit={() => void signIn()}
      />
    );
  return (
    <div className="app">
      <input
        hidden
        multiple
        ref={fileInput}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.tif,.tiff"
        onChange={(e) => void importFiles(e.target.files)}
      />
      <input
        hidden
        ref={replaceInput}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.tif,.tiff"
        onChange={(e) => void importFiles(e.target.files, true)}
      />
      <input
        hidden
        multiple
        ref={uploadInput}
        type="file"
        accept=".pdf,.jpg,.jpeg,.tif,.tiff"
        onChange={(e) => void directUpload(e.target.files)}
      />
      <aside className={`sidebar ${mobile ? "open" : ""}`}>
        <div className="brand">
          {/* <span className="brand-mark">f</span> */}
          <div>
            Folio360<small>Intelligent Document Management</small>
          </div>
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav className="nav">
          {navigation
            .filter(
              ([name]) => canEncode || !["Scan", "Upload Queue"].includes(name),
            )
            .map(([name, Icon], i) => (
              <button
                key={name}
                className={view === name ? "active" : ""}
                onClick={() => go(name)}
                style={i === 4 ? { marginTop: 25 } : undefined}
              >
                <Icon size={18} />
                {name}
                {name === "Upload Queue" && pending > 0 && (
                  <span className="count">{pending}</span>
                )}
              </button>
            ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="device">
            <div className="device-head">
              <ScanLine size={25} />
              <div>
                <strong style={{ fontSize: 12 }}>Fujitsu fi-7180</strong>
                <p>Duplex document scanner</p>
              </div>
            </div>
            <div className="device-status">
              <span>{scanner ? "Connected" : "Not connected"}</span>
              <button
                className="text-button"
                style={{ fontSize: 10, padding: 0 }}
                onClick={() => void checkScanner()}
              >
                Check scanner
              </button>
            </div>
          </div>
          <div className="user">
            <div className="avatar">
              {user
                ? user.name
                    .split(" ")
                    .map((s) => s[0])
                    .slice(0, 2)
                    .join("")
                : "DA"}
            </div>
            <div>
              <strong>
                {user?.name || (demo ? "Demo administrator" : "Not signed in")}
              </strong>
              <small>
                {demo ? "Demo workspace" : human(user?.role || "READ_ONLY")}
              </small>
            </div>
            <button
              className="icon text-button"
              style={{ marginLeft: "auto" }}
              title={user ? "Log out" : "Sign in"}
              onClick={() => (user ? void logout() : setLogin(true))}
            >
              {user ? <LogOut size={16} /> : <ChevronRight size={16} />}
            </button>
          </div>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <button
            className="mobile-menu icon"
            aria-label="Toggle menu"
            onClick={() => setMobile(!mobile)}
          >
            <Menu size={19} />
          </button>
          <div className="breadcrumb">
            Workspace <ChevronRight size={12} />
            <strong>{view}</strong>
          </div>
          <div className="top-actions">
            <button type="button" onClick={() => void logout()} aria-label="Sign out of Folio360">
              <LogOut size={16} aria-hidden="true" />
              Sign out
            </button>
            <span className="mode">
              {demo
                ? "DEMO WORKSPACE"
                : connected
                  ? "DMS CONNECTED"
                  : "DMS OFFLINE"}
            </span>
            <button
              className="text-button"
              onClick={() => go("About")}
              aria-label="Help"
            >
              <Info size={18} />
            </button>
            <span className="avatar" style={{ width: 30, height: 30 }}>
              {" "}
              {user?.name[0] || "D"}{" "}
            </span>
          </div>
        </header>
        <div className="content">
          {storageConfigured === false && <div className="notice" role="status">File storage is not configured. You can manage users and prepare documents, but uploads and downloads require S3_BUCKET and AWS_REGION in the API environment. Restart the API, then use Settings → Test connection.</div>}
          {view === "Scan" && scannerError && <div className="notice" role="alert">{scannerError}</div>}
          {reviewingQueue && <section className="panel form-panel" style={{marginBottom:20}}>
            <h2>Review pages — {queue.find(q=>q.id===reviewingQueue)?.title}</h2>
            <p>Use the page tools below to add, replace, remove, rotate, crop, or reorder pages. Changes are saved as a new PDF in this queue item. Run OCR again to include searchable text. PDF/A must be regenerated separately.</p>
            <div className="actions">
              {view !== "Scan" && <button onClick={()=>go("Scan")}>Return to page review</button>}
              <button disabled={busy || ocrRunning} onClick={closePageReview}>Cancel review</button>
              <button className="primary" disabled={busy || ocrRunning || !pages.length} onClick={()=>void savePageReview()}>Save reviewed PDF</button>
            </div>
          </section>}
          <div className="page-head">
            <div>
              <h1>
                {view === "Dashboard"
                  ? "Workspace overview"
                  : view === "Scan"
                    ? "Scan workspace"
                    : view}
              </h1>
              <p>
                {
                  (
                    {
                      Dashboard:
                        "Your documents, organized. Your workflow, in view.",
                      Scan: "Capture, prepare, and digitize your documents.",
                      Documents:
                        "A single place for every document and every version.",
                      "Upload Queue":
                        "Track your documents on their way to the archive.",
                      Settings:
                        "Configure your workspace and scanning preferences.",
                      Logs: "A chronological record of document and workspace activity.",
                      About: "Your document lifecycle, connected.",
                    } as any
                  )[view]
                }
              </p>
            </div>
            <div className="actions">
              {["Dashboard", "Documents"].includes(view) && (
                <>
                  <button
                    disabled={!canEncode || busy}
                    onClick={() => uploadInput.current?.click()}
                  >
                    <UploadCloud size={16} />
                    Upload documents
                  </button>
                  <button
                    className="primary"
                    disabled={!canEncode}
                    onClick={() => go("Scan")}
                  >
                    <Plus size={17} />
                    New scan
                  </button>
                </>
              )}
              {view === "Dashboard" && (
                <span
                  className="muted"
                  style={{ fontSize: 11, display: "none" }}
                >
                  {date(new Date().toISOString())}
                </span>
              )}
              {view === "Settings" && (
                <button
                  className="primary"
                  onClick={() => {
                    try {
                      const url = settings.apiUrl
                        ? new URL(settings.apiUrl)
                        : null;
                      if (
                        url &&
                        url.protocol !== "https:" &&
                        !["127.0.0.1", "localhost"].includes(url.hostname)
                      )
                        throw new Error("Use HTTPS for your DMS API.");
                      localStorage.setItem(
                        "folio-settings",
                        JSON.stringify(settings),
                      );
                      notify("Settings saved for this device.");
                    } catch (e: any) {
                      notify(e.message);
                    }
                  }}
                >
                  <Check size={16} />
                  Save settings
                </button>
              )}
            </div>
          </div>
          {view === "Dashboard" && (
            <>
              <div className="stats">
                {[
                  [
                    "Today's scans",
                    stats?.todayScans ?? (demo ? 3 : 0),
                    ScanLine,
                    "Completed batches",
                  ],
                  [
                    "Today's uploads",
                    stats?.todayUploads ?? today,
                    UploadCloud,
                    "Documents received",
                  ],
                  ["Pending uploads", pending, Clock, "Waiting to upload"],
                  [
                    "Failed uploads",
                    failed,
                    AlertCircle,
                    failed ? "Needs your attention" : "No failed uploads",
                  ],
                  [
                    "Total pages",
                    stats?.totalPages ?? (demo ? 24 : 0),
                    Layers,
                    "Across your documents",
                  ],
                ].map(([label, value, Icon, note]: any) => (
                  <div className="stat" key={label}>
                    <div className="stat-top">
                      {label}
                      <span className="stat-icon">
                        <Icon size={16} />
                      </span>
                    </div>
                    <div className="stat-value">{value}</div>
                    <div className="stat-note">
                      {label === "Failed uploads" && !failed ? (
                        <span className="positive">✓ {note}</span>
                      ) : (
                        note
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div className="dashboard-grid">
                <div>
                  <div className="capture">
                    <div className="capture-icon">
                      <ScanLine size={30} />
                    </div>
                    <div>
                      <h2>From paper to possibility.</h2>
                      <p>
                        Scan a batch, capture the details, and keep work moving.
                        <br />
                        Duplex scanning · Automatic numbering · Searchable PDFs
                      </p>
                    </div>
                    <button
                      className="primary"
                      disabled={!canEncode}
                      onClick={() => go("Scan")}
                    >
                      Start scanning <ArrowRight size={15} />
                    </button>
                  </div>
                  <section className="panel">
                    <div className="panel-head">
                      <div>
                        <h2>Recent documents</h2>
                        <p>The latest additions to your workspace</p>
                      </div>
                      <button
                        className="text-button"
                        onClick={() => go("Documents")}
                      >
                        View all documents <ArrowUpRight size={14} />
                      </button>
                    </div>
                    <div className="tabs">
                      {[
                        "All documents",
                        "In review",
                        "Approved",
                        "Archived",
                      ].map((s) => (
                        <button
                          className={filter === s ? "active" : ""}
                          key={s}
                          onClick={() => setFilter(s)}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                    {documentTable(filtered.slice(0, 5))}
                    <div className="panel-footer">
                      <span>
                        Showing {Math.min(filtered.length, 5)} of {docs.length}{" "}
                        documents
                      </span>
                      <span>{demo ? "Sample data" : "Live workspace"}</span>
                    </div>
                  </section>
                  <section className="panel" style={{ marginTop: 24 }}>
                    <div className="panel-head">
                      <h2>Document workflow</h2>
                      <span className="muted" style={{ fontSize: 11 }}>
                        Every document, every step
                      </span>
                    </div>
                    <div className="workflow">
                      {Object.entries(statuses).map(([s, label]) => (
                        <div className="workflow-step" key={s}>
                          <div className="workflow-bar" />
                          <small>{label}</small>
                          <strong>
                            {docs.filter((d) => d.status === s).length}
                          </strong>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
                <div className="stack">
                  <section className="panel">
                    <div className="panel-head">
                      <h2>Recent activity</h2>
                      <button
                        className="text-button"
                        onClick={() => go("Logs")}
                        aria-label="View activity"
                      >
                        <ArrowUpRight size={15} />
                      </button>
                    </div>
                    <div className="activity">
                      {audits.slice(0, 5).map((a) => (
                        <div className="activity-item" key={a.id}>
                          <div className="activity-icon">
                            {a.action.includes("SCAN") ? (
                              <ScanLine size={14} />
                            ) : (
                              <Check size={14} />
                            )}
                          </div>
                          <div>
                            <p>{human(a.action)}</p>
                            <small>
                              {a.actor?.name || "System"} ·{" "}
                              {new Date(a.createdAt).toLocaleTimeString(
                                "en-US",
                                { hour: "numeric", minute: "2-digit" },
                              )}
                            </small>
                          </div>
                        </div>
                      ))}
                      {!audits.length && (
                        <p className="muted">No activity yet.</p>
                      )}
                    </div>
                    <div className="panel-footer">
                      <button
                        className="text-button"
                        style={{ width: "100%" }}
                        onClick={() => go("Logs")}
                      >
                        View audit log <ArrowRight size={13} />
                      </button>
                    </div>
                  </section>
                  <section className="panel">
                    <div className="storage">
                      <div className="actions">
                        <HardDrive size={17} />
                        <h3>Workspace storage</h3>
                      </div>
                      <div
                        style={{ fontSize: 25, fontWeight: 650, marginTop: 17 }}
                      >
                        {bytes(docs.reduce((s, d) => s + d.fileSize, 0))}
                      </div>
                      <p
                        className="muted"
                        style={{ fontSize: 11, marginTop: 6 }}
                      >
                        {docs.length} documents in your workspace
                      </p>
                      <div className="storage-line">
                        <div style={{ width: "100%" }} />
                      </div>
                      <small>
                        {demo
                          ? "Sample document sizes"
                          : "Total size of current versions"}
                      </small>
                    </div>
                  </section>
                  <div
                    style={{
                      display: "flex",
                      gap: 9,
                      padding: "0 5px",
                      color: "#85958a",
                      fontSize: 11,
                      lineHeight: 1.7,
                    }}
                  >
                    <ShieldCheck size={17} />
                    <span>
                      {demo
                        ? "Explore with sample data. Connect your DMS in Settings to work with real records."
                        : "Access and document permissions are managed by your DMS API."}
                    </span>
                  </div>
                </div>
              </div>
            </>
          )}
          {view === "Documents" && (
            <section className="panel">
              <div className="panel-head">
                <h2>
                  Document library{" "}
                  <span className="badge ARCHIVED">{docs.length}</span>
                </h2>
                {!demo && (
                  <button
                    onClick={() =>
                      void refresh().catch((e) => notify(e.message))
                    }
                  >
                    <RefreshCw size={14} />
                    Refresh
                  </button>
                )}
              </div>
              <div className="table-controls">
                <div className="search search-wide">
                  <Search size={15} />
                  <input
                    aria-label="Search documents"
                    placeholder="Search title, department, reference, OCR text…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
                <select
                  aria-label="Department"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                >
                  {[
                    "All departments",
                    ...Array.from(
                      new Set(
                        docs.map((d) => d.metadata.department).filter(Boolean),
                      ),
                    ),
                  ].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
                <select
                  aria-label="Status"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                >
                  {["All documents", ...Object.values(statuses)].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </div>
              {documentTable(filtered)}
              <div className="panel-footer">
                {filtered.length} matching documents
              </div>
            </section>
          )}
          {view === "Scan" && (
            <>
              {!scanner && (
                <div className="notice">
                  The scanner bridge is not connected. Import files from
                  PaperStream Capture, or connect the Windows bridge in
                  Settings.
                </div>
              )}
              <div className="scan-layout">
                <section className="panel scan-settings">
                  <h2>Scan settings</h2>
                  <label>
                    Scanner
                    <select
                      value={settings.scanner}
                      onChange={(e) =>
                        setSettings({ ...settings, scanner: e.target.value })
                      }
                    >
                      <option>Fujitsu fi-7180</option>
                    </select>
                  </label>
                  <label>
                    Resolution
                    <select
                      value={settings.dpi}
                      onChange={(e) =>
                        setSettings({ ...settings, dpi: e.target.value })
                      }
                    >
                      {["150", "200", "300", "600"].map((x) => (
                        <option key={x} value={x}>
                          {x} DPI
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Color mode
                    <select
                      value={settings.color}
                      onChange={(e) =>
                        setSettings({ ...settings, color: e.target.value })
                      }
                    >
                      {["Color", "Grayscale", "Black and white"].map((x) => (
                        <option key={x}>{x}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Page size
                    <PaperSizeSelect value={settings.pageSize} onChange={pageSize => setSettings({...settings, pageSize})} />
                  </label>
                  <label className="switch" style={{ flexDirection: "row" }}>
                    Duplex scanning
                    <input
                      type="checkbox"
                      checked={settings.duplex}
                      onChange={(e) =>
                        setSettings({ ...settings, duplex: e.target.checked })
                      }
                    />
                  </label>
                  <button
                    className="primary"
                    disabled={busy || ocrRunning || !canEncode}
                    onClick={() => void scan()}
                  >
                    <ScanLine size={16} />
                    {busy ? "Processing…" : "Start scan"}
                  </button>
                  <button
                    disabled={busy || ocrRunning || !canEncode}
                    onClick={() => fileInput.current?.click()}
                  >
                    <Plus size={16} />
                    Import pages
                  </button>
                  <p
                    className="muted"
                    style={{ fontSize: 11, lineHeight: 1.8, marginTop: 15 }}
                  >
                    PDF, JPG, PNG, TIFF
                    <br />
                    Up to {settings.maxFileMb} MB per file
                  </p>
                </section>
                <section className="panel scan-viewer">
                  <div className="toolbar">
                    <button
                      title="Zoom out"
                      aria-label="Zoom out"
                      onClick={() => setZoom(Math.max(0.25, zoom - 0.25))}
                    >
                      <ZoomOut size={16} />
                    </button>
                    <small style={{ minWidth: 37, textAlign: "center" }}>
                      {Math.round(zoom * 100)}%
                    </small>
                    <button
                      title="Zoom in"
                      aria-label="Zoom in"
                      onClick={() => setZoom(Math.min(3, zoom + 0.25))}
                    >
                      <ZoomIn size={16} />
                    </button>
                    <span style={{ width: 5 }} />
                    {[
                      [
                        RotateCcw,
                        "Rotate counter-clockwise",
                        () => rotate(-90),
                      ],
                      [RotateCw, "Rotate clockwise", () => rotate(90)],
                      [Crop, "Crop page", () => setCropOpen(true)],
                      [ArrowLeft, "Move page earlier", () => movePage(-1)],
                      [ArrowRight, "Move page later", () => movePage(1)],
                      [
                        Trash2,
                        "Delete page",
                        () => {
                          setPages((p) => p.filter((_, i) => i !== pageIndex));
                          setPageIndex(Math.max(0, pageIndex - 1));
                        },
                      ],
                    ].map(([Icon, title, action]: any) => (
                      <button
                        key={title}
                        title={title}
                        aria-label={title}
                        disabled={!currentPage || ocrRunning || busy}
                        onClick={action}
                      >
                        <Icon size={16} />
                      </button>
                    ))}
                    <button
                      title="Replace page"
                      aria-label="Replace page"
                      disabled={!currentPage || ocrRunning || busy}
                      onClick={() => replaceInput.current?.click()}
                    >
                      <RefreshCw size={16} />
                    </button>
                  </div>
                  <div className="canvas">
                    {currentPage ? (
                      <img
                        alt={`Scanned page ${pageIndex + 1}`}
                        src={currentPage.url}
                        style={{
                          transform: `rotate(${currentPage.rotation}deg) scale(${zoom})`,
                        }}
                      />
                    ) : (
                      <div className="empty">
                        <ScanLine size={44} strokeWidth={1} />
                        <h2>Your next document starts here</h2>
                        <p>Scan a batch or import pages to begin.</p>
                        <button
                          disabled={busy || !canEncode}
                          onClick={() => fileInput.current?.click()}
                        >
                          <Plus size={15} />
                          Import pages
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="thumbnails">
                    {pages.map((p, i) => (
                      <button
                        key={p.id}
                        className={`thumb ${pageIndex === i ? "active" : ""}`}
                        onClick={() => setPageIndex(i)}
                      >
                        <img
                          src={p.url}
                          alt={`Page ${i + 1}`}
                          style={{ transform: `rotate(${p.rotation}deg)` }}
                        />
                        <small>
                          {i + 1}
                          {p.blank ? " · Blank?" : ""}
                        </small>
                      </button>
                    ))}
                    {!!pages.length && (
                      <button
                        className="thumb"
                        disabled={ocrRunning || busy}
                        onClick={() => fileInput.current?.click()}
                      >
                        <Plus size={18} />
                        <small>Add pages</small>
                      </button>
                    )}
                  </div>
                </section>
                <section className="panel ocr">
                  <h2>Text recognition</h2>
                  <p
                    className="muted"
                    style={{ fontSize: 12, lineHeight: 1.7 }}
                  >
                    Extract text from every page to make your document
                    searchable.
                  </p>
                  <label>
                    OCR language
                    <input
                      value={settings.language}
                      onChange={(e) =>
                        setSettings({ ...settings, language: e.target.value })
                      }
                      placeholder="eng or eng+fil"
                      disabled={ocrRunning}
                    />
                  </label>
                  <small>
                    English: eng. Add languages with +, for example eng+spa.
                    Language data downloads on first use; page images are processed in your browser.
                  </small>
                  <button
                    disabled={!pages.length || busy || !canEncode}
                    onClick={() => (ocrRunning ? stopOcr() : void runOcr())}
                  >
                    {ocrRunning ? <X size={15} /> : <FileText size={15} />}{" "}
                    {ocrRunning ? "Cancel OCR" : "Run OCR on all pages"}
                  </button>
                  {(ocrRunning || ocrProgress > 0) && (
                    <>
                      <div className="progress">
                        <div style={{ width: `${ocrProgress}%` }} />
                      </div>
                      <small>{ocrProgress}% complete</small>
                    </>
                  )}
                  <p role="status" aria-live="polite" className="muted">{ocrStatus}</p>
                  <label>Text preview
                    <select value={ocrTextView} onChange={e => setOcrTextView(e.target.value)}>
                      <option value="page">Selected page</option>
                      <option value="all">All pages in document order</option>
                    </select>
                  </label>
                  <textarea
                    aria-label="Extracted OCR text"
                    readOnly
                    value={ocrTextView === "all" ? pages.map((page, index) => `--- Page ${index + 1} ---\n${page.text}`).join("\n\n") : currentPage?.text || ""}
                    placeholder="Extracted page text will appear here."
                  />
                  <small>
                    {pages.length} pages · {pages.filter((p) => p.blank).length}{" "}
                    possibly blank
                  </small>
                  <button
                    disabled={!pages.some((p) => p.blank) || ocrRunning || busy}
                    onClick={() => {
                      if (
                        window.confirm(
                          "Remove all pages marked as possibly blank? Review the thumbnails first.",
                        )
                      ) {
                        setPages((p) => p.filter((p) => !p.blank));
                        setPageIndex(0);
                      }
                    }}
                  >
                    <Trash2 size={14} />
                    Remove blank pages
                  </button>
                  <button
                    disabled={!currentPage || busy || ocrRunning}
                    onClick={() => void scan(true)}
                  >
                    <RefreshCw size={14} />
                    Rescan selected page
                  </button>
                  <label>
                    Output format
                    <select
                      value={outputFormat}
                      disabled={settings.pdfa}
                      onChange={(e) => setOutputFormat(e.target.value)}
                    >
                      <option>PDF</option>
                      <option>JPG</option>
                      <option>TIFF</option>
                    </select>
                  </label>
                  <small>
                    JPG, TIFF, and validated PDF/A export use the Windows
                    bridge.
                  </small>
                  <button
                    className="primary"
                    disabled={!pages.length || busy || ocrRunning || !canEncode}
                    onClick={() => {
                      setEditingQueue(null);
                      setEditingDoc(null);
                      setMeta(emptyMeta);
                      setMetadataOpen(true);
                    }}
                  >
                    Create document <ArrowRight size={15} />
                  </button>
                </section>
              </div>
            </>
          )}
          {view === "Upload Queue" && (
            <>
              <div className="notice">
                {demo
                  ? "Demo uploads add records to this tab only. Files are not sent to S3."
                  : "Keep this tab open while uploads are pending. Files remain in memory until uploaded; failed uploads can be retried."}
              </div>
              <section className="panel">
                <div className="panel-head">
                  <h2>
                    {pending} pending · {failed} failed
                  </h2>
                  <div className="actions">
                    <button
                      disabled={!canEncode || busy}
                      onClick={() => uploadInput.current?.click()}
                    >
                      <Plus size={15} />
                      Add files
                    </button>
                    <button
                      className="primary"
                      disabled={
                        !canEncode || !queue.some((q) => q.status === "Pending")
                      }
                      onClick={() =>
                        queue
                          .filter((q) => q.status === "Pending")
                          .forEach((q) => void upload(q))
                      }
                    >
                      Upload all
                    </button>
                  </div>
                </div>
                {queue.map((q) => (
                  <div className="queue-item" key={q.id}>
                    <div className="file-icon">
                      <FileText size={18} />
                    </div>
                    <div className="grow">
                      <p>{q.title}</p>
                      <small>
                        {bytes(q.file.size)} ·{" "}
                        {q.documentId ? "New document version" : "New document"}{" "}
                        · {q.attempts} attempts
                      </small>
                      {q.error && (
                        <p
                          style={{
                            color: "#b54b4b",
                            fontSize: 12,
                            marginTop: 8,
                          }}
                        >
                          {q.error}
                        </p>
                      )}
                      {q.status === "Uploading" && (
                        <div className="progress">
                          <div style={{ width: `${q.progress}%` }} />
                        </div>
                      )}
                    </div>
                    <span className={`badge ${q.status}`}>{q.status}</span>
                    {q.status !== "Completed" && q.status !== "Uploading" && (
                      <>
                        <button
                          disabled={!canEncode}
                          onClick={() => {
                            setEditingDoc(null);
                            setEditingQueue(q.id);
                            setMeta({
                              ...emptyMeta,
                              ...q.metadata,
                              title: q.title,
                            });
                            setMetadataOpen(true);
                          }}
                        >
                          Edit details
                        </button>
                        <button disabled={!canEncode || busy || ocrRunning || !!reviewingQueue} onClick={()=>void reviewQueueItem(q)}>Review pages</button>
                        <button
                          disabled={
                            !canEncode || q.attempts >= settings.retryCount + 1
                          }
                          onClick={() => void upload(q)}
                        >
                          {q.status === "Failed" ? "Retry" : "Upload"}
                        </button>
                        <button
                          className="icon danger"
                          aria-label={`Remove ${q.title}`}
                          disabled={reviewingQueue === q.id}
                          onClick={() =>
                            setQueue((old) => old.filter((x) => x.id !== q.id))
                          }
                        >
                          <X size={15} />
                        </button>
                      </>
                    )}
                  </div>
                ))}
                {!queue.length && (
                  <div className="empty">
                    <UploadCloud size={40} strokeWidth={1} />
                    <h2>Your queue is clear</h2>
                    <p>Scan a document or add files to start an upload.</p>
                    <button onClick={() => go("Scan")}>
                      Open scan workspace <ArrowRight size={15} />
                    </button>
                  </div>
                )}
              </section>
            </>
          )}
          {view === "Settings" && (
            <>
              <div className="settings-grid">
                <section className="panel form-panel">
                  <h2>DMS connection</h2>
                  <div className="form-grid">
                    <label className="full">
                      DMS API URL
                      <input
                        placeholder="https://your-dms-domain.com/api"
                        readOnly
                        value={settings.apiUrl}
                        onChange={(e) =>
                          setSettings({ ...settings, apiUrl: e.target.value })
                        }
                      />
                    </label>
                    <div className="full actions">
                      <button onClick={() => void testConnection()}>
                        <Wifi size={15} />
                        Test connection
                      </button>
                      <small>Sign out to change your API connection.</small>
                    </div>
                    <label className="full">
                      Scanner bridge URL
                      <input
                        value={settings.bridgeUrl}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            bridgeUrl: e.target.value,
                          })
                        }
                      />
                    </label>
                    <button onClick={() => void checkScanner()}>
                      Check scanner
                    </button>
                  </div>
                </section>
                <section className="panel form-panel">
                  <h2>Scanning defaults</h2>
                  <div className="form-grid">
                    {[
                      ["scanner", "Scanner", ["Fujitsu fi-7180"]],
                      ["dpi", "Default DPI", ["150", "200", "300", "600"]],
                      [
                        "color",
                        "Default color mode",
                        ["Color", "Grayscale", "Black and white"],
                      ],
                      [
                        "pageSize",
                        "Default page size",
                        ["A4", "Letter", "Legal"],
                      ],
                    ].map(([key, label, options]: any) => (
                      <label key={key}>
                        {label}
                        {key === "pageSize" ? <PaperSizeSelect value={settings.pageSize} onChange={pageSize => setSettings({...settings, pageSize})} /> : <select
                          value={(settings as any)[key]}
                          onChange={(e) =>
                            setSettings({ ...settings, [key]: e.target.value })
                          }
                        >
                          {options.map((o: string) => (
                            <option key={o}>{o}</option>
                          ))}
                        </select>}
                      </label>
                    ))}
                  </div>
                  <label className="switch">
                    <span>Default duplex</span>
                    <input
                      type="checkbox"
                      checked={settings.duplex}
                      onChange={(e) =>
                        setSettings({ ...settings, duplex: e.target.checked })
                      }
                    />
                  </label>
                </section>
                <section className="panel form-panel">
                  <h2>Processing & uploads</h2>
                  <label>
                    OCR languages
                    <input
                      value={settings.language}
                      onChange={(e) =>
                        setSettings({ ...settings, language: e.target.value })
                      }
                    />
                  </label>
                  {[
                    ["pdfa", "PDF/A archival output"],
                    ["removeBlank", "Automatically remove blank pages"],
                    ["autoUpload", "Upload automatically"],
                  ].map(([key, label]) => (
                    <label className="switch" key={key}>
                      <span>{label}</span>
                      <input
                        type="checkbox"
                        checked={(settings as any)[key]}
                        onChange={(e) =>
                          setSettings({ ...settings, [key]: e.target.checked })
                        }
                      />
                    </label>
                  ))}
                  <small
                    style={{ display: "block", lineHeight: 1.7, marginTop: 12 }}
                  >
                    PDF/A needs a configured conversion and validation service.
                    Blank pages are flagged for review to avoid losing faint
                    content.
                  </small>
                  <div className="form-grid" style={{ marginTop: 20 }}>
                    <label>
                      Retry count
                      <input
                        type="number"
                        min="0"
                        max="10"
                        value={settings.retryCount}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            retryCount: Math.max(
                              0,
                              Math.min(10, Number(e.target.value)),
                            ),
                          })
                        }
                      />
                    </label>
                    <label>
                      Maximum file size (MB)
                      <input
                        type="number"
                        min="1"
                        max="100"
                        value={settings.maxFileMb}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            maxFileMb: Math.max(
                              1,
                              Math.min(100, Number(e.target.value)),
                            ),
                          })
                        }
                      />
                    </label>
                  </div>
                </section>
                <section className="panel form-panel">
                  <h2>Device & security</h2>
                  <label>
                    Temporary file location
                    <input readOnly value={settings.tempLocation} />
                  </label>
                  <p
                    className="muted"
                    style={{
                      fontSize: 12,
                      lineHeight: 1.7,
                      margin: "12px 0 18px",
                    }}
                  >
                    The browser keeps pages in memory. Configure disk storage in
                    the Windows scanner bridge.
                  </p>
                  <label>
                    Log level
                    <select
                      value={settings.logLevel}
                      onChange={(e) =>
                        setSettings({ ...settings, logLevel: e.target.value })
                      }
                    >
                      {["Error", "Warn", "Info", "Debug"].map((x) => (
                        <option key={x}>{x}</option>
                      ))}
                    </select>
                  </label>
                  <div
                    className="notice"
                    style={{ marginTop: 20, marginBottom: 0 }}
                  >
                    Live sessions expire after 15 minutes of inactivity. The API
                    controls roles; refresh tokens use secure, HTTP-only
                    cookies.
                  </div>
                </section>
              </div>
              {role === "ADMIN" && (
                <section className="panel form-panel" style={{ marginTop: 22 }}>
                  <h2>Document types</h2>
                  <p className="muted">Manage the choices available in Document details for all users.</p>
                  <form className="form-grid" onSubmit={async (event) => {
                    event.preventDefault();
                    if (!newDocumentType.trim() || savingDocumentType) return;
                    setSavingDocumentType(true);
                    try {
                      await request(settings.apiUrl, "/document-types", {method: "POST", body: JSON.stringify({name: newDocumentType.trim()})});
                      setDocumentTypes(await request(settings.apiUrl, "/document-types"));
                      setNewDocumentType("");
                      notify("Document type added.");
                    } catch (error: any) { notify(error.message); }
                    finally { setSavingDocumentType(false); }
                  }}>
                    <label>New document type<input value={newDocumentType} maxLength={100} required onChange={(event) => setNewDocumentType(event.target.value)} placeholder="e.g. Employment Certificate" /></label>
                    <button className="primary" type="submit" disabled={savingDocumentType || !newDocumentType.trim()}>{savingDocumentType ? "Adding…" : "Add document type"}</button>
                  </form>
                  <ul>{documentTypes.map((type) => <li key={type.id}>{type.name}</li>)}</ul>
                </section>
              )}
              {role === "ADMIN" && (
                <section className="panel form-panel" style={{ marginTop: 22 }}>
                  <div className="panel-head" style={{ padding: "0 0 20px" }}>
                    <h2>User management</h2>
                    <button
                      disabled={demo}
                      onClick={() =>
                        void request(settings.apiUrl, "/users")
                          .then(setUsers)
                          .catch((e) => notify(e.message))
                      }
                    >
                      Load users
                    </button>
                  </div>
                  {demo ? (
                    <p className="muted">
                      Connect to your DMS to manage administrator, encoder,
                      reviewer, and read-only accounts.
                    </p>
                  ) : (
                    <>
                      <div className="form-grid">
                        {["name", "email", "password"].map((key) => (
                          <label key={key}>
                            {human(key)}
                            <input
                              type={
                                key === "password"
                                  ? "password"
                                  : key === "email"
                                    ? "email"
                                    : "text"
                              }
                              value={(newUser as any)[key]}
                              onChange={(e) =>
                                setNewUser({
                                  ...newUser,
                                  [key]: e.target.value,
                                })
                              }
                            />
                          </label>
                        ))}
                        <label>
                          Role
                          <select
                            value={newUser.role}
                            onChange={(e) =>
                              setNewUser({ ...newUser, role: e.target.value })
                            }
                          >
                            {["ADMIN", "ENCODER", "REVIEWER", "READ_ONLY"].map(
                              (r) => (
                                <option key={r} value={r}>
                                  {human(r)}
                                </option>
                              ),
                            )}
                          </select>
                        </label>
                        <button
                          onClick={() =>
                            void request(settings.apiUrl, "/users", {
                              method: "POST",
                              body: JSON.stringify(newUser),
                            })
                              .then(() => {
                                setNewUser({
                                  name: "",
                                  email: "",
                                  password: "",
                                  role: "ENCODER",
                                });
                                notify("User created.");
                                return request(settings.apiUrl, "/users");
                              })
                              .then(setUsers)
                              .catch((e) => notify(e.message))
                          }
                        >
                          Create user
                        </button>
                      </div>
                      {users.map((u) => (
                        <div className="queue-item" key={u.id}>
                          <strong>{u.name}</strong>
                          <span>{u.email}</span>
                          <select
                            value={u.role}
                            aria-label={`Role for ${u.name}`}
                            onChange={(e) =>
                              void request(settings.apiUrl, `/users/${u.id}`, {
                                method: "PATCH",
                                body: JSON.stringify({ role: e.target.value }),
                              })
                                .then(() => request(settings.apiUrl, "/users"))
                                .then(setUsers)
                                .catch((e) => notify(e.message))
                            }
                          >
                            {["ADMIN", "ENCODER", "REVIEWER", "READ_ONLY"].map(
                              (r) => (
                                <option key={r}>{r}</option>
                              ),
                            )}
                          </select>
                        </div>
                      ))}
                    </>
                  )}
                </section>
              )}
            </>
          )}
          {view === "Logs" && (
            <section className="panel">
              <div className="panel-head">
                <h2>Audit trail</h2>
                <div className="search">
                  <Search size={15} />
                  <input
                    aria-label="Filter audit events"
                    value={logQuery}
                    onChange={(e) => setLogQuery(e.target.value)}
                    placeholder="Filter events…"
                  />
                </div>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>EVENT</th>
                      <th>USER</th>
                      <th>TIMESTAMP</th>
                      <th>DETAILS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {audits
                      .filter((a) =>
                        `${a.action} ${JSON.stringify(a.details)}`
                          .toLowerCase()
                          .includes(logQuery.toLowerCase()),
                      )
                      .map((a) => (
                        <tr key={a.id}>
                          <td>{human(a.action)}</td>
                          <td>{a.actor?.name || "System"}</td>
                          <td>{new Date(a.createdAt).toLocaleString()}</td>
                          <td
                            style={{
                              maxWidth: 400,
                              whiteSpace: "normal",
                              overflowWrap: "anywhere",
                            }}
                          >
                            {JSON.stringify(a.details || {})}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
                {!audits.length && (
                  <div className="empty">No audit events yet.</div>
                )}
              </div>
            </section>
          )}
          {view === "About" && (
            <section className="panel about">
              <div className="brand" style={{ padding: 0 }}>
                <span className="brand-mark" aria-hidden="true">f</span>Folio360
              </div>
              <h2>Intelligent Document Management</h2>
              <p>
                Capture paper records, organize employee documents, and follow
                each document from upload through review, approval, and archive.
              </p>
              <h2>Connected architecture</h2>
              <p>
                Next.js workspace · NestJS API · PostgreSQL and Prisma · Amazon
                S3 storage · AWS Amplify frontend hosting.
              </p>
              <h2>Scanner integration</h2>
              <p>
                The Fujitsu fi-7180 connects through a local Windows bridge
                using its PaperStream TWAIN driver. Until the bridge is
                configured, import PDF, JPG, or TIFF files exported by your
                scanning software.
              </p>
              <h2>Searchable documents</h2>
              <p>
                OCR runs on every imported page. Page order and orientation are
                preserved in generated PDFs, with A4, Letter, and Legal output.
                SHA-256 checksums accompany uploads. PDF/A output requires a
                separate conversion and validation service.
              </p>
              <h2>Workspace mode</h2>
              <p>
                {demo
                  ? "You are viewing sample records. Demo changes and imported files remain in this tab and are cleared when it closes."
                  : "Your workspace is connected to the configured DMS API. The server manages document access, versioning, and audit history."}
              </p>
              <button onClick={() => go("Settings")}>
                Open settings <ArrowRight size={15} />
              </button>
            </section>
          )}
        </div>
      </main>
      {selected && (
        <div className="overlay" onClick={() => setSelected(null)}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Document details"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <div>
                <small>{selected.documentNumber}</small>
                <h2 style={{ marginTop: 6 }}>{selected.title}</h2>
              </div>
              <button
                className="icon"
                aria-label="Close document"
                onClick={() => setSelected(null)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <span className={`badge ${selected.status}`}>
                {statuses[selected.status]}
              </span>
              <div className="details-grid">
                {[
                  ["Document type", selected.metadata.documentType || "—"],
                  ["Department", selected.metadata.department || "—"],
                  [
                    "Confidentiality",
                    selected.metadata.confidentiality || "Internal",
                  ],
                  ["Document date", selected.metadata.documentDate || "—"],
                  ["File size", bytes(selected.fileSize)],
                ].map(([k, v]) => (
                  <div key={k}>
                    <small>{k}</small>
                    <p>{v}</p>
                  </div>
                ))}
              </div>
              <p className="muted">{selected.description}</p>
              <div className="details-actions">
                <button onClick={() => void download(selected, true)}>
                  <FileText size={15} />
                  Preview / print
                </button>
                <button onClick={() => void download(selected)}>
                  <Download size={15} />
                  Download
                </button>
                {canEncode && selected.status !== "ARCHIVED" && (
                  <button
                    onClick={() => {
                      setEditingQueue(null);
                      setEditingDoc(selected.id);
                      setMeta({
                        ...emptyMeta,
                        ...selected.metadata,
                        title: selected.title,
                        description: selected.description,
                        documentNumber: selected.documentNumber,
                        tags: selected.tags.join(", "),
                      });
                      setMetadataOpen(true);
                    }}
                  >
                    Edit metadata
                  </button>
                )}
                {canEncode && selected.status !== "ARCHIVED" && (
                  <button
                    onClick={() => {
                      versionTarget.current = selected.id;
                      uploadInput.current?.click();
                    }}
                  >
                    <Layers size={15} />
                    Add version
                  </button>
                )}
                {selected.status === "UPLOADED" && canEncode && (
                  <button
                    className="primary"
                    onClick={() => void transition(selected, "IN_REVIEW")}
                  >
                    Submit for review
                  </button>
                )}
                {selected.status === "IN_REVIEW" && canReview && (
                  <button
                    className="primary"
                    onClick={() => void transition(selected, "APPROVED")}
                  >
                    <Check size={15} />
                    Approve
                  </button>
                )}
                {selected.status === "APPROVED" && canReview && (
                  <button
                    className="primary"
                    onClick={() => void transition(selected, "ARCHIVED")}
                  >
                    Archive
                  </button>
                )}
                {role === "ADMIN" && (
                  <button
                    className="danger"
                    onClick={() => void deleteDoc(selected)}
                  >
                    <Trash2 size={15} />
                    Delete
                  </button>
                )}
              </div>
              <h3>Extracted text</h3>
              <div className="ocr-result" style={{ margin: "12px 0 20px" }}>
                {selected.ocrText ||
                  "No OCR text is available for this document."}
              </div>
              <h3>Version history</h3>
              {selected.versions?.map((v) => (
                <p
                  style={{ padding: "12px 0", borderBottom: "1px solid #eee" }}
                  key={v.id}
                >
                  Version {v.version}{" "}
                  <small style={{ marginLeft: 15 }}>{date(v.createdAt)}</small>
                </p>
              ))}
              <h3 style={{ marginTop: 20 }}>Approval & audit history</h3>
              {selected.audits?.length ? (
                selected.audits.map((a) => (
                  <p key={a.id} style={{ padding: "10px 0" }}>
                    {human(a.action)}{" "}
                    <small>
                      {a.actor?.name} · {date(a.createdAt)}
                    </small>
                  </p>
                ))
              ) : (
                <p className="muted" style={{ marginTop: 10 }}>
                  No history attached to this sample record.
                </p>
              )}
              {selected.checksum && (
                <small
                  style={{
                    display: "block",
                    overflowWrap: "anywhere",
                    marginTop: 20,
                  }}
                >
                  SHA-256: {selected.checksum}
                </small>
              )}
            </div>
          </section>
        </div>
      )}
      {metadataOpen && (
        <div className="overlay">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Document metadata"
          >
            <div className="modal-head">
              <h2>Document details</h2>
              <button
                className="icon"
                onClick={() => setMetadataOpen(false)}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                {[
                  ["title", "Title"],
                  ["documentNumber", "Document number (automatic if empty)"],
                  ["documentType", "Document type"],
                  ["documentDate", "Document date"],
                  ["department", "Department"],
                  ["confidentiality", "Confidentiality"],
                  ["tags", "Tags (comma separated)"],
                ].map(([key, label]) => (
                  <label key={key}>
                    {label}
                    {key === "documentType" || key === "department" ? (
                      <CatalogSelect label={label} value={meta[key]} items={key === "documentType" ? documentTypes.map(type => type.name) : departments} canAdd={role === "ADMIN"}
                        onChange={value => setMeta(current => ({...current,[key]:value}))}
                        onAdd={async name => {
                          const endpoint = key === "documentType" ? "/document-types" : "/departments";
                          const created = await request(settings.apiUrl, endpoint, {method:"POST",body:JSON.stringify({name})});
                          const items = await request(settings.apiUrl, endpoint);
                          if(key === "documentType") setDocumentTypes(items); else setDepartments(items);
                          setMeta(current => ({...current,[key]:created.name}));
                        }} />
                    ) : key === "confidentiality" ? (
                      <select
                        value={meta.confidentiality}
                        onChange={(e) =>
                          setMeta({ ...meta, confidentiality: e.target.value })
                        }
                      >
                        {[
                          "Public",
                          "Internal",
                          "Confidential",
                          "Restricted",
                        ].map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={key === "documentDate" ? "date" : "text"}
                        value={(meta as any)[key]}
                        onChange={(e) =>
                          setMeta({ ...meta, [key]: e.target.value })
                        }
                      />
                    )}
                  </label>
                ))}
                <label className="full">
                  Description
                  <textarea
                    value={meta.description}
                    onChange={(e) =>
                      setMeta({ ...meta, description: e.target.value })
                    }
                  />
                </label>
              </div>
              <p className="muted" style={{ marginTop: 20, fontSize: 12 }}>
                {editingQueue || editingDoc
                  ? "Editing document details"
                  : pages.length + " pages · " + settings.pageSize}{" "}
                ·{" "}
                {settings.pdfa
                  ? "PDF/A requested"
                  : "PDF with OCR where available"}
              </p>
            </div>
            <div className="modal-footer">
              <button onClick={() => setMetadataOpen(false)}>Cancel</button>
              <button
                className="primary"
                disabled={busy}
                onClick={() => void makeDocument()}
              >
                {busy
                  ? "Processing…"
                  : editingQueue || editingDoc
                    ? "Save metadata"
                    : "Generate & queue document"}
              </button>
            </div>
          </section>
        </div>
      )}
      {cropOpen && (
        <div className="overlay">
          <section
            className="modal login"
            role="dialog"
            aria-modal="true"
            aria-label="Crop page"
          >
            <div className="modal-head">
              <h2>Crop page</h2>
              <button
                className="icon"
                onClick={() => setCropOpen(false)}
                aria-label="Close crop"
              >
                <X size={17} />
              </button>
            </div>
            <div className="modal-body">
              <p className="muted" style={{ marginBottom: 20 }}>
                Set the crop rectangle as percentages of the rotated page.
              </p>
              <div className="form-grid">
                {Object.entries(crop).map(([key, value]) => (
                  <label key={key}>
                    {human(key)} (%)
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={value}
                      onChange={(e) =>
                        setCrop({ ...crop, [key]: Number(e.target.value) })
                      }
                    />
                  </label>
                ))}
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setCropOpen(false)}>Cancel</button>
              <button className="primary" onClick={() => void applyCrop()}>
                Apply crop
              </button>
            </div>
          </section>
        </div>
      )}
      {login && (
        <div className="overlay">
          <section
            className="modal login"
            role="dialog"
            aria-modal="true"
            aria-label="Sign in"
          >
            <div className="modal-head">
              <h2>Sign in to your DMS</h2>
              <button
                className="icon"
                aria-label="Close sign in"
                onClick={() => setLogin(false)}
              >
                <X size={18} />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void signIn();
              }}
            >
              <div className="modal-body">
                <label>
                  Email address
                  <input
                    type="email"
                    autoComplete="username"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </label>
                <label style={{ marginTop: 18 }}>
                  Password
                  <input
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </label>
                <p
                  className="muted"
                  style={{ fontSize: 12, lineHeight: 1.7, marginTop: 20 }}
                >
                  Use an account provisioned by your DMS administrator.
                </p>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  onClick={() => {
                    setLogin(false);
                    go("Settings");
                  }}
                >
                  Connection settings
                </button>
                <button className="primary" disabled={busy} type="submit">
                  {busy ? "Signing in…" : "Sign in"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <Info size={17} />
          <span>{toast}</span>
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
