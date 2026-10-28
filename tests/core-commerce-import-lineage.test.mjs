import test from "node:test";
import assert from "node:assert/strict";
import {
  handle, storeDayUtcBounds, summarizeNamespaceRows, exactLineagePage
} from "../server/commerce/import-lineage.mjs";
import { WORKFLOW_ROUTES } from "../api/app/workflow.mjs";

const T = "10000000-0000-4000-8000-000000000001";
const S = "11000000-0000-4000-8000-000000000001";
const OTHER = "20000000-0000-4000-8000-000000000002";
const USER = "a0000000-0000-4000-8000-000000000001";
const DAY = "2026-10-28";
const env = {
  SUPABASE_URL: "https://synthetic.supabase.invalid",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_synthetic"
};
const row = (id, namespace, transactionId, occurredAt="2026-10-28T02:00:00+00:00")=>({
  id:"31000000-0000-4000-8000-"+String(id).padStart(12,"0"),
  tenant_id:T,store_id:S,source_namespace:namespace,
  transaction_id:transactionId,occurred_at:occurredAt
});
const data = [
  row(1,"kiotviet","SALE-001"),
  row(2,"kiotviet","SALE-001"),
  row(3,"sapo","SALE-001")
];
const req = (q="storeId="+S+"&businessDate="+DAY,method="GET")=>({
  url:"/api/app/commerce-import-lineage?"+q,method,
  headers:{authorization:"Bearer synthetic","x-cafeos-tenant-id":T}
});
const res=()=>({statusCode:0,body:"",setHeader(){},end(s){this.body=String(s)}});
const parsed=r=>JSON.parse(r.body);
const response=(x,status=200,headers={})=>new Response(JSON.stringify(x),{status,headers});
function fixture({role="manager",rows=data,contentRange,stores=[{
  id:S,tenant_id:T,name:"Synthetic Cafe",timezone:"Asia/Ho_Chi_Minh",active:true
}]}={}){
  const calls=[];
  const fetchImpl=async (url,opts={})=>{
    const u=new URL(url);
    if(u.pathname==="/auth/v1/user") return response({id:USER});
    if(u.pathname==="/rest/v1/tenant_members")return response([{tenant_id:T,role}]);
    if(u.pathname==="/rest/v1/stores"){
      calls.push("stores");
      assert.equal(opts.headers.authorization,"Bearer synthetic");
      assert.equal(u.searchParams.get("tenant_id"),"eq."+T);
      assert.equal(u.searchParams.get("id"),"eq."+S);
      return response(stores);
    }
    if(u.pathname==="/rest/v1/transaction_line_items"){
      calls.push("lines");
      assert.equal(opts.method??"GET","GET");
      assert.equal(opts.headers.prefer,"count=exact");
      assert.equal(opts.headers.authorization,"Bearer synthetic");
      assert.equal(u.searchParams.get("tenant_id"),"eq."+T);
      assert.equal(u.searchParams.get("store_id"),"eq."+S);
      assert.equal(u.searchParams.get("limit"),"501");
      assert.equal(u.searchParams.get("order"),"occurred_at.asc,id.asc");
      const and=u.searchParams.get("and");
      assert.match(and,/occurred_at\.gte\.2026-10-27T17:00:00\.000Z/);
      assert.match(and,/occurred_at\.lt\.2026-10-28T17:00:00\.000Z/);
      const range = contentRange === undefined
        ? (rows.length ? "0-"+(rows.length-1)+"/"+rows.length : "*/0")
        : contentRange;
      return response(rows,200,range===null?{}:{"content-range":range});
    }
    throw Error("Unexpected read "+u.pathname);
  };
  return {env,fetchImpl,calls};
}
test("business-day UTC range is Store-local, including daylight-saving transitions",()=>{
 const vn=storeDayUtcBounds(DAY,"Asia/Ho_Chi_Minh");
 assert.equal(vn.start,"2026-10-27T17:00:00.000Z");
 assert.equal(vn.end,"2026-10-28T17:00:00.000Z");
 const laSpring=storeDayUtcBounds("2026-03-08","America/Los_Angeles");
 assert.equal(laSpring.start,"2026-03-08T08:00:00.000Z");
 assert.equal(laSpring.end,"2026-03-09T07:00:00.000Z");
 const laFall=storeDayUtcBounds("2026-11-01","America/Los_Angeles");
 assert.equal(laFall.start,"2026-11-01T07:00:00.000Z");
 assert.equal(laFall.end,"2026-11-02T08:00:00.000Z");
 assert.throws(()=>storeDayUtcBounds(DAY,"NOT_A_ZONE"));
});
test("manager-only namespace diagnostic counts within source; no cross-source dedup",async()=>{
 assert.equal(typeof WORKFLOW_ROUTES["commerce-import-lineage"],"function");
 const d=fixture(),out=res();
 await handle(req(),out,d);
 assert.equal(out.statusCode,200);
 const p=parsed(out);
 assert.equal(p.businessDate,DAY);
 assert.equal(p.sourceBoundary.comparedToPos,false);
  assert.equal(p.sourceBoundary.sourceAccountProvenance, "not_verified");
 assert.equal(p.sourceBoundary.deduplication,"not_performed");
 assert.equal(p.sourceBoundary.combinedSales,null);
 assert.equal(p.sourceBoundary.transactionIdsExposed,false);
 assert.equal(p.observedLineItemCount,3);
 assert.equal(p.completeness.exactResponseVerified,true);
 assert.equal(p.completeness.exactMatchedLineItemCount,3);
 assert.equal(p.observedNamespaceCount,2);
 assert.deepEqual(p.namespaces,[
   {sourceNamespace:"kiotviet",lineItemCount:2,sourceScopedTransactionCount:1},
   {sourceNamespace:"sapo",lineItemCount:1,sourceScopedTransactionCount:1}
 ]);
 assert.deepEqual(d.calls,["stores","lines"]);
 assert.ok(!JSON.stringify(p).includes("SALE-001"));
});
test("cashier, analyst, viewer and anonymous cannot fetch namespace audit rows",async()=>{
 for(const role of ["cashier","analyst","viewer"]){
  const d=fixture({role}),out=res();await handle(req(),out,d);
  assert.equal(out.statusCode,403);
  assert.deepEqual(d.calls,[]);
 }
 const d=fixture(),out=res();await handle({...req(),headers:{}},out,d);
 assert.equal(out.statusCode,401);assert.deepEqual(d.calls,[]);
});
test("invalid/repeated query and non-GET fail before Store read",async()=>{
 const bad=["", "storeId="+S,"businessDate="+DAY,
  "storeId="+S+"&businessDate=2026-02-30",
  "storeId="+S+"&storeId="+S+"&businessDate="+DAY,
  "storeId="+S+"&businessDate="+DAY+"&businessDate="+DAY,
  "storeId="+S+"&businessDate="+DAY+"&tenantId="+T,
  "storeId=notuuid&businessDate="+DAY,
  "storeId="+S+"&businessDate=%20"+DAY];
 for(const q of bad){
  const d=fixture(),out=res();await handle(req(q),out,d);
  assert.equal(out.statusCode,400,q);assert.deepEqual(d.calls,[]);
 }
 const d=fixture(),out=res();await handle(req(undefined,"POST"),out,d);
 assert.equal(out.statusCode,405);assert.deepEqual(d.calls,[]);
});
test("Store lookup prevents foreign/inactive/duplicate or invalid timezone",async()=>{
 for(const stores of [
  [{id:S,tenant_id:OTHER,name:"Foreign",active:true,timezone:"Asia/Ho_Chi_Minh"}],
  [{id:S,tenant_id:T,name:"Disabled",active:false,timezone:"Asia/Ho_Chi_Minh"}],
  [{id:S,tenant_id:T,name:"Bad",active:true,timezone:"Invalid/Zone"}],
  [{id:S,tenant_id:T,name:"Duplicate",active:true,timezone:"Asia/Ho_Chi_Minh"},
   {id:S,tenant_id:T,name:"Duplicate",active:true,timezone:"Asia/Ho_Chi_Minh"}]
 ]){
  const d=fixture({stores}),out=res();await handle(req(),out,d);
  assert.equal(out.statusCode,502);
  assert.deepEqual(d.calls,["stores"]);
 }
 const d=fixture({stores:[]}),out=res();await handle(req(),out,d);
 assert.equal(out.statusCode,404);assert.deepEqual(d.calls,["stores"]);
});
test("501st row refuses incomplete namespace evidence without publishing prefix",async()=>{
 const rows=Array.from({length:501},(_,i)=>row(i+1,"import","ORDER-"+i));
 const d=fixture({rows}),out=res();await handle(req(),out,d);
 assert.equal(out.statusCode,422);
 assert.equal(parsed(out).error.code,"IMPORT_LINEAGE_LIMIT");
 assert.equal(Object.hasOwn(parsed(out),"namespaces"),false);
});
test("spoofed Tenant, Store, UUID, day and namespace/transaction IDs fail closed",async()=>{
 for(const rows of [
  [{...data[0],tenant_id:OTHER}],
  [{...data[0],store_id:OTHER}],
  [{...data[0],id:"not-a-uuid"}],
  [{...data[0],source_namespace:" "}],
  [{...data[0],source_namespace:" overtrim"}],
  [{...data[0],transaction_id:""}],
  [{...data[0],occurred_at:"2026-10-27T15:00:00Z"}],
  [{...data[0],occurred_at:"2026-02-30T02:00:00Z"}],
  [data[0],data[0]]
 ]){
  const d=fixture({rows}),out=res();await handle(req(),out,d);
  assert.equal(out.statusCode,502,JSON.stringify(rows));
  assert.equal(Object.hasOwn(parsed(out),"namespaces"),false);
 }
});
test("empty day means no observed rows, not zero sales or proven no activity",async()=>{
 const d=fixture({rows:[]}),out=res();await handle(req(),out,d);
 assert.equal(out.statusCode,200);
 const p=parsed(out);assert.equal(p.observedLineItemCount,0);
 assert.deepEqual(p.namespaces,[]);assert.equal(p.sourceBoundary.combinedSales,null);
 assert.equal(p.completeness.status,"bounded_read_only");
});

