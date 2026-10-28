import test from "node:test";
import assert from "node:assert/strict";
import { handle } from "../server/commerce/hq.mjs";
import { WORKFLOW_ROUTES } from "../api/app/workflow.mjs";

const TENANT = "10000000-0000-4000-8000-000000000001";
const USER = "a0000000-0000-4000-8000-000000000001";
const STORE_IDS = [1,2,3].map(n => "11000000-0000-4000-8000-" + String(n).padStart(12, "0"));
const STORES = STORE_IDS.map((id, n) => ({ id, tenant_id:TENANT, name:"Store "+(n+1), active:true }));
const DATE = "2026-10-28";
const env = { SUPABASE_URL:"https://example.supabase.co", SUPABASE_PUBLISHABLE_KEY:"sb_publishable_test" };
const response = (body, status=200) => new Response(JSON.stringify(body), {status});
const req = (method="GET",date=DATE) => ({
  method, url:"/api/app/commerce-hq"+(date===null?"":"?businessDate="+date),
  headers:{authorization:"Bearer fake-jwt","x-cafeos-tenant-id":TENANT}
});
const res = () => ({statusCode:0,body:"",setHeader(){},end(body){this.body=String(body);}});
const result = r => JSON.parse(r.body);
function daily(id, index) {
  const amount = ["70000.25","30000.20","0.00"][index];
  return {
    source:"cafeos_pos",tenantId:TENANT,storeId:id,businessDate:DATE,
    orderCount:[2,1,0][index],openOrderCount:index===0?1:0,
    salesTotal:amount,paymentTotal:amount,
    aov:["35000.125","30000.20",null][index],
    paymentMix:index===0?{cash:amount}:index===1?{card:amount}:{},
    closed:index===1,
    closeId:index===1?"12000000-0000-4000-8000-000000000001":null,
    closedAt:index===1?"2026-10-28T14:30:00Z":null
  };
}
function fixture({role="owner",stores=STORES,mutate=x=>x}={}) {
  const calls=[];
  const fetchImpl=async(url,options={})=>{
    const p=new URL(url);
    if(p.pathname==="/auth/v1/user")return response({id:USER});
    if(p.pathname==="/rest/v1/tenant_members")return response([{tenant_id:TENANT,role}]);
    if(p.pathname==="/rest/v1/stores"){
      calls.push({type:"stores"});
      assert.equal(p.searchParams.get("tenant_id"),"eq."+TENANT);
      assert.equal(p.searchParams.get("active"),"eq.true");
      assert.equal(p.searchParams.get("limit"),"26");
      return response(stores);
    }
    if(p.pathname==="/rest/v1/rpc/commerce_daily_dashboard"){
      const b=JSON.parse(options.body);
      calls.push({type:"rpc",id:b.p_store_id});
      assert.equal(options.method,"POST");
      assert.equal(options.headers.apikey,env.SUPABASE_PUBLISHABLE_KEY);
      assert.equal(options.headers.authorization,"Bearer fake-jwt");
      assert.equal(b.p_tenant_id,TENANT);
      assert.equal(b.p_business_date,DATE);
      assert.deepEqual(Object.keys(b).sort(),["p_business_date","p_store_id","p_tenant_id"]);
      const i=STORE_IDS.indexOf(b.p_store_id);
      assert.notEqual(i,-1);
      return response(mutate(daily(b.p_store_id,i),i));
    }
    throw Error("Unexpected upstream "+p.pathname);
  };
  return {env,fetchImpl,calls};
}
test("HQ authenticated overview aggregates exact cents, weighted AOV and separate first-party provenance",async()=>{
  assert.equal(typeof WORKFLOW_ROUTES["commerce-hq"],"function");
  const deps=fixture(),out=res();
  await handle(req(),out,deps);
  assert.equal(out.statusCode,200);
  const {overview:o}=result(out);
  assert.equal(o.source,"cafeos_pos");
  assert.equal(o.businessDate,DATE);
  assert.deepEqual([o.storeCount,o.closedStoreCount,o.orderCount,o.openOrderCount],[3,1,3,1]);
  assert.equal(o.salesTotal,"100000.45");
  assert.equal(o.paymentTotal,"100000.45");
  assert.equal(o.aov,"33333.48");
  assert.deepEqual(o.paymentMix,{card:"30000.20",cash:"70000.25"});
  assert.deepEqual(o.stores.map(x=>x.status),["open","closed","open"]);
  assert.equal(deps.calls.filter(x=>x.type==="rpc").length,3);
});
test("HQ denies cashier, analyst and viewer before Store reads; anonymous is denied",async()=>{
  for(const role of ["cashier","analyst","viewer"]){
    const deps=fixture({role}),out=res();
    await handle(req(),out,deps);
    assert.equal(out.statusCode,403);
    assert.equal(result(out).error.code,"COMMERCE_MANAGER_FORBIDDEN");
    assert.equal(deps.calls.length,0);
  }
  const deps=fixture(),out=res();
  await handle({...req(),headers:{}},out,deps);
  assert.equal(out.statusCode,401);
  assert.equal(deps.calls.length,0);
});
test("HQ requires an explicit valid date and GET-only access",async()=>{
  for(const date of [null,"2026-02-30","2026-10-28%20","bad-date"]){
    const deps=fixture(),out=res();
    await handle(req("GET",date),out,deps);
    assert.equal(out.statusCode,400);
    assert.equal(deps.calls.length,0);
  }
  const deps=fixture(),out=res();
  await handle(req("POST"),out,deps);
  assert.equal(out.statusCode,405);
  assert.equal(deps.calls.length,0);
});
test("HQ rejects forged tenant/store/date/financial data and never returns partial totals",async()=>{
  for(const modify of [
    x=>({...x,tenantId:STORE_IDS[2]}),
    x=>({...x,storeId:STORE_IDS[2]}),
    x=>({...x,businessDate:"2026-10-27"}),
    x=>({...x,paymentMix:{cash:"1.00"}}),
    x=>({...x,salesTotal:"70000.255"})
  ]){
    const deps=fixture({mutate:(x,i)=>i===0?modify(x):x}),out=res();
    await handle(req(),out,deps);
    assert.equal(out.statusCode,502);
    assert.equal(result(out).error.code,"SUPABASE_UPSTREAM");
    assert.equal(Object.hasOwn(result(out),"overview"),false);
  }
});
test("HQ detects duplicate, cross-tenant, inactive and 26th Store instead of undercounting",async()=>{
  const bad=[
    [...STORES,{...STORES[0]}],
    [{...STORES[0],tenant_id:STORE_IDS[2]}],
    [{...STORES[0],active:false}],
    Array.from({length:26},(_,i)=>({
      ...STORES[0],id:"11000000-0000-4000-8000-"+String(i+1).padStart(12,"0")
    }))
  ];
  for(const stores of bad){
    const deps=fixture({stores}),out=res();
    await handle(req(),out,deps);
    assert.equal(out.statusCode,502);
    assert.equal(deps.calls.filter(x=>x.type==="rpc").length,0);
  }
});
test("HQ zero-store result has no invented sales or AOV",async()=>{
  const deps=fixture({stores:[]}),out=res();
  await handle(req(),out,deps);
  assert.equal(out.statusCode,200);
  assert.deepEqual(result(out).overview,{
    source:"cafeos_pos",businessDate:DATE,
    storeCount:0,closedStoreCount:0,orderCount:0,openOrderCount:0,
    salesTotal:"0.00",paymentTotal:"0.00",aov:null,paymentMix:{},stores:[]
  });
});
