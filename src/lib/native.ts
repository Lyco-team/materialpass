import { precheck } from "./ai";
import { fmt, SPECS } from "./specs";
import * as store from "./store";
import type { Transform } from "./imaging";

/**
 * lilyco AI 原生协议层（lilyco-native-web/1）
 *
 * 两条通道对等：人类点按钮，Agent 调 invoke()，走的是同一套 action 与同一条校验链。
 * 因此页面不是「给 Agent 截图猜坐标」的黑盒，而是有稳定语义路径的可编程界面。
 */

export type ActionDef = {
  name: string;
  desc: string;
  params: Record<string, string>;
  writes: boolean;
  needsHuman?: boolean;
};

export const ACTIONS: ActionDef[] = [
  { name: "snapshot", desc: "读取当前档案/材料/草稿的编号视图（纯文本，省 token）", params: {}, writes: false },
  { name: "precheck", desc: "跑规则 + AI 预审，返回问题清单", params: {}, writes: false },
  {
    name: "set_field",
    desc: "设置档案字段",
    params: { category: "string", key: "string", value: "string" },
    writes: true,
  },
  {
    name: "align_spec",
    desc: "把材料一键处理成目标规格（裁剪+缩放+压缩）",
    params: { key: "材料 key" },
    writes: true,
  },
  {
    name: "process",
    desc: "手动处理材料：rotate/crop/width/height/maxBytes/mime/whiteBg",
    params: { key: "材料 key", transform: "Transform" },
    writes: true,
  },
  { name: "set_expiry", desc: "登记材料有效期 YYYY-MM-DD", params: { key: "材料 key", expiry: "date" }, writes: true },
  { name: "set_spec", desc: "为材料指定目标规格 id", params: { key: "材料 key", specId: "string" }, writes: true },
  { name: "create_draft", desc: "由档案与材料生成待审草稿", params: { base_url: "string?", session: "string?" }, writes: true },
  { name: "patch_arg", desc: "修改草稿字段（会使草稿回到待审）", params: { id: "draft id", field: "string", value: "any" }, writes: true },
  {
    name: "approve",
    desc: "人工复核批准。必须带 byHuman:true，Agent 不得自批",
    params: { id: "draft id", note: "string", byHuman: "true" },
    writes: true,
    needsHuman: true,
  },
  { name: "reject", desc: "退回草稿", params: { id: "draft id", note: "string" }, writes: true },
  { name: "export_draft", desc: "导出提交包 JSON（仅 approved 可导）", params: { id: "draft id" }, writes: false },
  { name: "export_vault_lweb2cli", desc: "导出 lweb2cli 互通资料库 JSON", params: {}, writes: false },
  { name: "list_specs", desc: "列出可用规格", params: {}, writes: false },
];

export type Bridge = {
  protocol: "lilyco-native-web/1";
  actions: ActionDef[];
  invoke: (name: string, params?: Record<string, unknown>) => Promise<unknown>;
  paths: () => string[];
  ambiguous: () => Record<string, number>;
};

function snapshotText(): string {
  const lines: string[] = [];
  lines.push(`档案：${store.state.profile.name}（材料 ${store.state.materials.length} 份，草稿 ${store.state.drafts.length} 个）`);
  lines.push("");
  lines.push("[材料]");
  store.state.materials.forEach((m, i) => {
    const bad = m.findings.filter((f) => f.level !== "ok").length;
    lines.push(
      `[${i + 1}] key=${m.key} ${m.label} | ${fmt(m.bytes)} ${m.width ? `${m.width}x${m.height}` : ""} | 规格=${m.specId ?? "未设"} | 有效期=${m.expiry ?? "未登记"}${bad ? ` | ⚠${bad} 项待修` : " | ✓"}`,
    );
  });
  lines.push("");
  lines.push("[草稿]");
  store.state.drafts.forEach((d, i) => {
    lines.push(`[${i + 1}] ${d.id} status=${d.status} 缺漏=${d.missing_required.length ? d.missing_required.join(",") : "无"}`);
  });
  return lines.join("\n");
}

export async function invoke(name: string, params: Record<string, unknown> = {}): Promise<unknown> {
  switch (name) {
    case "snapshot":
      return { ok: true, text: snapshotText() };
    case "list_specs":
      return { ok: true, specs: SPECS.map((s) => ({ id: s.id, label: s.label, group: s.group, mime: s.mime, maxBytes: s.maxBytes, px: s.px })) };
    case "precheck": {
      const r = await precheck();
      store.state.lastReport = { findings: r.findings, aiNotes: r.aiNotes, at: r.at };
      store.touch();
      return { ok: true, errors: r.findings.filter((f) => f.level === "error"), warns: r.findings.filter((f) => f.level === "warn"), usedAi: r.usedAi };
    }
    case "set_field": {
      store.setField(String(params.category), String(params.key), String(params.value));
      return { ok: true };
    }
    case "align_spec":
      return { ok: true, result: await store.alignToSpec(String(params.key)) };
    case "process":
      return { ok: true, result: await store.processMaterial(String(params.key), params.transform as Transform) };
    case "set_expiry":
      await store.updateMaterial(String(params.key), { expiry: String(params.expiry) });
      return { ok: true };
    case "set_spec":
      await store.updateMaterial(String(params.key), { specId: String(params.specId) });
      return { ok: true };
    case "create_draft":
      return { ok: true, draft: store.createDraft({ base_url: params.base_url as string, session: params.session as string }) };
    case "patch_arg":
      return { ok: true, draft: store.patchDraftArg(String(params.id), String(params.field), params.value) };
    case "approve":
      return { ok: true, draft: store.setDraftStatus(String(params.id), "approved", { note: params.note as string, byHuman: params.byHuman === true }) };
    case "reject":
      return { ok: true, draft: store.setDraftStatus(String(params.id), "rejected", { note: params.note as string }) };
    case "export_draft":
      return { ok: true, json: store.exportDraft(String(params.id)) };
    case "export_vault_lweb2cli":
      return { ok: true, json: store.exportVaultInteropJson() };
    default:
      throw new Error(`未知 action：${name}。可用：${ACTIONS.map((a) => a.name).join(", ")}`);
  }
}

export function semanticPaths(): string[] {
  return Array.from(new Set(Array.from(document.querySelectorAll("[data-mp-path]")).map((el) => el.getAttribute("data-mp-path") as string)));
}

/**
 * 语义路径必须一对一命中。响应式布局里重复渲染的控件如果共用同一路径，
 * Agent 就会拿到两个候选而定位失败——所以把歧义地址显式暴露出来。
 */
export function ambiguousPaths(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const el of document.querySelectorAll("[data-mp-path]")) {
    const p = el.getAttribute("data-mp-path") as string;
    counts[p] = (counts[p] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).filter(([, n]) => n > 1));
}

export function installBridge() {
  const bridge: Bridge = {
    protocol: "lilyco-native-web/1",
    actions: ACTIONS,
    invoke,
    paths: semanticPaths,
    ambiguous: ambiguousPaths,
  };
  (window as unknown as { __materialpass: Bridge }).__materialpass = bridge;
  document.dispatchEvent(new CustomEvent("materialpass:ready", { detail: bridge }));
  return bridge;
}
