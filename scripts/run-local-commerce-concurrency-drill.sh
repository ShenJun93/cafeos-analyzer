#!/usr/bin/env bash
# Real concurrent SQL sessions against the disposable Supabase CLI localhost DB.
# NEVER accepts a remote DB_URL, project ref, staging credentials or user input.
set -euo pipefail
umask 077
readonly DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
readonly TENANT="81000000-0000-4000-8000-000000000011"
readonly STORE="81100000-0000-4000-8000-000000000011"
readonly CATEGORY="81200000-0000-4000-8000-000000000011"
readonly ITEM="81300000-0000-4000-8000-000000000011"
readonly OWNER="81000000-0000-4000-8000-000000000101"
readonly CASHIER="81000000-0000-4000-8000-000000000102"
[[ "$DB_URL" == "postgresql://postgres:postgres@127.0.0.1:54322/postgres" ]]
command -v psql >/dev/null
command -v pg_isready >/dev/null
pg_isready -h 127.0.0.1 -p 54322 -U postgres -d postgres -q
[[ "$(psql "$DB_URL" -XAtqw -v ON_ERROR_STOP=1 -c "select current_database()||':'||current_user")" == "postgres:postgres" ]]
[[ "$(psql "$DB_URL" -XAtqw -v ON_ERROR_STOP=1 -c "select to_regprocedure('public.commerce_create_order(uuid,uuid,text,text,jsonb)') is not null")" == "t" ]]
export PGOPTIONS="-c statement_timeout=15000"

tmp="$(mktemp -d)"
fixtures=false
held_pid=""
cleanup() {
  if [[ -n "$held_pid" ]]; then
    kill "$held_pid" 2>/dev/null || true
    wait "$held_pid" 2>/dev/null || true
  fi
  if [[ "$fixtures" == true ]]; then
    psql "$DB_URL" -Xqw -v ON_ERROR_STOP=1 >/dev/null 2>&1 <<SQL || echo "WARNING: local fixture cleanup failed" >&2
begin;
delete from public.pos_payments where tenant_id='$TENANT';
delete from public.pos_order_items where tenant_id='$TENANT';
delete from public.daily_closes where tenant_id='$TENANT';
delete from public.pos_orders where tenant_id='$TENANT';
delete from public.menu_items where tenant_id='$TENANT';
delete from public.menu_categories where tenant_id='$TENANT';
delete from public.stores where tenant_id='$TENANT';
delete from public.tenant_members where tenant_id='$TENANT';
delete from public.tenants where id='$TENANT';
commit;
SQL
  fi
  rm -rf -- "$tmp"
}
trap cleanup EXIT

# Synthetic-only fixture, no migration, no remote connection and no real sales.
[[ "$(psql "$DB_URL" -XAtqw -v ON_ERROR_STOP=1 -c "select count(*) from public.tenants where id='$TENANT'")" == "0" ]]
fixtures=true
psql "$DB_URL" -Xqw -v ON_ERROR_STOP=1 <<SQL
begin;
insert into public.tenants(id,name) values ('$TENANT','Concurrency-only Commerce Fixture');
insert into public.tenant_members(tenant_id,user_id,role) values
 ('$TENANT','$OWNER','owner'),('$TENANT','$CASHIER','cashier');
insert into public.stores(id,tenant_id,source_namespace,external_key,name,timezone)
 values ('$STORE','$TENANT','synthetic','commerce-concurrency-only','Concurrency Store','Asia/Ho_Chi_Minh');
insert into public.menu_categories(id,tenant_id,name) values ('$CATEGORY','$TENANT','Race Coffee');
insert into public.menu_items(id,tenant_id,category_id,name,price)
 values ('$ITEM','$TENANT','$CATEGORY','Race Latte',35000);
commit;
SQL

query() {
  psql "$DB_URL" -XAtqw -v ON_ERROR_STOP=1 -c "$1"
}
readonly ITEMS="[{\"menuItemId\":\"$ITEM\",\"quantity\":1}]"
order_sql() {
  printf "public.commerce_create_order('%s','%s','%s','counter','%s'::jsonb) #>> '{order,id}'" \
    "$TENANT" "$STORE" "$1" "$ITEMS"
}
pay_sql() {
  printf "public.commerce_capture_payment('%s','%s','cash',35000,null) #>> '{status}'" \
    "$TENANT" "$1"
}
close_sql() {
  printf "public.commerce_close_day('%s','%s',null) #>> '{id}'" "$TENANT" "$STORE"
}

