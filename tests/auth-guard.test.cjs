require("reflect-metadata");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { AuthGuard } = require("../apps/api/dist/auth.guard.js");
function setup({
  roles,
  role = "READ_ONLY",
  revoked = false,
  active = true,
  subject = "user",
  owner = "user",
  publicRoute = false,
} = {}) {
  const req = { headers: { authorization: "Bearer test-token" } };
  const context = {
    getHandler: () => function () {},
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => req }),
  };
  const reflector = {
    getAllAndOverride: (key) => (key === "public" ? publicRoute : roles),
  };
  const jwt = {
    verifyAsync: async (token) => {
      if (!token) throw Error();
      return { sub: subject, sid: "session" };
    },
  };
  const store = {
    refreshSession: {
      findUnique: async () => ({
        id: "session",
        userId: owner,
        expiresAt: new Date(Date.now() + 60000),
        revokedAt: revoked ? new Date() : null,
        user: { id: owner, role, active },
      }),
    },
  };
  return { guard: new AuthGuard(jwt, reflector, store), context, req };
}
test("anonymous access is denied", async () => {
  const t = setup();
  t.req.headers = {};
  await assert.rejects(
    () => t.guard.canActivate(t.context),
    (e) => e.getStatus() === 401,
  );
});
test("only administrators can access account management", async () => {
  for (const role of ["ENCODER", "REVIEWER", "READ_ONLY"]) {
    const t = setup({ role, roles: ["ADMIN"] });
    await assert.rejects(
      () => t.guard.canActivate(t.context),
      (e) => e.getStatus() === 403,
    );
  }
  const t = setup({ role: "ADMIN", roles: ["ADMIN"] });
  assert.equal(await t.guard.canActivate(t.context), true);
});
test("revoked sessions, disabled users, and mismatched subjects are denied", async () => {
  for (const options of [
    { revoked: true },
    { active: false },
    { subject: "attacker" },
  ]) {
    const t = setup(options);
    await assert.rejects(
      () => t.guard.canActivate(t.context),
      (e) => e.getStatus() === 401,
    );
  }
});
test("roles are taken from the current database record", async () => {
  const t = setup({ role: "READ_ONLY", roles: ["ADMIN", "ENCODER"] });
  await assert.rejects(
    () => t.guard.canActivate(t.context),
    (e) => e.getStatus() === 403,
  );
});
test("public login and health routes remain reachable", async () => {
  const t = setup({ publicRoute: true });
  t.req.headers = {};
  assert.equal(await t.guard.canActivate(t.context), true);
});
test("scanner access is limited to administrators and encoders", async () => {
  for (const role of ["REVIEWER", "READ_ONLY"]) {
    const t = setup({ role, roles: ["ADMIN", "ENCODER"] });
    await assert.rejects(
      () => t.guard.canActivate(t.context),
      (e) => e.getStatus() === 403,
    );
  }
  for (const role of ["ADMIN", "ENCODER"]) {
    const t = setup({ role, roles: ["ADMIN", "ENCODER"] });
    assert.equal(await t.guard.canActivate(t.context), true);
  }
});
