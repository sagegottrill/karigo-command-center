#!/bin/bash
# Full E2E over the live API using ONLY isolated e2e.*@livecheck.io accounts.
# Real accounts, real passwords and real data are never touched.
BASE="${BASE:-http://localhost:3001}"
PASS=0; FAIL=0; FAILED_NAMES=()

req() {
  local m="$1" path="$2" token="$3" data="$4"
  local args=(-s -X "$m" "$BASE$path" -o /tmp/last_body -w '%{http_code}')
  [ -n "$token" ] && args+=(-H "Authorization: Bearer $token")
  [ -n "$data" ] && args+=(-H 'Content-Type: application/json' -d "$data")
  curl "${args[@]}" > /tmp/last_status
}
body() { cat /tmp/last_body; }
status() { cat /tmp/last_status; }
jqget() { node -e "const d=JSON.parse(require('fs').readFileSync('/tmp/last_body','utf8')); console.log(eval('(d)' + process.argv[1]) ?? '')" "$1" 2>/dev/null; }

check() {
  local name="$1" expected="$2"; local st; st=$(status)
  if [ "$st" = "$expected" ]; then PASS=$((PASS+1)); echo "  ok   $name ($st)";
  else FAIL=$((FAIL+1)); FAILED_NAMES+=("$name"); echo "  FAIL $name (got $st want $expected)"; echo "       body: $(head -c 300 /tmp/last_body)"; fi
}

login() { # email password -> sets LAST_TOKEN
  req POST /api/auth/login "" "{\"email\":\"$1\",\"password\":\"$2\"}"
  LAST_TOKEN="$(jqget .token)"
}

echo "=== 1. AUTH: login every role (isolated E2E accounts) ==="
declare -A TOKENS
for who in admin tm fo gate tracking hr accounts partner; do
  login "e2e.$who@livecheck.io" 'FleetOpsx2026!'
  check "login e2e.$who ($(jqget .user.role))" 200
  TOKENS[$who]="$LAST_TOKEN"
done

echo "=== 2. AUTH: negative cases ==="
req POST /api/auth/login "" '{"email":"e2e.tm@livecheck.io","password":"wrong"}'
check "bad password rejected (401)" 401
req POST /api/auth/login "" '{"email":"ghost@nowhere.io","password":"x"}'
check "unknown user rejected (401)" 401
req GET /api/trips "" ""
check "unauthenticated /api/trips blocked (401)" 401
req GET /api/users "${TOKENS[partner]}" ""
check "partner cannot list users (403)" 403

echo "=== 3. FLEET MASTERS ==="
# The suite runs on the DEDICATED E2E assets created by e2e_prep.cjs — it never
# borrows a real truck, tail or driver, because the gate cycle flips whatever it
# touches to Out of Yard / On Trip (a real head was once stranded on the yard
# board for two days this way). Cleanup restores/deletes these by name.
req GET /api/trucks "${TOKENS[fo]}" ""; check "list trucks (FO)" 200
TRUCK_REG=$(node -e "const d=JSON.parse(require('fs').readFileSync('/tmp/last_body','utf8')); const t=d.find(x=>x.cabId==='E2E-CAP-001'); console.log(t?t.registration:'')")
req GET /api/tails "${TOKENS[fo]}" ""; check "list tails (FO)" 200
TAIL_NO=$(node -e "const d=JSON.parse(require('fs').readFileSync('/tmp/last_body','utf8')); const t=d.find(x=>x.number==='E2E-TAIL-001'); console.log(t?t.number:'')")
TAIL_ID=$(node -e "const d=JSON.parse(require('fs').readFileSync('/tmp/last_body','utf8')); const t=d.find(x=>x.number==='E2E-TAIL-001'); console.log(t?t.id:'')")
req GET /api/drivers "${TOKENS[fo]}" ""; check "list drivers (FO)" 200
DRV_NAME=$(node -e "const d=JSON.parse(require('fs').readFileSync('/tmp/last_body','utf8')); const x=d.find(x=>x.staffId==='E2E-DRV-001'); console.log(x?x.name:'')")
echo "  masters: trucks=$(jqget '.length') tails=$(jqget '.length') drivers=$(jqget '.length')"
echo "  using E2E truck=$TRUCK_REG tail=$TAIL_NO driver=$DRV_NAME"
[ -n "$TRUCK_REG" ] && [ -n "$TAIL_ID" ] && [ -n "$TAIL_NO" ] && [ -n "$DRV_NAME" ] && { PASS=$((PASS+1)); echo "  ok   E2E fleet masters present"; } || { FAIL=$((FAIL+1)); FAILED_NAMES+=("E2E fleet masters present (prep.cjs creates them)"); }

