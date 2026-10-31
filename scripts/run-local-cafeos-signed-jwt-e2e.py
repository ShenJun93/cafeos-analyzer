#!/usr/bin/env python3
"""Synthetic-only, GoTrue-issued JWT and tenant-role E2E; no staging connections."""
import base64, io, json, os, re, secrets, subprocess, tarfile, time, urllib.error, urllib.parse, urllib.request, uuid

# Two explicit trust boundaries: the owner-owned disposable Compose test stack,
# or an independently provisioned, migration-applied GitHub Actions localhost
# Supabase stack. Never accept remote hostnames or a staging project reference.
if os.environ.get('CAFEOS_E2E_MODE') == 'CI_LOCAL':
    assert os.environ.get('GITHUB_ACTIONS') == 'true', 'CI_LOCAL_REQUIRES_GITHUB_ACTIONS'
    DB=os.environ['CAFEOS_E2E_DB']
    KONG=os.environ['CAFEOS_E2E_KONG']
    assert re.fullmatch(r'supabase_db_[a-zA-Z0-9_-]+',DB), 'CI_LOCAL_DB_NOT_SUPABASE'
    assert re.fullmatch(r'supabase_kong_[a-zA-Z0-9_-]+',KONG), 'CI_LOCAL_KONG_NOT_SUPABASE'
    assert DB.removeprefix('supabase_db_') == KONG.removeprefix('supabase_kong_'), 'CI_LOCAL_PROJECT_MISMATCH'
    BASE='http://127.0.0.1:54321'
else:
    assert os.environ.get('CAFEOS_E2E_MODE') in (None,''), 'UNSUPPORTED_E2E_MODE'
    DB='supabase_db_cafeos-e2e-isolated-20261030'
    KONG='supabase_kong_cafeos-e2e-isolated-20261030'
    BASE='http://127.0.0.1:55321'
case=uuid.uuid4().hex[:12]
ids={k:str(uuid.uuid4()) for k in ('tenant_a','tenant_b','store_a','store_b','category_a','category_b','item_a','item_b')}
actors={}
seeded=False
checks=0

