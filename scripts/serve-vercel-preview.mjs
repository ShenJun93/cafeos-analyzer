import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import analyze from '../api/analyze.mjs';
import inspect from '../api/inspect.mjs';
import profile from '../api/profile.mjs';
import health from '../api/health.mjs';

const port = Number(process.env.PORT ?? 4174);
const routes = new Map([
  ['/api/analyze', analyze], ['/api/inspect', inspect], ['/api/profile', profile], ['/api/health', health]
]);
const staticMap = new Map([
  ['/', 'index.html'], ['/free-cafe-sales-analyzer', 'index.html'], ['/analyzer', 'analyzer.html'], ['/sample-report', 'sample-report.html'], ['/feedback', 'feedback.html']
]);
const types = { '.html': 'text/html; charset=utf-8' };
const server = http.createServer(async (req,res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const api = routes.get(url.pathname);
  if (api) return api(req,res);
  const file = staticMap.get(url.pathname);
  if (!file) { res.statusCode=404; return res.end('Not found'); }
  const content = await readFile(join(process.cwd(),'public',file));
  res.statusCode=200; res.setHeader('content-type', types[extname(file)] ?? 'application/octet-stream'); res.end(content);
});
server.listen(port, '127.0.0.1', () => console.log(`CafeOS Vercel-shape preview: http://127.0.0.1:${port}`));
