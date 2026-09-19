import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

/**
 * Shared shell for the public legal pages (Privacy Policy, Account Deletion).
 *
 * These pages sit OUTSIDE the workspace shell: no sidebar, no auth, no app chrome,
 * because they are the URLs published to app stores and to anyone asking how their
 * data is handled. They must therefore be:
 *   - reachable signed-out (they are plain content, no data fetch),
 *   - readable on a phone (one column, real text sizes, tappable links),
 *   - accessible: landmark header/main/footer, a single h1, h2 sections in order,
 *     a labelled "on this page" nav, focus-visible links and no colour-only meaning.
 */

const CONTACT_EMAIL = "privacy@craviifoods.com";
const COMPANY = "Cravii Food and Logistics Ltd";

export function LegalPage({
  title,
  subtitle,
  effective,
  appliesTo,
  children,
}: {
  title: string;
  subtitle: string;
  effective: string;
  appliesTo: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#F1F2F4] text-[#1B2432]">
      <header className="bg-[#1B2432] px-5 pt-10 pb-12 md:px-10 md:pt-14 md:pb-16">
        <div className="mx-auto flex w-full max-w-[880px] flex-col gap-5">
          <Link to="/" className="flex items-center gap-2 self-start rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">
            <span className="grid size-8 place-items-center rounded bg-[#ED351D] text-[13px] font-bold text-white">F</span>
            <span className="text-[18px] font-semibold tracking-tight text-white">
              FleetOps<span className="text-[#ED351D]">X</span>
            </span>
          </Link>
          <div className="flex flex-col gap-3">
            <h1 className="text-[32px] font-semibold leading-10 tracking-tight text-white md:text-[42px] md:leading-[52px]">
              {title}
            </h1>
            <p className="max-w-[640px] text-[15px] leading-6 text-white/70 md:text-[16px]">{subtitle}</p>
          </div>
          <dl className="flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-white/70">
            <div className="flex gap-2">
              <dt className="font-semibold text-white/90">Effective</dt>
              <dd>{effective}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="font-semibold text-white/90">Applies to</dt>
              <dd>{appliesTo}</dd>
            </div>
          </dl>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[880px] flex-col gap-6 px-5 py-8 md:px-10 md:py-12">{children}</main>

      <footer className="bg-[#1B2432] px-5 py-9 md:px-10">
        <div className="mx-auto flex w-full max-w-[880px] flex-col gap-2 text-[13px] leading-6 text-white/70">
          <p className="text-[15px] font-semibold text-white">FleetOpsX</p>
          <p>
            {COMPANY} · Maiduguri, Borno State, Nigeria
          </p>
          <p>
            Questions about your data:{" "}
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="font-medium text-white underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              {CONTACT_EMAIL}
            </a>
          </p>
          <p className="flex flex-wrap gap-x-4 gap-y-1">
            <Link to="/privacy" className="underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
              Privacy Policy
            </Link>
            <Link to="/deleteaccount" className="underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
              Account Deletion
            </Link>
          </p>
          <p className="text-[12px] uppercase tracking-[0.6px] text-white/45">
            Copyright {new Date().getFullYear()} {COMPANY}
          </p>
        </div>
      </footer>
    </div>
  );
}

/** Card that holds the document body. */
export function LegalCard({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-8 rounded-[10px] border border-[#E2E5E9] bg-white p-5 shadow-[0px_4px_16px_rgba(12,12,13,0.05)] md:p-8">
      {children}
    </div>
  );
}

export function LegalLede({ children }: { children: ReactNode }) {
  return <p className="text-[15px] leading-7 text-[#344256] md:text-[16px]">{children}</p>;
}

/** "On this page" — a real nav so screen readers can jump straight to a section. */
export function LegalToc({ items }: { items: Array<{ id: string; label: string }> }) {
  return (
    <nav aria-label="On this page" className="rounded-[8px] border border-[#E2E5E9] bg-[#F7F8FA] p-4">
      <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.6px] text-[#5C6470]">On this page</p>
      <ol className="flex flex-col gap-1.5 text-[14px]">
        {items.map((item, i) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              className="inline-flex items-baseline gap-2 rounded text-[#1B2432] underline decoration-[#C6CCD6] underline-offset-2 hover:text-[#ED351D] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ED351D]"
            >
              <span className="text-[11px] font-semibold tabular-nums text-[#5C6470]">{String(i + 1).padStart(2, "0")}</span>
              {item.label}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function LegalSection({
  id,
  number,
  heading,
  children,
}: {
  id: string;
  number: string;
  heading: string;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="flex scroll-mt-6 flex-col gap-3">
      <div className="flex items-baseline gap-3">
        <span aria-hidden className="text-[12px] font-semibold tabular-nums text-[#ED351D]">
          {number}
        </span>
        <h2 id={`${id}-heading`} className="text-[19px] font-semibold leading-7 text-[#1B2432] md:text-[21px]">
          {heading}
        </h2>
      </div>
      <div className="flex flex-col gap-3 pl-0 text-[15px] leading-7 text-[#344256] md:pl-7">{children}</div>
    </section>
  );
}

export function LegalList({ items }: { items: ReactNode[] }) {
  return (
    <ul className="flex list-disc flex-col gap-2 pl-5 marker:text-[#ED351D]">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

export function LegalCallout({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-[8px] border border-[#F5C7BF] bg-[#FCE7E4] px-4 py-3 text-[14px] leading-6 font-medium text-[#7A2314]">
      {children}
    </p>
  );
}

export function LegalTable({
  caption,
  columns,
  rows,
}: {
  caption: string;
  columns: [string, string];
  rows: Array<[string, string]>;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-[14px]">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col" className="border-b border-[#E2E5E9] py-2 pr-4 font-semibold text-[#1B2432]">
              {columns[0]}
            </th>
            <th scope="col" className="border-b border-[#E2E5E9] py-2 font-semibold text-[#1B2432]">
              {columns[1]}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([a, b]) => (
            <tr key={a}>
              <th scope="row" className="border-b border-[#EDEFF2] py-2 pr-4 align-top font-normal text-[#344256]">
                {a}
              </th>
              <td className="border-b border-[#EDEFF2] py-2 align-top text-[#344256]">{b}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function LegalSteps({ steps }: { steps: Array<{ title: string; body: ReactNode }> }) {
  return (
    <ol className="flex flex-col gap-3">
      {steps.map((step, i) => (
        <li key={step.title} className="flex gap-3 rounded-[8px] border border-[#E2E5E9] p-4">
          <span
            aria-hidden
            className="grid size-7 shrink-0 place-items-center rounded-full bg-[#ED351D] text-[13px] font-semibold text-white"
          >
            {i + 1}
          </span>
          <div className="flex flex-col gap-1">
            <h3 className="text-[16px] font-semibold text-[#1B2432]">{step.title}</h3>
            <p className="text-[15px] leading-7 text-[#344256]">{step.body}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Inline link used across the documents — one style, visible focus ring. */
export function LegalLink({ href, children }: { href: string; children: ReactNode }) {
  const className =
    "font-medium text-[#1B2432] underline decoration-[#ED351D] decoration-2 underline-offset-2 hover:text-[#ED351D] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ED351D]";
  if (href.startsWith("mailto:") || href.startsWith("http")) {
    return (
      <a href={href} className={className}>
        {children}
      </a>
    );
  }
  return (
    <Link to={href} className={className}>
      {children}
    </Link>
  );
}