def pg(q):
    p=subprocess.run(['docker','exec','-i','-u','postgres',DB,'psql','-XqAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],input=q,text=True,capture_output=True)
    if p.returncode: raise RuntimeError('DISPOSABLE_PG_SQL_FAILED:'+str(p.returncode)+':'+p.stderr[-500:])
    return p.stdout.strip()

def assert_check(cond,label):
    global checks
    if not cond: raise AssertionError(label)
    checks+=1
    print('PASS',label)

def load_anon():
    r=subprocess.run(['docker','cp',KONG+':/home/kong/kong.yml','-'],capture_output=True,check=True)
    with tarfile.open(fileobj=io.BytesIO(r.stdout)) as t:
        raw=t.extractfile(t.getmembers()[0]).read().decode()
    # Only use the public anon JWT; never use the service_role token.
    tokens=re.findall(r'eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+',raw)
    candidates=[]
    for key in set(tokens):
        claims=json.loads(base64.urlsafe_b64decode(key.split('.')[1]+'=='))
        if claims.get('role')=='anon': candidates.append(key)
    assert len(candidates)==1,'AUTH_GATEWAY_ANON_JWT_UNEXPECTED'
    return candidates[0]

anon=load_anon()

def api(method,path,token=None,body=None):
    payload=None if body is None else json.dumps(body,separators=(',',':')).encode()
    head={'Content-Type':'application/json','apikey':anon,'Authorization':'Bearer '+(token or anon)}
    req=urllib.request.Request(BASE+path,data=payload,headers=head,method=method)
    try:
        with urllib.request.urlopen(req,timeout=8) as resp:
            status=resp.status; data=resp.read(16384)
    except urllib.error.HTTPError as exc:
        status=exc.code; data=exc.read(4096)
    try:return status,json.loads(data) if data else None
    except ValueError:return status,None

SNAPSHOT_TABLES=('auth.users','auth.identities','auth.sessions','auth.refresh_tokens',
                 'public.tenants','public.tenant_members','public.stores',
                 'public.menu_categories','public.menu_items','public.pos_orders',
                 'public.pos_order_items','public.pos_payments','public.daily_closes')
ZERO_SNAPSHOT=','.join('0' for _ in SNAPSHOT_TABLES)
def count_snapshot():
    expr="||','||".join('(SELECT count(*) FROM '+t+')::text' for t in SNAPSHOT_TABLES)
    return pg('BEGIN READ ONLY; SELECT '+expr+'; COMMIT;')

assert_check(count_snapshot()==ZERO_SNAPSHOT,'PREEXISTING_STACK_EXACT_BLANK_AUTH_TENANTS_POS')
try:
    for role in ('owner_a','owner_b','cashier_a','viewer_a'):
        email='cafeos-e2e-'+case+'-'+role+'@example.invalid'
        status,res=api('POST','/auth/v1/signup',body={'email':email,'password':secrets.token_urlsafe(26)})
        assert_check(status==200 and bool(res.get('access_token')) and bool(res.get('user',{}).get('id')),'GOTRUE_SIGNUP_'+role)
        token=res['access_token']
        parts=token.split('.')
        assert len(parts)==3,'INVALID_SIGNED_JWT_SHAPE'
        claims=json.loads(base64.urlsafe_b64decode(parts[1]+'=='))
        assert_check(claims.get('sub')==res['user']['id'] and claims.get('role')=='authenticated' and claims.get('exp',0)>time.time(),'GOTRUE_AUTHENTICATED_JWT_'+role)
        actors[role]={'id':res['user']['id'],'token':token}
        authstatus,account=api('GET','/auth/v1/user',token)
        assert_check(authstatus==200 and account.get('id')==res['user']['id'],'SIGNED_AUTH_USER_'+role)

    a,b=ids['tenant_a'],ids['tenant_b']
    # Every literal below is a fresh generated UUID, test string, or the issued
    # GoTrue user UUID, never a staging identity or imported merchant row.
    sql="BEGIN;\n"
    sql+=f"INSERT INTO public.tenants(id,name) VALUES ('{a}','CafeOS synthetic A {case}'),('{b}','CafeOS synthetic B {case}');\n"
    sql+="INSERT INTO public.tenant_members(tenant_id,user_id,role) VALUES\n"+",\n".join(
        f"('{a if role!='owner_b' else b}','{actors[role]['id']}','{role.split('_')[0]}')"
        for role in actors
    )+";\n"
    sql+=f"INSERT INTO public.stores(id,tenant_id,source_namespace,external_key,name,timezone) VALUES ('{ids['store_a']}','{a}','synthetic-e2e','store-a-{case}','Synthetic A','Asia/Ho_Chi_Minh'),('{ids['store_b']}','{b}','synthetic-e2e','store-b-{case}','Synthetic B','Asia/Ho_Chi_Minh');\n"
    sql+=f"INSERT INTO public.menu_categories(id,tenant_id,name) VALUES ('{ids['category_a']}','{a}','Synthetic A {case}'),('{ids['category_b']}','{b}','Synthetic B {case}');\n"
    sql+=f"INSERT INTO public.menu_items(id,tenant_id,category_id,name,price) VALUES ('{ids['item_a']}','{a}','{ids['category_a']}','Synthetic Coffee A',35000),('{ids['item_b']}','{b}','{ids['category_b']}','Synthetic Tea B',20000);\nCOMMIT;"
    pg(sql);seeded=True
    assert_check(count_snapshot().split(',')[4]=='2','SYNTHETIC_TENANTS_SEEDED')

    for role,visible in [('owner_a',a),('owner_b',b),('cashier_a',a),('viewer_a',a)]:
        status,rows=api('GET','/rest/v1/tenants?select=id',actors[role]['token'])
        assert_check(status==200 and isinstance(rows,list) and {r.get('id') for r in rows}=={visible},'RLS_TENANT_VISIBILITY_'+role)
        status,rows=api('GET','/rest/v1/stores?select=id,tenant_id',actors[role]['token'])
        assert_check(status==200 and isinstance(rows,list) and {r.get('tenant_id') for r in rows}=={visible},'RLS_STORE_VISIBILITY_'+role)

    menu_write={'tenant_id':a,'category_id':ids['category_a'],'name':'Owned JWT Menu '+case,'price':12345}
    for role in ('viewer_a','cashier_a'):
        status,_=api('POST','/rest/v1/menu_items',actors[role]['token'],menu_write)
        assert_check(status in (401,403),'MENU_MANAGER_WRITE_DENIED_'+role)
    status,_=api('POST','/rest/v1/menu_items',actors['owner_a']['token'],menu_write)
    assert_check(status==201,'MENU_MANAGER_WRITE_AUTHORIZED_OWNER')
    cross_write={**menu_write,'tenant_id':b,'category_id':ids['category_b']}
    status,_=api('POST','/rest/v1/menu_items',actors['owner_a']['token'],cross_write)
    assert_check(status in (401,403),'MENU_CROSS_TENANT_WRITE_DENIED')

    order={'p_tenant_id':a,'p_store_id':ids['store_a'],'p_client_order_key':'jwt-'+case,'p_channel':'counter','p_items':[{'menuItemId':ids['item_a'],'quantity':2}]}
    for role in ('viewer_a','owner_b'):
        status,_=api('POST','/rest/v1/rpc/commerce_create_order',actors[role]['token'],order)
        assert_check(status in (401,403),'POS_CREATE_ROLE_TENANT_DENIED_'+role)
    status,created=api('POST','/rest/v1/rpc/commerce_create_order',actors['cashier_a']['token'],order)
    assert_check(status==200 and created.get('order',{}).get('total')==70000,'SIGNED_CASHIER_CREATE_ORDER_EXACT_CENTS')
    order_id=created['order']['id']
    status,again=api('POST','/rest/v1/rpc/commerce_create_order',actors['cashier_a']['token'],order)
    assert_check(status==200 and again.get('order',{}).get('id')==order_id,'SIGNED_ORDER_IDEMPOTENT_RETRY')

    payment={'p_tenant_id':a,'p_order_id':order_id,'p_method':'cash','p_amount':70000,'p_reference':None}
    status,paid=api('POST','/rest/v1/rpc/commerce_capture_payment',actors['cashier_a']['token'],payment)
    assert_check(status==200 and paid.get('status')=='paid' and paid.get('payment',{}).get('amount')==70000,'SIGNED_CASHIER_CAPTURE_PAYMENT')

    close={'p_tenant_id':a,'p_store_id':ids['store_a'],'p_business_date':None}
    status,_=api('POST','/rest/v1/rpc/commerce_close_day',actors['cashier_a']['token'],close)
    assert_check(status in (401,403),'SIGNED_CASHIER_CLOSE_DENIED')
    status,closed=api('POST','/rest/v1/rpc/commerce_close_day',actors['owner_a']['token'],close)
    assert_check(status==200 and closed.get('orderCount')==1 and closed.get('paymentTotal')==70000,'SIGNED_OWNER_CLOSE_EXACT_TOTALS')

    status,rows=api('GET',f'/rest/v1/pos_orders?select=id,tenant_id,total&tenant_id=eq.{a}',actors['owner_b']['token'])
    assert_check(status==200 and rows==[],'SIGNED_CROSS_TENANT_ORDER_READ_DENIED')
    status,rows=api('GET',f'/rest/v1/pos_orders?select=id,tenant_id,total&tenant_id=eq.{a}',actors['viewer_a']['token'])
    assert_check(status==200 and len(rows)==1 and rows[0]['id']==order_id,'SIGNED_VIEWER_OWN_TENANT_READ_ALLOWED')

    pg(f"DELETE FROM public.tenant_members WHERE tenant_id='{a}' AND user_id='{actors['viewer_a']['id']}';")
    status,rows=api('GET',f'/rest/v1/pos_orders?select=id&tenant_id=eq.{a}',actors['viewer_a']['token'])
    assert_check(status==200 and rows==[],'SIGNED_REVOKED_VIEWER_JWT_NO_RLS_ACCESS')
    print('RESULT_SIGNED_JWT_LOCAL_E2E_PASS','ASSERTIONS='+str(checks))
finally:
    # Cleanup is constrained to the generated tenant ids + generated emails only.
    a,b=ids['tenant_a'],ids['tenant_b']
    scope=f"('{a}','{b}')"
    try:
        pg("BEGIN;\n"+"\n".join("DELETE FROM public."+t+" WHERE tenant_id IN "+scope+";" for t in ('pos_payments','daily_closes','pos_order_items','pos_orders','menu_items','menu_categories','stores','tenant_members'))+
          "\nDELETE FROM public.tenants WHERE id IN "+scope+";\nCOMMIT;")
        print('SYNTHETIC_COMMERCE_FIXTURE_CLEANUP_PASS')
    finally:
        for role in ('owner_a','owner_b','cashier_a','viewer_a'):
            email='cafeos-e2e-'+case+'-'+role+'@example.invalid'
            pg("DELETE FROM auth.users WHERE email='"+email+"';")
        after=count_snapshot()
        print('POST_CLEANUP_COUNTS='+after)
        if after!=ZERO_SNAPSHOT: raise RuntimeError('SYNTHETIC_FIXTURE_RESIDUE')
