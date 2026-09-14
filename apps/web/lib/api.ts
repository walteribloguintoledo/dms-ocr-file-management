let accessToken = "",
  tokenBase = "";
let refreshing: Promise<any> | null = null;
export function clearToken() {
  accessToken = "";
  tokenBase = "";
}
export async function request(
  base: string,
  path: string,
  options: RequestInit = {},
  retry = true,
): Promise<any> {
  const url = new URL(base);
  if (
    url.protocol !== "https:" &&
    !["localhost", "127.0.0.1"].includes(url.hostname)
  )
    throw new Error("The DMS API must use HTTPS.");
  const response = await fetch(base.replace(/\/$/, "") + path, {
    ...options,
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
    if (!refreshing) refreshing = request(base, "/auth/refresh", { method: "POST" }, false).finally(() => { refreshing = null; });
    await refreshing;
    return request(base, path, options, false);
  }
  const data = await response.json().catch(() => ({}));
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
