import { test } from "node:test";
import assert from "node:assert/strict";
import { clearToken, request, scannerHeaders } from "../apps/web/lib/api";
test("temporary refresh failures preserve the session, but rejected credentials clear it", async () => {
  const original = globalThis.fetch;
  try {
    for (const status of [503, 401]) {
      clearToken();
      globalThis.fetch = async (url) => {
        if (String(url).endsWith("/auth/login")) return Response.json({accessToken:"test-token"});
        return Response.json({message:"Unavailable"}, {status:String(url).endsWith("/auth/refresh") ? status : 401});
      };
      await request("https://dms.example/api", "/auth/login", {method:"POST"});
      await assert.rejects(request("https://dms.example/api", "/documents"));
      if (status === 503) assert.equal(scannerHeaders("https://dms.example/api", "https://localhost:17483").Authorization, "Bearer test-token");
      else assert.throws(() => scannerHeaders("https://dms.example/api", "https://localhost:17483"), /Sign in/);
    }
  } finally { globalThis.fetch=original; clearToken(); }
});
test("logout never attempts token refresh when a session is already expired", async () => {
  const original = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = async (url) => { calls.push(String(url)); return Response.json({message:"Expired"},{status:401}); };
  try { await assert.rejects(request("https://dms.example/api", "/auth/logout", {method:"POST"})); assert.deepEqual(calls,["https://dms.example/api/auth/logout"]); }
  finally { globalThis.fetch=original; clearToken(); }
});
test("access tokens stay scoped to the signed-in API and are cleared on logout", async () => {
  const original = globalThis.fetch;
  const calls: RequestInit[] = [];
  globalThis.fetch = async (_url, options) => {
    calls.push(options!);
    return Response.json(
      String(_url).endsWith("/auth/login")
        ? { accessToken: "test-token" }
        : { ok: true },
    );
  };
  try {
    clearToken();
    await request("https://dms.example/api", "/auth/login", { method: "POST" });
    await request("https://dms.example/api", "/documents");
    assert.equal((calls[1].headers as any).Authorization, "Bearer test-token");
    await request("https://other.example/api", "/documents");
    assert.equal((calls[2].headers as any).Authorization, undefined);
    assert.throws(
      () => scannerHeaders("https://dms.example/api", "https://remote.example"),
      /loopback/,
    );
    clearToken();
    await request("https://dms.example/api", "/documents");
    assert.equal((calls[3].headers as any).Authorization, undefined);
  } finally {
    globalThis.fetch = original;
    clearToken();
  }
});
test("a late response cannot restore credentials after logout", async () => {
  const original = globalThis.fetch;
  let finish!: (value: Response) => void;
  globalThis.fetch = () =>
    new Promise<Response>((r) => {
      finish = r;
    });
  try {
    const pending = request("https://dms.example/api", "/auth/login", {
      method: "POST",
    });
    clearToken();
    finish(Response.json({ accessToken: "stale-token" }));
    await assert.rejects(pending);
    assert.throws(
      () =>
        scannerHeaders("https://dms.example/api", "https://localhost:17483"),
      /Sign in/,
    );
  } finally {
    globalThis.fetch = original;
    clearToken();
  }
});
