/**
 * THE STORE'S OWN EVIDENCE.
 *
 * When the store hands a part over the counter, the signature on the ticket is
 * the only proof the part ever left the shelf and who walked away with it.
 * Screens pass; a dispute with engineering a month later does not. So issuing
 * ends with a paper: the items, their quantities and value, who issued them,
 * who collected them, and the collector's own signature beneath it.
 *
 * Printed through its own window rather than CSS-hidden DOM: a sheet that
 * depends on the page behind it prints whatever that page happens to be
 * showing, and the store prints this for a file, weeks later.
 */

export type CollectionNoteLine = {
  sku?: string | null;
  name: string;
  quantity: number;
  unitPrice?: number | null;
};

export type CollectionNote = {
  /** The ticket the parts was drawn against. */
  reference: string;
  /** When the handover happened (ISO). Defaults to now. */
  issuedAt?: string | null;
  /** The store officer behind the counter. */
  issuedBy?: string | null;
  /** The person who physically took the parts. */
  collectedBy?: string | null;
  truck?: string | null;
  description?: string | null;
  /** Data URL of the signature captured at the counter, when we have it. */
  signature?: string | null;
  lines: CollectionNoteLine[];
};

const esc = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const money = (value: number) =>
  `₦${Math.round(Number(value) || 0).toLocaleString("en-NG")}`;

