// Pre-migration SECURITY PREFLIGHT ONLY. These tests exercise existing
// auth/dispatch + untrusted provenance reviewer and real repository boundaries.
// They are NOT PostgreSQL RLS, a trusted connector, or signed-JWT staging tests.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  appContext, requireCommerceManagerRole
} from "../api/_app-auth.mjs";
import { WORKFLOW_ROUTES, dispatchWorkflow } from "../api/app/workflow.mjs";
import { inspectNamespaceAccountClaims } from "../server/commerce/source-account-provenance.mjs";

const F = JSON.parse(await readFile(new URL(
  "../fixtures/commerce-identity/source-account-provenance-review-v1.json", import.meta.url
), "utf8"));
const { context: C, claims } = F;
const OTHER_TENANT = "20000000-0000-4000-8000-000000000002";
const USER = "a0000000-0000-4000-8000-000000000001";
const env = {
  SUPABASE_URL: "https://synthetic.supabase.invalid",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_synthetic"
};
const inspect = (records, context = {}) =>
  inspectNamespaceAccountClaims({ ...C, records, ...context });
function noAuthority(value) {
  assert.equal(value.evidenceAuthority, "unverified_claims_only");
  assert.equal(value.crossSourceLinkAllowed, false);
  assert.equal(value.combinedSalesAllowed, false);
  assert.equal(value.transactionIdsExposed, false);
  for (const sensitive of [
    C.tenantId, C.storeId, claims.base.sourceAccountRef, claims.base.sourceBranchRef,
    claims.base.evidenceRef
  ]) assert.equal(JSON.stringify(value).includes(sensitive), false);
}

test("two binding IDs for same account + namespace never yield clean review", () => {
  const second = { ...claims.base,
    bindingId: "51000000-0000-4000-8000-000000000004",
    evidenceRef: "synthetic-binding-replay", revision: 1,
    recordedAt: "2026-10-28T09:00:00.000Z"
  };
  for (const records of [
    [claims.base, second], [second, claims.base]
  ]) {
    const result = inspect(records);
    assert.equal(result.status, "binding_conflict");
    assert.equal(result.reviewedCount, 2);
    noAuthority(result);
  }
});

test("expiring an old binding cannot silently permit reuse of binding ID", () => {
  const old = { ...claims.base, effectiveUntil: "2026-10-28T09:00:00.000Z" };
  const rotated = { ...claims.base,
    bindingId: "51000000-0000-4000-8000-000000000005",
    evidenceRef: "synthetic-unapproved-rotation",
    revision: 1, effectiveFrom: "2026-10-28T09:00:00.000Z",
    recordedAt: "2026-10-28T09:00:00.000Z"
  };
  assert.equal(inspect([old, rotated]).status, "binding_conflict");
  assert.equal(inspect([old]).status, "expired");
  noAuthority(inspect([old, rotated]));
});

test("future recorded binding cannot retroactively create a conflict", () => {
  const later = { ...claims.base,
    bindingId: "51000000-0000-4000-8000-000000000006",
    evidenceRef: "synthetic-future-binding",
    revision: 1, recordedAt: "2026-11-01T09:00:00.000Z"
  };
  assert.equal(inspect([claims.base, later]).status, "review_required");
  assert.equal(inspect([claims.base, later], {
    asOf: "2026-11-02T12:00:00.000Z"
  }).status, "binding_conflict");
});

test("foreign account, branch and family conflicts take precedence over same binding IDs", () => {
  const foreign = {
    ...claims.base, revision: 2, recordedAt: "2026-10-28T09:00:00.000Z",
    sourceAccountRef: "synthetic-foreign-account", sourceBranchRef: "synthetic-foreign-branch"
  };
  assert.equal(inspect([claims.base, foreign]).status, "namespace_conflict");
  noAuthority(inspect([claims.base, foreign]));
});

test("ordinary manager guard explicitly denies non-manager tenant roles", () => {
  for (const role of ["cashier", "analyst", "viewer", "", null]) {
    assert.throws(() => requireCommerceManagerRole({tenant:{role}}),
      error => error?.status === 403 && error?.code === "COMMERCE_MANAGER_FORBIDDEN");
  }
  for (const role of ["owner", "admin", "manager"]) {
    const ctx = { tenant: { role } };
    assert.equal(requireCommerceManagerRole(ctx), ctx);
  }
});

