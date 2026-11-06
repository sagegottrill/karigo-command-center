/**
 * PROCUREMENT PRD WALK — live, against https://api.fleetopsx.com
 *
 * Covers the three paths that were only deployed, never exercised:
 *   A. Engineering origin: grouped engineering request → HOE review → TM release
 *      → store flags the bin empty → the PO lands in the buying inbox as
 *      Engineering, carrying the shelf line it belongs to.
 *   B. Critical stockout: an issue that takes a line to zero raises a red
 *      "Critical stockout" alert (severity critical), not an amber low-stock.
 *   C. Receipt + masking: the store raises a buy, Procurement receives it with
 *      proof of purchase, the shelf updates, the vendor is filed in the
 *      directory, and the store's API answers carry no money at all.
 *
 * Only throwaway ZZ- records, e2e.* accounts, cleaned by
 * scripts/e2e/procurement-prd-cleanup.cjs afterwards.
 */
const API = process.env.API_URL || "https://api.fleetopsx.com/api";
const PW = "FleetOpsx2026!";
const STAMP = Date.now().toString(36).toUpperCase();
const SKU_A = `ZZ-ENG-${STAMP}`;
const SKU_B = `ZZ-OUT-${STAMP}`;
const SKU_C = `ZZ-RCV-${STAMP}`;
const VENDOR = `ZZ Probe Vendor ${STAMP}`;
const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8AAAwAB/AF+p1j9AAAAAElFTkSuQmCC";

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  → " + detail : ""}`);
};

async function login(email) {
  const r = await fetch(API + "/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: PW }),
  });
  const b = await r.json();
  if (!r.ok) throw new Error(`login ${email}: ${r.status} ${JSON.stringify(b).slice(0, 200)}`);
  return b.token || b.accessToken;
}

