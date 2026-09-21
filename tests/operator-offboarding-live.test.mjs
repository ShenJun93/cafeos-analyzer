import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  OPERATOR_ACCEPTANCE_STAGING_URL,
  OPERATOR_ACCEPTANCE_TENANT_ID,
  verifyOperatorUserOffboardingLive
} from "../scripts/verify-operator-user-offboarding-live.mjs";

const SECRET = "sb_secret_operator_acceptance_test";
const PUBLISHABLE = "sb_publishable_operator_acceptance_test";
const USER_ID = "a3000000-0000-4000-8000-000000000001";
const EXISTING_OWNER_ID = "987c2476-ea27-4485-a75b-f382bcf04dc7";
const JWT = "eyJ.synthetic.acceptance.jwt";

function jsonResponse(value, status = 200) {
  return new Response(value === null ? null : JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function noContent(status = 204) {
  return new Response(null, { status });
}

function liveFixture({ failSignIn = false, staleJwtStatus = 200 } = {}) {
  const calls = [];
  let userExists = false;
  let membershipExists = false;

  const fetchImpl = async (url, options = {}) => {
    const u = new URL(url);
    const method = options.method ?? "GET";
    const headers = options.headers ?? {};
    const authorization = headers.authorization ?? headers.Authorization;
    calls.push({
      method,
      pathname: u.pathname,
      search: u.search,
      headers,
      body: options.body
    });

    if (u.pathname === "/auth/v1/admin/users" && method === "POST") {
      userExists = true;
      return jsonResponse({ id: USER_ID }, 201);
    }

    if (u.pathname === "/rest/v1/tenant_members" && method === "POST") {
      const body = JSON.parse(options.body);
      assert.equal(body.tenant_id, OPERATOR_ACCEPTANCE_TENANT_ID);
      assert.equal(body.user_id, USER_ID);
      assert.equal(body.role, "viewer");
      membershipExists = true;
      return noContent(201);
    }

    if (u.pathname === "/auth/v1/token" && method === "POST") {
      if (failSignIn) return jsonResponse({ error_code: "invalid_credentials" }, 400);
      return jsonResponse({ access_token: JWT });
    }

    if (u.pathname === "/auth/v1/admin/users/" + USER_ID && method === "GET") {
      return userExists
        ? jsonResponse({ id: USER_ID })
        : jsonResponse({ error_code: "user_not_found" }, 404);
    }

    if (u.pathname === "/rest/v1/tenant_members" && method === "DELETE") {
      membershipExists = false;
      return noContent();
    }

    if (u.pathname === "/rest/v1/tenant_members" && method === "GET") {
      const isCaller = authorization === "Bearer " + JWT;
      if (isCaller && !membershipExists && staleJwtStatus !== 200) {
        return jsonResponse({ error_code: "session_not_found" }, staleJwtStatus);
      }
      const requestedUserId = u.searchParams.get("user_id");
      const rows = [
        { tenant_id: OPERATOR_ACCEPTANCE_TENANT_ID, user_id: EXISTING_OWNER_ID, role: "owner" },
        ...(membershipExists
          ? [{ tenant_id: OPERATOR_ACCEPTANCE_TENANT_ID, user_id: USER_ID, role: "viewer" }]
          : [])
      ];
      if (requestedUserId === `eq.${USER_ID}`) {
        return jsonResponse(rows.filter(row => row.user_id === USER_ID));
      }
      return jsonResponse(rows);
    }

    if (u.pathname === "/auth/v1/user" && method === "GET") {
      assert.equal(authorization, "Bearer " + JWT);
      return jsonResponse({ id: USER_ID });
    }

    if (u.pathname === "/auth/v1/logout" && method === "POST") {
      assert.equal(authorization, "Bearer " + JWT);
      return noContent();
    }

    if (u.pathname === "/auth/v1/admin/users/" + USER_ID && method === "DELETE") {
      userExists = false;
      return jsonResponse({ id: USER_ID });
    }

    return jsonResponse({ error_code: "unexpected_request" }, 500);
  };

  return {
    calls,
    fetchImpl,
    state: () => ({ userExists, membershipExists })
  };
}

test("live acceptance creates an ephemeral staging user and proves full offboarding order", async () => {
  const fixture = liveFixture();
  const logs = [];

  const receipt = await verifyOperatorUserOffboardingLive({
    supabaseUrl: OPERATOR_ACCEPTANCE_STAGING_URL,
    secretKey: SECRET,
    publishableKey: PUBLISHABLE,
    fetchImpl: fixture.fetchImpl,
    uuid: () => "11111111-2222-4333-8444-555555555555",
    passwordBytes: () => Buffer.alloc(32, 7),
    now: () => new Date("2026-09-21T12:30:00.000Z"),
    log: value => logs.push(value)
  });

  assert.equal(receipt.result, "pass");
  assert.equal(receipt.membershipBefore, 1);
  assert.equal(receipt.staleJwtMembershipRows, 0);
  assert.equal(receipt.staleJwtOutcome, "rls_denied");
  assert.equal(receipt.sessionRevocation, "global_signout_then_auth_user_hard_delete");
  assert.equal(receipt.authUserDeleted, true);
  assert.deepEqual(fixture.state(), { userExists: false, membershipExists: false });

  const callerMembershipReads = fixture.calls.filter(
    call =>
      call.pathname === "/rest/v1/tenant_members" &&
      call.method === "GET" &&
      (call.headers.authorization ?? call.headers.Authorization) === "Bearer " + JWT
  );
  assert.ok(callerMembershipReads.length >= 2);
  for (const call of callerMembershipReads) {
    const params = new URLSearchParams(call.search);
    assert.equal(params.get("tenant_id"), "eq." + OPERATOR_ACCEPTANCE_TENANT_ID);
    assert.equal(params.get("user_id"), "eq." + USER_ID);
  }

  const membershipDelete = fixture.calls.findIndex(
    call => call.pathname === "/rest/v1/tenant_members" && call.method === "DELETE"
  );
  const logout = fixture.calls.findIndex(
    call => call.pathname === "/auth/v1/logout" && call.method === "POST"
  );
  const userDelete = fixture.calls.findIndex(
    call => call.pathname === "/auth/v1/admin/users/" + USER_ID && call.method === "DELETE"
  );
  assert.ok(membershipDelete >= 0);
  assert.ok(logout > membershipDelete);
  assert.ok(userDelete > logout);

  assert.equal(logs.length, 1);
  assert.equal(logs[0].includes(USER_ID), false);
  assert.equal(logs[0].includes(SECRET), false);
  assert.equal(logs[0].includes(PUBLISHABLE), false);
  assert.equal(logs[0].includes(JWT), false);
  assert.doesNotMatch(logs[0], /cafeos\.offboarding\.acceptance/i);
  assert.match(logs[0], /sha256:/);
});

test("live acceptance treats explicit stale-session rejection as secure", async () => {
  const fixture = liveFixture({ staleJwtStatus: 401 });
  const receipt = await verifyOperatorUserOffboardingLive({
    supabaseUrl: OPERATOR_ACCEPTANCE_STAGING_URL,
    secretKey: SECRET,
    publishableKey: PUBLISHABLE,
    fetchImpl: fixture.fetchImpl,
    uuid: () => "11111111-2222-4333-8444-666666666666",
    passwordBytes: () => Buffer.alloc(32, 9)
  });
  assert.equal(receipt.result, "pass");
  assert.equal(receipt.staleJwtOutcome, "session_rejected");
  assert.equal(receipt.staleJwtMembershipRows, 0);
});

test("live acceptance cleanup removes ephemeral user and membership after intermediate failure", async () => {
  const fixture = liveFixture({ failSignIn: true });

  await assert.rejects(
    verifyOperatorUserOffboardingLive({
      supabaseUrl: OPERATOR_ACCEPTANCE_STAGING_URL,
      secretKey: SECRET,
      publishableKey: PUBLISHABLE,
      fetchImpl: fixture.fetchImpl,
      uuid: () => "11111111-2222-4333-8444-777777777777",
      passwordBytes: () => Buffer.alloc(32, 3)
    }),
    /status=400 code=invalid_credentials/
  );

  assert.deepEqual(fixture.state(), { userExists: false, membershipExists: false });
  assert.ok(
    fixture.calls.some(
      call => call.pathname === "/rest/v1/tenant_members" && call.method === "DELETE"
    )
  );
  assert.ok(
    fixture.calls.some(
      call => call.pathname === "/auth/v1/admin/users/" + USER_ID && call.method === "DELETE"
    )
  );
});

test("live acceptance refuses any Supabase project except pinned synthetic staging", async () => {
  let called = false;
  await assert.rejects(
    verifyOperatorUserOffboardingLive({
      supabaseUrl: "https://different-project.supabase.co",
      secretKey: SECRET,
      publishableKey: PUBLISHABLE,
      fetchImpl: async () => {
        called = true;
        return jsonResponse({});
      }
    }),
    /pinned to CafeOS synthetic staging/
  );
  assert.equal(called, false);
});

test("secure launcher prompts locally and clears temporary elevated credentials", async () => {
  const source = await readFile(
    new URL("../scripts/run-operator-user-offboarding-live.ps1", import.meta.url),
    "utf8"
  );

  assert.match(source, /Read-Host "Staging SUPABASE_SECRET_KEY \(sb_secret_\.\.\.\)" -AsSecureString/);
  assert.match(source, /Read-Host "Staging SUPABASE_PUBLISHABLE_KEY \(sb_publishable_\.\.\.\)" -AsSecureString/);
  assert.match(source, /SecureStringToBSTR/);
  assert.match(source, /ZeroFreeBSTR/);
  assert.match(source, /Remove-Item Env:SUPABASE_SECRET_KEY/);
  assert.match(source, /Remove-Item Env:SUPABASE_PUBLISHABLE_KEY/);
  assert.match(source, /Remove-Item Env:CAFEOS_TARGET_USER_JWT/);
  assert.match(source, /wjatnyvdygvblirggdcm\.supabase\.co/);
  assert.doesNotMatch(source, /sb_secret_[A-Za-z0-9_-]{10,}/);
});
