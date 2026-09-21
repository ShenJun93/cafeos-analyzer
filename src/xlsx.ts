import { inflateRawSync } from "node:zlib";
import { analyzeTable } from "./analyze.js";
import type { AnalysisOptions, MappingOverride } from "./analyze.js";
import { mapHeaders } from "./mapping.js";
import type { WorkbookAnalysisResult, WorkbookInspection, WorkbookSheetInspection } from "./types.js";

const MAX_XLSX_BYTES = 20 * 1024 * 1024;
const MAX_ENTRY_BYTES = 64 * 1024 * 1024;
const MAX_TOTAL_UNCOMPRESSED = 128 * 1024 * 1024;
const MAX_SHEETS = 50;
const MAX_ROWS_PER_SHEET = 200_000;
const MAX_COMPRESSION_RATIO = 1000;

interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
  flags: number;
}

interface ParsedWorkbook {
  sheets: { name: string; rows: string[][] }[];
}

function u16(data: Uint8Array, offset: number): number {
  return data[offset] | (data[offset + 1] << 8);
}

function u32(data: Uint8Array, offset: number): number {
  return (data[offset] | (data[offset + 1] << 8) | (data[offset + 2] << 16) | (data[offset + 3] << 24)) >>> 0;
}

function decodeUtf8(data: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(data);
}

function findEocd(data: Uint8Array): number {
  const min = Math.max(0, data.length - 65_557);
  for (let i = data.length - 22; i >= min; i--) {
    if (u32(data, i) === 0x06054b50) return i;
  }
  throw new Error("Invalid XLSX/ZIP: end-of-central-directory not found");
}

function parseCentralDirectory(data: Uint8Array): Map<string, ZipEntry> {
  const eocd = findEocd(data);
  const count = u16(data, eocd + 10);
  const centralSize = u32(data, eocd + 12);
  const centralOffset = u32(data, eocd + 16);
  if (count === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
    throw new Error("ZIP64 workbooks are not supported in v0.1");
  }
  if (centralOffset + centralSize > data.length) throw new Error("Invalid ZIP central directory bounds");

  const entries = new Map<string, ZipEntry>();
  let offset = centralOffset;
  let totalUncompressed = 0;
  for (let i = 0; i < count; i++) {
    if (u32(data, offset) !== 0x02014b50) throw new Error("Invalid ZIP central-directory entry");
    const flags = u16(data, offset + 8);
    const method = u16(data, offset + 10);
    const compressedSize = u32(data, offset + 20);
    const uncompressedSize = u32(data, offset + 24);
    const nameLen = u16(data, offset + 28);
    const extraLen = u16(data, offset + 30);
    const commentLen = u16(data, offset + 32);
    const localHeaderOffset = u32(data, offset + 42);
    const name = decodeUtf8(data.slice(offset + 46, offset + 46 + nameLen));

    if (flags & 0x1) throw new Error("Encrypted XLSX files are not supported");
    if (method !== 0 && method !== 8) throw new Error(`Unsupported ZIP compression method ${method}`);
    if (uncompressedSize > MAX_ENTRY_BYTES) throw new Error(`XLSX entry too large: ${name}`);
    if (compressedSize > 0 && uncompressedSize / compressedSize > MAX_COMPRESSION_RATIO) {
      throw new Error(`Suspicious XLSX compression ratio: ${name}`);
    }
    totalUncompressed += uncompressedSize;
    if (totalUncompressed > MAX_TOTAL_UNCOMPRESSED) throw new Error("XLSX uncompressed content exceeds limit");

    entries.set(name.replace(/^\//, ""), { name, method, compressedSize, uncompressedSize, localHeaderOffset, flags });
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function readEntry(data: Uint8Array, entry: ZipEntry): Uint8Array {
  const o = entry.localHeaderOffset;
  if (u32(data, o) !== 0x04034b50) throw new Error(`Invalid local ZIP header: ${entry.name}`);
  const nameLen = u16(data, o + 26);
  const extraLen = u16(data, o + 28);
  const start = o + 30 + nameLen + extraLen;
  const end = start + entry.compressedSize;
  if (end > data.length) throw new Error(`ZIP entry exceeds file bounds: ${entry.name}`);
  const compressed = data.slice(start, end);
  const result = entry.method === 0 ? compressed : inflateRawSync(compressed);
  if (result.length !== entry.uncompressedSize) throw new Error(`ZIP entry size mismatch: ${entry.name}`);
  return result;
}

function attrMap(source: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([:\w.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source))) attrs[match[1]] = xmlDecode(match[2] ?? match[3] ?? "");
  return attrs;
}

function xmlDecode(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function textNodes(xml: string): string {
  let out = "";
  const re = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml))) out += xmlDecode(match[1].replace(/<[^>]+>/g, ""));
  return out;
}

function normalizeTarget(target: string): string {
  const clean = target.replace(/\\/g, "/");
  if (clean.startsWith("/")) return clean.slice(1);
  if (clean.startsWith("xl/")) return clean;
  return `xl/${clean.replace(/^\.\//, "")}`;
}

function parseWorkbookDefinition(xml: string): { sheets: { name: string; relId: string }[]; date1904: boolean } {
  const workbookPr = xml.match(/<workbookPr\b([^>]*)\/?\s*>/);
  const pr = workbookPr ? attrMap(workbookPr[1]) : {};
  const date1904 = ["1", "true", "TRUE"].includes(pr.date1904 ?? "");
  const sheets: { name: string; relId: string }[] = [];
  const re = /<sheet\b([^>]*)\/?\s*>/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml))) {
    const attrs = attrMap(match[1]);
    const relId = attrs["r:id"];
    if (attrs.name && relId) sheets.push({ name: attrs.name, relId });
  }
  return { sheets, date1904 };
}

