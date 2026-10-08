/**
 * Snapshot a live table card into a self-contained, styled HTML string.
 *
 * Fortune's export rule: every table offers CSV, an IMAGE and a PDF. The CSV
 * is data the page already holds; the image and the PDF start here — the
 * on-screen card is cloned, every element's MEANINGFUL style is inlined (so
 * the snapshot renders identically without the app's stylesheets), and the
 * result is clean enough to draw into a canvas (image) or a print window (PDF).
 *
 * No dependencies: the image is a canvas draw of the HTML, and the PDF is the
 * browser's own print-to-PDF on a purpose-built sheet.
 *
 * PERFORMANCE CONTRACT — the first version of this file froze the tab: it
 * copied ALL ~300 computed properties onto EVERY element, producing tens of
 * megabytes of style text for a 50-row table (parse + serialize + copy of all
 * of it, synchronously). The inliner below only writes properties that differ
 * from the browser default AND are not just inherited from the parent, which
 * shrinks the output ~50x and keeps big tables responsive.
 */

/** Properties CSS inherits down the tree. Only emitted when they differ from the parent. */
const INHERITED_PROPS = new Set([
  "color",
  "direction",
  "font-family",
  "font-size",
  "font-style",
  "font-weight",
  "font-variant",
  "letter-spacing",
  "line-height",
  "list-style",
  "list-style-image",
  "list-style-position",
  "list-style-type",
  "text-align",
  "text-align-last",
  "text-decoration-color",
  "text-indent",
  "text-justify",
  "text-overflow",
  "text-shadow",
  "text-transform",
  "visibility",
  "white-space",
  "word-break",
  "word-spacing",
  "word-wrap",
  "overflow-wrap",
  "border-collapse",
  "border-spacing",
  "caption-side",
  "empty-cells",
  "quotes",
]);

/** Layout-only noise that never belongs in a static snapshot. */
const SKIPPED_PROPS = new Set([
  "cursor",
  "user-select",
  "pointer-events",
  "transition",
  "animation",
  "transform",
  "will-change",
  "scroll-behavior",
  "overscroll-behavior",
  "touch-action",
  "content-visibility",
  "contain-intrinsic-size",
]);

/** One browser-default style sheet, probed once per export run. */
function buildStyleBaseline(): { defaults: Record<string, string> } {
  const probe = document.createElement("div");
  document.body.appendChild(probe);
  const cs = window.getComputedStyle(probe);
  const defaults: Record<string, string> = {};
  for (let p = 0; p < cs.length; p++) {
    const prop = cs.item(p);
    if (prop) defaults[prop] = cs.getPropertyValue(prop);
  }
  probe.remove();
  return { defaults };
}

/**
 * Is this element UI the export must NOT carry — action menus, icon buttons,
 * filter controls, pagination — as opposed to a DATA ROW? Many tables render
 * their rows as <button> elements (clickable rows), so "strip all buttons"
 * once emptied entire exports. Rows carry long multi-cell text and no icons;
 * controls are icon-only, short-labelled, menu items, or page-marked.
 */
function isStrippedControl(el: Element): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.hasAttribute("data-export-remove")) return true;
  if (el.hasAttribute("data-pagination")) return true;
  if (el.closest("[role='menu'], [data-pagination], .row-action-menu")) return true;
  if (el.tagName !== "BUTTON") return false;
  const text = (el.textContent ?? "").trim();
  const isIconControl = el.querySelector("svg") !== null && text.length < 24;
  const isLabelledControl =
    text.length > 0 && text.length < 24 && el.querySelector("td, th") === null;
  // Rows: long multi-cell text, no icon — keep them.
  if (!isIconControl && !isLabelledControl) return false;
  // A button that contains another button is a row wrapper, not a control.
  if (el.querySelector("button")) return false;
  return true;
}

/**
 * Inline the meaningful computed styles for an element subtree so it survives
 * on its own. A property is written only when it differs from the browser
 * default and — for inherited properties — from the parent's own value.
 *
 * PAIRING CONTRACT — source and clone are walked in strict lockstep and the
 * clone is ONLY mutated through the pair (strip controls, drop hidden
 * subtrees). Stripping from the clone before the walk once desynced the two
 * trees and styles landed on the wrong elements, collapsing the layout.
 */
