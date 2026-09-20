import { json } from './_shared.mjs';
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('allow', 'GET');
    return json(res, 405, { error: 'Method not allowed' });
  }
  return json(res, 200, { ok: true, mode: 'public-validation', persistence: 'none', maxUploadBytes: 4194304 });
}
