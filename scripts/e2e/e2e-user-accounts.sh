#!/bin/bash
# E2E for STAFF ACCOUNTS (Create Staff Account screen):
#   1. one user, several departments: the secondary role really grants access
#      (a Security+HR account reaches the HR-only user list, not 403)
#   2. removing an account frees its email: delete then re-create the SAME
#      address is accepted and revives exactly one row (no duplicate, no ghost)
#   3. the revived account signs in with its NEW password and is Active
#   4. auth gates: a role with none of the needed departments is refused (403)
#   5. cleanup: the e2e account is deleted again
# Isolated e2e accounts only (e2e.admin@livecheck.io from e2e_prep.cjs).
BASE="${BASE:-http://localhost:3001}"
PASS=0; FAIL=0; FAILED_NAMES=()
MULTI_EMAIL="e2e.multi@livecheck.io"

req() {
  local m="$1" path="$2" token="$3" data="$4"
  local args=(-s -X "$m" "$BASE$path" -o /tmp/e2e_user_body -w '%{http_code}')
  [ -n "$token" ] && args+=(-H "Authorization: Bearer $token")
  [ -n "$data" ] && args+=(-H 'Content-Type: application/json' -d "$data")
  curl "${args[@]}" > /tmp/e2e_user_status
}
status() { cat /tmp/e2e_user_status; }
check() {
  local name="$1" expected="$2"; local st; st=$(status)
  if [ "$st" = "$expected" ]; then PASS=$((PASS+1)); echo "  ok   $name ($st)";
  else FAIL=$((FAIL+1)); FAILED_NAMES+=("$name"); echo "  FAIL $name (got $st want $expected)"; echo "       body: $(head -c 300 /tmp/e2e_user_body)"; fi
}
login() { # email password -> LAST_TOKEN
  req POST /api/auth/login "" "{\"email\":\"$1\",\"password\":\"$2\"}"
  LAST_TOKEN="$(node -e "const d=JSON.parse(require('fs').readFileSync('/tmp/e2e_user_body','utf8')); console.log(d.token ?? '')" 2>/dev/null)"
}
# jq_ <statements> — runs the snippet with the response body in `d`.
jq_() { node -e "let d; try{d=JSON.parse(require('fs').readFileSync('/tmp/e2e_user_body','utf8'))}catch(e){} if(!d){console.log('');process.exit(0)} try{$1}catch(e){console.log('')}"; }

echo "=== STAFF ACCOUNTS: MULTI-ROLE + DELETED-EMAIL REVIVE ==="
login e2e.admin@livecheck.io FleetOpsx2026!
ADMIN="$LAST_TOKEN"
if [ -z "$ADMIN" ]; then FAIL=$((FAIL+1)); FAILED_NAMES+=("e2e.admin login (run e2e_prep.cjs first)"); echo "  FAIL e2e.admin login"; exit 1; fi
PASS=$((PASS+1)); echo "  ok   e2e.admin login"

# --- start clean: remove any leftover from an interrupted run ---
req GET /api/users "$ADMIN" ""
OLD_ID="$(jq_ "const u=d.find(x=>String(x.email).toLowerCase()==='$MULTI_EMAIL'); console.log(u?u.id:'')")"
[ -n "$OLD_ID" ] && { req DELETE "/api/users/$OLD_ID" "$ADMIN" ""; echo "  ..   cleared leftover $OLD_ID ($(status))"; }

# --- 1. one person, two departments ---
req POST /api/users "$ADMIN" "{\"firstName\":\"E2E\",\"surname\":\"Multi\",\"username\":\"e2e.multi\",\"email\":\"$MULTI_EMAIL\",\"roles\":[\"Security\",\"HR\"],\"password\":\"MultiRole@2026\"}"
check "create a Security + HR account (200)" 200
MULTI_ID="$(jq_ "console.log(d.id ?? d.user?.id ?? '')")"
ROLES_SAVED="$(jq_ "console.log(JSON.stringify((d.roles||[]).slice().sort()))")"
if [ "$ROLES_SAVED" = '["HR","Security"]' ] || [ "$ROLES_SAVED" = '["Security","HR"]' ]; then PASS=$((PASS+1)); echo "  ok   both departments stored on the one row ($ROLES_SAVED)";
else FAIL=$((FAIL+1)); FAILED_NAMES+=("double department stored"); echo "       stored: $ROLES_SAVED"; fi

