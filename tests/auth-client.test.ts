import { test } from "node:test";
import assert from "node:assert/strict";
import { clearToken, request, scannerHeaders } from "../apps/web/lib/api";
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