function inlineStyles(source: HTMLElement, target: HTMLElement): void {
  const { defaults } = buildStyleBaseline();
  const inheritedList = [...INHERITED_PROPS];

  // Walk (source, target) in lockstep. `parentInherited` carries the parent's
  // COMPUTED value for every inheritable property — a child only needs to
  // re-declare an inheritable property when it differs from what it would
  // otherwise inherit (browser default at the root, parent's value below it).
  const walk = (
    srcEl: Element,
    dstEl: HTMLElement,
    parentInherited: Record<string, string> | null,
  ) => {
    const cs = window.getComputedStyle(srcEl);
    // Controls and hidden subtrees (the mobile duplicate list, collapsed
    // panels) never render — dropping them halves the snapshot. Removing the
    // clone's counterpart (never the live source) and skipping the whole
    // subtree keeps both sides aligned for every following sibling.
    if (isStrippedControl(srcEl) || cs.display === "none" || cs.visibility === "hidden") {
      dstEl.remove();
      return;
    }
    const myInherited: Record<string, string> = {};
    for (const prop of inheritedList) myInherited[prop] = cs.getPropertyValue(prop);

    let css = "";
    for (let p = 0; p < cs.length; p++) {
      const prop = cs.item(p);
      if (!prop || SKIPPED_PROPS.has(prop)) continue;
      const val = cs.getPropertyValue(prop);
      if (!val) continue;
      const def = defaults[prop];
      if (def === undefined) continue;
      if (INHERITED_PROPS.has(prop)) {
        // Emit only what differs from the effective inherited value.
        if (val === (parentInherited ? parentInherited[prop] : def)) continue;
      } else if (val === def) {
        // Non-inherited props revert to the browser default in the standalone
        // render, so anything but the default must be written.
        continue;
      }
      css += `${prop}:${val};`;
    }
    if (css) dstEl.setAttribute("style", css);

    // Inputs/selects keep their value in the clone.
    if (srcEl instanceof HTMLInputElement || srcEl instanceof HTMLSelectElement) {
      const v = (srcEl as HTMLInputElement).value;
      (dstEl as HTMLInputElement).value = v;
      if (srcEl instanceof HTMLInputElement && srcEl.type === "checkbox") {
        (dstEl as HTMLInputElement).checked = srcEl.checked;
      }
    }

    // Snapshot both child lists up front: removing a hidden/control subtree
    // below must not shift the pairing of its siblings.
    const srcKids = [...srcEl.children];
    const dstKids = [...dstEl.children];
    for (let i = 0; i < srcKids.length && i < dstKids.length; i++) {
      const srcKid = srcKids[i];
      const dstKid = dstKids[i];
      if (srcKid && dstKid) walk(srcKid, dstKid as HTMLElement, myInherited);
    }
  };

  walk(source, target, null);
}

/**
 * Clone the card, strip interactivity (action menus, buttons, scrollbar tails),
 * inline its styles and return standalone HTML sized to its natural width.
 */
