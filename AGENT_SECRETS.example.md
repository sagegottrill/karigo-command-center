# Agent secrets — EXAMPLE (safe to commit)

Copy to `AGENT_SECRETS.local.md` and fill real values.  
`AGENT_SECRETS.local.md` is gitignored. **Never commit real passwords.**

```markdown
# Agent secrets — LOCAL ONLY (do not commit)

## App logins
- manager@petroline.ng / <PASSWORD>
- admin@fleetopsx.com / <PASSWORD>
- Other ops users / <PASSWORD>

## VPS SSH
- Host: 2.28.45.216
- User: root
- Password: <ROTATE_IF_EXPOSED_IN_CHAT>
- IPv6: 2a01:4f8:c013:7735::/64
- App path: /var/www/fleetopsx-api
- PM2: fleetopsx-api

## Figma
- fileKey: lj4rA7VMJm03PZOBQyysRL
- Auth: Cursor Figma MCP (plugin-figma-figma); user must be logged into Figma in Cursor

## API
- Origin: http://2.28.45.216/api
- Browser: same-origin /api via Vercel rewrite
```
