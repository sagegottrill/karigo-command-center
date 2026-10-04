# Moving trips older than 5 days — transport-desk audit

Generated 2026-10-04 from the live ledger (`fleetopsx` DB), statuses counted by the
In Transit card (En Route / Loaded / Offloading / Returning / Delayed), created before
Sep 29. **38 of 60** open moving trips are in this list. Refs use the same DIS- form
the UI and notifications show (derive: DIS- + last 5 alphanumerics of the trip id).

Context: the duplicate-dispatch heal (20 superseded rows closed on Oct 4) already
proved some trucks went out on newer loads while these stayed open; every trip below
is now the ONLY open load naming its truck (0 duplicate trucks after heal). That
means these are singular desk decisions, not ledger noise: either the truck really
is still on the road (then it needs an ETA / gate stamp), or it came home and the
Return was never logged (then log it — the gate cycle now closes everything it names).

## By status

### Returning — 25 (most critical: trucks should be in the yard)

| Ref | Created | Age | Truck | Driver | Route (P→D) |
|---|---|---|---|---|---|
| DIS-8AF2D | Sep 16 | 18d | GGE109YK / B078 | Mudasiru Lawal | Saba Factory → Kano |
| DIS-93DEA | Sep 17 | 17d | KTU193XC / None | Sanusi Mohammed | Babangida.1 → Costain |
| DIS-CD8BA | Sep 18 | 16d | GGE95YK / B055 | Abdullahi Abubakar P | Metalberg.K → IKORODU |
| DIS-C76A2 | Sep 19 | 15d | MKA982XW / B010 | Adamu Muhammed | Saba Factory → Kirikiri |
| DIS-B77D6 | Sep 21 | 13d | GGE101YK / B043 | Shamailu Dauda | Babangida.1 → PH |
| DIS-B6CF9 | Sep 21 | 13d | FST570YL / B059 | Mogaji Issa | Saba Factory → Kano |
| DIS-08389 | Sep 21 | 13d | GGE105YK / B023 | MUSA | No 5 Aerodrome Road → IGBESA |
| DIS-4B331 | Sep 22 | 12d | KRD996YM / B085 | Muhammed Khalid | Babangida.3 → Kano |
| DIS-C50B9 | Sep 22 | 12d | GGE85YK / B074 | Ibrahim Garuba | Happy Home → Kano |
| DIS-6B630 | Sep 22 | 12d | GGE97YK / B039 | UMAR | Saba Factory → Kano |
| DIS-C2AE5 | Sep 22 | 12d | SBG757ZY / B038 | ABDULKADIR | Chimax Ayobo → Ijesha-2 |
| DIS-B5DF7 | Sep 23 | 11d | APP857YL / B051 | Saidu Usaini | Babangida.1 → PH |
| DIS-969E4 | Sep 23 | 11d | APP862YL / B087 | Buba Hammah | Babangida.3 → Kano |
| DIS-E02A4 | Sep 23 | 11d | FST569YL / B030 | SEMIU | Ikorodu → Kirikiri |
| DIS-73B1F | Sep 23 | 11d | APP863YL / B009 | 0 (bad name) | Saba Factory → PH |
| DIS-31A22 | Sep 23 | 11d | GRR171XA / B010 | Zakari Sanusi | Saba Factory → Shagamu |
| DIS-CEE5E | Sep 23 | 11d | SBG674XT / B028 | NDA | Ijesha.2 → Shagamu |
| DIS-1BDDF | Sep 23 | 11d | GGE88YK / B061 | Bashiru Yahaya | Babangida.3 → Onitsha |
| DIS-9F7D1 | Sep 23 | 11d | DKA321XQ / B029 | ali | Happy Home → Saba Factory |
| DIS-7F423 | Sep 24 | 10d | KRD992YM / B071 | Abdullahi Abubakar | Happy Home → Kano |
| DIS-5B552 | Sep 24 | 10d | AKD329YM / B069 | Abba Mohammed | Happy Home → PH |
| DIS-86930 | Sep 24 | 10d | KRD279YL / B061 | Ahmadu Illiyasu | Comfortoboh → PH |
| DIS-1E5FC | Sep 24 | 10d | KRD997YM / B073 | Tijani | Comfortoboh → PH |
| DIS-C52DA | Sep 28 | 6d | GGE84YK / B1006 | Abdullahi Ibrahim | Metalberg.K → Delta |
| DIS-CA89C | Sep 28 | 6d | AKD320YM / B100 | rabiu | Babangida.3 → Shagamu |



