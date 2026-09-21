import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requireUuid(value, name) {
  const raw = String(value ?? "").trim();
  if (!UUID_RE.test(raw)) throw new Error(`${name} must be a UUID`);
  return raw.toLowerCase();
}

function requireSupabaseUrl(value) {
  const raw = String(value ?? "").trim().replace(/\/+$/, "");
  if (!raw) throw new Error("SUPABASE_URL is required");
  const url = new URL(raw);
  if (url.protocol !== "https:" && !["127.0.0.1", "localhost"].includes(url.hostname)) {
    throw new Error("SUPABASE_URL must use https outside localhost");
  }
  return url.toString().replace(/\/$/, "");
}

function requireSecretKey(value) {
  const raw = String(value ?? "").trim();
  if (!raw.startsWith("sb_secret_")) {
    throw new Error("SUPABASE_SECRET_KEY must be a modern sb_secret_ key");
  }
  return raw;
}

function userRef(userId) {
  return `sha256:${createHash("sha256").update(userId).digest("hex").slice(0, 20)}`;
}

async function responseBody(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text.slice(0, 200) };
  }
}

async function expectResponse(fetchImpl, url, options, expectedStatuses) {
  const response = await fetchImpl(url, options);
  const body = await responseBody(response);
  if (!expectedStatuses.includes(response.status)) {
    const code = body?.error_code ?? body?.code ?? body?.error ?? "HTTP_ERROR";
    throw new Error(`Supabase request failed status=${response.status} code=${code}`);
  }
  return { status: response.status, body };
}

function adminHeaders(secretKey, extra = {}) {
  return {
    apikey: secretKey,
    accept: "application/json",
    ...extra
  };
}

async function getAdminUser({ base, secretKey, userId, fetchImpl }) {
  const result = await expectResponse(
    fetchImpl,
    `${base}/auth/v1/admin/users/${encodeURIComponent(userId)}`,
    { headers: adminHeaders(secretKey) },
    [200, 404]
  );
  return result.status === 200 ? result.body : null;
}

async function listMemberships({ base, secretKey, userId, fetchImpl }) {
  const params = new URLSearchParams({
    select: "tenant_id,user_id,role",
    user_id: `eq.${userId}`
  });
  const result = await expectResponse(
    fetchImpl,
    `${base}/rest/v1/tenant_members?${params}`,
    { headers: adminHeaders(secretKey) },
    [200]
  );
  if (!Array.isArray(result.body)) throw new Error("Membership preflight returned a malformed payload");
  return result.body;
}

async function removeMemberships({ base, secretKey, userId, fetchImpl }) {
  const params = new URLSearchParams({ user_id: `eq.${userId}` });
  await expectResponse(
    fetchImpl,
    `${base}/rest/v1/tenant_members?${params}`,
    {
      method: "DELETE",
      headers: adminHeaders(secretKey, { Prefer: "return=minimal" })
    },
    [200, 204]
  );
}

async function verifyTargetJwt({ base, secretKey, userId, targetUserJwt, fetchImpl }) {
  const result = await expectResponse(
    fetchImpl,
    `${base}/auth/v1/user`,
    {
      headers: adminHeaders(secretKey, {
        Authorization: `Bearer ${targetUserJwt}`
      })
    },
    [200]
  );
  if (String(result.body?.id ?? "").toLowerCase() !== userId) {
    throw new Error("CAFEOS_TARGET_USER_JWT does not belong to the requested user");
  }
}

async function globalSignOut({ base, secretKey, targetUserJwt, fetchImpl }) {
  await expectResponse(
    fetchImpl,
    `${base}/auth/v1/logout?scope=global`,
    {
      method: "POST",
      headers: adminHeaders(secretKey, {
        Authorization: `Bearer ${targetUserJwt}`
      })
    },
    [204]
  );
}

async function hardDeleteAuthUser({ base, secretKey, userId, fetchImpl }) {
  await expectResponse(
    fetchImpl,
    `${base}/auth/v1/admin/users/${encodeURIComponent(userId)}`,
    {
      method: "DELETE",
      headers: adminHeaders(secretKey, { "content-type": "application/json" }),
      body: JSON.stringify({ should_soft_delete: false })
    },
    [200]
  );
}

export async function offboardUser({
  supabaseUrl,
  secretKey,
  userId,
  targetUserJwt,
  execute = false,
  confirmUserId,
  fetchImpl = fetch,
  now = () => new Date(),
  log = () => {}
}) {
  const base = requireSupabaseUrl(supabaseUrl);
  const secret = requireSecretKey(secretKey);
  const targetUserId = requireUuid(userId, "userId");
  const ref = userRef(targetUserId);

  const account = await getAdminUser({
    base,
    secretKey: secret,
    userId: targetUserId,
    fetchImpl
  });
  const memberships = await listMemberships({
    base,
    secretKey: secret,
    userId: targetUserId,
    fetchImpl
  });

  const plan = {
    operation: "user_offboarding",
    mode: execute ? "execute" : "dry_run",
    userRef: ref,
    accountExists: Boolean(account),
    membershipCount: memberships.length,
    globalSignOutAvailable: Boolean(targetUserJwt)
  };

  if (!execute) {
    log(JSON.stringify(plan));
    return plan;
  }

  if (requireUuid(confirmUserId, "confirmUserId") !== targetUserId) {
    throw new Error("confirmUserId must exactly match userId");
  }

  if (memberships.length > 0) {
    await removeMemberships({
      base,
      secretKey: secret,
      userId: targetUserId,
      fetchImpl
    });
  }

  const remainingMemberships = await listMemberships({
    base,
    secretKey: secret,
    userId: targetUserId,
    fetchImpl
  });
  if (remainingMemberships.length !== 0) {
    throw new Error("Membership revocation verification failed");
  }

  let sessionRevocation = "auth_user_hard_delete";
  if (account && targetUserJwt) {
    await verifyTargetJwt({
      base,
      secretKey: secret,
      userId: targetUserId,
      targetUserJwt,
      fetchImpl
    });
    await globalSignOut({
      base,
      secretKey: secret,
      targetUserJwt,
      fetchImpl
    });
    sessionRevocation = "global_signout_then_auth_user_hard_delete";
  }

  if (account) {
    await hardDeleteAuthUser({
      base,
      secretKey: secret,
      userId: targetUserId,
      fetchImpl
    });
  }

  const accountAfter = await getAdminUser({
    base,
    secretKey: secret,
    userId: targetUserId,
    fetchImpl
  });
  if (accountAfter) throw new Error("Auth user deletion verification failed");

  const receipt = {
    operation: "user_offboarding",
    result: "completed",
    userRef: ref,
    completedAt: now().toISOString(),
    membershipsRemoved: memberships.length,
    sessionRevocation,
    authUserDeleted: Boolean(account)
  };
  log(JSON.stringify(receipt));
  return receipt;
}

function parseArgs(argv) {
  const args = { execute: false };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--execute") args.execute = true;
    else if (token === "--user-id") args.userId = argv[++i];
    else if (token === "--confirm-user-id") args.confirmUserId = argv[++i];
    else throw new Error(`Unknown argument: ${token}`);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await offboardUser({
    supabaseUrl: process.env.SUPABASE_URL,
    secretKey: process.env.SUPABASE_SECRET_KEY,
    userId: args.userId,
    confirmUserId: args.confirmUserId,
    execute: args.execute,
    targetUserJwt: process.env.CAFEOS_TARGET_USER_JWT,
    log: value => process.stdout.write(`${value}\n`)
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch(error => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
