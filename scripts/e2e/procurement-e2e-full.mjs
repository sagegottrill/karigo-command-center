/**
 * FULL PROCUREMENT CYCLE — end to end, against the live API.
 *
 * Store asks → the desk sources → the buy is received at a price → stock lands
 * at a weighted average → the receipt is filed on disk and opens byte-identical
 * → the price trail records it → the store can still see stock and never money.
 *
 * Throwaway markers only (ZZ-E2E-*), cleaned by tmp/cleanup-e2e.cjs afterwards.
 */
const API = process.env.API || "https://api.fleetopsx.com/api";
const PROC = { email: "procurement@petrolline.fleetopsx.com", password: "Petroline#2026" };
const STORE = { email: "e2e.store@livecheck.io", password: "E2e-Store#2026" };
const SKU = "ZZ-E2E-WAC";
const DOC = "zz-e2e-receipt.png";

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};

async function login(who) {
  const r = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(who),
  });
  const body = await r.json().catch(() => null);
  return { status: r.status, token: body?.token, roles: body?.user?.roles };
}

async function call(token, method, path, body) {
  const r = await fetch(API + path, {
    method,
    headers: { ...(body ? { "content-type": "application/json" } : {}), authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* non-JSON */
  }
  return { status: r.status, body: parsed, text };
}

const money = (n) => Math.round(Number(n ?? 0));

(async () => {
  const proc = await login(PROC);
  check("procurement desk signs in", proc.status === 200 && !!proc.token, `role ${proc.roles}`);
  const store = await login(STORE);
  check("store floor signs in", store.status === 200 && !!store.token, `role ${store.roles}`);
  if (!proc.token || !store.token) throw new Error("cannot continue without both sessions");

  const P = proc.token;
  const S = store.token;

  // 1. The store asks for a part.
  const asked = await call(P, "POST", "/procurement", {
    partName: "E2E Brake Shoe", quantity: 10, linkedId: "ZZ-E2E-PO-1", kind: "Part",
    sku: SKU, category: "Spare Parts", source: "Store", requestedBy: "E2E Store Probe", unitPrice: 1200,
  });
  check("request lands in the inbox", asked.status === 200 || asked.status === 201, `PO ${asked.body?.linkedId}`);
  const po1 = asked.body?.id;

  const inbox = await call(P, "GET", "/procurement");
  check("the request is listed for the desk", inbox.status === 200 && inbox.body.some((r) => r.id === po1));

  // 2. The desk sources it.
  const sourcing = await call(P, "PATCH", `/procurement/${po1}`, { status: "Sourcing" });
  check("request moves to Sourcing", sourcing.status === 200 && sourcing.body?.status === "Sourcing");

  // 3. It arrives, with the receipt scanned in.
  const payload = (await import("node:crypto")).randomBytes(120000);
  const dataUrl = "data:image/png;base64," + payload.toString("base64");
  const received = await call(P, "POST", `/procurement/${po1}/receive`, {
    quantity: 10, unitCost: 1200, vendor: "ZZ E2E Vendor",
    documents: [{ kind: "Receipt", fileName: DOC, mimeType: "image/png", dataUrl }],
  });
  check("receiving books the purchase", received.status === 200 || received.status === 201, `status ${received.status}`);

  const after = await call(P, "GET", "/procurement");
  const closed = after.body?.find((r) => r.id === po1);
  check("PO closes as Procured with its actual figures", closed?.status === "Procured" && money(closed?.receivedQty) === 10 && money(closed?.receivedUnitCost) === 1200);

  // 4. Stock and its price land on the shelf.
  const shelf = await call(P, "GET", "/inventory");
  const line = shelf.body?.find((i) => i.sku === SKU);
  check("stock lands on the shelf", !!line && money(line.stock) === 10, `${line?.name} qty ${line?.stock}`);
  check("the shelf carries the price paid", money(line?.unitCost) === 1200, `unit price ₦${money(line?.unitCost)}`);

  // 5. The price trail records it.
  const history = await call(P, "GET", "/vendors/price-history");
  const entry = history.body?.find((p) => p.sku === SKU && p.kind === "Purchase");
  check("price history records the purchase", !!entry && money(entry.unitCost) === 1200 && money(entry.value) === 12000, `₦${money(entry?.unitCost)} × ${entry?.quantity}`);

  // 6. The receipt is filed against the PO and opens byte-identical.
  const docs = await call(P, "GET", "/procurement/documents");
  const doc = docs.body?.find((d) => d.fileName === DOC);
  check("receipt filed against the PO", !!doc && doc.procurementId === po1 && money(doc.size) === 120000, `${doc?.size} bytes`);
  const opened = await call(P, "GET", `/procurement/documents/${doc?.id}`);
  const back = opened.body?.dataUrl ? Buffer.from(String(opened.body.dataUrl).split(",")[1], "base64") : Buffer.alloc(0);
  check("receipt opens byte-identical", opened.status === 200 && back.length === payload.length && back.equals(payload), `${back.length} bytes`);

  // 7. A second delivery blends at the weighted average, not the latest price.
  const asked2 = await call(P, "POST", "/procurement", {
    partName: "E2E Brake Shoe", quantity: 10, linkedId: "ZZ-E2E-PO-2", kind: "Part",
    sku: SKU, category: "Spare Parts", source: "Store", requestedBy: "E2E Store Probe", unitPrice: 1300,
  });
  const rec2 = await call(P, "POST", `/procurement/${asked2.body?.id}/receive`, {
    quantity: 10, unitCost: 1300, vendor: "ZZ E2E Vendor",
    documents: [{ kind: "Invoice", fileName: "zz-e2e-invoice.png", mimeType: "image/png", dataUrl }],
  });
  const shelf2 = await call(P, "GET", "/inventory");
  const line2 = shelf2.body?.find((i) => i.sku === SKU);
  check("second delivery adds stock", rec2.status === 200 && money(line2?.stock) === 20, `qty ${line2?.stock}`);
  check("price blends to the weighted average", money(line2?.unitCost) === 1250, `₦${money(line2?.unitCost)} (expected ₦1,250)`);

  // 8. A rejected buy cannot be received.
  const asked3 = await call(P, "POST", "/procurement", {
    partName: "E2E Rejected Part", quantity: 1, linkedId: "ZZ-E2E-PO-3", kind: "Part",
    sku: "ZZ-E2E-REJ", category: "Spare Parts", source: "Engineering",
  });
  await call(P, "PATCH", `/procurement/${asked3.body?.id}`, { status: "Rejected" });
  const badReceive = await call(P, "POST", `/procurement/${asked3.body?.id}/receive`, {
    quantity: 1, unitCost: 100, vendor: "ZZ E2E Vendor",
    documents: [{ kind: "Receipt", fileName: "zz-e2e-reject.png", mimeType: "image/png", dataUrl }],
  });
  check("a rejected buy refuses receiving", badReceive.status === 409, `status ${badReceive.status}`);

  // 9. The store sees the stock and never the money.
  const storeShelf = await call(S, "GET", "/inventory");
  const storeLine = storeShelf.body?.find((i) => i.sku === SKU);
  const leaks = storeShelf.body?.filter((i) => i.unitCost !== undefined || i.value !== undefined) || [];
  check("the store reads the shelf", storeShelf.status === 200 && !!storeLine, `${storeShelf.body?.length} rows`);
  check("no row carries money to the store", leaks.length === 0, `${leaks.length} leaking rows`);
  const storeDocs = await call(S, "GET", "/procurement/documents");
  check("the store cannot read receipts", storeDocs.status === 403, `status ${storeDocs.status}`);
  const storeHistory = await call(S, "GET", "/vendors/price-history");
  const storeLeak = (storeHistory.body || []).filter((p) => p.unitCost !== undefined || p.value !== undefined).length;
  check("the store cannot read the price trail", storeHistory.status === 200 && storeLeak === 0, `${storeLeak} priced rows`);
  const storeReceive = await call(S, "POST", `/procurement/${po1}/receive`, { quantity: 1, unitCost: 1 });
  check("the store cannot receive a purchase", storeReceive.status === 403, `status ${storeReceive.status}`);

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} checks passed`);
  if (passed !== results.length) {
    console.log("FAILED:", results.filter((r) => !r.ok).map((r) => r.name).join(" | "));
    process.exit(1);
  }
})().catch((e) => {
  console.error("E2E ABORTED:", e?.message || e);
  process.exit(2);
});
