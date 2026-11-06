import { StateMessage } from "@/components/ui";

export function Denied() {
  return <StateMessage kind="forbidden" body="Your admin role doesn't include this area. Ask a Super Admin if you need access." />;
}

/** Simple, accessible data table wrapper (horizontal scroll inside the card on small screens). */
export function Table({ head, children, caption }: { head: string[]; children: React.ReactNode; caption?: string }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-surface">
      <table className="w-full min-w-[640px] text-left text-sm">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead className="bg-surface-muted text-xs uppercase tracking-wide text-muted">
          <tr>{head.map((h) => <th key={h} scope="col" className="px-4 py-2.5 font-semibold">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
    </div>
  );
}
