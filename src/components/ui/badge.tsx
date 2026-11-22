import type { HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
  {
    variants: {
      variant: {
        default: "border-primary/30 bg-primary/10 text-primary",
        secondary: "border-border bg-secondary text-secondary-foreground",
        outline: "border-border bg-transparent text-muted-foreground",
        brand: "border-transparent bg-primary text-primary-foreground",
        error: "border-destructive/40 bg-destructive/12 text-destructive",
        warn: "border-amber-500/45 bg-amber-500/14 text-amber-700 dark:text-amber-300",
        ok: "border-emerald-600/35 bg-emerald-600/12 text-emerald-700 dark:text-emerald-300",
      },
    },
    defaultVariants: { variant: "secondary" },
  },
);

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
