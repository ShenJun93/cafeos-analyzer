import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const GRAPH_TABLES = [
  "tenants",
  "tenant_members",
  "imports",
  "transaction_line_items",
  "stores",
  "customers",
  "customer_identifiers",
  "attention_items",
  "actions",
  "action_status_history",
  "measurement_windows"
];

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

function tenantRef(tenantId) {
  return `sha256:${createHash("sha256").update(tenantId).digest("hex").slice(0, 20)}`;
}

function strictDate(value, name) {
  const raw = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw new Error(`${name} must be YYYY-MM-DD`);
  const parsed = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== raw) {
    throw new Error(`${name} must be a real calendar date`);
  }
  return raw;
}

function plusCalendarDays(date, days) {
  const copy = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy.toISOString().slice(0, 10);
}

function adminHeaders(secretKey, extra = {}) {
  return {
    apikey: secretKey,
    accept: "application/json",
    ...extra
  };
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
  return { response, body };
}

function tableFilter(table, tenantId) {
  return table === "tenants" ? ["id", tenantId] : ["tenant_id", tenantId];
}

async function countRows({ base, secretKey, table, tenantId, fetchImpl }) {
  const [field, value] = tableFilter(table, tenantId);
  const params = new URLSearchParams({
    select: "id",
    [field]: `eq.${value}`
  });
  const { response } = await expectResponse(
    fetchImpl,
    `${base}/rest/v1/${table}?${params}`,
    {
      method: "HEAD",
      headers: adminHeaders(secretKey, {
        Prefer: "count=exact",
        Range: "0-0"
      })
    },
    [200, 206]
  );
  const range = response.headers.get("content-range") ?? "*/0";
  const total = Number(range.split("/").at(-1));
  if (!Number.isInteger(total) || total < 0) {
    throw new Error(`Unable to determine row count for ${table}`);
  }
  return total;
}

async function graphCounts({ base, secretKey, tenantId, fetchImpl }) {
  const counts = {};
  for (const table of GRAPH_TABLES) {
    counts[table] = await countRows({ base, secretKey, table, tenantId, fetchImpl });
  }
  return counts;
}

async function deleteByFilter({ base, secretKey, table, field, value, fetchImpl }) {
  const params = new URLSearchParams({ [field]: `eq.${value}` });
  await expectResponse(
    fetchImpl,
    `${base}/rest/v1/${table}?${params}`,
    {
      method: "DELETE",
      headers: adminHeaders(secretKey, { Prefer: "return=minimal" })
    },
    [200, 204]
  );
}

function requireExecutionConfirmation(execute, confirmTenantId, tenantId) {
  if (!execute) return;
  if (requireUuid(confirmTenantId, "confirmTenantId") !== tenantId) {
    throw new Error("confirmTenantId must exactly match tenantId");
  }
}

function todayUtc(now) {
  return now.toISOString().slice(0, 10);
}

