import { inspectBytes } from '../dist/file.js';
import { errorResponse, json, onlyPost, readRawBody, requestUrl } from './_shared.mjs';
export default async function handler(req, res) {
  if (!onlyPost(req, res)) return;
  try {
    const url = requestUrl(req);
    const filename = url.searchParams.get('filename') ?? 'upload.csv';
    const data = await readRawBody(req);
    return json(res, 200, inspectBytes(filename, data));
  } catch (error) { return errorResponse(res, error); }
}
