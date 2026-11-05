#!/bin/bash
# E2E for MANUAL INPUT of inventory (the "Input New Inventory" module):
#   1. auth gates: unauthenticated 401, unauthorized role 403
#   2. validation: missing code/description 400, negative stock/cost 400
#   3. happy path: field ops + admin hand-create a line; it lands on the shelf
#      with exact fields, correct computed status (In/Low/Out), junk ignored
#   4. duplicate stock code answers 409 (not the old raw-Prisma 500)
#   5. cleanup: the E2E lines are deleted again — the shelf is untouched
# Isolated e2e.*@livecheck.io accounts only (created by e2e_prep.cjs).
BASE="${BASE:-http://localhost:3001}"
PASS=0; FAIL=0; FAILED_NAMES=()

req() {
  local m="$1" path="$2" token="$3" data="$4"
  local args=(-s -X "$m" "$BASE$path" -o /tmp/e2e_inv_body -w '%{http_code}')
  [ -n "$token" ] && args+=(-H "Authorization: Bearer $token")
  [ -n "$data" ] && args+=(-H 'Content-Type: application/json' -d "$data")
  curl "${args[@]}" > /tmp/e2e_inv_status
}
body()   { cat /tmp/e2e_inv_body; }
status() { cat /tmp/e2e_inv_status; }
check() {
  local name="$1" expected="$2"; local st; st=$(status)
  if [ "$st" = "$expected" ]; then PASS=$((PASS+1)); echo "  ok   $name ($st)";
  else FAIL=$((FAIL+1)); FAILED_NAMES+=("$name"); echo "  FAIL $name (got $st want $expected)"; echo "       body: $(head -c 300 /tmp/e2e_inv_body)"; fi
}
login() { # email password -> LAST_TOKEN
  req POST /api/auth/login "" "{\"email\":\"$1\",\"password\":\"$2\"}"
  LAST_TOKEN="$(node -e "const d=JSON.parse(require('fs').readFileSync('/tmp/e2e_inv_body','utf8')); console.log(d.token ?? '')" 2>/dev/null)"
}
getid() { LAST_ID="$(node -e "const d=JSON.parse(require('fs').readFileSync('/tmp/e2e_inv_body','utf8')); console.log(d.id ?? '')" 2>/dev/null)"; }

echo "=== MANUAL INVENTORY INPUT ==="
login e2e.field@livecheck.io FleetOpsx2026!
FIELD="$LAST_TOKEN"
login e2e.admin@livecheck.io FleetOpsx2026!
ADMIN="$LAST_TOKEN"
login e2e.gate@livecheck.io FleetOpsx2026!
GATE="$LAST_TOKEN"
[ -n "$FIELD" ] && [ -n "$ADMIN" ] && [ -n "$GATE" ] && { PASS=$((PASS+1)); echo "  ok   e2e role logins"; } || { FAIL=$((FAIL+1)); FAILED_NAMES+=("e2e role logins (run e2e_prep.cjs first)"); }
STAMP=$(date +%s)
SKU1="E2E-MAN-$STAMP"
SKU2="E2E-MAN-LOW-$STAMP"
SKU3="E2E-MAN-ZERO-$STAMP"

echo "--- auth gates ---"
req POST /api/inventory "" "{\"sku\":\"$SKU1\",\"name\":\"Manual line\",\"category\":\"General\",\"stock\":10}"
check "unauthenticated manual create blocked (401)" 401
req POST /api/inventory "$GATE" "{\"sku\":\"$SKU1\",\"name\":\"Manual line\",\"category\":\"General\",\"stock\":10}"
check "Security role blocked from manual create (403)" 403