const stamp = (value?: string | null) => {
  const d = value ? new Date(value) : new Date();
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

/** The store's collection note — one page, signed by the person who collected. */
export function collectionNoteHtml(note: CollectionNote): string {
  const lines = note.lines.filter((l) => l.name.trim() || l.sku);
  const totalUnits = lines.reduce((sum, l) => sum + Math.abs(Number(l.quantity) || 0), 0);
  const totalValue = lines.reduce(
    (sum, l) => sum + Math.abs(Number(l.quantity) || 0) * (Number(l.unitPrice) || 0),
    0,
  );
  const rows = lines.length
    ? lines
        .map((l, i) => {
          const qty = Math.abs(Number(l.quantity) || 0);
          const unit = Number(l.unitPrice) || 0;
          return `<tr>
        <td class="num">${i + 1}</td>
        <td><strong>${esc(l.sku || "—")}</strong><span class="sub">${esc(l.name || "")}</span></td>
        <td class="center">${qty.toLocaleString("en-NG")}</td>
        <td class="right">${unit ? esc(money(unit)) : "—"}</td>
        <td class="right">${unit ? esc(money(qty * unit)) : "—"}</td>
      </tr>`;
        })
        .join("")
    : `<tr><td colspan="5" class="empty">No items on this note.</td></tr>`;

  const signature = note.signature
    ? `<img class="sig" src="${esc(note.signature)}" alt="Collector signature" />`
    : `<span class="sig-empty">Signature</span>`;

  return `<!doctype html><html><head><meta charset="utf-8">
<title>${esc(note.reference)} — collection evidence</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #1B2432; margin: 26px; font-size: 12px; }
  .head { display: flex; justify-content: space-between; align-items: flex-start;
          border-bottom: 2px solid #1B2432; padding-bottom: 10px; margin-bottom: 14px; }
  .brand { font-size: 15px; font-weight: 700; letter-spacing: .3px; }
  .brand span { display: block; font-size: 10.5px; font-weight: 400; color: #5C6470; margin-top: 2px; }
  h1 { font-size: 14px; margin: 0 0 2px; text-transform: uppercase; letter-spacing: .8px; }
  .ref { font-size: 11px; color: #5C6470; }
  .meta { display: flex; flex-wrap: wrap; gap: 4px 28px; margin: 0 0 14px; font-size: 11.5px; }
  .meta div strong { font-weight: 600; }
  .meta div span { color: #5C6470; }
  table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
  th { text-align: left; text-transform: uppercase; letter-spacing: .4px; font-size: 9.5px;
       color: #5C6470; border-bottom: 1px solid #1B2432; padding: 6px; }
  td { border-bottom: 1px solid #E2E5E9; padding: 7px 6px; vertical-align: top; }
  td .sub { display: block; font-size: 10px; color: #5C6470; margin-top: 2px; }
  td.num { width: 26px; color: #8E95A1; }
  td.center { text-align: center; width: 70px; }
  td.right { text-align: right; width: 100px; white-space: nowrap; }
  td.empty { text-align: center; color: #8E95A1; padding: 20px; }
  tfoot td { border-bottom: none; font-weight: 600; padding-top: 10px; }
  .desc { margin: 12px 0 0; padding: 8px 10px; border: 1px solid #E2E5E9; border-radius: 4px;
          font-size: 11px; color: #5C6470; }
  .signs { display: flex; gap: 36px; margin-top: 34px; }
  .sign { flex: 1; }
  .sign .line { border-bottom: 1px solid #1B2432; height: 52px; display: flex; align-items: flex-end; }
  .sign .label { font-size: 10px; text-transform: uppercase; letter-spacing: .4px; color: #5C6470; margin-top: 5px; }
  .sign .who { font-size: 11.5px; font-weight: 600; margin-top: 2px; min-height: 14px; }
  .sig { max-height: 50px; max-width: 100%; object-fit: contain; }
  .sig-empty { display: block; font-size: 10px; color: #B6BCC5; padding-bottom: 4px; }
  .foot { margin-top: 26px; border-top: 1px solid #E2E5E9; padding-top: 8px;
          font-size: 9.5px; color: #8E95A1; display: flex; justify-content: space-between; }
  @page { margin: 14mm; }
</style></head><body>
  <div class="head">
    <div class="brand">Petroline Transport Ltd<span>Parts &amp; Store — collection evidence</span></div>
    <div style="text-align:right">
      <h1>Item Collection Note</h1>
      <div class="ref">Ticket ${esc(note.reference)}</div>
    </div>
  </div>

  <div class="meta">
    <div><span>Issued</span> <strong>${esc(stamp(note.issuedAt))}</strong></div>
    <div><span>Issued by</span> <strong>${esc(note.issuedBy || "—")}</strong></div>
    <div><span>Collected by</span> <strong>${esc(note.collectedBy || "—")}</strong></div>
    <div><span>Truck</span> <strong>${esc(note.truck || "Store floor")}</strong></div>
  </div>

  <table>
    <thead><tr>
      <th class="num">#</th><th>Part</th><th class="center">Qty</th>
      <th class="right">Unit price</th><th class="right">Value</th>
    </tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr>
      <td></td>
      <td>${esc(String(lines.length))} line${lines.length === 1 ? "" : "s"} · ${esc(String(totalUnits))} unit${totalUnits === 1 ? "" : "s"}</td>
      <td class="center">${esc(String(totalUnits))}</td>
      <td class="right"></td>
      <td class="right">${esc(money(totalValue))}</td>
    </tr></tfoot>
  </table>

  ${note.description ? `<p class="desc"><strong>Request:</strong> ${esc(note.description)}</p>` : ""}

  <div class="signs">
    <div class="sign">
      <div class="line">${signature}</div>
      <div class="label">Signature of person collecting</div>
      <div class="who">${esc(note.collectedBy || "")}</div>
    </div>
    <div class="sign">
      <div class="line"></div>
      <div class="label">Signature of store officer</div>
      <div class="who">${esc(note.issuedBy || "")}</div>
    </div>
  </div>

  <div class="foot">
    <span>Evidence of collection — goods received as listed above.</span>
    <span>Printed ${esc(stamp(new Date().toISOString()))} · FleetOpsX</span>
  </div>
</body></html>`;
}

/** Open the note in its own window and send it to the printer. */
export function printCollectionNote(note: CollectionNote): boolean {
  const html = collectionNoteHtml(note);
  const win = window.open("", "_blank", "width=900,height=960");
  if (!win) return false;
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
  // The signature image needs a beat before the print dialog measures the page.
  window.setTimeout(() => {
    try {
      win.print();
    } catch {
      /* the window still holds the sheet — the officer can print from it */
    }
  }, 260);
  return true;
}
