import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import analyze from '../api/analyze.mjs';
import inspect from '../api/inspect.mjs';
import profile from '../api/profile.mjs';
import health from '../api/health.mjs';
import { handle as sessionHandle } from '../api/app/session.mjs';
import { handle as storesHandle } from '../api/app/stores.mjs';
import { handle as attentionHandle } from '../api/app/attention.mjs';
import { handle as briefHandle } from '../api/app/brief.mjs';
import { handle as storeHealthHandle } from '../api/app/store-health.mjs';
import { dispatchWorkflow } from '../api/app/workflow.mjs';
import { appConfig } from '../api/_app-auth.mjs';
import { json } from '../api/_shared.mjs';

const DEFAULT_PORT = 4174;
const MAX_APP_JSON_BYTES = 64 * 1024;

const analyzerRoutes = new Map([
  ['/api/analyze', analyze],
  ['/api/inspect', inspect],
  ['/api/profile', profile],
  ['/api/health', health]
]);

const appReadRoutes = new Map([
  ['/api/app/session', sessionHandle],
  ['/api/app/stores', storesHandle],
  ['/api/app/attention', attentionHandle],
  ['/api/app/brief', briefHandle],
  ['/api/app/store-health', storeHealthHandle]
]);

const workflowRoutes = new Map([
  ['/api/app/actions', 'actions'],
  ['/api/app/action-status', 'action-status'],
  ['/api/app/measurement-window', 'measurement-window'],
  ['/api/app/action-detail', 'action-detail'],
  ['/api/app/commerce-menu', 'commerce-menu'],
  ['/api/app/commerce-order', 'commerce-order'],
  ['/api/app/commerce-payment', 'commerce-payment'],
  ['/api/app/commerce-order-status', 'commerce-order-status'],
  ['/api/app/commerce-receipt', 'commerce-receipt'],
  ['/api/app/commerce-open-orders', 'commerce-open-orders'],
  ['/api/app/commerce-paid-orders', 'commerce-paid-orders'],
  ['/api/app/commerce-dashboard', 'commerce-dashboard'],
  ['/api/app/commerce-hq', 'commerce-hq'],
  ['/api/app/commerce-daily-close', 'commerce-daily-close']
]);

const staticMap = new Map([
  ['/', { dir: 'public', file: 'index.html' }],
  ['/free-cafe-sales-analyzer', { dir: 'public', file: 'index.html' }],
  ['/analyzer', { dir: 'public', file: 'analyzer.html' }],
  ['/sample-report', { dir: 'public', file: 'sample-report.html' }],
  ['/feedback', { dir: 'public', file: 'feedback.html' }],
  ['/app', { dir: 'public', file: 'app.html' }],
  ['/control-tower-e1', { dir: 'web', file: 'control-tower-e1.html' }],
  ['/cafeos-ui.css', { dir: 'public', file: 'cafeos-ui.css' }]
]);

const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8'
};

async function parseJsonBody(req, maxBytes = MAX_APP_JSON_BYTES) {
  if (req.body !== undefined) return req.body;
  const declared = Number(req.headers?.['content-length'] ?? 0);
  if (Number.isFinite(declared) && declared > maxBytes) {
    const error = new Error('Control Tower request body is too large');
    error.status = 413;
    throw error;
  }
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > maxBytes) {
      const error = new Error('Control Tower request body is too large');
      error.status = 413;
      throw error;
    }
    chunks.push(buffer);
  }
  if (chunks.length === 0) return undefined;
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    const error = new Error('A valid JSON object body is required');
    error.status = 400;
    throw error;
  }
}

function localClientConfig(res, env) {
  try {
    const config = appConfig(env);
    return json(res, 200, {
      environment: 'synthetic_staging',
      evidenceProvenance: 'operator_synthetic_assisted',
      supabaseUrl: config.url,
      publishableKey: config.publishableKey
    });
  } catch {
    return json(res, 503, {
      error: {
        code: 'APP_NOT_CONFIGURED',
        message: 'Control Tower staging is not configured'
      }
    });
  }
}

export function createVercelShapePreviewServer({
  env = process.env,
  fetchImpl = globalThis.fetch,
  root = process.cwd()
} = {}) {
  const deps = { env, fetchImpl };

  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

      const analyzer = analyzerRoutes.get(url.pathname);
      if (analyzer) return analyzer(req, res);

      if (url.pathname === '/api/app/client-config') {
        if (req.method !== 'GET') {
          res.setHeader('allow', 'GET');
          return json(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' } });
        }
        return localClientConfig(res, env);
      }

      const appRead = appReadRoutes.get(url.pathname);
      if (appRead) return appRead(req, res, deps);

      const workflowRoute = workflowRoutes.get(url.pathname);
      if (workflowRoute) {
        if (req.method === 'POST' || req.method === 'PATCH') {
          req.body = await parseJsonBody(req);
        }
        const originalUrl = req.url;
        req.url = `/api/app/workflow?route=${encodeURIComponent(workflowRoute)}${url.search ? "&" + url.search.slice(1) : ""}`;
        try {
          return await dispatchWorkflow(req, res, deps);
        } finally {
          req.url = originalUrl;
        }
      }

      const staticEntry = staticMap.get(url.pathname);
      if (!staticEntry) {
        res.statusCode = 404;
        return res.end('Not found');
      }

      const content = await readFile(join(root, staticEntry.dir, staticEntry.file));
      res.statusCode = 200;
      res.setHeader('content-type', types[extname(staticEntry.file)] ?? 'application/octet-stream');
      res.end(content);
    } catch (error) {
      const status = Number(error?.status ?? 500);
      return json(res, status, {
        error: {
          code: status === 400 ? 'BODY_INVALID' : status === 413 ? 'BODY_TOO_LARGE' : 'LOCAL_PREVIEW_ERROR',
          message: status >= 500 ? 'Local validation server error' : String(error?.message ?? 'Request failed')
        }
      });
    }
  });
}

export function startVercelShapePreviewServer({
  port = Number(process.env.PORT ?? DEFAULT_PORT),
  env = process.env,
  fetchImpl = globalThis.fetch,
  root = process.cwd()
} = {}) {
  const server = createVercelShapePreviewServer({ env, fetchImpl, root });
  server.listen(port, '127.0.0.1', () => {
    console.log(`CafeOS Vercel-shape preview: http://127.0.0.1:${port}`);
    console.log(`Control Tower E1: http://127.0.0.1:${port}/control-tower-e1`);
  });
  return server;
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  startVercelShapePreviewServer();
}
