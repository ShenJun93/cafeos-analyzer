import test from "node:test";
import assert from "node:assert/strict";
import { handle } from "../server/commerce/source-bridge.mjs";
import { WORKFLOW_ROUTES } from "../api/app/workflow.mjs";

const TENANT="10000000-0000-4000-8000-000000000001";
const OTHER="20000000-0000-4000-8000-000000000002";
const STORE="11000000-0000-4000-8000-000000000001";
const USER="a0000000-0000-4000-8000-000000000001";
const DATE="2026-10-28";
const env={SUPABASE_URL:"https://synthetic.supabase.invalid",SUPABASE_PUBLISHABLE_KEY:"sb_publishable_test"};
const response=body=>new Response(JSON.stringify(body),{status:200});
const req=(query="storeId="+STORE+"&businessDate="+DATE,method="GET")=>({
 method,url:"/api/app/commerce-source-bridge?"+query,
 headers:{authorization:"Bearer synthetic","x-cafeos-tenant-id":TENANT}
});
const res=()=>({statusCode:0,body:"",setHeader(){},end(x){this.body=String(x)}});
const parsed=r=>JSON.parse(r.body);
function native() {
 return {
  source:"cafeos_pos",tenantId:TENANT,storeId:STORE,businessDate:DATE,
  salesTotal:"70000.25",paymentTotal:"70000.25",
  orderCount:2,openOrderCount:1,aov:"35000.125",
  paymentMix:{cash:"70000.25"},closed:false,closeId:null,closedAt:null
 };
}
function imported() {
 return {
  tenantId:TENANT,store:{id:STORE,name:"Main cafe",active:true},
  asOfBusinessDate:DATE,
  coverage:{currentHasData:true},
  freshness:{latestObservedTransactionAt:"2026-10-28T10:11:12Z"},
  metrics:{
   netSales:{current:"34000.00",baselineStatus:"insufficient_history"},
   orders:{current:1,baselineStatus:"insufficient_history"},
   aov:{current:"34000.00",baselineStatus:"insufficient_history"}
  }
 };
}
function fixture({role="owner",pos=native(),ext=imported()}={}) {
 const calls=[];
 const fetchImpl=async (url,options={})=>{
  const p=new URL(url);
  if(p.pathname==="/auth/v1/user")return response({id:USER});
  if(p.pathname==="/rest/v1/tenant_members")return response([{tenant_id:TENANT,role}]);
  if(p.pathname==="/rest/v1/rpc/commerce_daily_dashboard"
    || p.pathname==="/rest/v1/rpc/store_health_aggregate"){
   const body=JSON.parse(options.body);
   assert.equal(options.method,"POST");
   assert.equal(options.headers.authorization,"Bearer synthetic");
   assert.equal(body.p_tenant_id,TENANT);
   assert.equal(body.p_store_id,STORE);
   assert.equal(body.p_business_date??body.p_as_of_business_date,DATE);
   calls.push(p.pathname);
   return response(p.pathname.endsWith("commerce_daily_dashboard")?pos:ext);
  }
  throw Error("Unexpected upstream "+p.pathname);
 };
 return {env,fetchImpl,calls};
}
test("source bridge GET keeps exact-date native/imported sources separate without synthetic combined totals",async()=>{
 assert.equal(typeof WORKFLOW_ROUTES["commerce-source-bridge"],"function");
 const d=fixture(),r=res();await handle(req(),r,d);
 assert.equal(r.statusCode,200);
 const value=parsed(r);
 assert.equal(value.store.id,STORE);
 assert.equal(value.businessDate,DATE);
 assert.deepEqual(value.sourceBoundary.status,"separate_not_deduplicated");
 assert.equal(value.sources.cafeosPos.salesTotal,"70000.25");
 assert.equal(value.sources.imports.netSales,"34000.00");
 assert.equal(value.sources.cafeosPos.orderCount,2);
 assert.equal(value.sources.imports.orderCount,1);
 assert.equal(value.sources.imports.hasData,true);
 assert.equal(Object.hasOwn(value,"totalSales"),false);
 assert.equal(Object.hasOwn(value,"unifiedSales"),false);
 assert.equal(d.calls.length,2);
});
test("read is available to authorized tenant members without write privileges",async()=>{
 for(const role of ["cashier","manager","analyst","viewer"]){
  const d=fixture({role}),r=res();await handle(req(),r,d);
  assert.equal(r.statusCode,200);assert.equal(d.calls.length,2);
 }
 const d=fixture(),r=res();await handle({...req(),headers:{}},r,d);
 assert.equal(r.statusCode,401);assert.equal(d.calls.length,0);
});
test("all invalid or repeated query inputs fail without reading either source",async()=>{
 for(const query of [
  "storeId="+STORE,"businessDate="+DATE,"storeId="+STORE+"&businessDate=2026-02-30",
  "storeId="+STORE+"&businessDate="+DATE+"&businessDate="+DATE,
  "storeId="+STORE+"&storeId="+STORE+"&businessDate="+DATE,
  "storeId=bad&businessDate="+DATE,
  "storeId="+STORE+"&businessDate="+DATE+"&total=20",
  "storeId="+STORE+"&businessDate=%20"+DATE+"%20"
 ]){
  const d=fixture(),r=res();await handle(req(query),r,d);
  assert.equal(r.statusCode,400,query);
  assert.equal(d.calls.length,0,query);
 }
 const d=fixture(),r=res();await handle(req(undefined,"POST"),r,d);
 assert.equal(r.statusCode,405);assert.equal(d.calls.length,0);
});
test("native tenant, date and financial inconsistencies refuse any partial bridge",async()=>{
 for(const pos of [
  {...native(),tenantId:OTHER},{...native(),storeId:OTHER},
  {...native(),businessDate:"2026-10-27"},
  {...native(),salesTotal:"70000.26"},
  {...native(),source:"imported_line_items"}
 ]){
  const d=fixture({pos}),r=res();await handle(req(),r,d);
  assert.equal(r.statusCode,502);
  assert.equal(Object.hasOwn(parsed(r),"sources"),false);
 }
});
test("imported lineage and coverage guard fail closed for fabricated tenant/store/date/money",async()=>{
 for(const ext of [
  {...imported(),tenantId:OTHER},
  {...imported(),store:{...imported().store,id:OTHER}},
  {...imported(),asOfBusinessDate:"2026-10-27"},
  {...imported(),coverage:{currentHasData:false}},
  {...imported(),metrics:{...imported().metrics,orders:{current:null,baselineStatus:"ready"}}},
  {...imported(),metrics:{...imported().metrics,netSales:{current:"garbled",baselineStatus:"ready"}}},
  {...imported(),freshness:{latestObservedTransactionAt:"2026-02-30T10:00:00Z"}}
 ]){
  const d=fixture({ext}),r=res();await handle(req(),r,d);
  assert.equal(r.statusCode,502,JSON.stringify(ext));
  assert.equal(Object.hasOwn(parsed(r),"sources"),false);
 }
});
test("missing import observations remain unknown, never become invented zero sales",async()=>{
 const e=imported();
 e.asOfBusinessDate=null;e.coverage={currentHasData:false};
 e.metrics={
  netSales:{current:null,baselineStatus:"insufficient_history"},
  orders:{current:null,baselineStatus:"insufficient_history"},
  aov:{current:null,baselineStatus:"insufficient_history"}
 };
 e.freshness={latestObservedTransactionAt:null};
 const d=fixture({ext:e}),r=res();await handle(req(),r,d);
 assert.equal(r.statusCode,200);
 const {sources}=parsed(r);
 assert.equal(sources.imports.hasData,false);
 assert.equal(sources.imports.netSales,null);
 assert.equal(sources.cafeosPos.salesTotal,"70000.25");
});
