import { blobDel, blobGet, blobSet, kvGet, kvSet } from "./db";
import { checkMaterial, specById, specTransform } from "./specs";
import { decryptVault, encryptJson } from "./crypto";
import { process, probe } from "./imaging";
import type { Transform } from "./imaging";
import type { Finding, StoredMaterial, SubmissionDraft, VaultProfile } from "./types";

export type Settings = {
  aiBase: string;
  aiModel: string;
  aiKey: string;
  aiEnabled: boolean;
};

export type State = {
  ready: boolean;
  profile: VaultProfile;
  materials: StoredMaterial[];
  drafts: SubmissionDraft[];
  settings: Settings;
  lastReport: { findings: Finding[]; aiNotes: string[]; at: number } | null;
};

const DEFAULT_PROFILE: VaultProfile = {
  name: "默认档案",
  categories: {
    personal: {},
    company: {},
    legal_rep: {},
    finance: {},
    contact: {},
  },
  attachments: {},
};

const DEFAULT_SETTINGS: Settings = {
  aiBase: "https://api.lain42.top/v1",
  aiModel: "qwen3-max",
  aiKey: "",
  aiEnabled: false,
};

export const state: State = {
  ready: false,
  profile: structuredClone(DEFAULT_PROFILE),
  materials: [],
  drafts: [],
  settings: { ...DEFAULT_SETTINGS },
  lastReport: null,
};

type Listener = () => void;
const listeners = new Set<Listener>();
let version = 0;

export function subscribe(fn: Listener) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function getVersion() {
  return version;
}
function emit() {
  version++;
  for (const l of listeners) l();
}
export function touch() {
  emit();
  void persist();
}

async function persist() {
  const { profile, materials, drafts, settings } = state;
  await Promise.all([
    kvSet("profile", profile),
    kvSet("materials", materials),
    kvSet("drafts", drafts),
    kvSet("settings", settings),
  ]);
}

export async function init() {
  const [profile, materials, drafts, settings] = await Promise.all([
    kvGet<VaultProfile>("profile"),
    kvGet<StoredMaterial[]>("materials"),
    kvGet<SubmissionDraft[]>("drafts"),
    kvGet<Settings>("settings"),
  ]);
  if (profile) state.profile = { ...DEFAULT_PROFILE, ...profile };
  if (materials) state.materials = materials;
  if (drafts) state.drafts = drafts;
  if (settings) state.settings = { ...DEFAULT_SETTINGS, ...settings };
  state.ready = true;
  touch();
}

/* ────────────── 档案 / 资料库 ────────────── */

export function setProfileName(name: string) {
  state.profile.name = name || "默认档案";
  syncAttachments();
  touch();
}

export function setField(category: string, key: string, value: string) {
  state.profile.categories[category] ??= {};
  state.profile.categories[category][key] = value;
  touch();
}

export function removeField(category: string, key: string) {
  delete state.profile.categories?.[category]?.[key];
  touch();
}

function syncAttachments() {
  for (const m of state.materials) {
    state.profile.attachments[m.key] = {
      category: m.category,
      label: m.label,
      path: m.fileName,
      mime_hint: m.mime,
    };
  }
}

/* ────────────── 材料：保管 ────────────── */

export async function addMaterial(input: {
  file: File;
  category?: string;
  label?: string;
  specId?: string;
  expiry?: string;
}): Promise<StoredMaterial> {
  const key = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const dims = await probe(input.file);
  const m: StoredMaterial = {
    key,
    category: input.category || "证照",
    label: input.label || input.file.name.replace(/\.[^.]+$/, ""),
    fileName: input.file.name,
    mime: input.file.type || "application/octet-stream",
    bytes: input.file.size,
    width: dims.width,
    height: dims.height,
    specId: input.specId,
    expiry: input.expiry,
    addedUnix: Date.now(),
    operations: [],
    findings: [],
  };
  m.findings = checkMaterial(m, specById(m.specId));
  await blobSet(key, input.file);
  state.materials = [m, ...state.materials];
  syncAttachments();
  touch();
  return m;
}

export async function updateMaterial(key: string, patch: Partial<StoredMaterial>) {
  const m = state.materials.find((x) => x.key === key);
  if (!m) throw new Error(`找不到材料 ${key}`);
  Object.assign(m, patch);
  m.findings = checkMaterial(m, specById(m.specId));
  touch();
}

export async function removeMaterial(key: string) {
  state.materials = state.materials.filter((m) => m.key !== key);
  delete state.profile.attachments[key];
  await blobDel(key);
  touch();
}

export async function getMaterialBlob(key: string) {
  return blobGet(key);
}

/** 处理：旋转 / 裁剪 / 缩放 / 压缩 / 转格式，结果覆盖原件并留操作痕迹 */
export async function processMaterial(key: string, t: Transform) {
  const m = state.materials.find((x) => x.key === key);
  if (!m) throw new Error(`找不到材料 ${key}`);
  const src = await blobGet(key);
  if (!src) throw new Error("材料二进制已丢失，请重新上传");
  if (!m.mime.startsWith("image/")) throw new Error("目前只有图片支持自动处理，PDF 请用系统自带工具");

  const out = await process(src, t);
  await blobSet(key, out.blob);
  m.bytes = out.blob.size;
  m.width = out.width;
  m.height = out.height;
  m.mime = out.mime;
  m.fileName = m.fileName.replace(/\.[^.]+$/, "") + suffixOf(out.mime);
  m.operations = [...m.operations, ...out.log];
  m.findings = checkMaterial(m, specById(m.specId));
  touch();
  return out;
}