echo "--- validation ---"
req POST /api/inventory "$FIELD" "{\"name\":\"No code given\",\"category\":\"General\",\"stock\":3}"
check "missing stock code rejected (400)" 400
req POST /api/inventory "$FIELD" "{\"sku\":\"\",\"name\":\"X\",\"stock\":3}"
check "empty stock code rejected (400)" 400
req POST /api/inventory "$FIELD" "{\"sku\":\"$SKU1\",\"name\":\"\",\"stock\":3}"
check "empty description rejected (400)" 400
req POST /api/inventory "$FIELD" "{\"sku\":\"$SKU1\",\"name\":\"Neg\",\"stock\":-4}"
check "negative stock rejected (400)" 400
req POST /api/inventory "$ADMIN" "{\"sku\":\"$SKU1\",\"name\":\"Bad\",\"stock\":3,\"unitCost\":-9}"
check "negative unit cost rejected (400) [admin]" 400
req POST /api/inventory "$FIELD" "{\"sku\":\"$SKU1\",\"category\":\"General\",\"name\":\"Blind cost ignored\",\"stock\":3,\"unitCost\":-9}"
check "cost-blind role's negative cost ignored, line passes (200)" 200
req DELETE "/api/inventory/$(node -e "const d=JSON.parse(require('fs').readFileSync('/tmp/e2e_inv_body','utf8')); console.log(d.id??'')")" "$ADMIN" ""

echo "--- happy path ---"
req POST /api/inventory "$FIELD" "{\"sku\":\"$SKU1\",\"name\":\"E2E Manual Brake Pad\",\"category\":\"Brake\",\"stock\":12,\"unitCost\":4500.5,\"reorderLevel\":5,\"location\":\"Main Store\",\"injectedField\":\"NOT SAVED\"}"
check "field ops hand-creates a line (200)" 200
getid; ID1="$LAST_ID"
req GET /api/inventory "$FIELD" ""
FOUND=$(node -e "const d=JSON.parse(require('fs').readFileSync('/tmp/e2e_inv_body','utf8')); const i=d.find(x=>x.sku==='$SKU1'); if(!i){console.log('MISSING');process.exit(0)} const ok = i.name==='E2E Manual Brake Pad' && i.category==='Brake' && i.stock===12 && i.status==='In Stock' && i.location==='Main Store' && i.injectedField===undefined && i.unitCost===undefined; console.log(ok?'FIELDS_OK':'FIELDS_BAD: '+JSON.stringify(i))")
if [ "$FOUND" = "FIELDS_OK" ]; then PASS=$((PASS+1)); echo "  ok   line lands on shelf, exact fields, junk ignored, cost stripped";
else FAIL=$((FAIL+1)); FAILED_NAMES+=("manual line fields"); echo "       shelf readback: $FOUND"; fi
req GET /api/inventory "$ADMIN" ""
PRICED=$(node -e "const d=JSON.parse(require('fs').readFileSync('/tmp/e2e_inv_body','utf8')); const i=d.find(x=>x.sku==='$SKU1'); console.log(i&&i.unitCost===0?'ADMIN_SEES_ZERO':'UNEXPECTED: '+JSON.stringify(i&&i.unitCost))")
if [ "$PRICED" = "ADMIN_SEES_ZERO" ]; then PASS=$((PASS+1)); echo "  ok   admin view: line created by cost-blind desk carries 0 (its 4500.5 was ignored)";
else FAIL=$((FAIL+1)); FAILED_NAMES+=("admin cost on manual line"); echo "       $PRICED"; fi