test("exact count metadata proves entire filtered page, including empty and 500 lines",()=>{
 const rows=Array.from({length:500},(_,i)=>row(i+1,"namespace","order-"+i));
 assert.equal(exactLineagePage([],"*/0"),0);
 assert.equal(exactLineagePage(data,"0-2/3"),3);
 assert.equal(exactLineagePage(rows,"0-499/500"),500);
});
test("upstream 501st hidden row or larger exact total is rejected rather than undercounted",async()=>{
 for(const count of [501,800,100000]){
  const d=fixture({rows:data,contentRange:"0-2/"+count}),out=res();
  await handle(req(),out,d);
  assert.equal(out.statusCode,422,count);
  assert.equal(parsed(out).error.code,"IMPORT_LINEAGE_LIMIT");
  assert.equal(Object.hasOwn(parsed(out),"namespaces"),false);
 }
});
test("PostgREST lower max-rows cap, missing count or malformed range fails closed",async()=>{
 const invalid=[
  "0-1/3","0-2/*","0-2/2","1-3/3","0-1/2",
  "0-3/3","*/0","*/3","0-2/NaN","0-2/9007199254740992",
  null
 ];
 for(const contentRange of invalid){
  const d=fixture({rows:data,contentRange}),out=res();
  await handle(req(),out,d);
  assert.equal(out.statusCode,502,String(contentRange));
  assert.equal(parsed(out).error.code,"SUPABASE_UPSTREAM");
  assert.equal(Object.hasOwn(parsed(out),"namespaces"),false);
 }
});
test("exact counted rows below server cap still publish bounded read-only observation",async()=>{
 const rows=Array.from({length:100},(_,i)=>row(i+1,"synthetic","X"+i));
 const d=fixture({rows,contentRange:"0-99/100"}),out=res();
 await handle(req(),out,d);
 assert.equal(out.statusCode,200);
 assert.equal(parsed(out).completeness.exactResponseVerified,true);
 assert.equal(parsed(out).completeness.exactMatchedLineItemCount,100);
 assert.equal(parsed(out).observedLineItemCount,100);
});
