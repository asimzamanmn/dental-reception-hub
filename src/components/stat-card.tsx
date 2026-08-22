import type { LucideIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  loading,
}: {
  label: string;
  value: string | number | null | undefined;
  hint?: string;
  icon?: LucideIcon;
  loading?: boolean;
}) {
  return (
    <div className="surface p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        {Icon ? <Icon className="h-4 w-4 text-muted-foreground" /> : null}
      </div>
      {loading ? (
        <Skeleton className="mt-3 h-7 w-20" />
      ) : (
        <p className="mt-2 text-2xl font-semibold tabular-nums">{value ?? "—"}</p>
      )}
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
