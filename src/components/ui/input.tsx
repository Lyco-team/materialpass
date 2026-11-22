import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/** 面向办事窗口的高对比输入框：字号不小于 16px，避免移动端聚焦时页面缩放。 */
export function Input({ className, type, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  if (type === "file") {
    return (
      <input
        type="file"
        aria-label={props["aria-label"] ?? "选择文件"}
        className={cn(
          "h-11 w-full cursor-pointer rounded-lg border border-dashed border-input bg-muted/40 px-3 text-sm",
          "file:mr-3 file:h-8 file:cursor-pointer file:rounded-md file:border-0 file:bg-primary file:px-3 file:font-medium",
          "file:text-primary-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          className,
        )}
        {...props}
      />
    );
  }
  return (
    <input
      type={type}
      className={cn(
        "h-11 w-full min-w-0 rounded-lg border border-input bg-background px-3 py-2 text-base",
        "shadow-xs transition-colors placeholder:text-muted-foreground/80",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "read-only:bg-muted/60",
        type === "number" && "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
        className,
      )}
      {...props}
    />
  );
}
