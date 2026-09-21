import { createHash, randomBytes, randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { offboardUser } from "./operator-offboard-user.mjs";

export const OPERATOR_ACCEPTANCE_STAGING_URL = "https://wjatnyvdygvblirggdcm.supabase.co";
export const OPERATOR_ACCEPTANCE_TENANT_ID = "11111111-1111-4111-8111-111111111111";

function requireStagingUrl(value) {
  const raw = String(value ?? "").trim().replace(/\/+$/, "");
  if (raw !== OPERATOR_ACCEPTANCE_STAGING_URL) {
    throw new Error("Live operator-offboarding acceptance is pinned to CafeOS synthetic staging");
  }
  return raw;
}

function requireSecretKey(value) {
  const raw = String(value ?? "").trim();
  if (!raw.startsWith("sb_secret_")) {
    throw new Error("SUPABASE_SECRET_KEY must be a modern sb_secret_ key");
  }
  return raw;
}

function requirePublishableKey(value) {
  const raw = String(value ?? "").trim();
  if (!raw.startsWith("sb_publishable_")) {
    throw new Error("SUPABASE_PUBLISHABLE_KEY must be a modern sb_publishable_ key");
  }
  return raw;
}

function opaqueRef(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex").slice(0, 20)}`;
}

async function responseBody(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function expectResponse(fetchImpl, url, options, expectedStatuses) {
  const response = await fetchImpl(url, options);
  const body = await responseBody(response);
  if (!expectedStatuses.includes(response.status)) {
    const code = body?.error_code ?? body?.code ?? body?.error ?? "HTTP_ERROR";
    throw new Error(`Synthetic acceptance request failed status=${response.status} code=${code}`);
  }
  return { status: response.status, body };
}

function elevatedHeaders(secretKey, extra = {}) {
  return {
    apikey: secretKey,
    accept: "application/json",
    ...extra
  };
}

function callerHeaders(publishableKey, jwt, extra = {}) {
  return {
    apikey: publishableKey,
    authorization: `Bearer ${jwt}`,
    accept: "application/json",
    ...extra
  };
}

async function createSyntheticUser({ base, secretKey, email, password, fetchImpl }) {
  const result = await expectResponse(
    fetchImpl,
    `${base}/auth/v1/admin/users`,
    {
      method: "POST",
      headers: elevatedHeaders(secretKey, { "content-type": "application/json" }),
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        app_metadata: { cafeos_acceptance: "operator_user_offboarding" }
      })
    },
    [200, 201]
  );
  const userId = String(result.body?.id ?? result.body?.user?.id ?? "").toLowerCase();
  if (!userId) throw new Error("Synthetic Auth user creation returned no user id");
  return userId;
}

async function addSyntheticMembership({ base, secretKey, userId, tenantId, fetchImpl }) {
  await expectResponse(
    fetchImpl,
    `${base}/rest/v1/tenant_members`,
    {
      method: "POST",
      headers: elevatedHeaders(secretKey, {
        "content-type": "application/json",
        Prefer: "return=minimal"
      }),
      body: JSON.stringify({
        tenant_id: tenantId,
        user_id: userId,
        role: "viewer"
      })
    },
    [200, 201, 204]
  );
}

async function signInSyntheticUser({ base, publishableKey, email, password, fetchImpl }) {
  const result = await expectResponse(
    fetchImpl,
    `${base}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: {
        apikey: publishableKey,
        accept: "application/json",
        "content-type": "application/json"
      },
      body: JSON.stringify({ email, password })
    },
    [200]
  );
  const jwt = String(result.body?.access_token ?? "");
  if (!jwt) throw new Error("Synthetic sign-in returned no access token");
  return jwt;
}

async function callerMemberships({
  base,
  publishableKey,
  jwt,
  tenantId,
  userId,
  fetchImpl,
  expectedStatuses = [200]
}) {
  const params = new URLSearchParams({
    select: "tenant_id,user_id,role",
    tenant_id: `eq.${tenantId}`,
    user_id: `eq.${userId}`
  });
  const result = await expectResponse(
    fetchImpl,
    `${base}/rest/v1/tenant_members?${params}`,
    { headers: callerHeaders(publishableKey, jwt) },
    expectedStatuses
  );
  if (result.status !== 200) return { status: result.status, rows: [] };
  if (!Array.isArray(result.body)) throw new Error("Caller membership verification returned malformed payload");
  return { status: 200, rows: result.body };
}

async function cleanupSynthetic({ base, secretKey, userId, fetchImpl }) {
  if (!userId) return;
  const membershipParams = new URLSearchParams({ user_id: `eq.${userId}` });
  await fetchImpl(`${base}/rest/v1/tenant_members?${membershipParams}`, {
    method: "DELETE",
    headers: elevatedHeaders(secretKey, { Prefer: "return=minimal" })
  }).catch(() => {});

  await fetchImpl(`${base}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: "DELETE",
    headers: elevatedHeaders(secretKey, { "content-type": "application/json" }),
    body: JSON.stringify({ should_soft_delete: false })
  }).catch(() => {});
}

