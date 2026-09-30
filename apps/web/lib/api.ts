let accessToken = "",
  tokenBase = "";
let sessionController = new AbortController();
let sessionRevision = 0;
export class ApiError extends Error {
  constructor(message: string, public readonly status: number) { super(message); }
}
export const getSessionRevision = () => sessionRevision;
const restoring = new Map<string, Promise<any>>();
export function restoreSession(base: string) {
  const key = `${sessionRevision}:${base}`;
  let pending = restoring.get(key);
  if (!pending) {
    pending = request(base, "/auth/refresh", { method: "POST" }, false)
      .finally(() => restoring.delete(key));
    restoring.set(key, pending);
  }
  return pending;
}
export function scannerHeaders(base: string, bridge: string) {
  const url = new URL(bridge);
  if (
    url.protocol !== "https:" ||
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    url.username ||
    url.password
  )
    throw new Error("The scanner bridge must use an HTTPS loopback address.");
  if (!accessToken || tokenBase !== base)
    throw new Error("Sign in before using the scanner.");
  return { Authorization: `Bearer ${accessToken}` };
}
export function clearToken() {
  sessionRevision++;
  sessionController.abort();
  sessionController = new AbortController();
  accessToken = "";
  tokenBase = "";
}
export function localApiUrl(base:string, pageHostname:string):string {
  const url=new URL(base);
  const local=['localhost','127.0.0.1'];
  if(url.protocol==='http:' && local.includes(url.hostname) && local.includes(pageHostname))
    url.hostname=pageHostname;
  return url.toString().replace(/\/$/,'');
}
export async function request(
  base: string,
  path: string,
  options: RequestInit = {},
  retry = true,
): Promise<any> {
  const scope = sessionController;
  const url = new URL(typeof window !== 'undefined' ? localApiUrl(base,window.location.hostname) : base);
  if (
    url.protocol !== "https:" &&
    !["localhost", "127.0.0.1"].includes(url.hostname)
  )
    throw new Error("The DMS API must use HTTPS.");
  const response = await fetch(url.toString().replace(/\/$/, "") + path, {
    ...options,
    signal: AbortSignal.any([
      scope.signal,
      ...(options.signal ? [options.signal] : []),
      AbortSignal.timeout(30000),
    ]),
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(accessToken && tokenBase === base
        ? { Authorization: `Bearer ${accessToken}` }
        : {}),
      ...options.headers,
    },
  });
  if (
    response.status === 401 &&
    retry &&
    path !== "/auth/login" &&
    path !== "/auth/refresh" &&
    path !== "/auth/logout"
  ) {
    try {
      await restoreSession(base);
    } catch (error) {
      // Only an explicit authentication rejection ends the session. Offline,
      // timeout and server errors can be retried without discarding credentials.
      if (!scope.signal.aborted && error instanceof ApiError && error.status === 401) {
        clearToken();
        if (typeof window !== "undefined")
          window.dispatchEvent(new Event("dms-session-expired"));
      }
      throw error;
    }
    return request(base, path, options, false);
  }
  const data = await response.json().catch(() => ({}));
  scope.signal.throwIfAborted();
  if (
    response.status === 401 &&
    path !== "/auth/login" &&
    path !== "/auth/refresh" &&
    path !== "/auth/logout"
  ) {
    clearToken();
    if (typeof window !== "undefined")
      window.dispatchEvent(new Event("dms-session-expired"));
  }
  if (!response.ok)
    throw new ApiError(
      response.status === 429 && path === "/auth/login"
        ? "Login attempt limit reached (3 attempts). Wait 15 minutes before trying again."
        : Array.isArray(data.message)
        ? data.message.join(", ")
        : data.message || `Request failed (${response.status})`,
      response.status,
    );
  if (data.accessToken) {
    accessToken = data.accessToken;
    tokenBase = base;
  }
  return data;
}
