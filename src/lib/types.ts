/** VaultProfile 与 lilyco-web2cli 的 Rust 结构逐字段一致（已实测导入）；SubmissionDraft 对齐字段命名与 status 取值，CLI 侧带 command 的填报草稿由 prepare-submit 生成。 */

export type AttachmentEntry = {
  category: string;
  label: string;
  /** 逻辑文件名；lweb2cli 侧解析为本地路径，浏览器侧作为 IndexedDB blob 的展示名 */
  path: string;
  mime_hint?: string | null;
};

export type VaultProfile = {
  name: string;
  categories: Record<string, Record<string, string>>;
  attachments: Record<string, AttachmentEntry>;
};

export type DraftStatus = "pending_review" | "approved" | "rejected" | "submitted";

export type SubmissionDraft = {
  id: string;
  created_unix: number;
  status: DraftStatus;
  profile: string;
  session: string;
  base_url: string;
  args: Record<string, unknown>;
  mapping_notes: string[];
  missing_required: string[];
  reviewer_note?: string | null;
  reviewed_unix?: number | null;
  receipt?: unknown | null;
};

export type FindingLevel = "error" | "warn" | "ok";

export type Finding = {
  level: FindingLevel;
  code: string;
  message: string;
  /** 影响的字段或附件 key，Agent 可据此定位到 data-mp-path */
  target: string;
};

/** 材料规格：政务/日常场景的常见要求，全部可在「规格」页覆盖，不是不可质疑的硬编码 */
export type MaterialSpec = {
  id: string;
  label: string;
  group: string;
  mime: string[];
  maxBytes?: number;
  minBytes?: number;
  /** 期望像素尺寸（允许 ratioTolerance 偏差） */
  px?: { w: number; h: number };
  ratioTolerance?: number;
  /** 需要有效期字段（如身份证、体检报告） */
  needsExpiry?: boolean;
  note?: string;
};

export type StoredMaterial = {
  key: string;
  category: string;
  label: string;
  fileName: string;
  mime: string;
  bytes: number;
  width?: number;
  height?: number;
  specId?: string;
  expiry?: string;
  addedUnix: number;
  /** 处理历史（压缩/缩放/旋转/裁剪） */
  operations: string[];
  findings: Finding[];
};

export const KB = 1024;
export const MB = 1024 * KB;
