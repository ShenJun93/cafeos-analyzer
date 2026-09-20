import type { CanonicalField } from "./types.js";

const aliases: Record<CanonicalField, string[]> = {
  transaction_id: [
    "transactionid", "transaction_id", "mahd", "mahoadon", "invoice", "invoiceid", "invoicecode",
    "orderid", "ordercode", "orderno", "madon", "madonhang", "sohoadon", "sodonhang", "no"
  ],
  occurred_at: [
    "occurredat", "occurred_at", "ngayban", "ngay", "ngaygio", "thoigian", "ngaytao", "ngayhoadon",
    "datetime", "purchasedate", "createddate", "date", "orderdate"
  ],
  store: [
    "store", "storename", "cuahang", "tencuahang", "chinhanh", "tenchinhanh", "branch", "branchname"
  ],
  product: [
    "product", "productname", "sanpham", "tensanpham", "tenhang", "tenhanghoa", "item", "itemname", "tenmon", "mon"
  ],
  quantity: ["quantity", "qty", "sl", "soluong", "soluongban"],
  net_amount: [
    "netamount", "net_amount", "linenetamount", "lineamount", "thanhtien", "tongtien", "tongthanhtien",
    "doanhthu", "doanhthuthuan", "amount", "subtotal", "totalamount", "nettotal"
  ],
  customer_phone: [
    "customerphone", "customer_phone", "customertel", "contactnumber", "sdt", "sdtkhach", "sodienthoai",
    "sodienthoaikhach", "dienthoai", "phone", "telephone", "customerid", "customer_id", "customerkey", "customercode", "customeridentifier"
  ]
};

export interface MappingSuggestion {
  field: CanonicalField;
  index?: number;
  header?: string;
  confidence: number;
  reason: "exact_alias" | "contained_alias" | "unmapped";
}

export function normalizeHeader(value: string): string {
  return value
    .replace(/^\uFEFF/, "")
    .replace(/[Đđ]/g, "d")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "");
}

function scoreHeader(header: string, field: CanonicalField): { score: number; reason: MappingSuggestion["reason"] } {
  const h = normalizeHeader(header);
  let best = 0;
  let reason: MappingSuggestion["reason"] = "unmapped";
  for (const alias of aliases[field]) {
    const a = normalizeHeader(alias);
    if (h === a) return { score: 0.99, reason: "exact_alias" };
    if (a.length >= 4 && h.length >= 4 && (h.includes(a) || a.includes(h))) {
      const ratio = Math.min(h.length, a.length) / Math.max(h.length, a.length);
      const score = 0.80 + ratio * 0.08;
      if (score > best) { best = score; reason = "contained_alias"; }
    }
  }
  return { score: best, reason };
}

export function suggestMappings(headers: string[]): MappingSuggestion[] {
  const suggestions: MappingSuggestion[] = [];
  const used = new Set<number>();
  for (const field of Object.keys(aliases) as CanonicalField[]) {
    let best: MappingSuggestion = { field, confidence: 0, reason: "unmapped" };
    for (let i = 0; i < headers.length; i++) {
      if (used.has(i)) continue;
      const { score, reason } = scoreHeader(headers[i], field);
      if (score > best.confidence) best = { field, index: i, header: headers[i], confidence: score, reason };
    }
    if (best.confidence >= 0.80 && best.index !== undefined) used.add(best.index);
    else best = { field, confidence: 0, reason: "unmapped" };
    suggestions.push(best);
  }
  return suggestions;
}

export function mapHeaders(headers: string[]): Partial<Record<CanonicalField, number>> {
  const result: Partial<Record<CanonicalField, number>> = {};
  for (const suggestion of suggestMappings(headers)) {
    if (suggestion.index !== undefined && suggestion.confidence >= 0.80) result[suggestion.field] = suggestion.index;
  }
  return result;
}