function parseRelationships(xml: string): Map<string, string> {
  const result = new Map<string, string>();
  const re = /<Relationship\b([^>]*)\/?\s*>/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml))) {
    const attrs = attrMap(match[1]);
    if (attrs.Id && attrs.Target) result.set(attrs.Id, normalizeTarget(attrs.Target));
  }
  return result;
}

function parseSharedStrings(xml: string): string[] {
  const result: string[] = [];
  const re = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml))) result.push(textNodes(match[1]));
  return result;
}

const BUILTIN_DATE_FORMATS = new Set<number>([
  14, 15, 16, 17, 18, 19, 20, 21, 22,
  27, 28, 29, 30, 31, 32, 33, 34, 35, 36,
  45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58
]);

function looksLikeDateFormat(format: string): boolean {
  const stripped = format
    .replace(/"[^"]*"/g, "")
    .replace(/\\./g, "")
    .replace(/\[[^\]]*\]/g, "")
    .toLowerCase();
  return /[ymdhis]/.test(stripped);
}

function parseDateStyleIndexes(stylesXml: string | undefined): Set<number> {
  if (!stylesXml) return new Set();
  const customDateIds = new Set<number>();
  const fmtRe = /<numFmt\b([^>]*)\/?\s*>/g;
  let match: RegExpExecArray | null;
  while ((match = fmtRe.exec(stylesXml))) {
    const attrs = attrMap(match[1]);
    const id = Number(attrs.numFmtId);
    if (Number.isFinite(id) && looksLikeDateFormat(attrs.formatCode ?? "")) customDateIds.add(id);
  }

  const dateStyles = new Set<number>();
  const xfs = stylesXml.match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/)?.[1] ?? "";
  const xfRe = /<xf\b([^>]*)\/?\s*>/g;
  let index = 0;
  while ((match = xfRe.exec(xfs))) {
    const attrs = attrMap(match[1]);
    const id = Number(attrs.numFmtId ?? 0);
    if (BUILTIN_DATE_FORMATS.has(id) || customDateIds.has(id)) dateStyles.add(index);
    index++;
  }
  return dateStyles;
}

function excelSerialToNaiveIso(serial: number, date1904: boolean): string {
  const dayMs = 86_400_000;
  const ms = date1904
    ? Date.UTC(1904, 0, 1) + serial * dayMs
    : Date.UTC(1899, 11, 31) + (serial >= 60 ? serial - 1 : serial) * dayMs;
  // Excel serial dates are wall-clock values with no timezone. Keep them naive
  // so normalizeRows can apply the explicit source IANA timezone.
  return new Date(ms).toISOString().slice(0, 19);
}

function columnIndex(ref: string): number {
  const letters = ref.match(/^[A-Z]+/i)?.[0]?.toUpperCase();
  if (!letters) return -1;
  let n = 0;
  for (const ch of letters) n = n * 26 + ch.charCodeAt(0) - 64;
  return n - 1;
}

function cellValue(xml: string, attrs: Record<string, string>, shared: string[], dateStyles: Set<number>, date1904: boolean): string {
  const type = attrs.t ?? "n";
  if (type === "inlineStr") return textNodes(xml);
  const raw = xml.match(/<v\b[^>]*>([\s\S]*?)<\/v>/)?.[1] ?? "";
  const value = xmlDecode(raw);
  if (type === "s") return shared[Number(value)] ?? "";
  if (type === "b") return value === "1" ? "TRUE" : "FALSE";
  if (type === "str") return value;
  if (type === "e") return "";
  const style = Number(attrs.s ?? -1);
  const number = Number(value);
  if (value && Number.isFinite(number) && dateStyles.has(style)) return excelSerialToNaiveIso(number, date1904);
  return value;
}

function parseWorksheet(xml: string, shared: string[], dateStyles: Set<number>, date1904: boolean): string[][] {
  const rows: string[][] = [];
  const rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowRe.exec(xml))) {
    if (rows.length >= MAX_ROWS_PER_SHEET) throw new Error(`Worksheet exceeds ${MAX_ROWS_PER_SHEET} row limit`);
    const row: string[] = [];
    const cellRe = /<c\b([^>]*)>([\s\S]*?)<\/c>|<c\b([^>]*)\/>/g;
    let cellMatch: RegExpExecArray | null;
    while ((cellMatch = cellRe.exec(rowMatch[1]))) {
      const attrs = attrMap(cellMatch[1] ?? cellMatch[3] ?? "");
      const index = columnIndex(attrs.r ?? "");
      if (index < 0 || index > 16_383) continue;
      while (row.length <= index) row.push("");
      row[index] = cellValue(cellMatch[2] ?? "", attrs, shared, dateStyles, date1904);
    }
    rows.push(row);
  }
  return rows;
}

