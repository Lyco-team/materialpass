import type { DraftStatus, FindingLevel } from "@/lib/types";

/** 页面统一用「中文说法」呈现 store 里的英文标识，Agent 侧仍然只用原始 id。 */

export const CATEGORY_LABELS: Record<string, string> = {
  personal: "个人信息",
  company: "单位 / 企业",
  legal_rep: "法定代表人",
  finance: "财务 / 银行",
  contact: "联系方式",
  证照: "证照类",
  证件照: "证件照类",
  证明: "证明类",
};

export const CATEGORY_ORDER = ["personal", "company", "legal_rep", "finance", "contact"];

export const FIELD_LABELS: Record<string, string> = {
  name: "姓名",
  id_card: "身份证号",
  phone: "手机号",
  address: "住址",
  email: "邮箱",
  company_name: "单位名称",
  credit_code: "统一社会信用代码",
  legal_rep_name: "法定代表人姓名",
  bank_name: "开户银行",
  bank_account: "银行账号",
  account_name: "账户名",
  姓名: "姓名",
  证件号: "证件号",
};

export const MATERIAL_CATEGORIES = ["证照", "证件照", "证明", "其他"];

export function categoryLabel(cat: string): string {
  return CATEGORY_LABELS[cat] ?? cat;
}

export function fieldLabel(key: string): string {
  return FIELD_LABELS[key] ?? key;
}

export const STATUS_META: Record<DraftStatus, { label: string; hint: string }> = {
  pending_review: { label: "待人工复核", hint: "还没有人签字，不能导出提交包" },
  approved: { label: "已批准", hint: "人类已签字，可以导出提交包" },
  rejected: { label: "已退回", hint: "复核未通过，改完字段会重新回到待审" },
  submitted: { label: "已提交", hint: "草稿已锁定，不可再修改" },
};

export const LEVEL_META: Record<FindingLevel, { label: string; tone: "error" | "warn" | "ok" }> = {
  error: { label: "错误", tone: "error" },
  warn: { label: "提醒", tone: "warn" },
  ok: { label: "通过", tone: "ok" },
};

export const CODE_LABELS: Record<string, string> = {
  mime: "格式",
  oversize: "体积过大",
  undersize: "体积偏小",
  pixels: "像素尺寸",
  expiry_missing: "有效期未登记",
  expiry_passed: "证件已过期",
  expiry_soon: "有效期将至",
  no_spec: "未设规格",
  empty_fields: "空字段",
  ai: "AI 审查",
};

export function codeLabel(code: string): string {
  return CODE_LABELS[code] ?? code;
}

export function mimeShort(mime: string): string {
  if (mime.includes("jpeg") || mime.includes("jpg")) return "JPG";
  if (mime.includes("png")) return "PNG";
  if (mime.includes("webp")) return "WebP";
  if (mime.includes("pdf")) return "PDF";
  return mime.replace("image/", "").toUpperCase() || "未知";
}

export function shortDate(unixMsOrSec: number): string {
  const ms = unixMsOrSec > 1e11 ? unixMsOrSec : unixMsOrSec * 1000;
  return new Date(ms).toLocaleString("zh-CN", { hour12: false });
}

export function todayValue(): string {
  return new Date().toISOString().slice(0, 10);
}
