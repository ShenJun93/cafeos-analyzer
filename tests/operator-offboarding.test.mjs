import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { offboardUser } from "../scripts/operator-offboard-user.mjs";

const BASE = "https://example.supabase.co";
const SECRET = "sb_secret_operator_test";
const USER_ID = "a1000000-0000-4000-8000-000000000001";
const OTHER_USER_ID = "b1000000-0000-4000-8000-000000000002";
const JWT = "eyJ.synthetic.target.jwt";

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function noContent(status = 204) {
  return new Response(null, { status });
}

function operatorFixture({ accountExists = true, memberships = 2 } = {}) {
  const calls = [];
  let userExists = accountExists;
  let rows = Array.from({ length: memberships }, (_, index) => ({
    tenant_id: String(index + 1) + "0000000-0000-4000-8000-00000000000" + String(index + 1),
    user_id: USER_ID,
    role: index === 0 ? "owner" : "viewer"
  }));

  const fetchImpl = async (url, options = {}) => {
    const u = new URL(url);
    const method = options.method ?? "GET";
    calls.push({ method, pathname: u.pathname, search: u.search, headers: options.headers ?? {}, body: options.body });

    if (u.pathname === "/auth/v1/admin/users/" + USER_ID && method === "GET") {
      return userExists ? jsonResponse({ id: USER_ID }) : jsonResponse({ error_code: "user_not_found" }, 404);
    }

    if (u.pathname === "/rest/v1/tenant_members" && method === "GET") {
      return jsonResponse(rows);
    }

    if (u.pathname === "/rest/v1/tenant_members" && method === "DELETE") {
      rows = [];
      return noContent();
    }

    if (u.pathname === "/auth/v1/user" && method === "GET") {
      return jsonResponse({ id: USER_ID });
    }

    if (u.pathname === "/auth/v1/logout" && method === "POST") {
      return noContent();
    }

    if (u.pathname === "/auth/v1/admin/users/" + USER_ID && method === "DELETE") {
      userExists = false;
      return jsonResponse({ id: USER_ID });
    }

    return jsonResponse({ error_code: "unexpected_request" }, 500);
  };

  return { calls, fetchImpl };
}

test("operator offboarding is dry-run by default and logs no raw user id or secret", async () => {
  const { calls, fetchImpl } = operatorFixture();
  const logs = [];
  const result = await offboardUser({
    supabaseUrl: BASE,
    secretKey: SECRET,
    userId: USER_ID,
    fetchImpl,
    log: value => logs.push(value)
  });

  assert.equal(result.mode, "dry_run");
  assert.equal(result.membershipCount, 2);
  assert.equal(calls.some(call => ["DELETE", "POST", "PUT", "PATCH"].includes(call.method)), false);
  assert.equal(logs.length, 1);
  assert.equal(logs[0].includes(USER_ID), false);
  assert.equal(logs[0].includes(SECRET), false);
  assert.match(logs[0], /sha256:/);
});

test("execute removes memberships before global logout and Auth hard-delete", async () => {
  const { calls, fetchImpl } = operatorFixture();
  const logs = [];

  const result = await offboardUser({
    supabaseUrl: BASE,
    secretKey: SECRET,
    userId: USER_ID,
    confirmUserId: USER_ID,
    execute: true,
    targetUserJwt: JWT,
    fetchImpl,
    now: () => new Date("2026-09-21T11:45:00.000Z"),
    log: value => logs.push(value)
  });

  assert.equal(result.result, "completed");
  assert.equal(result.membershipsRemoved, 2);
  assert.equal(result.sessionRevocation, "global_signout_then_auth_user_hard_delete");
  assert.equal(result.authUserDeleted, true);
  assert.equal(result.completedAt, "2026-09-21T11:45:00.000Z");
  assert.equal(logs[0].includes(USER_ID), false);
  assert.equal(logs[0].includes(SECRET), false);
  assert.equal(logs[0].includes(JWT), false);

  const membershipDelete = calls.findIndex(call => call.pathname === "/rest/v1/tenant_members" && call.method === "DELETE");
  const membershipVerify = calls.findIndex((call, index) =>
    index > membershipDelete &&
    call.pathname === "/rest/v1/tenant_members" &&
    call.method === "GET"
  );
  const jwtVerify = calls.findIndex(call => call.pathname === "/auth/v1/user");
  const logout = calls.findIndex(call => call.pathname === "/auth/v1/logout");
  const authDelete = calls.findIndex(call => call.pathname === "/auth/v1/admin/users/" + USER_ID && call.method === "DELETE");

  assert.ok(membershipDelete >= 0);
  assert.ok(membershipVerify > membershipDelete);
  assert.ok(jwtVerify > membershipVerify);
  assert.ok(logout > jwtVerify);
  assert.ok(authDelete > logout);

  for (const call of calls) {
    assert.equal(call.headers.apikey, SECRET);
    assert.notEqual(call.headers.Authorization, "Bearer " + SECRET);
  }
  assert.equal(calls[jwtVerify].headers.Authorization, "Bearer " + JWT);
  assert.equal(calls[logout].headers.Authorization, "Bearer " + JWT);
  assert.deepEqual(JSON.parse(calls[authDelete].body), { should_soft_delete: false });
});

