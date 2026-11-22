import { KB, MB, type Finding, type MaterialSpec } from "./types";
import type { Transform } from "./imaging";

/**
 * 常见政务/办事材料要求。数值取自各地高频公示的报名照与证照规格，
 * 站点差异很大，所以每一项都可编辑覆盖，校验时只报「与你设定的规格不符」，不假装官方标准。
 */
export const SPECS: MaterialSpec[] = [
  {
    id: "id_card",
    label: "身份证正反面（扫描件）",
    group: "证照",
    mime: ["image/jpeg", "image/png", "application/pdf"],
    maxBytes: 2 * MB,
    minBytes: 40 * KB,
    needsExpiry: true,
    note: "四角完整、无反光遮挡；很多系统要求单文件 ≤2MB",
  },
  {
    id: "photo_1in",
    label: "一寸证件照",
    group: "证件照",
    mime: ["image/jpeg"],
    maxBytes: 500 * KB,
    px: { w: 295, h: 413 },
    ratioTolerance: 0.04,
    note: "25×35mm @300dpi ≈ 295×413px，白底",
  },
  {
    id: "photo_2in",
    label: "二寸证件照",
    group: "证件照",
    mime: ["image/jpeg"],
    maxBytes: 1 * MB,
    px: { w: 413, h: 579 },
    ratioTolerance: 0.04,
    note: "35×49mm @300dpi ≈ 413×579px",
  },
  {
    id: "photo_web",
    label: "网页上传小照（≤100KB）",
    group: "证件照",
    mime: ["image/jpeg"],
    maxBytes: 100 * KB,
    note: "老系统常见硬限制，超了直接报「文件过大」",
  },
  {
    id: "license",
    label: "营业执照 / 登记证书",
    group: "证照",
    mime: ["image/jpeg", "image/png", "application/pdf"],
    maxBytes: 5 * MB,
    needsExpiry: true,
  },
  {
    id: "bank_proof",
    label: "银行流水 / 缴费证明",
    group: "证明",
    mime: ["application/pdf", "image/jpeg", "image/png"],
    maxBytes: 10 * MB,
  },
  {
    id: "med_report",
    label: "体检报告 / 医疗健康材料",
    group: "证明",
    mime: ["application/pdf", "image/jpeg", "image/png"],
    maxBytes: 5 * MB,
    needsExpiry: true,
  },
  {
    id: "house_contract",
    label: "房产证 / 租赁合同",
    group: "证明",
    mime: ["application/pdf", "image/jpeg", "image/png"],
    maxBytes: 10 * MB,
  },
  {
    id: "diploma",
    label: "学历证书 / 成绩单",
    group: "证明",
    mime: ["application/pdf", "image/jpeg", "image/png"],
    maxBytes: 5 * MB,
  },
];

export function specById(id?: string): MaterialSpec | undefined {
  return id ? SPECS.find((s) => s.id === id) : undefined;
}

/**
 * 规格 → 处理参数：比例不符先按目标比例居中裁切，再缩放到目标像素。
 * 「一键对齐」和处理页的实时预览共用这一份，两边结果必须一致。
 */
export function specTransform(m: { mime: string; bytes: number; width?: number; height?: number }, spec: MaterialSpec): Transform {
  const t: Transform = { mime: spec.mime.includes("image/png") ? "image/png" : "image/jpeg" };
  if (spec.px) {
    const err = m.width && m.height ? Math.abs(m.width / m.height - spec.px.w / spec.px.h) / (spec.px.w / spec.px.h) : 1;
    if (err > (spec.ratioTolerance ?? 0.02) && m.width && m.height) {
      // 比例不对 → 以目标比例居中裁切
      const tr = spec.px.w / spec.px.h;
      const cw = m.height * tr > m.width ? m.width : m.height * tr;
      const ch = cw / tr;
      t.crop = { x: Math.round((m.width - cw) / 2), y: Math.round((m.height - ch) / 2), w: Math.round(cw), h: Math.round(ch) };
    }
    t.width = spec.px.w;
    t.height = spec.px.h;
  }
  if (spec.maxBytes) t.maxBytes = spec.maxBytes;
  return t;
}

export type MaterialLike = {
  fileName: string;
  mime: string;
  bytes: number;
  width?: number;
  height?: number;
  expiry?: string;
};

/** 确定性规则引擎：不联网也能跑，AI 只在它之上补充语义审查 */
export function checkMaterial(m: MaterialLike, spec?: MaterialSpec): Finding[] {
  const out: Finding[] = [];
  if (!spec) return out;

  if (spec.mime.length && !spec.mime.includes(m.mime)) {
    out.push({
      level: "error",
      code: "mime",
      message: `格式不符：要求 ${spec.mime.join(" / ")}，实际 ${m.mime || "未知"}`,
      target: m.fileName,
    });
  } else {
    out.push({ level: "ok", code: "mime", message: `格式 ${m.mime} 可用`, target: m.fileName });
  }

  if (spec.maxBytes !== undefined && m.bytes > spec.maxBytes) {
    out.push({
      level: "error",
      code: "oversize",
      message: `体积超限：${fmt(m.bytes)} > ${fmt(spec.maxBytes)}，可用「处理」页压到目标大小`,
      target: m.fileName,
    });
  }
  if (spec.minBytes !== undefined && m.bytes < spec.minBytes) {
    out.push({
      level: "warn",
      code: "undersize",
      message: `体积偏小（${fmt(m.bytes)} < ${fmt(spec.minBytes)}），可能是压缩过度导致看不清`,
      target: m.fileName,
    });
  }

  if (spec.px && m.width && m.height) {
    const err = Math.abs(m.width / m.height - spec.px.w / spec.px.h) / (spec.px.w / spec.px.h);
    if (m.width !== spec.px.w || m.height !== spec.px.h) {
      out.push({
        level: err > (spec.ratioTolerance ?? 0.02) ? "error" : "warn",
        code: "pixels",
        message: `像素尺寸 ${m.width}×${m.height}，目标 ${spec.px.w}×${spec.px.h}`,
        target: m.fileName,
      });
    }
  }

  if (spec.needsExpiry) {
    if (!m.expiry) {
      out.push({
        level: "warn",
        code: "expiry_missing",
        message: "未登记有效期，无法判断证件是否已过期",
        target: m.fileName,
      });
    } else if (new Date(m.expiry).getTime() < Date.now()) {
      out.push({
        level: "error",
        code: "expiry_passed",
        message: `证件已过期（${m.expiry}），提交必被退回`,
        target: m.fileName,
      });
    } else {
      const days = Math.floor((new Date(m.expiry).getTime() - Date.now()) / 86400000);
      if (days < 30) {
        out.push({
          level: "warn",
          code: "expiry_soon",
          message: `有效期仅剩 ${days} 天（${m.expiry}），建议先续办`,
          target: m.fileName,
        });
      }
    }
  }

  if (!out.some((f) => f.level === "error")) {
    out.push({ level: "ok", code: "pass", message: "符合设定规格", target: m.fileName });
  }
  return out;
}

export function fmt(bytes: number): string {
  if (bytes >= MB) return `${(bytes / MB).toFixed(2)} MB`;
  if (bytes >= KB) return `${(bytes / KB).toFixed(0)} KB`;
  return `${bytes} B`;
}
