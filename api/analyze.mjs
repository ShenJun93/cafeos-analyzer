import { extname } from 'node:path';
import { analyzeBytes } from '../dist/file.js';
import { inspectXlsx } from '../dist/xlsx.js';
import { errorResponse, json, onlyPost, readRawBody, requestUrl } from './_shared.mjs';
export default async function handler(req, res) {
  if (!onlyPost(req, res)) return;
  try {
    const url = requestUrl(req);
    const filename = url.searchParams.get('filename') ?? 'upload.csv';
    const sheet = url.searchParams.get('sheet') ?? undefined;
    const mappingRaw = url.searchParams.get('mapping');
    let mapping;
    if (mappingRaw) {
      try { mapping = JSON.parse(mappingRaw); }
      catch { return json(res, 400, { error: 'Invalid mapping JSON' }); }
    }
    const data = await readRawBody(req);
    if (extname(filename).toLowerCase() === '.xlsx' && !sheet) {
      const inspection = inspectXlsx(data);
      if (inspection.ambiguous) return json(res, 409, { code: 'AMBIGUOUS_SHEETS', workbook: inspection });
    }
    const result = analyzeBytes(filename, data, sheet, mapping);
    const { items, ...safeResult } = result;
    return json(res, 200, { ...safeResult, itemCount: items.length });
  } catch (error) { return errorResponse(res, error); }
}