export function snapshotTableCard(
  card: HTMLElement,
  title: string,
): { html: string; width: number; height: number } {
  const rect = card.getBoundingClientRect();
  // The clone is an exact copy; controls and hidden subtrees are dropped
  // DURING the style walk, which keeps source/clone pairing intact.
  const clone = card.cloneNode(true) as HTMLElement;

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

const EXPORT_TIMEOUT_MS = 45_000;

function renderHtmlToCanvas(
  html: string,
  width: number,
  height: number,
): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const frame = document.createElement("iframe");
    frame.style.cssText =
      "position:fixed;left:-10000px;top:0;width:" + width + "px;height:" + height + "px;border:0;";
    document.body.appendChild(frame);
    frame.style.width = `${width}px`;
    frame.style.height = `${height}px`;

    let settled = false;
    const done = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(hardStop);
      frame.remove();
      fn();
    };
    const fail = (message: string) => done(() => reject(new Error(message)));
    // The busy state must never stick: whatever happens below, this fires.
    const hardStop = setTimeout(
      () => fail("The export took too long — filter to a shorter period and retry."),
      EXPORT_TIMEOUT_MS,
    );

    const doc = frame.contentDocument;
    if (!doc) {
      fail("Could not prepare the export canvas.");
      return;
    }
    doc.open();
    doc.write(
      `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;">${html}</body></html>`,
    );
    doc.close();

    // DO NOT rely on frame.onload — a same-doc write can finish before the
    // handler attaches and the event never fires (the old hang). Poll the
    // document's own readyState instead, then let layout settle. setTimeout,
    // not requestAnimationFrame: rAF never fires in a hidden tab, which
    // freezes the whole export when the user switches away mid-export.
    const whenReady = () => {
      if (settled) return;
      if (doc.readyState !== "complete") {
        setTimeout(whenReady, 60);
        return;
      }
      setTimeout(() => {
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
            // draws of iframes are forbidden by the canvas spec. The data URI
            // is deliberate: blob URLs TAINT the canvas and toBlob throws,
            // while a data URI counts as same-origin in Chrome/Edge.
            const body = doc.body.firstElementChild;
            if (!body) throw new Error("Nothing to render.");
            const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
            svg.setAttribute("width", String(width));
            svg.setAttribute("height", String(height));
            const foreign = document.createElementNS("http://www.w3.org/2000/svg", "foreignObject");
            foreign.setAttribute("width", "100%");
            foreign.setAttribute("height", "100%");
            foreign.appendChild(body);
            svg.appendChild(foreign);
            const xml = new XMLSerializer().serializeToString(svg);
            // Data URI, not a blob URL: blob-backed SVG images TAINT the
            // canvas and toBlob throws SecurityError, while a data URI
            // counts as same-origin in Chrome/Edge.
            const dataUri = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(xml);
            // A huge data URI can very rarely fail to decode without ever
            // calling onload — retry once from a fresh Image before giving up.
            const img = new Image();
            let decoded = false;
            const draw = () => {
              try {
                ctx.drawImage(img, 0, 0, width, height);
                done(() => resolve(canvas));
              } catch (err) {
                fail(err instanceof Error ? err.message : "Could not draw the snapshot.");
              }
            };
            img.onload = () => {
              if (!decoded) {
                decoded = true;
                draw();
              }
            };
            img.onerror = () => {
              if (!decoded) {
                decoded = true;
                const retry = new Image();
                retry.onload = draw;
                retry.onerror = () => fail("Could not render the snapshot.");
                retry.src = dataUri;
              }
            };
            img.src = dataUri;
          } catch (err) {
            fail(err instanceof Error ? err.message : "Snapshot failed");
          }
        }, 120);
      }, 0);
    };
    whenReady();
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
export async function downloadTableImage(
  card: HTMLElement,
  title: string,
  fileNameBase: string,
): Promise<void> {
  const snap = snapshotTableCard(card, title);
  const canvas = await renderHtmlToCanvas(snap.html, snap.width, snap.height);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
  if (!blob) throw new Error("Could not render the image.");
  saveBlob(blob, `${fileNameBase}-${stamp()}.png`);
}

/** The clean A4 landscape sheet both print paths share. */
function printSheet(html: string, fileNameBase: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${fileNameBase}-${stamp()}</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; }
    @page { size: A4 landscape; margin: 10mm; }
    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  </style></head><body>`;
}

/** The card as a .pdf — the browser's own print-to-PDF on a clean sheet.
 *  Pop-ups blocked (kiosk browsers, embedded webviews) fall back to a hidden
 *  iframe print, so the option still works where window.open is denied. */
export async function downloadTablePdf(
  card: HTMLElement,
  title: string,
  fileNameBase: string,
): Promise<void> {
  const snap = snapshotTableCard(card, title);
  const printable = `${printSheet(snap.html, fileNameBase)}${snap.html}<script>window.onload=function(){setTimeout(function(){window.print();},250);};</script></body></html>`;
  const w = window.open("", "_blank", "width=1000,height=1200");
  if (w) {
    w.document.write(printable);
    w.document.close();
    w.focus();
    return;
  }
  // Pop-up blocked — print the same sheet from a hidden iframe instead.
  await new Promise<void>((resolve, reject) => {
    const frame = document.createElement("iframe");
    frame.style.cssText = "position:fixed;left:-10000px;top:0;width:1100px;height:1400px;border:0;";
    document.body.appendChild(frame);
    const doc = frame.contentDocument;
    if (!doc) {
      frame.remove();
      reject(new Error("The PDF sheet could not be prepared."));
      return;
    }
    doc.open();
    doc.write(printable);
    doc.close();
    // Print once the sheet has laid out; remove the frame after the dialog
    // has been dealt with (print() blocks until the dialog closes).
    const print = frame.contentWindow;
    const go = () => {
      try {
        print?.focus();
        print?.print();
        resolve();
      } catch {
        reject(new Error("Allow pop-ups to export the PDF."));
      } finally {
        setTimeout(() => frame.remove(), 500);
      }
    };
    const wait = () => {
      if (doc.readyState === "complete") setTimeout(go, 250);
      else setTimeout(wait, 60);
    };
    wait();
  });
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
