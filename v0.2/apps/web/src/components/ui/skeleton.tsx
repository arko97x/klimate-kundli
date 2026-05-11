import { cn } from "@/lib/utils";

export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "pending-shimmer rounded-sm bg-foreground/[0.04]",
        className,
      )}
      {...props}
    />
  );
}