const call = async (token, method, path, body) => {
  const r = await fetch(API + path, {
    method,
    headers: { authorization: "Bearer " + token, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }
  return { status: r.status, body: parsed };
};

(async () => {
  const admin = await login("e2e.admin@livecheck.io");
  const store = await login("e2e.store@livecheck.io");
  const tm = await login("e2e.tm@livecheck.io");

  /* ---------------- A. ENGINEERING ORIGIN ---------------- */
  const itemA = await call(admin, "POST", "/inventory", {
    sku: SKU_A, name: "ZZ Engineering Probe Part", category: "General", stock: 5, reorderLevel: 2,
  });
  check("A1 shelf line seeded", itemA.status === 200, `status ${itemA.status}`);

  const group = await call(admin, "POST", "/inventory-requisitions/group", {
    targetType: "Workshop",
    description: "e2e engineering probe",
    requestedBy: "E2E Admin",
    lines: [{ part: "ZZ Engineering Probe Part", quantity: 2, itemId: itemA.body?.id }],
  });
  check("A2 grouped engineering request raised", group.status === 201 && !!group.body?.group, `group ${group.body?.group}`);
  const reqId = group.body?.lines?.[0]?.id;
  check("A3 line starts at Awaiting HOE Review", group.body?.lines?.[0]?.status === "Awaiting HOE Review", group.body?.lines?.[0]?.status);

  const review = await call(admin, "POST", `/inventory-requisitions/group/${group.body?.group}/review`, { approve: true });
  check("A4 HOE review approves to TM", review.status === 200, `status ${review.status}`);

  const release = await call(tm, "POST", `/inventory/${itemA.body?.id}/release`, { qty: 2, reqId });
  check("A5 TM release hands to the store floor", release.status === 200 && release.body?.ok === true, `status ${release.status}`);

  const handoffs = await call(store, "GET", "/inventory-handoffs");
  const queued = Array.isArray(handoffs.body) && handoffs.body.find((r) => r.id === reqId);
  check("A6 ticket is on the store's pickup queue", queued?.status === "Awaiting Pickup", queued?.status);

  const pick = await call(store, "POST", `/inventory-handoffs/${reqId}/pick`, { picked: false });
  check("A7 store flags the bin empty", pick.status === 200, `status ${pick.status}`);

  const pos = await call(admin, "GET", "/procurement");
  const engPo = Array.isArray(pos.body) ? pos.body.find((r) => r.sku === SKU_A) : null;
  check("A8 a PO reached the buying inbox", !!engPo, engPo ? engPo.linkedId : "none");
  check("A9 its channel is Engineering", engPo?.source === "Engineering", String(engPo?.source));
  check("A10 it carries the shelf line it belongs to", !!engPo?.itemId && engPo?.sku === SKU_A, `${engPo?.itemId?.slice(0, 8)}… / ${engPo?.sku}`);
  check("A11 it names the mechanic who asked", engPo?.requestedBy === "E2E Admin", String(engPo?.requestedBy));

  /* ---------------- B. CRITICAL STOCKOUT ---------------- */
  const itemB = await call(admin, "POST", "/inventory", {
    sku: SKU_B, name: "ZZ Stockout Probe", category: "General", stock: 1, reorderLevel: 1,
  });
  check("B1 single-unit shelf line seeded", itemB.status === 200, `status ${itemB.status}`);

  const reqB = await call(admin, "POST", "/inventory-requisitions", {
    workOrder: `ZZ-WO-${STAMP}`, truckReg: "ZZ-000-XY", mechanic: "E2E Admin",
    part: "ZZ Stockout Probe", itemId: itemB.body?.id, quantity: 1, reason: "e2e stockout probe",
  });
  check("B2 requisition raised", reqB.status === 200, `status ${reqB.status}`);
  await call(admin, "PATCH", `/inventory-requisitions/${reqB.body?.id}`, { status: "Awaiting Pickup" });

  const complete = await call(store, "POST", `/inventory-handoffs/${reqB.body?.id}/complete`, {
    signature: PNG, qty: 1,
  });
  check("B3 handoff signed and released", complete.status === 200, `status ${complete.status}`);

  const shelfB = (await call(admin, "GET", "/inventory")).body?.find?.((i) => i.sku === SKU_B);
  check("B4 the line is now at zero", shelfB?.stock === 0, `stock ${shelfB?.stock}`);

  // The alert is audience-scoped — Transport Manager, Head of Inventory, store
  // floor and Procurement — so it is read here as the TM, the seat that acts on
  // a stockout, not as an unrelated admin session.
  const notes = await call(tm, "GET", "/notifications");
  const rows = Array.isArray(notes.body) ? notes.body : notes.body?.data || [];
  const critical = rows.find((n) => n.refId === itemB.body?.id && /Critical stockout/i.test(String(n.title)));
  check("B5 a Critical stockout alert fired", !!critical, critical?.title);
  check("B6 it is high priority, not a warning", critical?.severity === "critical", String(critical?.severity));
  check("B7 Procurement is on the alert's audience", /Procurement/.test(String(critical?.audience)), String(critical?.audience || "").slice(0, 70));

  /* ---------------- C. RECEIPT, VENDOR, MASKING ---------------- */
  const itemC = await call(admin, "POST", "/inventory", {
    sku: SKU_C, name: "ZZ Receipt Probe", category: "General", stock: 0, reorderLevel: 5,
  });
  check("C1 empty shelf line seeded", itemC.status === 200, `status ${itemC.status}`);

  const poC = await call(store, "POST", "/procurement", {
    partName: "ZZ Receipt Probe", sku: SKU_C, quantity: 10, kind: "Part", status: "Requested", vendor: VENDOR,
  });
  check("C2 the store raised the buy", poC.status === 200, `status ${poC.status} source=${poC.body?.source}`);

  const recv = await call(admin, "POST", `/procurement/${poC.body?.id}/receive`, {
    quantity: 10, unitCost: 1200, vendor: VENDOR,
    documents: [{ kind: "Invoice", fileName: "zz-receipt.png", mimeType: "image/png", dataUrl: PNG }],
  });
  check("C3 Procurement received it with proof", recv.status === 200 && recv.body?.documents === 1, `status ${recv.status} docs=${recv.body?.documents}`);
  check("C4 shelf took the quantity at the price paid", recv.body?.item?.stock === 10 && recv.body?.item?.unitCost === 1200, `stock ${recv.body?.item?.stock} @ ${recv.body?.item?.unitCost}`);

  const vendors = await call(admin, "GET", "/vendors");
  check("C5 the vendor filed itself in the directory", Array.isArray(vendors.body) && vendors.body.some((v) => v.name === VENDOR), `${Array.isArray(vendors.body) ? vendors.body.length : 0} vendors`);

  const storeShelf = (await call(store, "GET", "/inventory")).body?.find?.((i) => i.sku === SKU_C);
  check("C6 the store sees the new quantity", storeShelf?.stock === 10, `stock ${storeShelf?.stock}`);
  check("C7 the store's wire carries no unit cost", storeShelf && !("unitCost" in storeShelf), storeShelf ? Object.keys(storeShelf).join(",") : "no row");

  const storePo = (await call(store, "GET", "/procurement")).body?.find?.((r) => r.id === poC.body?.id);
  check("C8 the store's PO carries no agreed price", storePo && !("unitPrice" in storePo) && !("receivedUnitCost" in storePo), storePo ? Object.keys(storePo).join(",") : "no row");

  const storeDocs = await call(store, "GET", "/procurement/documents");
  check("C9 the store is refused the receipts", storeDocs.status === 403, `status ${storeDocs.status}`);

  const docs = await call(admin, "GET", "/procurement/documents");
  const doc = Array.isArray(docs.body) ? docs.body.find((d) => d.procurementId === poC.body?.id) : null;
  check("C10 the receipt is auditable against the PO", !!doc && doc.kind === "Invoice", doc ? `${doc.fileName} ${Math.round(doc.size / 1024)}KB` : "none");

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} checks passed`);
  console.log(`STAMP=${STAMP}`);
  process.exit(passed === results.length ? 0 : 1);
})().catch((e) => {
  console.error("walk failed:", e.message);
  process.exit(1);
});
