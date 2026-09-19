/**
 * A Transport Request rendered as an IMAGE.
 *
 * Fortune's words (17 Sept): the partner must be able to "print it because they
 * need to create a WP internally… click and generate it in JPEG and send it on
 * WhatsApp". A CSV can't be pasted into a WhatsApp chat and a screenshot loses
 * the details, so the whole ticket is drawn onto a canvas and exported as a
 * real .jpg — no printing library, no dependency, works offline once the page
 * is loaded.
 */

export interface TicketTimelineStep {
  label: string;
  date?: string;
  state: "done" | "current" | "pending" | "seen";
}

export interface TicketImageInput {
  ticketId: string;
  status: string;
  customerName: string;
  product: string;
  truckType: string;
  destination: string;
  destinationAddress?: string;
  loadingSites: string[];
  driverName?: string;
  driverPhone?: string;
  truckHead?: string;
  truckTail?: string;
  serial?: string;
  tripDuration?: string;
  expectedReturn?: string;
  dispatchedDate?: string;
  timeline?: TicketTimelineStep[];
}

const INK = "#1B2432";
const MUTED = "#5C6470";
const LINE = "#E2E5E9";
const BRAND = "#ED351D";
const GREEN = "#0ACF83";
const AMBER = "#F99E1F";

const WIDTH = 1240;
const SCALE = 2;
const PAD = 64;
const LINE_H = 30;

const FONT = (size: number, weight = 400) =>
  `${weight} ${size}px "Helvetica Neue", Helvetica, Arial, sans-serif`;

type TextStyle = { size?: number; weight?: number; color?: string };

interface Draw {
  y: number;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = String(text ?? "").split(/\s+/).filter(Boolean);
  if (words.length === 0) return ["—"];
  const lines: string[] = [];
  let line = words[0] ?? "";
  for (const word of words.slice(1)) {
    const candidate = `${line} ${word}`;
    if (ctx.measureText(candidate).width <= maxWidth) line = candidate;
    else {
      lines.push(line);
      line = word ?? "";
    }
  }
  lines.push(line);
  return lines;
}

function text(
  ctx: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  { size = 22, weight = 400, color = INK }: TextStyle = {},
) {
  ctx.font = FONT(size, weight);
  ctx.fillStyle = color;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(value, x, y);
}

interface Row {
  label: string;
  value: string;
}

interface Section {
  title: string;
  rows: Row[];
}

/**
 * Measure every row before a single pixel is drawn: the canvas has to be tall
 * enough for all of them, and a canvas cannot grow once it exists.
 */
function measureSections(ctx: CanvasRenderingContext2D, sections: Section[]): number {
  const valueWidth = WIDTH - PAD * 2 - 300;
  let height = 0;
  for (const section of sections) {
    height += 62; // section heading
    for (const row of section.rows) {
      const lines = wrap(ctx, row.value || "—", valueWidth).length;
      height += Math.max(1, lines) * LINE_H + 14;
    }
    height += 22;
  }
  return height;
}

