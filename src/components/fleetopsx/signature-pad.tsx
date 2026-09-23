import { useEffect, useRef, useState } from "react";
import { Eraser } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The mechanic's signature, captured at handoff.
 *
 * A full-width touch pad: the mechanic signs with a finger or stylus, the
 * strokes are captured as points and drawn live, and the result leaves as a
 * PNG data URL the server stores on the requisition. The pad refuses to
 * submit an empty signature — a receipt without a name is not a receipt.
 */
export function SignaturePad({
  onChange,
  className,
}: {
  onChange: (dataUrl: string | null) => void;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const data = canvas.toDataURL();
      const ratio = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(rect.width * ratio));
      canvas.height = Math.max(1, Math.floor(rect.height * ratio));
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.scale(ratio, ratio);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = "#141A1F";
      // Restore what was already signed across a re-layout.
      if (dirty && data && !data.endsWith("0000")) {
        const img = new Image();
        img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height);
        img.src = data;
      }
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [dirty]);

  const point = (event: PointerEvent | React.PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: "clientX" in event ? event.clientX - rect.left : 0,
      y: "clientY" in event ? event.clientY - rect.top : 0,
    };
  };

  const start = (event: React.PointerEvent) => {
    event.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(event.pointerId);
    drawing.current = true;
    last.current = point(event);
  };

  const move = (event: React.PointerEvent) => {
    if (!drawing.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const next = point(event);
    const from = last.current ?? next;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(next.x, next.y);
    ctx.stroke();
    last.current = next;
    if (!dirty) setDirty(true);
  };

  const stop = () => {
    drawing.current = false;
    last.current = null;
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setDirty(false);
    onChange(null);
  };

  /** Export only when there is something signed; otherwise the pad stays null. */
  const commit = () => {
    if (!dirty) return;
    const canvas = canvasRef.current;
    if (canvas) onChange(canvas.toDataURL("image/png"));
  };

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="relative">
        <canvas
          ref={canvasRef}
          className="h-[180px] w-full touch-none rounded-[6px] border border-[#1B2432] bg-white"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={() => {
            stop();
            commit();
          }}
          onPointerLeave={() => {
            stop();
            commit();
          }}
        />
        {!dirty ? (
          <span className="pointer-events-none absolute inset-0 grid place-items-center text-[13px] text-[#8E95A1]">
            Sign here with a finger or stylus
          </span>
        ) : null}
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-[0.4px] text-[#5C6470]">
          {dirty ? "Signature captured on release" : "The mechanic signs for every unit taken"}
        </span>
        <button
          type="button"
          onClick={clear}
          disabled={!dirty}
          className="flex h-8 items-center gap-1.5 rounded border border-[#1B2432] px-3 text-[13px] font-medium text-[#1B2432] disabled:opacity-40"
        >
          <Eraser className="size-4" />
          Clear
        </button>
      </div>
    </div>
  );
}
