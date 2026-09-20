export const PUBLIC_MAX_BYTES = 4 * 1024 * 1024;

export function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(payload));
}

export async function readRawBody(req, maxBytes = PUBLIC_MAX_BYTES) {
  const declared = Number(req.headers?.['content-length'] ?? 0);
  if (Number.isFinite(declared) && declared > maxBytes) {
    const error = new Error(`Public preview accepts files up to ${Math.floor(maxBytes / 1024 / 1024)}MB`);
    error.status = 413;
    throw error;
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buf.length;
    if (size > maxBytes) {
      const error = new Error(`Public preview accepts files up to ${Math.floor(maxBytes / 1024 / 1024)}MB`);
      error.status = 413;
      throw error;
    }
    chunks.push(buf);
  }
  return new Uint8Array(Buffer.concat(chunks));
}

export function requestUrl(req) {
  return new URL(req.url ?? '/', `https://${req.headers?.host ?? 'localhost'}`);
}

export function errorResponse(res, error) {
  const status = Number(error?.status ?? 422);
  json(res, status, { error: error instanceof Error ? error.message : String(error) });
}

export function onlyPost(req, res) {
  if (req.method === 'POST') return true;
  res.setHeader('allow', 'POST');
  json(res, 405, { error: 'Method not allowed' });
  return false;
}
