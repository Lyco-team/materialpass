import { rulePrecheck, state } from "./store";
import { fmt, specById } from "./specs";
import type { Finding } from "./types";

export type Report = { findings: Finding[]; aiNotes: string[]; usedAi: boolean; at: number };

/**
 * AI 预审：确定性规则先跑完，再把「规则看不到的语义问题」交给模型。
 * 未配置 Key 时只跑规则，页面照常可用；Key 只存在本机，绝不写进仓库或前端产物。
 */
export async function precheck(): Promise<Report> {
  const findings = rulePrecheck();
  const s = state.settings;
  if (!s.aiEnabled || !s.aiKey) {
    return { findings, aiNotes: ["未启用 AI，仅执行了本地规则校验（配置设置里的 AI Key 可开启语义审查）"], usedAi: false, at: Date.now() };
  }

  const brief = state.materials.map((m) => ({
    名称: m.label,
    分类: m.category,
    规格: specById(m.specId)?.label ?? "未设定",
    大小: fmt(m.bytes),
    像素: m.width && m.height ? `${m.width}x${m.height}` : undefined,
    有效期: m.expiry,
    格式: m.mime,
  }));

  try {
    const res = await fetch(`${s.aiBase.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${s.aiKey}` },
      body: JSON.stringify({
        model: s.aiModel,
        temperature: 0.1,
        messages: [
          {
            role: "system",
            content:
              "你是政务与办事材料预审员。只做审查、不臆造事实、绝不建议自动提交。输出 JSON 数组，每项 {level: 'error'|'warn'|'ok', message: string}，最多 8 条，聚焦人类容易漏掉的一致性问题：姓名/证件号是否各处一致、材料是否互相矛盾、是否缺关键页、有效期是否覆盖办理日期、清晰度是否可能不过审。",
          },
          { role: "user", content: JSON.stringify({ 档案字段: state.profile.categories, 材料清单: brief }, null, 0) },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = data.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(text) as { 审查?: Finding[] } | Finding[];
    const notes = Array.isArray(parsed) ? parsed : (parsed.审查 ?? []);
    const normalized = notes.map((n) => ({
      level: (n.level === "error" ? "error" : n.level === "warn" ? "warn" : "ok") as Finding["level"],
      code: "ai",
      message: `[AI 预审] ${n.message}`,
      target: "ai",
    }));
    return { findings: [...findings, ...normalized], aiNotes: normalized.map((f) => f.message), usedAi: true, at: Date.now() };
  } catch (e) {
    return {
      findings,
      aiNotes: [`AI 调用失败（${(e as Error).message}），已回退到本地规则校验`],
      usedAi: false,
      at: Date.now(),
    };
  }
}