echo "=== 4. LIFECYCLE: request -> TM approve -> FO assign -> TM schedule -> gate -> tracking -> complete ==="
STAMP=$(date +%s)
CONSIGNEE="LIVECHECK Consignee $STAMP"

req POST /api/trips "${TOKENS[partner]}" "{\"driverName\":\"Unassigned\",\"truckReg\":\"Unassigned\",\"pickup\":\"Saba Steel Ikeja\",\"dropoff\":\"Abuja Central Depot\",\"customerConsignee\":\"$CONSIGNEE\",\"cargo\":\"Steel Coils\",\"tailType\":\"Flatbed\",\"loadingSite\":\"Saba Factory\",\"status\":\"Requested\"}"
check "partner creates request" 200
TRIP_ID="$(jqget .id)"

req GET "/api/trips/$TRIP_ID" "${TOKENS[partner]}" ""
check "partner reads own trip" 200
req GET "/api/trips/$TRIP_ID" "${TOKENS[hr]}" ""
check "non-authorized role blocked from PATCH context (info)" 200

req PATCH "/api/trips/$TRIP_ID" "${TOKENS[tm]}" '{"status":"Approved"}'
check "TM approves (Approved)" 200
req PATCH "/api/trips/$TRIP_ID" "${TOKENS[fo]}" "{\"driverName\":\"$DRV_NAME\",\"truckReg\":\"$TRUCK_REG\",\"tailType\":\"Flatbed\",\"tailNumber\":\"$TAIL_NO\",\"status\":\"Awaiting Approval\",\"directCosts\":{\"diesel\":250000,\"gas\":180000,\"route\":95000}}"
check "FO assigns truck+tail+driver (Awaiting Approval)" 200
req PATCH "/api/trips/$TRIP_ID" "${TOKENS[tm]}" '{"status":"Scheduled"}'
check "TM schedules (Scheduled)" 200
# Departure names the E2E plate AND the E2E driver — both match the trip, so the
# server-side cycle (trip -> En Route, assets Out of Yard, driver On Trip)
# demonstrably keys on THIS dispatch.
req POST "/api/gate" "${TOKENS[gate]}" "{\"type\":\"Departure\",\"truckReg\":\"$TRUCK_REG\",\"driver\":\"$DRV_NAME\",\"purpose\":\"Delivery to LIVECHECK consignee\"}"
check "gate logs departure" 200
sleep 2
req GET "/api/trips/$TRIP_ID" "${TOKENS[tm]}" ""
TRIP_STATUS_AFTER_DEP="$(jqget .status)"
if [ "$TRIP_STATUS_AFTER_DEP" = "En Route" ]; then PASS=$((PASS+1)); echo "  ok   gate departure moved trip to En Route";
else FAIL=$((FAIL+1)); FAILED_NAMES+=("gate departure moves trip to En Route"); echo "       trip status after departure: $TRIP_STATUS_AFTER_DEP"; fi
req GET /api/trucks "${TOKENS[fo]}" ""
TRUCK_AFTER_DEP=$(node -e "const d=JSON.parse(require('fs').readFileSync('/tmp/last_body','utf8')); const t=d.find(x=>x.cabId==='E2E-CAP-001'); console.log(t?t.status:'')")
if [ "$TRUCK_AFTER_DEP" = "Out of Yard" ]; then PASS=$((PASS+1)); echo "  ok   gate departure sent E2E truck Out of Yard";
else FAIL=$((FAIL+1)); FAILED_NAMES+=("gate departure sends truck Out of Yard"); echo "       E2E truck status after departure: $TRUCK_AFTER_DEP"; fi
req GET /api/drivers "${TOKENS[fo]}" ""
DRV_AFTER_DEP=$(node -e "const d=JSON.parse(require('fs').readFileSync('/tmp/last_body','utf8')); const x=d.find(x=>x.staffId==='E2E-DRV-001'); console.log(x?x.status:'')")
if [ "$DRV_AFTER_DEP" = "On Trip" ]; then PASS=$((PASS+1)); echo "  ok   gate departure marked E2E driver On Trip";
else FAIL=$((FAIL+1)); FAILED_NAMES+=("gate departure marks driver On Trip"); echo "       E2E driver status after departure: $DRV_AFTER_DEP"; fi
req POST "/api/tracking" "${TOKENS[tracking]}" "{\"tripId\":\"$TRIP_ID\",\"location\":\"Ikeja Toll Gate\",\"leg\":\"Outbound\"}"
check "tracking logs checkpoint" 200
req GET "/api/tracking/$TRIP_ID" "${TOKENS[tracking]}" ""
check "tracking lists checkpoints ($(jqget '.length'))" 200
# NOTE: no FO "In Transit" PATCH here — "In Transit" is the UI bucket over the
# moving statuses, not a stored one; the stored word after departure is En Route,
# which is exactly what the gate's return cycle scans for. Writing 'In Transit'
# (as this suite once did) knocked the trip OUT of the return's open list.
req POST "/api/gate" "${TOKENS[gate]}" "{\"type\":\"Return\",\"truckReg\":\"$TRUCK_REG\",\"driver\":\"$DRV_NAME\",\"purpose\":\"Return to yard after LIVECHECK\"}"
check "gate logs return" 200
sleep 2
# The return stamp closes the dispatch server-side (Completed) and sends the E2E
# truck+tail to Check Up — assert the whole server cycle, not just the 200s.
req GET "/api/trips/$TRIP_ID" "${TOKENS[tm]}" ""
TRIP_STATUS_AFTER_RET="$(jqget .status)"
if [ "$TRIP_STATUS_AFTER_RET" = "Completed" ]; then PASS=$((PASS+1)); echo "  ok   gate return closed the trip (Completed)";
else FAIL=$((FAIL+1)); FAILED_NAMES+=("gate return closes the trip"); echo "       trip status after return: $TRIP_STATUS_AFTER_RET"; fi
req GET /api/trucks "${TOKENS[fo]}" ""
TRUCK_AFTER_RET=$(node -e "const d=JSON.parse(require('fs').readFileSync('/tmp/last_body','utf8')); const t=d.find(x=>x.cabId==='E2E-CAP-001'); console.log(t?t.status:'')")
if [ "$TRUCK_AFTER_RET" = "Check Up" ]; then PASS=$((PASS+1)); echo "  ok   gate return sent E2E truck to Check Up";
else FAIL=$((FAIL+1)); FAILED_NAMES+=("gate return sends truck to Check Up"); echo "       E2E truck status after return: $TRUCK_AFTER_RET"; fi
req GET /api/drivers "${TOKENS[fo]}" ""
DRV_AFTER_RET=$(node -e "const d=JSON.parse(require('fs').readFileSync('/tmp/last_body','utf8')); const x=d.find(x=>x.staffId==='E2E-DRV-001'); console.log(x?x.status:'')")
if [ "$DRV_AFTER_RET" = "Active" ]; then PASS=$((PASS+1)); echo "  ok   gate return freed the E2E driver (Active)";
else FAIL=$((FAIL+1)); FAILED_NAMES+=("gate return frees the driver"); echo "       E2E driver status after return: $DRV_AFTER_RET"; fi
req GET "/api/trips/$TRIP_ID" "${TOKENS[partner]}" ""
check "partner reads completed trip" 200
echo "  final status: $(jqget .status)"

