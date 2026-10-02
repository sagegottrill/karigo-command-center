# Fuel desk + recipient requests — API for the mobile app

_Added 2026-10-03. Live on https://api.fleetopsx.com. This is the contract the
mobile app builds against; every endpoint below is deployed and smoke-tested._

## The four things this covers

| # | Who asks | What he needs | Where it shows |
|---|----------|---------------|----------------|
| 1 | A **walk-in buyer** at the yard with a paper slip — "I want 50 L of diesel" | The **diesel attendant must SEE the request** | `GET /api/fuel-requests` + `GET /api/fuel-requests/desk` + a bell alert addressed to the `Lubricant` role |
| 2 | The **Transport Manager**, buying on behalf of a partner (Silver Steel, Saba Steel…) | Raise the request *for* the partner, without waiting for them to type it | `POST /api/trips` with `onBehalfOfPartner`; it lands in the partner's own portal **and** the TM queue |
| 3 | The **recipient / mobile guy** | His own screen showing only *his* work | `GET /api/worklist` (one call, role-scoped) |
| 4 | The **yard mechanic** — "the boss wants 50 L of diesel to wash the engine" (Petroline → Petroline) | An internal draw on the tank, pushed onto the system | Same fuel-request queue as #1, `source: "Internal Use"` |

Everything is **push-then-pull**: raising a request writes a `Notification` row
immediately (the bell + the "needs me" queue), and the desk/mobile screens poll
the queue endpoints.

## Auth

```
POST /api/auth/login          { "email": "...", "password": "..." }   → { token, user }
```
Send the token on every call: `Authorization: Bearer <token>`.
The JWT carries `role` (primary) and `roles[]` (multi-role). Endpoints below are
role-gated by that list.

## Statuses

* Fuel request: `Requested` → `Authorized` → `Dispensed`, with `Declined` as the exit.
  Dispensing a `Requested` row is allowed (the desk clears and draws in one motion)
  and auto-stamps `authorizedBy: "<name> (at the pump)"`.
* Payment: `Unpaid` (default) · `Paid` · `Credit`. Every unpaid dispense raises a
  "Payment pending" alert owned by the `Lubricant` role.
* One draw per request: a second dispense returns **409**.

## 1–4. Fuel requests (walk-in + internal)

### Raise it — anyone in the yard
```http
POST /api/fuel-requests
{
  "fuelType": "Diesel",          // Diesel | Gas (default Diesel)
  "quantity": 50,                 // litres (KG for Gas)
  "source": "Walk-In Sale",       // "Walk-In Sale" | "Internal Use"
  "requestedBy": "Musa the buyer",// who is asking — buyer, mechanic, department
  "requestedFor": "Silver Steel", // company/department it is FOR (optional)
  "purpose": "engine wash — boss asked",   // optional, free text
  "buyerPhone": "0803…",          // optional
  "plateNumber": "KNE-482-XA",    // optional
  "note": "paper slip 0241"       // optional
}
→ 201 { "id", "reference": "FQ-00012", "status": "Requested", "unit": "LITRES", … }
```
Partner-portal accounts get **403** here — a tank draw is raised by the yard.

### The desk queue (what the diesel attendant sees)
```http
GET /api/fuel-requests?status=Requested,Authorized&source=Walk-In Sale&limit=200
→ 200 {
  "requests": [ { "reference", "fuelType", "quantity", "unit", "source",
                  "status", "requestedBy", "requestedFor", "purpose",
                  "unitPrice", "estimatedAmount", "paymentStatus", … } ],
  "counts": { "requested", "authorized", "dispensed", "declined", "walkIn", "internal" },
  "tanks":  [ { "fuelType", "quantity", "minLevel", "unit", "low" } ],
  "prices": { "Diesel": 1830, "Gas": 0 }
}
```
`?mine=1` returns what **this** account raised (the mobile "my requests" tab).

### The desk screen in one call
```http
GET /api/fuel-requests/desk
→ 200 {
  "waiting":  [ … ],   // status Requested  — must be cleared
  "cleared":  [ … ],   // status Authorized — cleared, not yet drawn
  "today":    [ … ],   // dispensed since midnight
  "recent":   [ … ],   // last 50 dispensed
  "counts":   { "waiting", "cleared", "dispensedToday", "litresToday",
                "salesToday", "unpaid" },
  "tanks":    [ … ], "prices": { … }, "generatedAt": "…"
}
```

### Clear it / decline it (desk, Fleet Operations, TM)
```http
PATCH /api/fuel-requests/:id
{ "status": "Authorized" }                       // or "Requested" (push back), "Declined"
{ "status": "Declined", "reason": "no approval" }
{ "paymentStatus": "Paid", "paymentRef": "TRF-9931" }   // record payment later
```

