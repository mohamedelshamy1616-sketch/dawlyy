/** The h1 of a page with an optional one-line subtitle. Every page has exactly one. */
export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex flex-col gap-1 text-start">
      <h1 className="text-2xl font-bold tracking-tight text-foreground rtl:tracking-normal">{title}</h1>
      {subtitle ? <p className="text-sm text-foreground/75">{subtitle}</p> : null}
    </div>
  );
}
