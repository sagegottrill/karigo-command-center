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
    <header className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4 lg:flex lg:justify-between">
      <div className="min-w-0">
        <h1 className="truncate text-[28px] leading-[1.08] font-semibold tracking-[-0.035em] text-foreground sm:text-[34px]">
          {title}
        </h1>
        {description && (
          <p className="mt-1.5 max-w-2xl text-[14px] leading-[1.45] text-muted-foreground sm:text-[15px]">{description}</p>
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
  meta,
  children,
  className,
  bodyClassName,
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  meta?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-[24px] border border-black/[0.05] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03),0_12px_32px_rgba(0,0,0,0.04)]",
        className,
      )}
    >
      {(title || actions || meta) && (
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-black/[0.05] px-5 py-4">
          <div className="min-w-0">
            {title && (
              <h2 className="truncate text-[16px] font-semibold tracking-[-0.02em] text-foreground">
                {title}
              </h2>
            )}
            {description && (
              <p className="mt-0.5 truncate text-[12px] leading-snug text-muted-foreground">{description}</p>
            )}
            {meta && <div className="mt-2">{meta}</div>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cn("p-5", bodyClassName)}>{children}</div>
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
    <div className="flex flex-col items-center justify-center gap-2 rounded-[22px] border border-dashed border-black/10 bg-black/[0.015] px-6 py-16 text-center">
      <p className="text-[15px] font-semibold tracking-[-0.015em] text-foreground">{title}</p>
      <p className="max-w-sm text-[13px] leading-relaxed text-muted-foreground">{description}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function FieldRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-black/[0.04] py-2.5 last:border-0">
      <span className="text-[13px] text-muted-foreground">{label}</span>
      <span className="num truncate text-right text-[13px] font-medium text-foreground">{value}</span>
    </div>
  );
}