function parseWorkbook(data: Uint8Array): ParsedWorkbook {
  if (data.byteLength > MAX_XLSX_BYTES) throw new Error(`XLSX exceeds ${MAX_XLSX_BYTES / 1024 / 1024}MB limit`);
  const entries = parseCentralDirectory(data);
  const readXml = (name: string, optional = false): string | undefined => {
    const entry = entries.get(name);
    if (!entry) {
      if (optional) return undefined;
      throw new Error(`Required XLSX entry missing: ${name}`);
    }
    return decodeUtf8(readEntry(data, entry));
  };

  const workbook = parseWorkbookDefinition(readXml("xl/workbook.xml")!);
  if (workbook.sheets.length > MAX_SHEETS) throw new Error(`Workbook exceeds ${MAX_SHEETS} sheet limit`);
  const relationships = parseRelationships(readXml("xl/_rels/workbook.xml.rels")!);
  const shared = parseSharedStrings(readXml("xl/sharedStrings.xml", true) ?? "");
  const dateStyles = parseDateStyleIndexes(readXml("xl/styles.xml", true));

  const sheets: { name: string; rows: string[][] }[] = [];
  for (const sheet of workbook.sheets) {
    const target = relationships.get(sheet.relId);
    if (!target || !target.startsWith("xl/worksheets/")) continue;
    const xml = readXml(target);
    if (!xml) continue;
    sheets.push({ name: sheet.name, rows: parseWorksheet(xml, shared, dateStyles, workbook.date1904) });
  }
  if (!sheets.length) throw new Error("Workbook contains no readable worksheets");
  return { sheets };
}

const REQUIRED_FIELDS = ["transaction_id", "occurred_at", "store", "product", "quantity", "net_amount"] as const;

function inspectRows(name: string, rows: string[][]): WorkbookSheetInspection {
  const headers = rows[0] ?? [];
  const mapping = mapHeaders(headers);
  const mappedRequired = REQUIRED_FIELDS.filter(field => mapping[field] !== undefined).length;
  const mappedOptional = mapping.customer_phone !== undefined ? 1 : 0;
  const rowCount = Math.max(0, rows.length - 1);
  const candidateScore = mappedRequired * 100 + mappedOptional * 10 + Math.min(rowCount, 10_000) / 10_000;
  return {
    name,
    rowCount,
    columnCount: headers.length,
    headers,
    mapping,
    mappedRequired,
    mappedOptional,
    candidateScore
  };
}

export function inspectXlsx(data: Uint8Array): WorkbookInspection {
  const workbook = parseWorkbook(data);
  const sheets = workbook.sheets.map(s => inspectRows(s.name, s.rows));
  const ranked = [...sheets].sort((a, b) => b.candidateScore - a.candidateScore || b.rowCount - a.rowCount);
  const top = ranked[0];
  const second = ranked[1];
  const suggestedSheet = top && top.mappedRequired === REQUIRED_FIELDS.length ? top.name : undefined;
  const ambiguous = Boolean(suggestedSheet && second && second.mappedRequired === REQUIRED_FIELDS.length && Math.abs(top.candidateScore - second.candidateScore) < 0.0001);
  return { sheets, suggestedSheet, ambiguous };
}

export function analyzeXlsx(
  data: Uint8Array,
  sheetName?: string,
  mappingOverride?: MappingOverride,
  options: AnalysisOptions = {}
): WorkbookAnalysisResult {
  const workbook = parseWorkbook(data);
  const inspectionSheets = workbook.sheets.map(s => inspectRows(s.name, s.rows));
  const ranked = [...inspectionSheets].sort((a, b) => b.candidateScore - a.candidateScore || b.rowCount - a.rowCount);
  const suggested = ranked[0]?.mappedRequired === REQUIRED_FIELDS.length ? ranked[0].name : undefined;
  const ambiguous = Boolean(suggested && ranked[1] && ranked[1].mappedRequired === REQUIRED_FIELDS.length && Math.abs(ranked[0].candidateScore - ranked[1].candidateScore) < 0.0001);
  const selectedName = sheetName ?? suggested;
  if (!selectedName) throw new Error("No worksheet maps all required CafeOS fields");
  if (!sheetName && ambiguous) throw new Error("Multiple equally plausible transaction sheets; select a sheet explicitly");
  const selected = workbook.sheets.find(s => s.name === selectedName);
  if (!selected) throw new Error(`Worksheet not found: ${selectedName}`);
  const analysis = analyzeTable(selected.rows, mappingOverride, options);
  return {
    ...analysis,
    workbook: {
      sheets: inspectionSheets,
      suggestedSheet: suggested,
      ambiguous,
      selectedSheet: selectedName,
      selectionSource: sheetName ? "explicit" : "suggested"
    }
  };
}
