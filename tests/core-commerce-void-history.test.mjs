import test from "node:test";
import assert from "node:assert/strict";
import { handle } from "../server/commerce/void-history.mjs";
import { WORKFLOW_ROUTES } from "../api/app/workflow.mjs";

const TENANT="10000000-0000-4000-8000-000000000001";
const OTHER="20000000-0000-4000-8000-000000000002";
const STORE="11000000-0000-4000-8000-000000000001";
const ORDER="16000000-0000-4000-8000-000000000001";
const USER="a0000000-0000-4000-8000-000000000001";
const DAY="2026-10-28";
const TIME="2026-10-28T06:12:15Z";
const env={SUPABASE_URL:"https://synthetic.supabase.invalid",SUPABASE_PUBLISHABLE_KEY:"sb_publishable_test"};
const response=(body,status=200)=>new Response(JSON.stringify(body),{status});
const req=(query,method="GET")=>({
 method,url:"/api/app/commerce-void-history?"+query,
 headers:{authorization:"Bearer synthetic","x-cafeos-tenant-id":TENANT}
});
const res=()=>({statusCode:0,body:"",setHeader(){},end(x){this.body=String(x)}});
const result=r=>JSON.parse(r.body);
const record=()=>({
 tenant_id:TENANT,order_id:ORDER,store_id:STORE,
 business_date:DAY,reason:"Khách đổi ý",voided_by_user_id:USER,voided_at:TIME
});
const order=(status="voided")=>({
 id:ORDER,tenant_id:TENANT,store_id:STORE,order_number:"POS-123",
 status,business_date:DAY,voided_at:status==="voided"?TIME:null
});
function deps({role="manager", orders=[order()], receipts=[record()],
 list=[record()]}={}) {
 const calls=[];
 const fetchImpl=async(url,options={})=>{
  const p=new URL(url);
  if(p.pathname==="/auth/v1/user")return response({id:USER});
  if(p.pathname==="/rest/v1/tenant_members")return response([{tenant_id:TENANT,role}]);
  assert.equal(options.method??"GET","GET");
  assert.equal(options.headers.authorization,"Bearer synthetic");
  if(p.pathname==="/rest/v1/pos_orders") {
    calls.push("order");assert.equal(p.searchParams.get("store_id"),"eq."+STORE);
    assert.equal(p.searchParams.get("tenant_id"),"eq."+TENANT);
    assert.equal(p.searchParams.get("id"),"eq."+ORDER);
    return response(orders);
  }
  if(p.pathname==="/rest/v1/pos_order_voids"){
    assert.equal(p.searchParams.get("tenant_id"),"eq."+TENANT);
    assert.equal(p.searchParams.get("store_id"),"eq."+STORE);
    if(p.searchParams.has("order_id")){
      calls.push("receipt");
      assert.equal(p.searchParams.get("order_id"),"eq."+ORDER);
      return response(receipts);
    }
    calls.push("history");
    assert.equal(p.searchParams.get("limit"),"21");
    return response(list);
  }
  throw Error("Unexpected upstream "+p.pathname);
 };
 return {env,fetchImpl,calls};
}
test("manager's GET void reconciliation verifies Order status and same authoritative audit receipt",async()=>{
 assert.equal(typeof WORKFLOW_ROUTES["commerce-void-history"],"function");
 const d=deps(),r=res();
 await handle(req("storeId="+STORE+"&orderId="+ORDER),r,d);
 assert.equal(r.statusCode,200);
 assert.deepEqual(d.calls,["order","receipt"]);
 assert.equal(result(r).order.status,"voided");
 assert.equal(result(r).receipt.reason,"Khách đổi ý");
 assert.equal(result(r).receipt.voidedByUserId,USER);
});
test("pending void GET differentiates OPEN and PAID with no audit, without declaring success",async()=>{
 for(const status of ["open","paid"]) {
   const d=deps({orders:[order(status)],receipts:[]}),r=res();
   await handle(req("storeId="+STORE+"&orderId="+ORDER),r,d);
   assert.equal(r.statusCode,200);
   assert.equal(result(r).order.status,status);
   assert.equal(result(r).receipt,null);
   assert.deepEqual(d.calls,["order","receipt"]);
 }
});
test("foreign, cashier, viewer, analyst and anonymous callers cannot read void audit",async()=>{
 for(const role of ["cashier","viewer","analyst"]){
  const d=deps({role}),r=res();
  await handle(req("storeId="+STORE),r,d);
  assert.equal(r.statusCode,403);
  assert.equal(d.calls.length,0);
 }
 const d=deps(),r=res();
 await handle({...req("storeId="+STORE),headers:{}},r,d);
 assert.equal(r.statusCode,401);assert.equal(d.calls.length,0);
});
test("read-only void browse returns paginated manager audit rows",async()=>{
 const d=deps(),r=res();
 await handle(req("storeId="+STORE+"&offset=0"),r,d);
 assert.equal(r.statusCode,200);
 assert.equal(result(r).receipts.length,1);
 assert.equal(result(r).receipts[0].reason,"Khách đổi ý");
 assert.equal(result(r).nextOffset,null);
 assert.deepEqual(d.calls,["history"]);
});
test("bad query offsets, duplicate keys, unsupported fields fail before database reads",async()=>{
 const bad=[
 "storeId="+STORE+"&offset=-1",
 "storeId="+STORE+"&offset=10001",
 "storeId="+STORE+"&offset=1e3",
 "storeId="+STORE+"&orderId="+ORDER+"&offset=0",
 "storeId="+STORE+"&storeId="+STORE,
 "storeId="+STORE+"&bogus=1",
 "storeId=invalid",
 "storeId="+STORE+"&orderId=[]"
 ];
 for(const query of bad) {
   const d=deps(),r=res();
   await handle(req(query),r,d);
   assert.equal(r.statusCode,400,query);
   assert.equal(d.calls.length,0,query);
 }
});
test("inconsistent status/receipt combinations and forged tenant/store/date/actor/time fail closed",async()=>{
 const variants=[
 {orders:[order("voided")],receipts:[]},
 {orders:[order("open")],receipts:[record()]},
 {orders:[order("paid")],receipts:[record()]},
 {orders:[{...order(),voided_at:null}],receipts:[record()]},
 {orders:[{...order(),business_date:"2026-10-27"}],receipts:[record()]},
 {orders:[order()],receipts:[{...record(),tenant_id:OTHER}]},
 {orders:[order()],receipts:[{...record(),store_id:OTHER}]},
 {orders:[order()],receipts:[{...record(),voided_by_user_id:"invalid"}]},
 {orders:[order()],receipts:[{...record(),voided_at:"2026-02-30T12:00:00Z"}]},
 {orders:[order()],receipts:[{...record(),voided_at:"2026-10-28T06:12:16Z"}]},
 {orders:[order()],receipts:[record(),record()]}
 ];
 for(const bad of variants){
  const d=deps(bad),r=res();
  await handle(req("storeId="+STORE+"&orderId="+ORDER),r,d);
  assert.equal(r.statusCode,502,JSON.stringify(bad));
  assert.equal(Object.hasOwn(result(r),"receipt"),false);
 }
});
test("manager audit history rejects forged rows and duplicate IDs including lookahead",async()=>{
 const variants=[
  [{...record(),tenant_id:OTHER}],
  [{...record(),reason:"no"}],
  [{...record(),voided_at:"bad"}],
  [record(),record()],
  Array.from({length:22},()=>record())
 ];
 for(const list of variants){
  const d=deps({list}),r=res();
  await handle(req("storeId="+STORE),r,d);
  assert.equal(r.statusCode,502);
  assert.equal(Object.hasOwn(result(r),"receipts"),false);
 }
});
