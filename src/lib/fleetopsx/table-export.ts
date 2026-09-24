/**
 * Snapshot a live table card into a self-contained, styled HTML string.
 *
 * Fortune's export rule: every table offers CSV, an IMAGE and a PDF. The CSV
 * is data the page already holds; the image and the PDF start here — the
 * on-screen card is cloned, every element's computed style is inlined (so the
 * snapshot renders identically without the app's stylesheets), and the result
 * is clean enough to draw into a canvas (image) or a print window (PDF).
 *
 * No dependencies: the image is a canvas draw of the HTML, and the PDF is the
 * browser's own print-to-PDF on a purpose-built sheet — both already proven in
 * this codebase (the ticket JPEG, the dashboard's printSheet).
 */

/** Inline computed styles for an element subtree so it survives on its own. */
function inlineStyles(source: HTMLElement, target: HTMLElement): void {
  const srcEls = [source, ...Array.from(source.querySelectorAll<HTMLElement>("*"))];
  const dstEls = [target, ...Array.from(target.querySelectorAll<HTMLElement>("*"))];
  const SKIP = new Set(["cursor", "user-select", "pointer-events", "transition", "animation", "transform"]);
  for (let i = 0; i < srcEls.length && i < dstEls.length; i++) {
    const srcEl = srcEls[i];
    const dstEl = dstEls[i];
    if (!srcEl || !dstEl) continue;
    const cs = window.getComputedStyle(srcEl);
    let css = "";
    for (let p = 0; p < cs.length; p++) {
      const prop = cs.item(p);
      if (SKIP.has(prop)) continue;
      const val = cs.getPropertyValue(prop);
      if (val) css += `${prop}:${val};`;
    }
    // Inputs/selects keep their value in the clone.
    if (srcEl instanceof HTMLInputElement || srcEl instanceof HTMLSelectElement) {
      (dstEl as HTMLInputElement).value = (srcEl as HTMLInputElement).value;
    }
    dstEl.setAttribute("style", css);
  }
}

/**
 * Clone the card, strip interactivity (action menus, buttons, scrollbar tails),
 * inline its styles and return standalone HTML sized to its natural width.
 */
export function snapshotTableCard(card: HTMLElement, title: string): { html: string; width: number; height: number } {
  const rect = card.getBoundingClientRect();
  const clone = card.cloneNode(true) as HTMLElement;

  // The live table's action menus, 3-dots and buttons are UI, not data.
  clone.querySelectorAll<HTMLElement>(
    "button, [data-export-remove], .row-action-menu, [role='menu'], [role='menuitem']",
  ).forEach((el) => el.remove());
  // Column headers render fine; the sticky/pagination strip does not.
  clone.querySelectorAll<HTMLElement>("[data-pagination]").forEach((el) => el.remove());

  inlineStyles(card, clone);

  const wrapper = document.createElement("div");
  wrapper.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
  wrapper.style.cssText = `width:${Math.ceil(rect.width)}px;padding:28px;background:#F1F2F4;font-family:Arial,Helvetica,sans-serif;box-sizing:border-box;`;
  const heading = document.createElement("div");
  heading.style.cssText = "margin-bottom:14px;";
  heading.innerHTML = `<div style="font-size:19px;font-weight:700;color:#1B2432;">${title.replace(/</g, "&lt;")}</div><div style="font-size:11px;color:#5C6470;text-transform:uppercase;letter-spacing:.5px;margin-top:3px;">Exported ${new Date().toLocaleString("en-NG")}</div>`;
  wrapper.appendChild(heading);
  wrapper.appendChild(clone);

  return {
    html: wrapper.outerHTML,
    width: Math.ceil(rect.width) + 56,
    height: Math.ceil(rect.height) + 100,
  };
}

