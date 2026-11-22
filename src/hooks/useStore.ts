import { useSyncExternalStore } from "react";
import { getVersion, state, subscribe } from "@/lib/store";
import type { State } from "@/lib/store";

/** 全站唯一的订阅入口：UI 不复制状态，只读 store 的同一份对象。 */
export function useStoreVersion(): number {
  return useSyncExternalStore(subscribe, getVersion, getVersion);
}

export function useStore(): State {
  useStoreVersion();
  return state;
}
