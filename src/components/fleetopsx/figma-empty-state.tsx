import type { ReactNode } from "react";

export function FigmaEmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <p className="text-[16px] font-medium leading-6 text-[#1B2432]">{title}</p>
      <p className="mt-1.5 max-w-[380px] text-[14px] font-normal tracking-[0.4px] text-[#5C6470]">{body}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function FigmaLoadingState({ label = "Loading" }: { label?: string }) {
  return (
    <p className="px-5 py-16 text-center text-[14px] tracking-[0.4px] text-[#5C6470]">{label}</p>
  );
}
