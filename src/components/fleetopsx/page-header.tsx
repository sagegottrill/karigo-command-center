import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
  meta,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <header className="flex flex-col lg:flex-row lg:items-end justify-between gap-[16px] mb-[24px]">
      <div className="min-w-0">
        <h1 className="text-[28px] font-[600] leading-[36px] text-[#141a1f] mb-[8px]">
          {title}
        </h1>
        {description && (
          <p className="text-[12px] font-[500] leading-[14.52px] tracking-[0.05em] text-[#8e95a1] uppercase">{description}</p>
        )}
        {meta && <div className="mt-3 flex flex-wrap items-center gap-2">{meta}</div>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2.5 pb-0.5">{actions}</div>}
    </header>
  );
}

export function SectionPanel({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      className={cn(
        "flex flex-col rounded-[10px] border-[1px] border-[#e2e5e9] bg-[#ffffff] shadow-[0px_4px_24px_rgba(0,0,0,0.04)] overflow-hidden",
        className,
      )}
    >
      {(title || actions) && (
        <div className="flex flex-row items-center justify-between gap-3 border-b border-[#e2e5e9] px-[24px] py-[16px]">
          <div className="min-w-0">
            {title && (
              <h2 className="text-[18px] font-[600] text-[#141a1f]">
                {title}
              </h2>
            )}
            {description && (
              <p className="mt-0.5 truncate text-[12px] font-[500] tracking-[0.05em] text-[#8e95a1] uppercase">{description}</p>
            )}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cn("p-[24px]", bodyClassName)}>{children}</div>
    </section>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-[8px] rounded-[10px] border border-dashed border-[#e2e5e9] bg-[#f6f7f9] px-6 py-16 text-center">
      <p className="text-[16px] font-[600] text-[#141a1f]">{title}</p>
      <p className="max-w-sm text-[14px] font-[400] text-[#5c6470]">{description}</p>
      {action && <div className="mt-[12px]">{action}</div>}
    </div>
  );
}

export function FieldRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-row items-center justify-between gap-3 border-b border-[#e2e5e9] py-[12px] last:border-0">
      <span className="text-[14px] font-[500] text-[#5c6470]">{label}</span>
      <span className="num truncate text-right text-[14px] font-[600] text-[#141a1f]">{value}</span>
    </div>
  );
}
