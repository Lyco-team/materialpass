import { useSyncExternalStore } from "react";

export const TABS = ["guide", "vault", "process", "review", "agent", "settings"] as const;
export type TabId = (typeof TABS)[number];

export type Route = { tab: TabId; arg: string | null };

function readHash(): string {
  return window.location.hash;
}

function parse(hash: string): Route {
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  const first = parts[0];
  const tab: TabId = first && (TABS as readonly string[]).includes(first) ? (first as TabId) : "guide";
  const arg = parts[1] ? decodeURIComponent(parts[1]) : null;
  return { tab, arg };
}

function subscribe(cb: () => void) {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
}

/** 当前页签与被选中的对象（材料 key / 档案分类）都写进 URL，Agent 读地址栏即可知道人在看什么。 */
export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, readHash, () => "#/guide");
  return parse(hash);
}

export function navigate(tab: TabId, arg?: string | null): void {
  window.location.hash = `#/${tab}${arg ? `/${encodeURIComponent(arg)}` : ""}`;
}