function suffixOf(mime: string) {
  return mime === "image/png" ? ".png" : mime === "image/webp" ? ".webp" : ".jpg";
}

/** 一键对齐规格：按规格目标像素与体积上限做处理 */
export async function alignToSpec(key: string) {
  const m = state.materials.find((x) => x.key === key);
  const spec = specById(m?.specId);
  if (!m || !spec) throw new Error("该材料未设定目标规格");
  return processMaterial(key, specTransform(m, spec));
}

/* ────────────── 草稿与人类复核闸门 ────────────── */

export function createDraft(input: { base_url?: string; session?: string } = {}): SubmissionDraft {
  const args: Record<string, unknown> = {};
  const notes: string[] = [];
  for (const [cat, fields] of Object.entries(state.profile.categories)) {
    for (const [k, v] of Object.entries(fields)) {
      if (v) args[k] = v;
      else notes.push(`字段 ${cat}.${k} 为空，需要补`);
    }
  }
  const missing = state.materials.filter((m) => m.findings.some((f) => f.level === "error")).map((m) => m.label);
  const draft: SubmissionDraft = {
    id: `draft-${Date.now().toString(36)}`,
    created_unix: Math.floor(Date.now() / 1000),
    status: "pending_review",
    profile: state.profile.name,
    session: input.session || "default",
    base_url: input.base_url || "about:blank",
    args,
    mapping_notes: notes,
    missing_required: missing,
    reviewer_note: null,
  };
  state.drafts = [draft, ...state.drafts];
  touch();
  return draft;
}

export function patchDraftArg(id: string, field: string, value: unknown) {
  const d = state.drafts.find((x) => x.id === id);
  if (!d) throw new Error(`找不到草稿 ${id}`);
  if (d.status === "submitted") throw new Error("草稿已提交，不可修改");
  d.args[field] = value;
  // 改动后必须重新人工复核，这是闸门的核心语义
  d.status = "pending_review";
  touch();
  return d;
}

/**
 * 状态流转。approved 代表人类已签字：
 * Agent 可以调用，但必须显式带 `byHuman: true`，否则拒绝——避免 AI 自己批自己的材料。
 */
export function setDraftStatus(id: string, status: SubmissionDraft["status"], opts: { note?: string; byHuman?: boolean } = {}) {
  const d = state.drafts.find((x) => x.id === id);
  if (!d) throw new Error(`找不到草稿 ${id}`);
  if (status === "approved" && !opts.byHuman) {
    throw new Error("复核闸门：批准必须由人类操作（invoke 时需带 byHuman: true）");
  }
  d.status = status;
  d.reviewer_note = opts.note ?? d.reviewer_note ?? null;
  d.reviewed_unix = Math.floor(Date.now() / 1000);
  touch();
  return d;
}

/** 导出包：只有 approved 的草稿才会被打包，页面绝不代替人提交 */
export function exportDraft(id: string) {
  const d = state.drafts.find((x) => x.id === id);
  if (!d) throw new Error(`找不到草稿 ${id}`);
  if (d.status !== "approved") throw new Error("草稿尚未通过人工复核，不能导出提交包");
  const files = state.materials.map((m) => ({
    key: m.key,
    category: m.category,
    label: m.label,
    path: m.fileName,
    mime: m.mime,
    bytes: m.bytes,
  }));
  return JSON.stringify({ ...d, attachments: files, exported_unix: Math.floor(Date.now() / 1000) }, null, 2);
}

/** lweb2cli 互通格式：导出后可直接 lweb2cli vault --op import --profile <名> --file <json> */
export function exportVaultInteropJson() {
  syncAttachments();
  return JSON.stringify(state.profile, null, 2);
}

export async function exportEncryptedVault(password: string) {
  const materials: Record<string, string> = {};
  for (const m of state.materials) {
    const blob = await blobGet(m.key);
    if (!blob) continue;
    materials[m.key] = btoa(String.fromCharCode(...new Uint8Array(await blob.arrayBuffer())));
  }
  return encryptJson({ profile: state.profile, meta: state.materials, materials, at: Date.now() }, password);
}

export type VaultBundle = {
  profile: VaultProfile;
  meta: StoredMaterial[];
  materials: Record<string, string>;
};

export async function importEncryptedVault(text: string, password: string) {
  const bundle = await decryptVault<VaultBundle>(text, password);
  for (const [key, b64] of Object.entries(bundle.materials ?? {})) {
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    await blobSet(key, new Blob([bin as unknown as BlobPart], { type: "application/octet-stream" }));
  }
  state.profile = bundle.profile;
  state.materials = bundle.meta ?? [];
  touch();
  return state.materials.length;
}

/* ────────────── 预审 ────────────── */

export function rulePrecheck(): Finding[] {
  const out: Finding[] = [];
  for (const m of state.materials) {
    if (!m.specId) {
      out.push({ level: "warn", code: "no_spec", message: `「${m.label}」未设定目标规格，无法判断是否合规`, target: m.key });
      continue;
    }
    out.push(...m.findings.map((f) => ({ ...f, target: m.key, message: `[${m.label}] ${f.message}` })));
  }
  for (const [cat, fields] of Object.entries(state.profile.categories)) {
    const empties = Object.entries(fields).filter(([, v]) => !v).map(([k]) => k);
    if (empties.length) {
      out.push({
        level: "warn",
        code: "empty_fields",
        message: `${cat} 分类下有 ${empties.length} 个空字段：${empties.join(", ")}`,
        target: `categories.${cat}`,
      });
    }
  }
  return out;
}

export function setSettings(patch: Partial<Settings>) {
  state.settings = { ...state.settings, ...patch };
  touch();
}