echo "=== 5. TM decline path ==="
req POST /api/trips "${TOKENS[partner]}" "{\"pickup\":\"Custom Yard 12\",\"dropoff\":\"Ikeja\",\"customerConsignee\":\"LIVECHECK Decline $STAMP\",\"cargo\":\"Declined Goods\",\"tailType\":\"Flatbed\",\"status\":\"Requested\"}"
TRIP2_ID="$(jqget .id)"
req PATCH "/api/trips/$TRIP2_ID" "${TOKENS[tm]}" '{"status":"Stopped"}'
check "TM declines request (Stopped)" 200

echo "=== 6. USER MANAGEMENT (TM role, UI payload shape) ==="
STAMP6=$STAMP
req POST /api/users "${TOKENS[tm]}" "{\"firstName\":\"Live\",\"surname\":\"Check\",\"username\":\"livecheck$STAMP\",\"companyId\":\"tnt_001\",\"role\":\"Fleet Operations\",\"phone\":\"08030000001\",\"password\":\"TestUser@2026\"}"
check "TM creates user (UI payload)" 200
NEW_UID="$(jqget .id)"
UEMAIL="$(jqget .email)"
echo "  created: $UEMAIL"
req POST /api/users "${TOKENS[tm]}" "{\"firstName\":\"Live\",\"surname\":\"Check\",\"username\":\"livecheck$STAMP\",\"companyId\":\"tnt_001\",\"role\":\"Fleet Operations\"}"
check "duplicate username rejected (409)" 409
req PATCH "/api/users/$NEW_UID" "${TOKENS[tm]}" '{"role":"Tracking","phone":"08030000002","bogusUiField":"should-not-500"}'
check "patch ignores unknown UI fields (no 500)" 200
req PATCH "/api/users/$NEW_UID" "${TOKENS[tm]}" '{"status":"Suspended"}'
check "suspend user" 200
req POST /api/auth/login "" "{\"email\":\"$UEMAIL\",\"password\":\"TestUser@2026\"}"
check "suspended user cannot login (401)" 401
req PATCH "/api/users/$NEW_UID" "${TOKENS[tm]}" '{"status":"Active"}'
check "reactivate user" 200
req POST /api/auth/login "" "{\"email\":\"$UEMAIL\",\"password\":\"TestUser@2026\"}"
check "reactivated user can login (200)" 200
req DELETE "/api/users/$NEW_UID" "${TOKENS[admin]}" ""
check "admin deletes user (204)" 204
req POST /api/auth/login "" "{\"email\":\"$UEMAIL\",\"password\":\"TestUser@2026\"}"
check "deleted user cannot login (401)" 401