function mockAuth({ role="manager", memberTenant=C.tenantId, userId=USER } = {}) {
  const requests = [];
  return {
    env, requests,
    fetchImpl: async (url, options) => {
      const target = new URL(url);
      requests.push(target.pathname);
      assert.equal(options.headers.apikey, env.SUPABASE_PUBLISHABLE_KEY);
      assert.equal(options.headers.authorization, "Bearer synthetic-token");
      if (target.pathname === "/auth/v1/user") {
        return new Response(JSON.stringify({id:userId}), {status:200});
      }
      if (target.pathname === "/rest/v1/tenant_members") {
        assert.equal(target.searchParams.get("limit"), "1");
        assert.equal(target.searchParams.get("user_id"), "eq."+USER);
        const selectedTenant = target.searchParams.get("tenant_id")?.replace(/^eq\./,"");
        const rows = selectedTenant === memberTenant
          ? [{tenant_id:selectedTenant,role}] : [];
        return new Response(JSON.stringify(rows), {status:200});
      }
      throw new Error("UNEXPECTED_PRIVILEGED_READ "+target.pathname);
    }
  };
}
const req = (tenant=C.tenantId) => ({
  headers: {
    authorization:"Bearer synthetic-token", "x-cafeos-tenant-id":tenant
  }
});

test("existing authenticated context resolves membership scope before manager authorization", async () => {
  const deps = mockAuth(), context = await appContext(req(), deps);
  assert.equal(context.tenant.id, C.tenantId);
  assert.equal(context.user.id, USER);
  assert.equal(requireCommerceManagerRole(context), context);
  assert.deepEqual(deps.requests, ["/auth/v1/user","/rest/v1/tenant_members"]);
});

test("spoofed foreign Tenant header has no member and is denied before review", async () => {
  const deps = mockAuth();
  await assert.rejects(() => appContext(req(OTHER_TENANT), deps),
    err => err?.status === 403 && err?.code === "TENANT_FORBIDDEN");
  assert.deepEqual(deps.requests, ["/auth/v1/user","/rest/v1/tenant_members"]);
});

test("non-manager roles cannot pass composed authenticated context", async () => {
  for (const role of ["cashier","viewer","analyst"]) {
    const deps = mockAuth({role}), result = await appContext(req(), deps);
    assert.throws(() => requireCommerceManagerRole(result),
      error => error?.status === 403 && error?.code === "COMMERCE_MANAGER_FORBIDDEN");
    assert.deepEqual(deps.requests, ["/auth/v1/user","/rest/v1/tenant_members"]);
  }
});

test("anonymous or invalid synthetic identity is denied before membership query", async () => {
  const deps = mockAuth();
  await assert.rejects(() => appContext({headers:{"x-cafeos-tenant-id":C.tenantId}}, deps),
    error => error?.status === 401 && error?.code === "AUTH_REQUIRED");
  assert.deepEqual(deps.requests, []);
  const invalid = mockAuth({userId:"not-a-uuid"});
  await assert.rejects(() => appContext(req(), invalid),
    error => error?.status === 401 && error?.code === "AUTH_INVALID");
  assert.deepEqual(invalid.requests, ["/auth/v1/user"]);
  // These are synthetic Auth API mocks, NOT a cryptographic JWT signature check.
});

test("provenance reviewer is not publicly routed by Vercel or workflow dispatch", async () => {
  const vercel = JSON.parse(await readFile(new URL("../vercel.json",import.meta.url),"utf8"));
  for(const rewrite of vercel.rewrites) {
    assert.doesNotMatch(rewrite.source, /source.account|provenance|binding/i);
    assert.doesNotMatch(rewrite.destination, /source.account|provenance|binding/i);
  }
  for(const route of Object.keys(WORKFLOW_ROUTES))
    assert.doesNotMatch(route, /source.account|provenance|binding/i);

  const out = { statusCode:null, text:null,
    setHeader() {}, end(data) {this.text=String(data);} };
  await dispatchWorkflow({url:"/api/app/workflow?route=commerce-source-account-provenance",
    method:"GET", query:{route:"commerce-source-account-provenance"}},out);
  assert.equal(out.statusCode,404);
  assert.equal(JSON.parse(out.text).error.code,"ROUTE_NOT_FOUND");
});

test("no source-account binding SQL is already deployed via known canonical migrations", async () => {
  const sources = [
    "../db/migrations/001_analyzer_core.sql",
    "../db/contracts/core_commerce_v1.sql"
  ];
  for (const path of sources) {
    const contents = await readFile(new URL(path, import.meta.url), "utf8");
    assert.doesNotMatch(contents, /\b(?:source_account_bindings|source_account_binding_events|source_identity_attestations)\b/i);
  }
  // Only these inspected files are covered; not a complete DB schema inventory.
});

test("security gate rejects account claims as authentication evidence and financial authority", () => {
  const forged = {...claims.base,verified:true,evidenceKind:"connector_claim",
    signedJwt:true,role:"owner",allowRead:true,allowWrite:true,combinedSales:"9999999"};
  const output = inspect([forged]);
  assert.equal(output.status,"review_required");
  noAuthority(output);
  assert.deepEqual(Object.keys(output).sort(),
    ["status","scope","evidenceAuthority","reviewedCount",
      "crossSourceLinkAllowed","combinedSalesAllowed","transactionIdsExposed"].sort());
});