# Start and hold a committed-effect candidate inside a still-open transaction.
# The sentinel prints AFTER the RPC but BEFORE commit; the second connection
# therefore genuinely races on a live transactional lock, not a sequential retry.
start_held() {
  local name="$1" actor="$2" expression="$3"
  psql "$DB_URL" -XAtqw -v ON_ERROR_STOP=1 >"$tmp/$name.out" 2>"$tmp/$name.err" <<SQL &
begin;
set local role authenticated;
set local request.jwt.claim.sub = '$actor';
select $expression;
\echo CAFEOS_LOCK_HELD
select pg_sleep(4);
commit;
SQL
  held_pid=$!
  local n
  for ((n=0; n<100; n++)); do
    if grep -qx 'CAFEOS_LOCK_HELD' "$tmp/$name.out"; then
      kill -0 "$held_pid" 2>/dev/null || { echo "Held session exited too soon" >&2; exit 1; }
      return 0
    fi
    kill -0 "$held_pid" 2>/dev/null || {
      cat "$tmp/$name.err" >&2
      echo "Failed to acquire test lock in $name" >&2
      exit 1
    }
    sleep 0.1
  done
  echo "Timed out waiting for independent SQL session: $name" >&2
  exit 1
}
finish_held() {
  if ! wait "$held_pid"; then
    cat "$tmp/$1.err" >&2
    exit 1
  fi
  held_pid=""
}
run_ok() {
  local name="$1" actor="$2" expression="$3"
  psql "$DB_URL" -XAtqw -v ON_ERROR_STOP=1 >"$tmp/$name.out" 2>"$tmp/$name.err" <<SQL || {
begin;
set local role authenticated;
set local request.jwt.claim.sub = '$actor';
select $expression;
commit;
SQL
    cat "$tmp/$name.err" >&2
    echo "Concurrent success expected: $name" >&2
    exit 1
  }
}
run_reject() {
  local name="$1" actor="$2" expression="$3" expected="$4"
  if psql "$DB_URL" -XAtqw -v ON_ERROR_STOP=1 >"$tmp/$name.out" 2>"$tmp/$name.err" <<SQL
begin;
set local role authenticated;
set local request.jwt.claim.sub = '$actor';
select $expression;
commit;
SQL
  then
    echo "STOP: concurrent $name was wrongly accepted" >&2
    exit 1
  fi
  if ! grep -Fq "$expected" "$tmp/$name.err"; then
    cat "$tmp/$name.err" >&2
    echo "Wrong concurrent rejection for $name; expected $expected" >&2
    exit 1
  fi
}

# Race 1: two independent cashier sessions use the identical idempotency key.
start_held order_first "$CASHIER" "$(order_sql race-shared-key)"
run_ok order_second "$CASHIER" "$(order_sql race-shared-key)"
finish_held order_first
first_id="$(grep -E '^[0-9a-f]{8}-[0-9a-f-]{27,}$' "$tmp/order_first.out" | head -n 1)"
second_id="$(grep -E '^[0-9a-f]{8}-[0-9a-f-]{27,}$' "$tmp/order_second.out" | head -n 1)"
[[ -n "$first_id" && "$first_id" == "$second_id" ]]
[[ "$(query "select count(*) from public.pos_orders where tenant_id='$TENANT' and client_order_key='race-shared-key'")" == "1" ]]
echo "CAFEOS_RACE_SAME_KEY_SINGLE_ORDER_PASS"

# Race 2: first payment remains uncommitted while second cashier tries capture.
start_held payment_first "$CASHIER" "$(pay_sql "$first_id")"
run_reject payment_second "$CASHIER" "$(pay_sql "$first_id")" COMMERCE_ORDER_NOT_OPEN
finish_held payment_first
[[ "$(query "select count(*) from public.pos_payments where tenant_id='$TENANT' and order_id='$first_id' and status='captured'")" == "1" ]]
[[ "$(query "select status from public.pos_orders where id='$first_id'")" == "paid" ]]
echo "CAFEOS_RACE_DOUBLE_CAPTURE_DENIED_PASS"

# Race 3: order commits before a concurrent close. The close must see it open.
start_held order_before_close "$CASHIER" "$(order_sql race-open-before-close)"
run_reject close_after_order "$OWNER" "$(close_sql)" COMMERCE_CLOSE_OPEN_ORDERS
finish_held order_before_close
[[ "$(query "select count(*) from public.daily_closes where tenant_id='$TENANT'")" == "0" ]]
open_id="$(query "select id from public.pos_orders where tenant_id='$TENANT' and client_order_key='race-open-before-close'")"
run_ok settle_open "$CASHIER" "$(pay_sql "$open_id")"
echo "CAFEOS_RACE_OPEN_ORDER_BLOCKS_CLOSE_PASS"

# Race 4: close commits before a concurrent new order. Immutable close wins.
start_held close_first "$OWNER" "$(close_sql)"
run_reject order_after_close "$CASHIER" "$(order_sql race-after-close)" COMMERCE_DAY_CLOSED
finish_held close_first
[[ "$(query "select count(*) from public.pos_orders where tenant_id='$TENANT'")" == "2" ]]
[[ "$(query "select count(*) from public.pos_payments where tenant_id='$TENANT'")" == "2" ]]
[[ "$(query "select count(*) from public.daily_closes where tenant_id='$TENANT' and order_count=2 and sales_total=70000 and payment_total=70000")" == "1" ]]
echo "CAFEOS_RACE_CLOSE_BLOCKS_NEW_ORDER_PASS"
echo "CAFEOS_LOCAL_COMMERCE_CONCURRENCY_PASS: 4 cross-session invariants"
