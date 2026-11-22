import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** 带真实 <label> 的表单行：读屏能念出字段名，纯键盘可逐项走完。 */
export function Field({
  label,
  htmlFor,
  hint,
  required,
  className,
  children,
}: {
  label: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  required?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-sm font-medium text-foreground">
        {label}
        {required && <span className="text-destructive"> （必填）</span>}
      </label>
      {children}
      {hint && <p className="text-muted-foreground text-xs leading-relaxed">{hint}</p>}
    </div>
  );
}

export function FieldRow({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("grid gap-3 sm:grid-cols-2 lg:grid-cols-3", className)}>{children}</div>;
}
