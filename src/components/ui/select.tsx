import type { SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/** 原生 select：不引入任何弹层库，键盘与读屏行为由浏览器保证，对老年用户和 Agent 都最稳。 */
export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className={cn("relative w-full", className)}>
      <select
        className={cn(
          "h-11 w-full cursor-pointer appearance-none rounded-lg border border-input bg-background pr-9 pl-3 text-base shadow-xs",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          "disabled:cursor-not-allowed disabled:opacity-50",
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 opacity-60" />
    </div>
  );
}