export function buildTicketImage(input: TicketImageInput): HTMLCanvasElement {
  const sections: Section[] = [
    {
      title: "CUSTOMER DETAILS",
      rows: [
        { label: "Customer Name", value: input.customerName },
        { label: "Product", value: input.product },
        { label: "Truck Type", value: input.truckType },
        { label: "Destination", value: input.destination },
        ...(input.destinationAddress ? [{ label: "Destination Address", value: input.destinationAddress }] : []),
        ...(input.loadingSites.length
          ? input.loadingSites.map((site, i) => ({
              label: `Loading Site ${input.loadingSites.length > 1 ? i + 1 : ""}`.trim(),
              value: site,
            }))
          : [{ label: "Loading Site", value: "—" }]),
      ],
    },
    {
      title: "VEHICLE & OPERATOR DETAILS",
      rows: [
        { label: "Truck Head (Cap / Plate)", value: input.truckHead || "—" },
        { label: "Truck Tail (Type)", value: input.truckTail || "—" },
        { label: "Serial Number", value: input.serial || "—" },
        { label: "Driver Name", value: input.driverName || "—" },
        { label: "Driver Phone Number", value: input.driverPhone || "—" },
      ],
    },
    {
      title: "DISPATCH & EXPECTED RETURN",
      rows: [
        { label: "Dispatched Date", value: input.dispatchedDate || "Not dispatched yet" },
        { label: "Trip Duration", value: input.tripDuration || "Not set yet" },
        { label: "Expected Return", value: input.expectedReturn || "Not set yet" },
      ],
    },
  ];

  // Measuring needs a context; a throwaway one costs nothing.
  const probe = document.createElement("canvas").getContext("2d");
  if (!probe) throw new Error("This browser cannot render the ticket image.");
  const headerHeight = 190;
  const timelineSteps = input.timeline ?? [];
  const timelineHeight = timelineSteps.length ? 62 + timelineSteps.length * LINE_H + 24 : 0;
  const footerHeight = 110;
  const bodyHeight = measureSections(probe, sections);
  const height = headerHeight + bodyHeight + timelineHeight + footerHeight;

  const canvas = document.createElement("canvas");
  canvas.width = WIDTH * SCALE;
  canvas.height = height * SCALE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser cannot render the ticket image.");
  ctx.scale(SCALE, SCALE);

  // Page
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, WIDTH, height);

  // Header band
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, WIDTH, headerHeight);
  ctx.fillStyle = BRAND;
  ctx.fillRect(0, 0, WIDTH, 8);
  text(ctx, "PETROLINE TRANSPORT LTD", PAD, 76, { size: 24, weight: 700, color: "#FFFFFF" });
  text(ctx, "Transport Request", PAD, 112, { size: 18, color: "#C9CFD8" });
  text(ctx, input.ticketId, PAD, 162, { size: 40, weight: 700, color: "#FFFFFF" });

  // Status chip, right aligned
  ctx.font = FONT(20, 600);
  const statusWidth = ctx.measureText(input.status).width + 44;
  const chipX = WIDTH - PAD - statusWidth;
  ctx.fillStyle = "rgba(255,255,255,0.14)";
  ctx.beginPath();
  ctx.roundRect(chipX, 60, statusWidth, 44, 22);
  ctx.fill();
  text(ctx, input.status, chipX + 22, 89, { size: 20, weight: 600, color: "#FFFFFF" });

  let y = headerHeight + 28;
  const labelX = PAD;
  const valueX = PAD + 300;
  const valueWidth = WIDTH - PAD - valueX;

  for (const section of sections) {
    text(ctx, section.title, labelX, y, { size: 17, weight: 700, color: MUTED });
    y += 10;
    ctx.strokeStyle = LINE;
    ctx.beginPath();
    ctx.moveTo(labelX, y);
    ctx.lineTo(WIDTH - PAD, y);
    ctx.stroke();
    y += 34;

    for (const row of section.rows) {
      text(ctx, row.label, labelX, y, { size: 19, color: MUTED });
      const lines = wrap(ctx, row.value || "—", valueWidth);
      lines.forEach((line, i) => {
        text(ctx, line, valueX, y + i * LINE_H, { size: 21, weight: i === 0 ? 600 : 400, color: INK });
      });
      y += Math.max(1, lines.length) * LINE_H + 14;
    }
    y += 22;
  }

  if (timelineSteps.length) {
    text(ctx, "REQUEST TIMELINE", labelX, y, { size: 17, weight: 700, color: MUTED });
    y += 10;
    ctx.strokeStyle = LINE;
    ctx.beginPath();
    ctx.moveTo(labelX, y);
    ctx.lineTo(WIDTH - PAD, y);
    ctx.stroke();
    y += 36;

    for (const step of timelineSteps) {
      const done = step.state === "done";
      const current = step.state === "current";
      const seen = step.state === "seen";
      ctx.fillStyle = seen ? AMBER : done || current ? GREEN : "#D1D5DB";
      ctx.beginPath();
      ctx.arc(labelX + 9, y - 7, 7, 0, Math.PI * 2);
      ctx.fill();
      text(ctx, step.label, labelX + 34, y, {
        size: 20,
        weight: current || done ? 600 : 400,
        color: step.state === "pending" ? MUTED : INK,
      });
      if (step.date) {
        ctx.font = FONT(19, 400);
        const w = ctx.measureText(step.date).width;
        text(ctx, step.date, WIDTH - PAD - w, y, { size: 19, color: MUTED });
      }
      y += LINE_H;
    }
  }

  // Footer
  const footerY = height - footerHeight + 40;
  ctx.strokeStyle = LINE;
  ctx.beginPath();
  ctx.moveTo(PAD, footerY - 28);
  ctx.lineTo(WIDTH - PAD, footerY - 28);
  ctx.stroke();
  text(
    ctx,
    `Generated ${new Date().toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })} · Petroline Transport Ltd · FleetOpsX`,
    PAD,
    footerY,
    { size: 17, color: MUTED },
  );
  text(
    ctx,
    "This document is the partner's copy of the request and its assigned vehicle, driver and journey.",
    PAD,
    footerY + 28,
    { size: 17, color: MUTED },
  );

  return canvas;
}

export function ticketImageFileName(ticketId: string): string {
  return `${ticketId || "request"}.jpg`;
}

export function ticketImageBlob(input: TicketImageInput): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas = buildTicketImage(input);
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not render the ticket image."))),
      "image/jpeg",
      0.94,
    );
  });
}

/** Save the ticket as a .jpg the partner can attach anywhere (WhatsApp, mail). */
export async function downloadTicketJpeg(input: TicketImageInput): Promise<void> {
  const blob = await ticketImageBlob(input);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = ticketImageFileName(input.ticketId);
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export type ShareOutcome = "shared" | "downloaded";

/**
 * Share the ticket image. On a phone (WhatsApp Web on Android/iOS) the native
 * share sheet takes the JPEG straight into a chat; on a desktop browser, which
 * cannot put a file into another app, the image is downloaded and the caller is
 * told so it can explain that to the user.
 */
export async function shareTicketJpeg(input: TicketImageInput): Promise<ShareOutcome> {
  const blob = await ticketImageBlob(input);
  const file = new File([blob], ticketImageFileName(input.ticketId), { type: "image/jpeg" });
  const canShareFiles =
    typeof navigator !== "undefined" &&
    typeof navigator.canShare === "function" &&
    navigator.canShare({ files: [file] });
  if (canShareFiles && navigator.share) {
    await navigator.share({ files: [file], title: input.ticketId, text: `${input.ticketId} — transport request` });
    return "shared";
  }
  await downloadTicketJpeg(input);
  return "downloaded";
}