test("execute without target JWT still deletes Auth user after membership revocation", async () => {
  const { calls, fetchImpl } = operatorFixture({ memberships: 1 });
  const result = await offboardUser({
    supabaseUrl: BASE,
    secretKey: SECRET,
    userId: USER_ID,
    confirmUserId: USER_ID,
    execute: true,
    fetchImpl
  });

  assert.equal(result.sessionRevocation, "auth_user_hard_delete");
  assert.equal(calls.some(call => call.pathname === "/auth/v1/logout"), false);
  assert.equal(calls.some(call => call.pathname === "/auth/v1/admin/users/" + USER_ID && call.method === "DELETE"), true);
});

test("confirmation mismatch fails before any mutation", async () => {
  const { calls, fetchImpl } = operatorFixture();
  await assert.rejects(
    offboardUser({
      supabaseUrl: BASE,
      secretKey: SECRET,
      userId: USER_ID,
      confirmUserId: OTHER_USER_ID,
      execute: true,
      fetchImpl
    }),
    /confirmUserId must exactly match userId/
  );
  assert.equal(calls.some(call => ["DELETE", "POST", "PUT", "PATCH"].includes(call.method)), false);
});

test("target JWT must belong to the requested user before global logout", async () => {
  const { calls, fetchImpl: baseFetch } = operatorFixture();
  const fetchImpl = async (url, options = {}) => {
    const u = new URL(url);
    if (u.pathname === "/auth/v1/user") {
      calls.push({ method: options.method ?? "GET", pathname: u.pathname, headers: options.headers ?? {} });
      return jsonResponse({ id: OTHER_USER_ID });
    }
    return baseFetch(url, options);
  };

  await assert.rejects(
    offboardUser({
      supabaseUrl: BASE,
      secretKey: SECRET,
      userId: USER_ID,
      confirmUserId: USER_ID,
      execute: true,
      targetUserJwt: JWT,
      fetchImpl
    }),
    /does not belong to the requested user/
  );
  assert.equal(calls.some(call => call.pathname === "/auth/v1/logout"), false);
  assert.equal(calls.some(call => call.pathname === "/auth/v1/admin/users/" + USER_ID && call.method === "DELETE"), false);
  assert.ok(calls.some(call => call.pathname === "/rest/v1/tenant_members" && call.method === "DELETE"));
});

test("operator script never contains hard-coded elevated credentials or direct auth.sessions mutation", async () => {
  const source = await readFile(
    new URL("../scripts/operator-offboard-user.mjs", import.meta.url),
    "utf8"
  );
  assert.match(source, /SUPABASE_SECRET_KEY/);
  assert.match(source, /sb_secret_/);
  assert.match(source, /\/auth\/v1\/logout\?scope=global/);
  assert.match(source, /\/auth\/v1\/admin\/users\//);
  assert.doesNotMatch(source, /service_role/i);
  assert.doesNotMatch(source, /auth\.sessions/i);
  assert.doesNotMatch(source, /sb_secret_[A-Za-z0-9_-]{10,}/);
});