req POST /api/inventory "$FIELD" "{\"sku\":\"$SKU1\",\"name\":\"Duplicate probe\",\"category\":\"General\",\"stock\":1}"
check "duplicate stock code answers 409 (not 500)" 409
req POST /api/inventory "$ADMIN" "{\"sku\":\"$SKU2\",\"name\":\"E2E Manual Low\",\"category\":\"Engine Oil\",\"stock\":3,\"reorderLevel\":5}"
check "admin creates low-stock line (200)" 200
getid; ID2="$LAST_ID"
req POST /api/inventory "$ADMIN" "{\"sku\":\"$SKU3\",\"name\":\"E2E Manual Zero\",\"category\":\"Battery\",\"stock\":0}"
check "admin creates out-of-stock line (200)" 200
getid; ID3="$LAST_ID"
req GET /api/inventory "$ADMIN" ""
STATS=$(node -e "const d=JSON.parse(require('fs').readFileSync('/tmp/e2e_inv_body','utf8')); const l=d.find(x=>x.sku==='$SKU2'), z=d.find(x=>x.sku==='$SKU3'); console.log((l&&l.status==='Low Stock'?'low-ok':'low-bad')+' '+(z&&z.status==='Out of Stock'?'zero-ok':'zero-bad'))")
if [ "$STATS" = "low-ok zero-ok" ]; then PASS=$((PASS+1)); echo "  ok   computed statuses: Low Stock + Out of Stock";
else FAIL=$((FAIL+1)); FAILED_NAMES+=("computed statuses"); echo "       statuses: $STATS"; fi

echo "--- cleanup ---"
req DELETE "/api/inventory/$ID1" "$FIELD" ""; check "cleanup delete manual line 1" 204
req DELETE "/api/inventory/$ID2" "$ADMIN" ""; check "cleanup delete manual line 2" 204
req DELETE "/api/inventory/$ID3" "$ADMIN" ""; check "cleanup delete manual line 3" 204
req GET /api/inventory "$FIELD" ""
GONE=$(node -e "const d=JSON.parse(require('fs').readFileSync('/tmp/e2e_inv_body','utf8')); console.log(d.some(x=>String(x.sku||'').startsWith('E2E-MAN-'))?'STILL THERE':'CLEAN')")
if [ "$GONE" = "CLEAN" ]; then PASS=$((PASS+1)); echo "  ok   shelf restored to pre-test state";
else FAIL=$((FAIL+1)); FAILED_NAMES+=("e2e shelf cleanup"); echo "       leftovers: $GONE"; fi