function renderHtmlToCanvas(html: string, width: number, height: number): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const frame = document.createElement("iframe");
    frame.style.cssText = "position:fixed;left:-10000px;top:0;width:" + width + "px;height:" + height + "px;border:0;";
    document.body.appendChild(frame);
    const doc = frame.contentDocument;
    if (!doc) {
      frame.remove();
      reject(new Error("Could not prepare the export canvas."));
      return;
    }
    doc.open();
    doc.write(`<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;">${html}</body></html>`);
    doc.close();
    // Two rAFs + a tick: the frame must finish layout and font resolution.
    frame.onload = () => {
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          setTimeout(() => {
            try {
              const canvas = document.createElement("canvas");
              const scale = Math.min(2, 8000 / Math.max(width, height));
              canvas.width = Math.ceil(width * scale);
              canvas.height = Math.ceil(height * scale);
              const ctx = canvas.getContext("2d");
              if (!ctx) throw new Error("Canvas unavailable");
              ctx.scale(scale, scale);
              ctx.fillStyle = "#F1F2F4";
              ctx.fillRect(0, 0, width, height);
              // SVG foreignObject snapshot: the frame's own document is drawn
              // through an <img> of its serialized DOM — same-document canvas
              // draws of iframes are forbidden by the canvas spec.
              const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
              svg.setAttribute("width", String(width));
              svg.setAttribute("height", String(height));
              const foreign = document.createElementNS("http://www.w3.org/2000/svg", "foreignObject");
              foreign.setAttribute("width", "100%");
              foreign.setAttribute("height", "100%");
              const body = doc.body.firstElementChild;
              if (!body) throw new Error("Nothing to render.");
              foreign.appendChild(body);
              svg.appendChild(foreign);
              const xml = new XMLSerializer().serializeToString(svg);
              const img = new Image();
              img.onload = () => {
                ctx.drawImage(img, 0, 0, width, height);
                frame.remove();
                resolve(canvas);
              };
              img.onerror = () => {
                frame.remove();
                reject(new Error("Could not render the snapshot."));
              };
              img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(xml);
            } catch (err) {
              frame.remove();
              reject(err instanceof Error ? err : new Error("Snapshot failed"));
            }
          }, 120);
        }),
      );
    };
  });
}

function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

const stamp = () => new Date().toISOString().slice(0, 10);

/** The card as a .png image — pastes into WhatsApp, mail, anywhere. */
export async function downloadTableImage(card: HTMLElement, title: string, fileNameBase: string): Promise<void> {
  const snap = snapshotTableCard(card, title);
  const canvas = await renderHtmlToCanvas(snap.html, snap.width, snap.height);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
  if (!blob) throw new Error("Could not render the image.");
  saveBlob(blob, `${fileNameBase}-${stamp()}.png`);
}

/** The card as a .pdf — the browser's own print-to-PDF on a clean sheet. */
export async function downloadTablePdf(card: HTMLElement, title: string, fileNameBase: string): Promise<void> {
  const snap = snapshotTableCard(card, title);
  const w = window.open("", "_blank", "width=1000,height=1200");
  if (!w) throw new Error("Allow pop-ups to export the PDF.");
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${fileNameBase}-${stamp()}</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; }
    @page { size: A4 landscape; margin: 10mm; }
    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  </style></head><body>${snap.html}
  <script>window.onload = function () { setTimeout(function () { window.print(); }, 250); };</script>
  </body></html>`);
  w.document.close();
  w.focus();
}

/** The table card this page exports — found relative to the toolbar button. */
export function findExportCard(from: HTMLElement | null): HTMLElement | null {
  if (!from) return null;
  // The card is the nearest ancestor section's bordered table wrapper, or the
  // previous sibling block with the table — the toolbar sits just above it.
  let el: HTMLElement | null = from;
  while (el) {
    const candidate =
      el.querySelector<HTMLElement>(".overflow-hidden.rounded-\\[10px\\]") ??
      el.querySelector<HTMLElement>("[data-export-card]");
    if (candidate && candidate !== from) return candidate;
    el = el.parentElement;
  }
  return null;
}

/** Fire the browser download from the CSV path the pages already use. */
export function downloadCsvBlob(csv: string, fileNameBase: string): void {
  saveBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), `${fileNameBase}-${stamp()}.csv`);
}