export async function offboardTenant({
  supabaseUrl,
  secretKey,
  tenantId,
  phase = "prepare",
  execute = false,
  confirmTenantId,
  graceDeadline,
  earlyDeleteApproved = false,
  exportCleared = false,
  legalHoldCleared = false,
  fetchImpl = fetch,
  now = () => new Date(),
  log = () => {}
}) {
  const base = requireSupabaseUrl(supabaseUrl);
  const secret = requireSecretKey(secretKey);
  const targetTenantId = requireUuid(tenantId, "tenantId");
  if (!["prepare", "hard-delete"].includes(phase)) {
    throw new Error("phase must be prepare or hard-delete");
  }
  requireExecutionConfirmation(execute, confirmTenantId, targetTenantId);

  const started = now();
  const ref = tenantRef(targetTenantId);
  const countsBefore = await graphCounts({
    base,
    secretKey: secret,
    tenantId: targetTenantId,
    fetchImpl
  });
  const tenantExists = countsBefore.tenants === 1;
  if (countsBefore.tenants > 1) throw new Error("Tenant preflight returned more than one row");

  if (phase === "prepare") {
    const defaultGraceDeadline = plusCalendarDays(started, 14);
    const plan = {
      operation: "tenant_offboarding_prepare",
      mode: execute ? "execute" : "dry_run",
      tenantRef: ref,
      tenantExists,
      membershipCount: countsBefore.tenant_members,
      requestedAt: started.toISOString(),
      defaultGraceDeadline,
      ingestionBoundary: "no_background_ingestion_or_write_api_authorized"
    };

    if (!execute) {
      log(JSON.stringify(plan));
      return plan;
    }
    if (!tenantExists) throw new Error("Tenant does not exist");

    if (countsBefore.tenant_members > 0) {
      await deleteByFilter({
        base,
        secretKey: secret,
        table: "tenant_members",
        field: "tenant_id",
        value: targetTenantId,
        fetchImpl
      });
    }
    const membershipsAfter = await countRows({
      base,
      secretKey: secret,
      table: "tenant_members",
      tenantId: targetTenantId,
      fetchImpl
    });
    if (membershipsAfter !== 0) throw new Error("Tenant membership revocation verification failed");

    const receipt = {
      ...plan,
      mode: "execute",
      result: "prepared",
      membershipsRemoved: countsBefore.tenant_members
    };
    log(JSON.stringify(receipt));
    return receipt;
  }

  const deadline = graceDeadline ? strictDate(graceDeadline, "graceDeadline") : null;
  const today = todayUtc(started);
  const deadlineReached = deadline ? today >= deadline : false;
  const deleteAuthorized = earlyDeleteApproved || deadlineReached;

  const plan = {
    operation: "tenant_offboarding_hard_delete",
    mode: execute ? "execute" : "dry_run",
    tenantRef: ref,
    tenantExists,
    countsBefore,
    graceDeadline: deadline,
    deadlineReached,
    earlyDeleteApproved: Boolean(earlyDeleteApproved),
    exportCleared: Boolean(exportCleared),
    legalHoldCleared: Boolean(legalHoldCleared)
  };

  if (!execute) {
    log(JSON.stringify(plan));
    return plan;
  }

  if (!exportCleared) throw new Error("exportCleared must be explicitly confirmed");
  if (!legalHoldCleared) throw new Error("legalHoldCleared must be explicitly confirmed");
  if (!deleteAuthorized) {
    throw new Error("Hard delete requires reached graceDeadline or earlyDeleteApproved");
  }
  if (countsBefore.tenant_members !== 0) {
    throw new Error("Tenant still has memberships; run prepare phase first");
  }

  if (tenantExists) {
    await deleteByFilter({
      base,
      secretKey: secret,
      table: "tenants",
      field: "id",
      value: targetTenantId,
      fetchImpl
    });
  }

  const countsAfter = await graphCounts({
    base,
    secretKey: secret,
    tenantId: targetTenantId,
    fetchImpl
  });
  const residue = Object.entries(countsAfter).filter(([, count]) => count !== 0);
  if (residue.length > 0) {
    throw new Error(`Tenant hard-delete verification failed for ${residue.map(([table]) => table).join(",")}`);
  }

  const receipt = {
    ...plan,
    mode: "execute",
    result: tenantExists ? "deleted" : "already_absent",
    completedAt: started.toISOString(),
    countsAfter
  };
  log(JSON.stringify(receipt));
  return receipt;
}

function parseArgs(argv) {
  const args = { execute: false, phase: "prepare" };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--execute") args.execute = true;
    else if (token === "--tenant-id") args.tenantId = argv[++i];
    else if (token === "--confirm-tenant-id") args.confirmTenantId = argv[++i];
    else if (token === "--phase") args.phase = argv[++i];
    else if (token === "--grace-deadline") args.graceDeadline = argv[++i];
    else if (token === "--early-delete-approved") args.earlyDeleteApproved = true;
    else if (token === "--export-cleared") args.exportCleared = true;
    else if (token === "--legal-hold-cleared") args.legalHoldCleared = true;
    else throw new Error(`Unknown argument: ${token}`);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await offboardTenant({
    supabaseUrl: process.env.SUPABASE_URL,
    secretKey: process.env.SUPABASE_SECRET_KEY,
    tenantId: args.tenantId,
    phase: args.phase,
    execute: args.execute,
    confirmTenantId: args.confirmTenantId,
    graceDeadline: args.graceDeadline,
    earlyDeleteApproved: args.earlyDeleteApproved,
    exportCleared: args.exportCleared,
    legalHoldCleared: args.legalHoldCleared,
    log: value => process.stdout.write(`${value}\n`)
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch(error => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