### En Route — 10 (long-haul departures, 5–9 days out)

| Ref | Created | Age | Truck | Driver | Route (P→D) |
|---|---|---|---|---|---|
| DIS-6A6EE | Sep 25 | 9d | AKD324YM / B082 | Yahaya Alabi Moruf | Babangida.3 → Kaduna |
| DIS-EBB2E | Sep 26 | 8d | KRD995YM / B075 | Danladi Adamu | Ijesha.2 → Kano |
| DIS-25D6D | Sep 28 | 6d | AKD325YM / B077 | Samaila Ibrahim | Babangida.3 → Nasarawa |
| DIS-F61B9 | Sep 28 | 6d | GGE102YK / B060 | Zakari Mohammed | Babangida.3 → Nasarawa |
| DIS-2C866 | Sep 28 | 6d | GGE87YK / B1000 | Mohammed Rabiu G | Saba factory → Metalberg k |
| DIS-89899 | Sep 29 | 5d | GGE99YK / B045 | Salisu Adamu | Babangida.3 → Nasarawa |
| DIS-FA3D2 | Sep 29 | 5d | KRD532YM / B084 | Ibrahim Adamu | Saba Factory → Kano |
| DIS-4D906 | Sep 29 | 5d | KRD990YM / B081 | Ado Sanni | Ijesha.2 → Abuja |
| DIS-7BB41 | Sep 29 | 5d | KRD987YM / B079 | Yakubu Abubakar Biu | Ijesha.2 → Nasarawa |
| DIS-9A092 | Sep 29 | 5d | GGE91YK / B034 | Yahya Aliyu | Metalberg.K → Delta |

### Offloading — 3 (at destination but stuck)

| Ref | Created | Age | Truck | Driver | Route (P→D) |
|---|---|---|---|---|---|
| DIS-819AA | Sep 23 | 11d | GGE98YK / B035 | Idowu Adekola | Saba Factory → Kaduna |
| DIS-77FD7 | Sep 24 | 10d | GGE94YK / B1007 | Abudulazees | Ikorodu → Kirikiri factory |
| DIS-2B8FF | Sep 28 | 6d | GGE106YK / B1005 | Hassan Abdullahi | Ikorodu → Kirikiri factory |

## Desk flags worth acting on first

1. **Driver name junk** (roster hygiene, blocks the driver-free logic):
   DIS-73B1F driver recorded as `0`; also raw lowercase/junk entries like `ali`,
   `rabiu`, `MUSA`, `UMAR`, `NDA`, `SEMIU`, `Tijani`.
2. **Truck tail "None"**: DIS-93DEA (KTU193XC) — tail never recorded.
3. **B100x tails** (B1000/B1005/B1006/B1007/B046-style): several are the newer
   test-inventory tails — confirm they are real assets before trusting their rows.
4. **Returning >10 days** (Sep 16–24 block, 23 trips): physically impossible round
   trips — almost certainly trucks that came home days ago without a gate Return
   stamp. Their drivers are still marked On Trip. Logging the gate Return today
   closes each one and frees the driver (patched cycle now closes *all* matches).

## Reproduce

```sql
SELECT 'DIS-' || lpad(upper(right(regexp_replace(id, '[^0-9a-zA-Z]', '', 'g'), 5)), 5, '0') AS ref, status, "createdAt", "truckReg", "driverName", "pickup", "dropoff"
FROM "Trip"
WHERE status IN ('En Route','Loaded','Offloading','Returning','Delayed')
  AND "createdAt" < NOW() - INTERVAL '5 days'
ORDER BY "createdAt" ASC;
```
