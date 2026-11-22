import { useEffect, useSyncExternalStore } from "react";

export type Theme = "light" | "dark";

const KEY = "materialpass:theme";
const listeners = new Set<() => void>();

function read(): Theme {
  const saved = localStorage.getItem(KEY);
  if (saved === "dark" || saved === "light") return saved;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

let current: Theme | null = null;

function snapshot(): Theme {
  if (current === null) current = read();
  return current;
}

function toggle(): void {
  current = snapshot() === "dark" ? "light" : "dark";
  try {
    localStorage.setItem(KEY, current);
  } catch {
    /* 隐私模式下写不了 localStorage，只在本次会话里保持主题 */
  }
  for (const l of listeners) l();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** 主题不属于业务状态，但也要一处切换、顶栏和 Toaster 同时生效，所以做成同一个外部 store。 */
export function useTheme(): { theme: Theme; toggleTheme: () => void } {
  const theme = useSyncExternalStore(subscribe, snapshot, () => "light" as Theme);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);
  return { theme, toggleTheme: toggle };
}
