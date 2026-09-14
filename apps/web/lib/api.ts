let accessToken = "",
  tokenBase = "";
let refreshing: Promise<any> | null = null;
let sessionController = new AbortController();
let sessionRevision = 0;
export const getSessionRevision = () => sessionRevision;
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
export async function request(
  base: string,
  path: string,
  options: RequestInit = {},
  retry = true,
): Promise<any> {
  const scope = sessionController;
  const url = new URL(base);
  if (
    url.protocol !== "https:" &&
    !["localhost", "127.0.0.1"].includes(url.hostname)
  )
    throw new Error("The DMS API must use HTTPS.");
  const response = await fetch(base.replace(/\/$/, "") + path, {
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
    path !== "/auth/refresh"
  ) {
    if (!refreshing)
      refreshing = request(
        base,
        "/auth/refresh",
        { method: "POST" },
        false,
      ).finally(() => {
        refreshing = null;
      });
    try {
      await refreshing;
    } catch (error) {
      clearToken();
      if (typeof window !== "undefined")
        window.dispatchEvent(new Event("dms-session-expired"));
      throw error;
    }
    return request(base, path, options, false);
  }
  const data = await response.json().catch(() => ({}));
  scope.signal.throwIfAborted();
  if (
    response.status === 401 &&
    path !== "/auth/login" &&
    path !== "/auth/refresh"
  ) {
    clearToken();
    if (typeof window !== "undefined")
      window.dispatchEvent(new Event("dms-session-expired"));
  }
  if (!response.ok)
    throw new Error(
      Array.isArray(data.message)
        ? data.message.join(", ")
        : data.message || `Request failed (${response.status})`,
    );
  if (data.accessToken) {
    accessToken = data.accessToken;
    tokenBase = base;
  }
  return data;
}