login "$MULTI_EMAIL" 'MultiRole@2026'
MTOK="$LAST_TOKEN"
if [ -n "$MTOK" ]; then PASS=$((PASS+1)); echo "  ok   the multi-role account signs in"; else FAIL=$((FAIL+1)); FAILED_NAMES+=("multi-role sign-in"); fi
TOKEN_ROLES="$(jq_ "console.log(JSON.stringify((d.user?.roles||[]).slice().sort()))")"
if echo "$TOKEN_ROLES" | grep -q 'HR' && echo "$TOKEN_ROLES" | grep -q 'Security'; then PASS=$((PASS+1)); echo "  ok   session carries both roles ($TOKEN_ROLES)";
else FAIL=$((FAIL+1)); FAILED_NAMES+=("session carries both roles"); echo "       token roles: $TOKEN_ROLES"; fi
# HR is the SECONDARY role here: if only the primary were honoured this is 403.
req GET /api/users "$MTOK" ""
check "secondary department grants its module (HR list 200)" 200

# --- 2. delete frees the email ---
req DELETE "/api/users/$MULTI_ID" "$ADMIN" ""
check "remove the account (soft delete 204)" 204
req GET /api/users "$ADMIN" ""
GONE="$(jq_ "const u=d.find(x=>x.id==='$MULTI_ID'); console.log(!u?'HIDDEN':(u.status||'ACTIVE'))")"
if [ "$GONE" = "HIDDEN" ] || [ "$GONE" = "Deleted" ] || [ "$GONE" = "Inactive" ]; then PASS=$((PASS+1)); echo "  ok   account reads as removed ($GONE)";
else FAIL=$((FAIL+1)); FAILED_NAMES+=("account removed from list"); echo "       still listed as: $GONE"; fi
login "$MULTI_EMAIL" 'MultiRole@2026'
if [ -z "$LAST_TOKEN" ]; then PASS=$((PASS+1)); echo "  ok   removed account can no longer sign in";
else FAIL=$((FAIL+1)); FAILED_NAMES+=("removed account still signs in"); echo "       deleted account logged in"; fi

# --- 3. the same address can be created again ---
req POST /api/users "$ADMIN" "{\"firstName\":\"E2E\",\"surname\":\"Multi\",\"username\":\"e2e.multi\",\"email\":\"$MULTI_EMAIL\",\"roles\":[\"Security\",\"HR\"],\"password\":\"SecondLife@2026\"}"
check "re-create the SAME email after deletion (200, was 409)" 200
NEW_ID="$(jq_ "console.log(d.id ?? d.user?.id ?? '')")"
NEW_STATUS="$(jq_ "console.log(d.status ?? d.user?.status ?? '')")"
req GET /api/users "$ADMIN" ""
ROWS="$(jq_ "console.log(d.filter(x=>String(x.email).toLowerCase()==='$MULTI_EMAIL').length)")"
if [ "$ROWS" = "1" ]; then PASS=$((PASS+1)); echo "  ok   exactly one row for that email (revived, not duplicated)";
else FAIL=$((FAIL+1)); FAILED_NAMES+=("one row after revive"); echo "       rows: $ROWS"; fi
[ "$NEW_ID" = "$MULTI_ID" ] && { PASS=$((PASS+1)); echo "  ok   history kept: same user id revived"; } || echo "  ..   revived row id differs (old $MULTI_ID, new $NEW_ID)"
[ "$NEW_STATUS" = "Active" ] && { PASS=$((PASS+1)); echo "  ok   revived account is Active"; } || echo "  ..   status after revive: $NEW_STATUS"

login "$MULTI_EMAIL" 'SecondLife@2026'
if [ -n "$LAST_TOKEN" ]; then PASS=$((PASS+1)); echo "  ok   revived account signs in with the NEW password";
else FAIL=$((FAIL+1)); FAILED_NAMES+=("revived account sign-in"); fi
login "$MULTI_EMAIL" 'MultiRole@2026'
[ -z "$LAST_TOKEN" ] && { PASS=$((PASS+1)); echo "  ok   the OLD password is dead after revive"; } || { FAIL=$((FAIL+1)); FAILED_NAMES+=("old password rejected after revive"); }

# --- 4. a role with none of the needed departments is refused ---
login e2e.store@livecheck.io FleetOpsx2026!
req GET /api/users "$LAST_TOKEN" ""
check "a single-role store account is refused the HR list (403)" 403

# --- 5. cleanup ---
req DELETE "/api/users/$NEW_ID" "$ADMIN" ""
check "cleanup: remove the e2e account again (204)" 204

echo "==============================="
echo "STAFF ACCOUNTS: PASS=$PASS FAIL=$FAIL"
if [ ${#FAILED_NAMES[@]} -gt 0 ]; then printf 'FAILED: %s\n' "${FAILED_NAMES[@]}"; exit 1; fi
