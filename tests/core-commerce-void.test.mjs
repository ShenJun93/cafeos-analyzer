import test from "node:test";
import assert from "node:assert/strict";
import { handle } from "../server/commerce/void-order.mjs";
import { WORKFLOW_ROUTES } from "../api/app/workflow.mjs";

const TENANT = "10000000-0000-4000-8000-000000000001";
const STORE = "11000000-0000-4000-8000-000000000001";
const ORDER = "16000000-0000-4000-8000-000000000001";
const ACTOR = "a0000000-0000-4000-8000-000000000001";
const reason = "Nhập nhầm món";
const env = { SUPABASE_URL:"https://synthetic.supabase.invalid",
  SUPABASE_PUBLISHABLE_KEY:"sb_publishable_synthetic" };
const respond = (body,status=200) => new Response(JSON.stringify(body),{status});
const req = (body,method="POST") => ({url:"/api/app/commerce-void-order",method,
  headers:{authorization:"Bearer synthetic", "x-cafeos-tenant-id":TENANT},body});
const res = () => ({statusCode:0,body:"",setHeader(){},end(value){this.body=String(value);}});
const parsed = r => JSON.parse(r.body);
function fixture({role="manager", rpcPayload, rpcStatus=200}={}) {
  const calls=[];
  const fetchImpl=async (url, options={})=>{
    const u=new URL(url);
    if(u.pathname==="/auth/v1/user")return respond({id:ACTOR});
    if(u.pathname==="/rest/v1/tenant_members")return respond([{tenant_id:TENANT,role}]);
    if(u.pathname==="/rest/v1/rpc/commerce_void_order") {
      const body=JSON.parse(options.body);
      calls.push(body);
      assert.equal(options.method,"POST");
      assert.equal(options.headers.authorization,"Bearer synthetic");
      assert.deepEqual(Object.keys(body).sort(),["p_order_id","p_reason","p_tenant_id"]);
      return respond(rpcPayload ?? {
        orderId:ORDER,storeId:STORE,businessDate:"2026-10-28",
        status:"voided",reason,voidedByUserId:ACTOR,
        voidedAt:"2026-10-28T05:52:10Z",idempotent:false
      },rpcStatus);
    }
    throw Error("Unexpected upstream "+u.pathname);
  };
  return {env,fetchImpl,calls};
}
const good=()=>({orderId:ORDER,storeId:STORE,reason});
test("void order route and manager audit receipt are exact and no direct table writes",async()=>{
  assert.equal(typeof WORKFLOW_ROUTES["commerce-void-order"],"function");
  const deps=fixture(),out=res();
  await handle(req(good()),out,deps);
  assert.equal(out.statusCode,200);
  assert.equal(parsed(out).void.orderId,ORDER);
  assert.equal(parsed(out).void.voidedByUserId,ACTOR);
  assert.deepEqual(deps.calls,[{p_tenant_id:TENANT,p_order_id:ORDER,p_reason:reason}]);
});
test("void order disallows cashier, viewer, analyst and anonymous before RPC",async()=>{
  for(const role of ["cashier","viewer","analyst"]) {
    const deps=fixture({role}),out=res();
    await handle(req(good()),out,deps);
    assert.equal(out.statusCode,403);
    assert.equal(deps.calls.length,0);
  }
  const deps=fixture(),out=res();
  await handle({...req(good()),headers:{}},out,deps);
  assert.equal(out.statusCode,401);
  assert.equal(deps.calls.length,0);
});
test("void order rejects malformed IDs, reason coercion, extra fields and methods before RPC",async()=>{
  const bad=[
    { ...good(), reason:"a" },
    { ...good(), reason:["Nhập nhầm món"] },
    { ...good(), reason:true },
    { ...good(), reason:"x".repeat(241) },
    { ...good(), orderId:[ORDER] },
    { ...good(), storeId:[STORE] },
    { ...good(), total:1 }
  ];
  for(const body of bad) {
    const deps=fixture(),out=res();
    await handle(req(body),out,deps);
    assert.equal(out.statusCode,400);
    assert.equal(deps.calls.length,0);
  }
  const deps=fixture(),out=res();
  await handle(req(good(),"GET"),out,deps);
  assert.equal(out.statusCode,405);
  assert.equal(deps.calls.length,0);
});
test("void order refuses forged actor/Store/Order/date/reason/terminal status",async()=>{
  const reference={
    orderId:ORDER,storeId:STORE,businessDate:"2026-10-28",
    status:"voided",reason,voidedByUserId:ACTOR,voidedAt:"2026-10-28T05:52:10Z",
    idempotent:false
  };
  const bad=[
    {storeId:TENANT},
    {orderId:TENANT},
    {businessDate:"2026-02-30"},
    {reason:"Different"},
    {voidedByUserId:TENANT},
    {voidedAt:"2026-02-30T05:52:10Z"},
    {status:"paid"},
    {idempotent:"true"}
  ];
  for(const delta of bad){
    const deps=fixture({rpcPayload:{...reference,...delta}}),out=res();
    await handle(req(good()),out,deps);
    assert.equal(out.statusCode,502);
    assert.equal(parsed(out).error.code,"SUPABASE_UPSTREAM");
  }
});
test("void order resolves same actor exact retry and reports conflicts without extra writes",async()=>{
  const deps=fixture({rpcPayload:{
    orderId:ORDER,storeId:STORE,businessDate:"2026-10-28",
    status:"voided",reason,voidedByUserId:ACTOR,
    voidedAt:"2026-10-28T05:52:10Z",idempotent:true
  }});
  const r=res();
  await handle(req(good()),r,deps);
  assert.equal(r.statusCode,200);
  assert.equal(parsed(r).void.idempotent,true);
  for(const code of ["COMMERCE_VOID_CONFLICT","COMMERCE_ORDER_HAS_PAYMENT","COMMERCE_ORDER_NOT_OPEN"]) {
    const conflict=fixture({rpcPayload:{message:code},rpcStatus:400});
    const out=res();
    await handle(req(good()),out,conflict);
    assert.equal(out.statusCode,409);
    assert.equal(parsed(out).error.code,code);
  }
});