### Dispense it — the one call that moves the tank
```http
POST /api/fuel-requests/:id/dispense
{ "quantity": 50, "dispensedBy": "Abba (diesel desk)", "paymentStatus": "Paid" }
→ 201 { …row, "unit": "LITRES", "stock": { "fuelType": "Diesel", "quantity": 16625 } }
```
* Price per litre comes from **the Transport Manager's** FuelPrice and is
  snapshotted onto the row; only a TM may pass `unitPrice` to override.
* Guards, each a 409 with a readable message: already dispensed · declined ·
  more litres than the tank holds · TM has not set a price.

## 2. Transport Manager raises a dispatch FOR a partner

```http
GET /api/partners
→ 200 [ { "company": "Saba Steel", "accounts": 2, "source": "Portal Account" }, … ]
```
(the picker list: Genbrite, Ghaddar, GT & Imports, Metalberg, Petroline,
Saba Steel, SAR Ltd, Sat Ltd, … plus any name already used on a dispatch)

```http
POST /api/trips
{
  "onBehalfOfPartner": "Saba Steel",   // or "requestedForPartner"
  "tailType": "Flatbed", "requestedTruckType": "Flatbed",
  "pickup": "Petroline Yard", "dropoff": "Kano Dry Port",
  "customerConsignee": "Steel coils", "cargo": "Steel coils"
}
→ 200 { "id", "status": "Requested", "customer": "Saba Steel",
        "directCosts": { "raisedOnBehalf": { "company", "by", "role", "at" } } }
```
* The partner name is **canonicalised** to the spelling already on file, so the
  partner's dashboard and this row can never disagree.
* The row enters the normal lifecycle (`Requested` → approval → assignment) and
  is visible on the partner's own trip list immediately.
* One notification covers both sides: audience
  `Partner:<Company>,Transport Manager,Fleet Operations`.
* Only staff (`Transport Manager`, `Platform Admin`, `Fleet Operations`) can pass
  it; a partner account raising its own request is unchanged.

## 3. The recipient / mobile screen

```http
GET /api/worklist
→ 200 {
  "user":  { "id", "name", "role", "roles", "partnerCompany" },
  "fuelRequests":     [ { "reference", "fuelType", "quantity", "unit", "source",
                          "status", "requestedBy", "requestedFor", "purpose",
                          "amount", "paymentStatus", "needs" } ],
  "dispatchRequests": [ { "reference", "status", "customer", "requestedTruckType",
                          "pickup", "dropoff", "cargo", "customerConsignee",
                          "raisedOnBehalf" } ],
  "pumpQueue":        [ { "reference", "fuelType", "quantity", "unit", "gate",
                          "truckReg", "driverName", "dropoff" } ],
  "mine":             [ { "reference", "status", "fuelType", "quantity",
                          "dispensedBy", "dispensedAt" } ],
  "counts": { "fuelWaiting", "fuelCleared", "dispatchWaiting", "pumpQueue" },
  "generatedAt": "…"
}
```
One URL for every kind of user — the server decides what is his:
* **Diesel desk / Fleet Ops / TM** → the fuel queue, the dispatch requests
  waiting, and the trucks waiting at the pump.
* **Recipient / gate / tracking** → the dispatch requests + pump queue.
* **Partner login** → only its own company's rows (`fuelRequests` where
  `requestedFor` = his company, plus its own dispatches).

## Suggested mobile screens

1. **Diesel desk** — top: two lists from `/api/fuel-requests/desk`
   (`waiting` with a *Clear* button, `cleared` with a *Dispense* button),
   bottom: tank levels + today's litres/naira; badge = `counts.waiting`.
   Dispense sheet: litres (prefilled), payment (Paid / Unpaid / Credit), ref.
2. **Raise a request** (gate / desk / mechanic): fuel type, litres, source
   toggle (Walk-in / Internal), who's asking, company/department, purpose.
   One tap posts to `/api/fuel-requests`.
3. **My worklist** — `/api/worklist` sections as tabs; pull to refresh, plus
   `GET /api/notifications?action=1` for the "needs me" bell.
4. **TM: raise for a partner** — partner picker from `/api/partners`, then the
   normal dispatch form; post with `onBehalfOfPartner`.

## Fire-tested

`node scripts/smoke-fueldesk.cjs` (on the API host) — `--read`, `--write`
(raise → clear → dispense → double-dispense refused), `--cleanup`, and
`--partner "Saba Steel"` (raise on behalf + partner visibility + self-delete).