echo "=== 7. PASSWORD RESET flow (on E2E TM account) ==="
req GET /api/users "${TOKENS[hr]}" ""
E2E_TM_UID=$(node -e "const d=JSON.parse(require('fs').readFileSync('/tmp/last_body','utf8')); const u=d.find(u=>u.email==='e2e.tm@livecheck.io'); console.log(u?u.id:'')")
req PATCH "/api/users/$E2E_TM_UID" "${TOKENS[hr]}" '{"resetPassword":true}'
check "HR resets E2E TM password (200)" 200
RESET_PWD="$(jqget .tempPassword)"
[ -n "$RESET_PWD" ] && [ "$RESET_PWD" != "undefined" ] && { PASS=$((PASS+1)); echo "  ok   reset returns temp password"; } || { FAIL=$((FAIL+1)); FAILED_NAMES+=("reset returns temp password"); echo "       body: $(head -c 200 /tmp/last_body)"; }

echo "=== 8. RBAC spot checks ==="
req POST /api/tails "${TOKENS[gate]}" '{"number":"B999X"}'
check "gate cannot create tails (403)" 403
req POST /api/tails "${TOKENS[fo]}" "{\"number\":\"LIVEB$STAMP\",\"type\":\"Flatbed\"}"
check "FO can create tail" 200
TAIL_TMP_ID="$(jqget .id)"
req DELETE "/api/tails/$TAIL_TMP_ID" "${TOKENS[tm]}" ""
check "TM deletes test tail (204)" 204
req GET /api/users "${TOKENS[hr]}" ""
check "HR can list users" 200
req POST /api/users "${TOKENS[fo]}" '{"firstName":"X","surname":"Y","username":"nope","companyId":"tnt_001"}'
check "FO cannot create users (403)" 403

echo "=== 9. MODULE smoke (reads only) ==="
req GET /api/inventory "${TOKENS[accounts]}" ""; check "inventory list" 200
req GET /api/tenants "${TOKENS[admin]}" ""; check "tenants list" 200
req GET /api/gate "${TOKENS[gate]}" ""; check "gate entries list" 200
req GET /api/trips "${TOKENS[tm]}" ""; check "trips list (TM)" 200

echo ""
echo "=========================================="
echo "PASS: $PASS   FAIL: $FAIL"
if [ $FAIL -gt 0 ]; then printf 'Failed: %s\n' "${FAILED_NAMES[@]}"; fi
echo "=========================================="
echo "$TRIP_ID $TRIP2_ID" > /tmp/e2e_artifacts.txt
exit $FAIL
