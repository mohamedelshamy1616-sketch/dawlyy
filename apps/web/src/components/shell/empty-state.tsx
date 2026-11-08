import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  Icon: LucideIcon;
  title: string;
  description?: string;
  /** Optional button or link below the text. */
  action?: React.ReactNode;
  className?: string;
};

/** A branded "nothing here yet" block: tinted icon badge, one line of title, one of explanation. */
export function EmptyState({ Icon, title, description, action, className }: Props) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-2xl border border-dashed border-brand/30 bg-brand-soft/40 px-6 py-10 text-center",
        className,
      )}
    >
      <span
        aria-hidden
        className="grid size-14 place-items-center rounded-2xl bg-brand-soft text-brand"
      >
        <Icon className="size-7" />
      </span>
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      {description ? (
        <p className="max-w-sm text-sm leading-relaxed text-foreground/75">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
