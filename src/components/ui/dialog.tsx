import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * 极简对话框：不依赖任何弹层库。
 * 打开时把焦点移入面板，Esc 关闭，Tab 在面板内循环，关闭后焦点回到原处。
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  footer,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  footer?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    panel?.querySelector<HTMLElement>("input,textarea,select,button,[href],[tabindex]")?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>("button:not([disabled]),a[href],input,select,textarea,[tabindex]:not([tabindex='-1'])"));
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      prev?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center sm:p-6">
      <div className="bg-foreground/45 absolute inset-0" role="presentation" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        className={cn(
          "relative max-h-[88vh] w-full overflow-auto rounded-xl border border-border bg-card p-5 text-card-foreground shadow-lg",
          "sm:p-6",
          className,
        )}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭对话框"
          className="absolute top-3 right-3 rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <X className="size-5" />
        </button>
        <h2 id={titleId} className="pr-10 text-lg font-semibold">
          {title}
        </h2>
        {description && (
          <p id={descId} className="text-muted-foreground mt-1.5 text-sm leading-relaxed">
            {description}
          </p>
        )}
        {children && <div className="mt-4">{children}</div>}
        {footer && <div className="mt-5 flex flex-wrap justify-end gap-3">{footer}</div>}
      </div>
    </div>
  );
}