export async function verifyOperatorUserOffboardingLive({
  supabaseUrl,
  secretKey,
  publishableKey,
  tenantId = OPERATOR_ACCEPTANCE_TENANT_ID,
  fetchImpl = fetch,
  uuid = randomUUID,
  passwordBytes = randomBytes,
  now = () => new Date(),
  log = () => {}
}) {
  const base = requireStagingUrl(supabaseUrl);
  const secret = requireSecretKey(secretKey);
  const publishable = requirePublishableKey(publishableKey);
  if (tenantId !== OPERATOR_ACCEPTANCE_TENANT_ID) {
    throw new Error("Live operator-offboarding acceptance is pinned to synthetic Tenant A");
  }

  const runId = uuid();
  const email = `cafeos.offboarding.acceptance.${runId}@example.com`;
  const password = passwordBytes(32).toString("base64url");
  let userId = null;
  let jwt = null;
  let offboardingCompleted = false;

  try {
    userId = await createSyntheticUser({
      base,
      secretKey: secret,
      email,
      password,
      fetchImpl
    });

    await addSyntheticMembership({
      base,
      secretKey: secret,
      userId,
      tenantId,
      fetchImpl
    });

    jwt = await signInSyntheticUser({
      base,
      publishableKey: publishable,
      email,
      password,
      fetchImpl
    });

    const before = await callerMemberships({
      base,
      publishableKey: publishable,
      jwt,
      tenantId,
      userId,
      fetchImpl
    });
    if (before.status !== 200 || before.rows.length !== 1) {
      throw new Error("Synthetic user did not receive exactly one Tenant A membership");
    }

    const operatorReceipt = await offboardUser({
      supabaseUrl: base,
      secretKey: secret,
      userId,
      confirmUserId: userId,
      execute: true,
      targetUserJwt: jwt,
      fetchImpl,
      now,
      log: () => {}
    });
    offboardingCompleted = true;

    const after = await callerMemberships({
      base,
      publishableKey: publishable,
      jwt,
      tenantId,
      userId,
      fetchImpl,
      expectedStatuses: [200, 401, 403]
    });
    if (after.status === 200 && after.rows.length !== 0) {
      throw new Error("Stale JWT retained Tenant A membership after offboarding");
    }

    const receipt = {
      operation: "operator_user_offboarding_live_acceptance",
      result: "pass",
      userRef: opaqueRef(userId),
      tenantRef: opaqueRef(tenantId),
      membershipBefore: before.rows.length,
      staleJwtMembershipRows: after.rows.length,
      staleJwtOutcome: after.status === 200 ? "rls_denied" : "session_rejected",
      sessionRevocation: operatorReceipt.sessionRevocation,
      authUserDeleted: operatorReceipt.authUserDeleted,
      completedAt: now().toISOString()
    };
    log(JSON.stringify(receipt));
    return receipt;
  } finally {
    if (!offboardingCompleted && userId) {
      await cleanupSynthetic({ base, secretKey: secret, userId, fetchImpl });
    }
    jwt = null;
  }
}

async function main() {
  const result = await verifyOperatorUserOffboardingLive({
    supabaseUrl: process.env.SUPABASE_URL,
    secretKey: process.env.SUPABASE_SECRET_KEY,
    publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY,
    log: value => process.stdout.write(`${value}\n`)
  });
  if (result.result !== "pass") process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch(error => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
