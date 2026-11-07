#!/usr/bin/env bash
# Reconcile the VPS with the repo: the server must hold the committed build,
# byte for byte. GitHub is only a backup copy; nothing is served from there.
cd "$(dirname "$0")/.." || exit 1
HOST=root@2.28.45.216
say() { echo; echo "=== $*"; }

say "build the committed source (HEAD $(git rev-parse --short HEAD))"
NITRO_PRESET=node-server npm run build > /tmp/web-build.log 2>&1
echo "BUILD_EXIT=$?"

say "API source: local vs the file pm2 actually runs"
LOCAL_API=$(md5sum backend-live/index.ts | awk '{print $1}')
LOCAL_ROUTES=$(grep -cE '^app\.(get|post|patch|put|delete)\(' backend-live/index.ts)
echo "local  $LOCAL_API  ($LOCAL_ROUTES routes)"
REMOTE_API=$(ssh -o BatchMode=yes $HOST 'md5sum /var/www/fleetopsx-api/index.ts | cut -d" " -f1')
REMOTE_ROUTES=$(ssh -o BatchMode=yes $HOST 'grep -cE "^app\.(get|post|patch|put|delete)\(" /var/www/fleetopsx-api/index.ts')
echo "server $REMOTE_API  ($REMOTE_ROUTES routes)"
if [ "$LOCAL_API" = "$REMOTE_API" ] && [ "$LOCAL_ROUTES" = "$REMOTE_ROUTES" ]; then
  echo "API_IN_SYNC"
else
  echo "API_DRIFTED — shipping the committed file and restarting"
  ssh -o BatchMode=yes $HOST 'cp /var/www/fleetopsx-api/index.ts /root/backups/api-index-$(date +%s).ts'
  scp -o BatchMode=yes backend-live/index.ts $HOST:/var/www/fleetopsx-api/index.ts >/dev/null
  ssh -o BatchMode=yes $HOST 'cd /var/www/fleetopsx-api && npx esbuild index.ts --bundle --platform=node --outfile=/tmp/eb.js >/tmp/esb.log 2>&1 && pm2 restart fleetopsx-api --update-env >/dev/null && echo API_REDEPLOYED || (echo API_BUNDLE_FAILED; head -10 /tmp/esb.log)'
fi

say "web build: every file on the server must match the committed build"
( cd .output && find nitro.json public server -type f -print0 | sort -z | xargs -0 md5sum ) > /tmp/web.manifest
echo "local files: $(wc -l < /tmp/web.manifest)"
scp -o BatchMode=yes /tmp/web.manifest $HOST:/tmp/web.manifest >/dev/null
MISMATCH=$(ssh -o BatchMode=yes $HOST 'cd /var/www/fleetopsx-web && md5sum -c --quiet /tmp/web.manifest 2>/dev/null | wc -l')
echo "server files differing or missing: $MISMATCH"
if [ "$MISMATCH" != "0" ]; then
  echo "WEB_DRIFTED — shipping the build"
  tar czf /tmp/web.tgz -C .output nitro.json server public
  scp -o BatchMode=yes /tmp/web.tgz $HOST:/tmp/web.tgz >/dev/null
  ssh -o BatchMode=yes $HOST 'set -e; cd /var/www/fleetopsx-web; rm -rf /tmp/webx; mkdir -p /tmp/webx; tar xzf /tmp/web.tgz -C /tmp/webx; cp -a /tmp/webx/public/. public/; rm -rf server; cp -a /tmp/webx/server server; cp -f /tmp/webx/nitro.json nitro.json; pm2 restart fleetopsx-web --update-env >/dev/null; rm -rf /tmp/webx /tmp/web.tgz; echo WEB_REDEPLOYED'
  echo "after redeploy, differing files: $(ssh -o BatchMode=yes $HOST 'cd /var/www/fleetopsx-web && md5sum -c --quiet /tmp/web.manifest 2>/dev/null | wc -l')"
else
  echo "WEB_IN_SYNC"
fi

say "processes, boot persistence, proxy"
ssh -o BatchMode=yes $HOST 'pm2 jlist | node -e "let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>{for(const p of JSON.parse(s))if(/fleetopsx/.test(p.name))console.log(p.name,p.pm2_env.status,\"| script:\",p.pm2_env.pm_exec_path,\"| args:\",(p.pm2_env.args||[]).join(\" \"),\"| restarts:\",p.pm2_env.restart_time)})"; pm2 save --force >/dev/null 2>&1 && echo PM2_DUMP_SAVED; systemctl is-enabled pm2-root 2>/dev/null || echo NO_PM2_SYSTEMD; nginx -t 2>&1 | tail -2; echo "sites:"; ls /etc/nginx/sites-enabled'

say "document storage on the box"
ssh -o BatchMode=yes $HOST 'ls -ld /var/www/fleetopsx-docs 2>/dev/null || echo DOCS_DIR_MISSING; find /var/www/fleetopsx-docs -type f 2>/dev/null | wc -l; df -h /var/www | tail -1'

say "the public domain must be this server"
curl -s -o /dev/null -w 'home            %{http_code}  server=%{scheme}\n' https://petrolline.fleetopsx.com/
curl -s -o /dev/null -w 'procurement     %{http_code}\n' https://petrolline.fleetopsx.com/workspace/app/procurement
curl -s -o /dev/null -w 'inventory       %{http_code}\n' https://petrolline.fleetopsx.com/workspace/app/procurement/inventory
curl -s -o /dev/null -w 'api health      %{http_code}\n' https://api.fleetopsx.com/api/health
echo "dns petrolline: $(nslookup petrolline.fleetopsx.com 8.8.8.8 2>/dev/null | awk '/^Address: /{print $2}' | tail -1)"
echo "dns api:        $(nslookup api.fleetopsx.com 8.8.8.8 2>/dev/null | awk '/^Address: /{print $2}' | tail -1)"
echo "tls not-after:  $(echo | openssl s_client -servername petrolline.fleetopsx.com -connect petrolline.fleetopsx.com:443 2>/dev/null | openssl x509 -noout -enddate)"

say "the domain must serve the newest chunk the router manifest names"
CHUNK=$(grep -o 'workspace\.app\.procurement\.index-[A-Za-z0-9_-]*\.js' /dev/null 2>/dev/null; grep -roh 'workspace\.app\.procurement\.index-[A-Za-z0-9_-]*\.js' .output/public/assets/index-*.js | head -1)
echo "manifest names: ${CHUNK:-unknown}"
if [ -n "$CHUNK" ]; then
  curl -s -o /dev/null -w "asset ${CHUNK} -> %{http_code}\n" "https://petrolline.fleetopsx.com/assets/$CHUNK"
fi
