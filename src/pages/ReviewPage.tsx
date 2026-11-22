import { useState } from "react";
import { CircleAlert, CircleCheckBig, Download, FileJson, ListChecks, ShieldCheck, Signature, TriangleAlert, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { LEVEL_META, STATUS_META, categoryLabel, codeLabel, fieldLabel, shortDate } from "@/components/labels";
import { navigate } from "@/hooks/useRoute";
import { useStore } from "@/hooks/useStore";
import { precheck } from "@/lib/ai";
import { download } from "@/lib/db";
import { createDraft, exportDraft, exportVaultInteropJson, patchDraftArg, setDraftStatus, state, touch } from "@/lib/store";
import type { Finding } from "@/lib/types";

export default function ReviewPage() {
  const s = useStore();
  const [running, setRunning] = useState(false);
  const [signing, setSigning] = useState<{ id: string; mode: "approve" | "reject" } | null>(null);
  const [note, setNote] = useState("");
  const [sworn, setSworn] = useState(false);

  const report = s.lastReport;
  const indexed = report ? report.findings.map((f, index) => ({ f, index })) : [];
  const errors = indexed.filter((x) => x.f.level === "error");
  const warns = indexed.filter((x) => x.f.level === "warn");
  const oks = indexed.filter((x) => x.f.level === "ok");
  const usedAi = report ? report.findings.some((f) => f.code === "ai") : false;

  const signingDraft = s.drafts.find((d) => d.id === signing?.id) ?? null;

  async function runPrecheck() {
    setRunning(true);
    try {
      const r = await precheck();
      state.lastReport = r;
      touch();
      const bad = r.findings.filter((f) => f.level !== "ok").length;
      toast[bad ? "warning" : "success"](bad ? `预审完成：${bad} 项需要处理` : "预审完成：没有发现问题", {
        description: r.usedAi ? "本轮包含 AI 语义审查。" : "本轮只跑本地规则；在「设置」填 Key 可开启 AI 语义审查。",
      });
    } catch (e) {
      toast.error(`预审失败：${(e as Error).message}`);
    } finally {
      setRunning(false);
    }
  }

  function openSign(id: string, mode: "approve" | "reject") {
    setSigning({ id, mode });
    setNote(mode === "approve" ? "已逐字段核对档案信息与材料清单" : "");
    setSworn(false);
  }

  function confirmSign() {
    if (!signing || !signingDraft) return;
    try {
      if (signing.mode === "approve") {
        if (!sworn) {
          toast.error("请先勾选「我以人类身份确认」");
          return;
        }
        setDraftStatus(signing.id, "approved", { note: note.trim() || "已人工核对", byHuman: true });
        toast.success("已签字批准，现在可以导出提交包");
      } else {
        setDraftStatus(signing.id, "rejected", { note: note.trim() || "复核未通过，需补材料" });
        toast.success("已退回草稿，改字段会重新进入待审");
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSigning(null);
    }
  }

  function exportPackage(id: string) {
    try {
      const json = exportDraft(id);
      download(new Blob([json], { type: "application/json" }), `materialpass-submit-package-${id}.json`);
      toast.success("提交包已存到本机下载目录", { description: "里面是草稿快照 + 材料清单，页面不会替你去任何网站提交。" });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="grid gap-5">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ListChecks aria-hidden className="text-primary size-5" />
            预审结果
          </CardTitle>
          <CardDescription>
            确定性规则先跑（格式、体积、像素、有效期、空字段），启用 AI 时再补一层语义审查。规则部分不联网，所以断网也能用。
          </CardDescription>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button size="lg" data-mp-path="review.precheck" onClick={() => void runPrecheck()} disabled={running}>
              <ShieldCheck aria-hidden className="size-4" />
              {running ? "正在预审…" : "跑预审"}
            </Button>
            {report ? (
              <span className="text-muted-foreground text-sm">上次预审：{shortDate(report.at)}</span>
            ) : (
              <Badge variant="warn">还没跑过预审</Badge>
            )}
            {usedAi && <Badge variant="ok">本轮用了 AI 语义审查</Badge>}
          </div>
        </CardHeader>
        <CardContent className="grid gap-4">
          {!report ? (
            <p className="text-muted-foreground rounded-lg bg-muted/60 p-4 text-sm leading-relaxed">
              还没生成结论。点上面「跑预审」看看有没有体积超限、证件过期、字段留空这类会被窗口退回的问题。
            </p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                <Badge variant={errors.length ? "error" : "ok"}>{errors.length ? `${errors.length} 项错误` : "没有错误"}</Badge>
                <Badge variant={warns.length ? "warn" : "secondary"}>{warns.length ? `${warns.length} 项提醒` : "没有提醒"}</Badge>
                <Badge variant="secondary">{oks.length} 项通过</Badge>
              </div>

              {report.aiNotes.length > 0 && (
                <div className="bg-primary/5 border-primary/25 rounded-lg border p-3">
                  <p className="text-sm font-medium">AI 预审说明</p>
                  <ul className="text-muted-foreground mt-1 grid gap-1 text-xs leading-relaxed">
                    {report.aiNotes.map((n, i) => (
                      <li key={i}>{n}</li>
                    ))}
                  </ul>
                </div>
              )}

              <FindingGroup title="错误：提交必被退回" tone="error" items={errors} />
              <FindingGroup title="提醒：建议先处理" tone="warn" items={warns} />
              <FindingGroup title="通过项" tone="ok" items={oks} collapsible />
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>草稿与人工复核闸门</CardTitle>
          <CardDescription>
            草稿只是把档案字段和材料清单拼成一份待提交内容。批准这一步必须是人：AI 调 approve 时不带 byHuman:true 会被直接拒绝，改任何一个字段又会打回待审。
          </CardDescription>
          <div className="mt-3 flex flex-wrap gap-3">
            <Button
              size="lg"
              onClick={() => {
                const d = createDraft();
                toast.success(`已生成草稿 ${d.id}`, {
                  description: d.missing_required.length ? `有 ${d.missing_required.length} 份材料存在错误项，先处理再签字。` : "逐字段核对后点「批准」才能导出提交包。",
                });
              }}
            >
              <Signature aria-hidden className="size-4" />
              生成草稿
            </Button>
            <Button
              variant="secondary"
              size="lg"
              onClick={() => {
                const json = exportVaultInteropJson();
                download(new Blob([json], { type: "application/json" }), "materialpass-vault.json");
                toast.success("互通资料库已导出", { description: "字段与 lilyco-web2cli 的 VaultProfile 逐字段一致，可直接 lweb2cli vault --op import --profile <名> --file <json>。" });
              }}
            >
              <FileJson aria-hidden className="size-4" />
              导出 lweb2cli 互通资料库
            </Button>
          </div>
          {s.drafts.length === 0 && (
            <p className="text-muted-foreground mt-3 text-sm">
              还没有草稿。上面「生成草稿」会把当前档案的 {Object.values(s.profile.categories).reduce((n, f) => n + Object.keys(f).length, 0)} 个字段拼成一份提交内容。
            </p>
          )}
        </CardHeader>
        <CardContent className="grid gap-4">
          {s.drafts.map((d) => {
            const meta = STATUS_META[d.status];
            const locked = d.status === "submitted";
            const canExport = d.status === "approved";
            return (
              <section key={d.id} className="border-border rounded-xl border p-4" aria-label={`草稿 ${d.id}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-mono text-sm font-semibold">{d.id}</h3>
                    <p className="text-muted-foreground mt-1 text-xs">
                      档案「{d.profile}」· 创建于 {shortDate(d.created_unix)} · session={d.session}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span data-mp-path={`review.draft.${d.id}.status`}>
                      <Badge variant={d.status === "approved" ? "ok" : d.status === "rejected" ? "error" : "warn"}>{meta.label}</Badge>
                    </span>
                    <span className="text-muted-foreground text-xs">{meta.hint}</span>
                  </div>
                </div>

                {d.missing_required.length > 0 && (
                  <p className="text-destructive mt-3 flex items-start gap-2 rounded-lg bg-destructive/10 p-2.5 text-sm">
                    <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
                    <span>
                      这些材料当前有错误项，签字前请先处理：{d.missing_required.join("、")}
                      <button type="button" className="text-primary ml-2 underline underline-offset-2" onClick={() => navigate("process")}>
                        去材料处理
                      </button>
                    </span>
                  </p>
                )}
                {d.mapping_notes.length > 0 && (
                  <p className="text-muted-foreground mt-3 rounded-lg bg-muted/60 p-2.5 text-xs leading-relaxed">
                    拼草稿时的提醒：{d.mapping_notes.join("；")}
                  </p>
                )}

                <div className="mt-4 border-border border-t pt-4">
                  {Object.keys(d.args).length > 0 && (
                    <p className="text-muted-foreground mb-3 text-xs leading-relaxed">
                      下面任何一格改动都会把这份草稿打回「待人工复核」，需要重新签字。
                    </p>
                  )}
                  <div className="grid gap-3 sm:grid-cols-2">
                    {Object.keys(d.args).length === 0 && (
                      <p className="text-muted-foreground text-sm sm:col-span-2">
                        草稿里没有字段 —— 先去资料库填档案，或点「载入示例档案」。
                      </p>
                    )}
                    {Object.entries(d.args).map(([field, value]) => (
                      <Field
                        key={field}
                        label={fieldLabel(field)}
                        htmlFor={`arg-${d.id}-${field}`}
                        hint={
                          fieldLabel(field) === field ? undefined : (
                            <code className="text-muted-foreground font-mono">{field}</code>
                          )
                        }
                      >
                        <Input
                          id={`arg-${d.id}-${field}`}
                          data-mp-path={`review.draft.${d.id}.arg.${field}`}
                          disabled={locked}
                          value={typeof value === "string" ? value : JSON.stringify(value)}
                          onChange={(e) => {
                            try {
                              patchDraftArg(d.id, field, e.target.value);
                            } catch (err) {
                              toast.error((err as Error).message);
                            }
                          }}
                        />
                      </Field>
                    ))}
                  </div>
                </div>

                {d.reviewer_note && (
                  <p className="mt-3 rounded-lg bg-muted/60 p-2.5 text-sm">
                    <span className="text-muted-foreground">复核意见：</span>
                    {d.reviewer_note}
                    {d.reviewed_unix ? <span className="text-muted-foreground text-xs">（{shortDate(d.reviewed_unix)}）</span> : null}
                  </p>
                )}

                <div className="mt-4 flex flex-wrap items-center gap-3 border-border border-t pt-4">
                  <Button
                    data-mp-path={`review.draft.${d.id}.approve`}
                    disabled={locked || d.status === "approved"}
                    onClick={() => openSign(d.id, "approve")}
                  >
                    <CircleCheckBig aria-hidden className="size-4" />
                    {d.status === "approved" ? "已批准" : "人工复核：批准"}
                  </Button>
                  <Button variant="secondary" data-mp-path={`review.draft.${d.id}.reject`} disabled={locked} onClick={() => openSign(d.id, "reject")}>
                    <X aria-hidden className="size-4" />
                    退回
                  </Button>
                  <Button variant={canExport ? "default" : "secondary"} data-mp-path={`review.draft.${d.id}.export`} disabled={!canExport} onClick={() => exportPackage(d.id)}>
                    <Download aria-hidden className="size-4" />
                    导出提交包
                  </Button>
                  {!canExport && <span className="text-muted-foreground text-xs">导出被挡住：只有「已批准」的草稿才能打包，这是人类签字闸门。</span>}
                </div>
              </section>
            );
          })}
        </CardContent>
      </Card>

      <Dialog
        open={!!signing}
        onClose={() => setSigning(null)}
        title={signing?.mode === "approve" ? "你正在以人类身份签字" : "退回这份草稿"}
        description={
          signing?.mode === "approve"
            ? "批准后这份草稿才允许导出提交包。AI 不能替你按这个按钮 —— invoke(\"approve\") 必须显式带 byHuman: true，否则被拒绝。"
            : "退回后草稿仍是待审状态，补完材料再重新核对。"
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setSigning(null)}>
              取消
            </Button>
            <Button
              variant={signing?.mode === "approve" ? "default" : "destructive"}
              disabled={signing?.mode === "approve" && !sworn}
              onClick={confirmSign}
            >
              {signing?.mode === "approve" ? "确认由我本人批准" : "确认退回"}
            </Button>
          </>
        }
      >
        <div className="grid gap-3">
          {signingDraft && (
            <p className="bg-muted/60 rounded-lg p-3 font-mono text-xs">
              {signingDraft.id} · {Object.keys(signingDraft.args).length} 个字段 · 材料 {s.materials.length} 份
            </p>
          )}
          <Field label="复核意见（会写进草稿和提交包）" htmlFor="sign-note">
            <Textarea id="sign-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="例如：姓名与身份证号已与原件核对一致" />
          </Field>
          {signing?.mode === "approve" && (
            <label className="border-border flex items-start gap-2.5 rounded-lg border p-3 text-sm leading-relaxed">
              <input type="checkbox" checked={sworn} onChange={(e) => setSworn(e.target.checked)} aria-label="确认以人类身份签字" />
              <span>
                我已逐字段核对档案信息与材料清单，确认这份提交内容<strong>由我本人签字</strong>，不是 AI 自动批准。
              </span>
            </label>
          )}
        </div>
      </Dialog>
    </div>
  );
}

function FindingGroup({
  title,
  tone,
  items,
  collapsible,
}: {
  title: string;
  tone: Finding["level"];
  items: { f: Finding; index: number }[];
  collapsible?: boolean;
}) {
  const Icon = tone === "error" ? CircleAlert : tone === "warn" ? TriangleAlert : CircleCheckBig;
  if (!items.length && tone !== "warn") return null;
  return (
    <section className="border-border rounded-xl border" aria-label={title}>
      <h3 className="flex items-center gap-2 px-4 py-3 font-semibold">
        <Icon aria-hidden className={tone === "error" ? "size-4 text-destructive" : tone === "warn" ? "size-4 text-amber-500" : "size-4 text-emerald-600"} />
        {title}
        <span className="text-muted-foreground text-sm font-normal">{items.length} 条</span>
      </h3>
      {items.length > 0 && (
        <ul className="border-border grid gap-2 border-t px-4 py-3">
          {items.map(({ f, index }) => (
            <FindingRow key={`${f.level}-${f.code}-${f.target}-${index}`} finding={f} index={index} collapsible={collapsible} />
          ))}
        </ul>
      )}
      {items.length === 0 && tone === "warn" && <p className="text-muted-foreground px-4 pb-3 text-sm">没有提醒类问题。</p>}
    </section>
  );
}

function FindingRow({ finding, index, collapsible }: { finding: Finding; index: number; collapsible?: boolean }) {
  const s = useStore();
  const material = s.materials.find((m) => m.key === finding.target);
  const category = finding.target.startsWith("categories.") ? finding.target.slice("categories.".length) : null;
  const fixableInProcess = !!material?.mime.startsWith("image/") && ["mime", "oversize", "undersize", "pixels"].includes(finding.code);

  if (finding.level === "ok" && collapsible) {
    return (
      <li data-mp-path={`review.finding.${index}`} className="text-muted-foreground flex items-start gap-2 text-sm">
        <CircleCheckBig aria-hidden className="mt-0.5 size-4 shrink-0 text-emerald-600" />
        <span>
          <Badge variant="ok" className="mr-2">
            {codeLabel(finding.code)}
          </Badge>
          {finding.message}
        </span>
      </li>
    );
  }

  return (
    <li
      data-mp-path={`review.finding.${index}`}
      className="flex flex-wrap items-start justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2"
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-relaxed">
          <Badge variant={LEVEL_META[finding.level].tone} className="mr-2">
            {LEVEL_META[finding.level].label}·{codeLabel(finding.code)}
          </Badge>
          {finding.message}
        </p>
        <p className="text-muted-foreground mt-1 font-mono text-xs">定位：{finding.target}</p>
      </div>
      <div className="flex gap-2">
        {material && (
          <Button size="sm" variant="secondary" onClick={() => navigate(fixableInProcess ? "process" : "vault", material.key)}>
            {fixableInProcess ? "去处理这一份" : "在资料库定位"}
          </Button>
        )}
        {category && (
          <Button size="sm" variant="secondary" onClick={() => navigate("vault")}>
            去补「{categoryLabel(category)}」字段
          </Button>
        )}
        {finding.target === "ai" && (
          <Button size="sm" variant="secondary" onClick={() => navigate("vault")}>
            去核对档案与材料
          </Button>
        )}
      </div>
    </li>
  );
}