echo "=== COST VISIBILITY (TM ruling Nov 2026) ==="
login e2e.store@livecheck.io FleetOpsx2026!
STORE="$LAST_TOKEN"
if [ -n "$STORE" ]; then
  # A priced line only TM/Admin hands can read fully.
  req POST /api/inventory "$ADMIN" "{\"sku\":\"E2E-COST-$STAMP\",\"name\":\"E2E Cost Line\",\"category\":\"General\",\"stock\":50,\"unitCost\":500,\"reorderLevel\":5}"
  check "admin creates priced line (200)" 200
  getid; COST_ID="$LAST_ID"
  req GET /api/inventory "$STORE" ""
  STORE_VIEW=$(node -e "const d=JSON.parse(require('fs').readFileSync('/tmp/e2e_inv_body','utf8')); const i=d.find(x=>x.sku==='E2E-COST-$STAMP'); if(!i){console.log('MISSING');process.exit(0)} console.log(i.unitCost===undefined&&i.value===undefined?'COST_STRIPPED':'COST_LEAKS: '+JSON.stringify(i))")
  if [ "$STORE_VIEW" = "COST_STRIPPED" ]; then PASS=$((PASS+1)); echo "  ok   store GET carries no unitCost at all";
  else FAIL=$((FAIL+1)); FAILED_NAMES+=("store cost stripped on GET"); echo "       store view: $STORE_VIEW"; fi
  req GET /api/inventory "$ADMIN" ""
  ADMIN_VIEW=$(node -e "const d=JSON.parse(require('fs').readFileSync('/tmp/e2e_inv_body','utf8')); const i=d.find(x=>x.sku==='E2E-COST-$STAMP'); console.log(i&&i.unitCost===500?'COST_SEEN':'COST_GONE')")
  if [ "$ADMIN_VIEW" = "COST_SEEN" ]; then PASS=$((PASS+1)); echo "  ok   admin GET still carries the real 500 cost";
  else FAIL=$((FAIL+1)); FAILED_NAMES+=("admin cost visible"); echo "       admin view: $ADMIN_VIEW"; fi
  req POST /api/inventory "$STORE" "{\"sku\":\"E2E-COST-S-$STAMP\",\"name\":\"Store Adds Line\",\"category\":\"General\",\"stock\":7,\"unitCost\":9999}"
  check "store can still add a line (200)" 200
  getid; STORE_ID="$LAST_ID"
  req GET /api/inventory "$ADMIN" ""
  FORCED0=$(node -e "const d=JSON.parse(require('fs').readFileSync('/tmp/e2e_inv_body','utf8')); const i=d.find(x=>x.sku==='E2E-COST-S-$STAMP'); console.log(i&&Number(i.unitCost)===0?'COST_FORCED_0':'STORE_COST_KEPT: '+JSON.stringify(i))")
  if [ "$FORCED0" = "COST_FORCED_0" ]; then PASS=$((PASS+1)); echo "  ok   store-created line lands with cost 0 (9999 ignored)";
  else FAIL=$((FAIL+1)); FAILED_NAMES+=("store line cost forced 0"); echo "       $FORCED0"; fi
  req PATCH "/api/inventory/$STORE_ID" "$STORE" "{\"unitCost\":12345}"
  check "store PATCH of cost forbidden (403)" 403
  req PATCH "/api/inventory/$STORE_ID" "$ADMIN" "{\"unitCost\":12345}"
  check "admin prices the store line (200)" 200
  # Store restock books quantity without moving the money.
  req GET /api/inventory "$ADMIN" ""
  BEFORE=$(node -e "const d=JSON.parse(require('fs').readFileSync('/tmp/e2e_inv_body','utf8')); const i=d.find(x=>x.sku==='E2E-COST-S-$STAMP'); console.log(i.stock+'|'+i.unitCost)")
  req POST "/api/inventory/$STORE_ID/purchase" "$STORE" "{\"qty\":5,\"unitPrice\":88888}"
  check "store restock accepted without price (200)" 200
  req GET /api/inventory "$ADMIN" ""
  AFTER=$(node -e "const d=JSON.parse(require('fs').readFileSync('/tmp/e2e_inv_body','utf8')); const i=d.find(x=>x.sku==='E2E-COST-S-$STAMP'); console.log(i.stock+'|'+i.unitCost)")
  if [ "$BEFORE" != "$AFTER" ] && [ "$(echo "$AFTER" | cut -d'|' -f2).0" = "12345.0" ]; then PASS=$((PASS+1)); echo "  ok   restock +5 stock, unit cost untouched (88888 ignored)";
  else FAIL=$((FAIL+1)); FAILED_NAMES+=("store restock leaves money alone"); echo "       before=$BEFORE after=$AFTER"; fi
  # Movements: no money columns for the store.
  req GET "/api/inventory-movements?itemId=$STORE_ID" "$STORE" ""
  MOV=$(node -e "const d=JSON.parse(require('fs').readFileSync('/tmp/e2e_inv_body','utf8')); const m=d[0]; console.log(m&&(m.unitCost===undefined&&m.value===undefined)?'MONEY_STRIPPED':'MONEY_LEAKS: '+JSON.stringify(m))")
  if [ "$MOV" = "MONEY_STRIPPED" ]; then PASS=$((PASS+1)); echo "  ok   movements ledger money-stripped for store";
  else FAIL=$((FAIL+1)); FAILED_NAMES+=("movements money stripped"); echo "       $MOV"; fi
  req DELETE "/api/inventory/$COST_ID" "$ADMIN" ""; check "cleanup cost line" 204
  req DELETE "/api/inventory/$STORE_ID" "$ADMIN" ""; check "cleanup store line" 204
else
  FAIL=$((FAIL+1)); FAILED_NAMES+=("e2e.store account present (rerun e2e_prep.cjs)"); echo "  FAIL e2e.store login"
fi

echo "==============================="
echo "MANUAL-INVENTORY: PASS=$PASS FAIL=$FAIL"
if [ $FAIL -gt 0 ]; then printf 'FAILED: %s\n' "${FAILED_NAMES[@]}"; exit 1; fi
