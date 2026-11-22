import { useEffect, useMemo, useState } from "react";
import { FolderCog, Plus, Sparkles, Trash2, Upload, WandSparkles } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { FindingBadges } from "@/components/finding";
import { Input } from "@/components/ui/input";
import { MaterialPreviewDialog, MaterialThumb } from "@/components/material";
import { Select } from "@/components/ui/select";
import { CATEGORY_ORDER, MATERIAL_CATEGORIES, categoryLabel, fieldLabel, mimeShort } from "@/components/labels";
import { navigate } from "@/hooks/useRoute";
import { useStore } from "@/hooks/useStore";
import { fmt, SPECS } from "@/lib/specs";
import { addMaterial, removeField, removeMaterial, setField, setProfileName, updateMaterial } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { StoredMaterial } from "@/lib/types";

const SUGGESTED: Record<string, string[]> = {
  personal: ["name", "id_card", "address"],
  company: ["company_name", "credit_code"],
  legal_rep: ["legal_rep_name"],
  finance: ["bank_name", "bank_account"],
  contact: ["phone", "email"],
};

/** 文件名里带明显关键词时顺手猜一个规格；猜不出来就不猜，绝不硬塞。 */
function guessSpec(name: string): string | undefined {
  const n = name.toLowerCase();
  if (/身份证|idcard|id_card/.test(n)) return "id_card";
  if (/一寸|1寸/.test(n)) return "photo_1in";
  if (/二寸|2寸/.test(n)) return "photo_2in";
  if (/营业执照|登记证|许可证/.test(n)) return "license";
  if (/流水|缴费|银行/.test(n)) return "bank_proof";
  if (/体检|健康/.test(n)) return "med_report";
  if (/房产|租赁|合同/.test(n)) return "house_contract";
  if (/学历|毕业|成绩单/.test(n)) return "diploma";
  return undefined;
}

function guessCategory(name: string): string {
  const spec = guessSpec(name);
  if (!spec) return "证照";
  const group = SPECS.find((s) => s.id === spec)?.group;
  return group && group !== "证照" ? group : "证照";
}

export default function VaultPage({ focusKey }: { focusKey: string | null }) {
  const s = useStore();
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [newField, setNewField] = useState<Record<string, { key: string; value: string }>>({});
  const [addOpen, setAddOpen] = useState<Record<string, boolean>>({});
  const [highlight, setHighlight] = useState<string | null>(null);

  const categories = useMemo(
    () => Array.from(new Set([...CATEGORY_ORDER, ...Object.keys(s.profile.categories)])),
    [s.profile.categories],
  );
  const previewMaterial = s.materials.find((m) => m.key === previewKey) ?? null;
  const deleting = s.materials.find((m) => m.key === pendingDelete) ?? null;
  const fieldCount = Object.values(s.profile.categories).reduce((n, f) => n + Object.keys(f).length, 0);

  useEffect(() => {
    if (!focusKey) return;
    setHighlight(focusKey);
    const el = document.getElementById(`material-${focusKey}`);
    el?.scrollIntoView({ block: "center" });
    const timer = window.setTimeout(() => setHighlight(null), 2400);
    return () => window.clearTimeout(timer);
  }, [focusKey]);

  async function ingest(files: FileList | File[] | null) {
    if (!files) return;
    const list = Array.from(files);
    if (!list.length) return;
    let added = 0;
    const failed: string[] = [];
    for (const file of list) {
      try {
        await addMaterial({
          file,
          category: guessCategory(file.name),
          specId: guessSpec(file.name),
        });
        added++;
      } catch (e) {
        failed.push(`${file.name}：${(e as Error).message}`);
      }
    }
    if (added) toast.success(`已存进本机保管箱 ${added} 份`, { description: "文件只写进 IndexedDB，没有上传。下一步：给每份材料选目标规格。" });
    if (failed.length) toast.error(`${failed.length} 份没能存入`, { description: failed.join("；") });
  }

  function loadSampleProfile() {
    const name = s.profile.name === "默认档案" ? "张阿姨" : s.profile.name;
    setProfileName(name);
    setField("personal", "name", name);
    setField("personal", "id_card", "11010119500101001X");
    setField("contact", "phone", "13800138000");
    toast.success("已载入示例档案（3 个字段）", {
      description: "证件号和手机号是虚构的测试值，导出提交包前请改成真实信息。",
    });
  }

  function addField(cat: string) {
    const draft = newField[cat];
    const key = draft?.key.trim();
    if (!key) {
      toast.error("请先写清字段名", { description: "例如「姓名」或 id_card，Agent 和 lweb2cli 都按这个名字取用。" });
      return;
    }
    if (s.profile.categories[cat]?.[key] !== undefined) {
      toast.error(`分类「${categoryLabel(cat)}」里已经有字段 ${fieldLabel(key)}`);
      return;
    }
    setField(cat, key, draft?.value.trim() ?? "");
    setNewField((prev) => ({ ...prev, [cat]: { key: "", value: "" } }));
    toast.success(`已添加字段 ${categoryLabel(cat)}.${fieldLabel(key)}`);
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    const label = deleting?.label ?? pendingDelete;
    setPendingDelete(null);
    try {
      await removeMaterial(pendingDelete);
      toast.success(`已删除「${label}」`, { description: "本机 IndexedDB 里的原件和元数据一起删掉了。" });
    } catch (e) {
      toast.error(`删除失败：${(e as Error).message}`);
    }
  }

  return (
    <div className="grid gap-5">
      <Card>
        <CardHeader>
          <CardTitle>这份档案是谁的</CardTitle>
          <CardDescription>档案名会写进导出的 JSON，lweb2cli 侧按它匹配资料库条目。姓名、证件号在下面按分类填写。</CardDescription>
          <div className="mt-3 grid gap-2 sm:flex sm:items-end sm:gap-3">
            <Field label="档案名" htmlFor="profile-name" className="sm:max-w-80 sm:flex-1">
              <Input
                id="profile-name"
                data-mp-path="vault.profile.name"
                value={s.profile.name}
                onChange={(e) => setProfileName(e.target.value)}
                placeholder="例如：张阿姨 / 某某公司"
              />
            </Field>
            <Button variant="secondary" onClick={loadSampleProfile} aria-label="载入示例档案，空库时快速试用">
              <Sparkles aria-hidden className="size-4" />
              载入示例档案
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2 pt-0 text-sm">
          <Badge variant="secondary">分类 {categories.length} 个</Badge>
          <Badge variant="secondary">字段 {fieldCount} 项</Badge>
          <Badge variant="secondary">材料 {s.materials.length} 份</Badge>
          {fieldCount === 0 && <Badge variant="warn">还没有任何字段，草稿会是空的</Badge>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>档案字段</CardTitle>
          <CardDescription>填一次，以后每张表都从这里取。空字段会在预审时被点名。</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {categories.map((cat) => {
            const fields = s.profile.categories[cat] ?? {};
            const keys = Object.keys(fields);
            const missing = (SUGGESTED[cat] ?? []).filter((k) => fields[k] === undefined);
            const draft = newField[cat] ?? { key: "", value: "" };
            const formOpen = addOpen[cat] ?? (keys.length === 0 && missing.length === 0);
            return (
              <section key={cat} className="border-border rounded-xl border p-4" aria-labelledby={`cat-${cat}`}>
                <h3 id={`cat-${cat}`} className="flex items-center gap-2 font-semibold">
                  <FolderCog aria-hidden className="text-muted-foreground size-4" />
                  {categoryLabel(cat)}
                  <span className="text-muted-foreground font-mono text-xs">{cat}</span>
                </h3>

                {keys.length === 0 && (
                  <p className="text-muted-foreground mt-2 text-sm">这个分类还没有字段，可以在下面添加。</p>
                )}

                {keys.length > 0 && (
                  <ul className="mt-3 grid gap-3">
                    {keys.map((key) => (
                      <li key={key} className="grid items-center gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_auto]">
                        <div className="grid gap-0.5">
                          <label htmlFor={`f-${cat}-${key}`} className="text-sm font-medium">
                            {fieldLabel(key)}
                          </label>
                          <code className="text-muted-foreground font-mono text-xs">
                            {cat}.{key}
                          </code>
                        </div>
                        <Input
                          id={`f-${cat}-${key}`}
                          data-mp-path={`vault.field.${cat}.${key}`}
                          value={fields[key]}
                          onChange={(e) => setField(cat, key, e.target.value)}
                          placeholder={fieldLabel(key)}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`删除字段 ${categoryLabel(cat)}.${fieldLabel(key)}`}
                          onClick={() => {
                            removeField(cat, key);
                            toast.success(`已删除字段 ${fieldLabel(key)}`);
                          }}
                        >
                          <Trash2 aria-hidden className="size-4" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}

                {missing.length > 0 && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="text-muted-foreground text-xs">建议补上：</span>
                    {missing.map((key) => (
                      <Button
                        key={key}
                        variant="secondary"
                        size="sm"
                        aria-label={`补上字段 ${fieldLabel(key)}`}
                        onClick={() => {
                          setField(cat, key, "");
                          window.setTimeout(() => document.getElementById(`f-${cat}-${key}`)?.focus(), 30);
                        }}
                      >
                        <Plus aria-hidden className="size-3.5" />
                        {fieldLabel(key)}
                      </Button>
                    ))}
                  </div>
                )}

                {formOpen ? (
                  <form
                    className="mt-4 grid items-end gap-2 border-t border-border/70 pt-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto]"
                    onSubmit={(e) => {
                      e.preventDefault();
                      addField(cat);
                    }}
                  >
                    <Field label="新字段名" htmlFor={`nf-${cat}`} hint="中文名或英文 key 都行，导出时原样保留">
                      <Input
                        id={`nf-${cat}`}
                        value={draft.key}
                        onChange={(e) => setNewField((p) => ({ ...p, [cat]: { ...draft, key: e.target.value } }))}
                        placeholder="例如 手机号 / phone"
                      />
                    </Field>
                    <Field label="字段值" htmlFor={`nv-${cat}`}>
                      <Input
                        id={`nv-${cat}`}
                        value={draft.value}
                        onChange={(e) => setNewField((p) => ({ ...p, [cat]: { ...draft, value: e.target.value } }))}
                        placeholder="例如 138…"
                      />
                    </Field>
                    <div className="flex gap-1">
                      <Button type="submit">
                        <Plus aria-hidden className="size-4" />
                        添加字段
                      </Button>
                      {keys.length > 0 && (
                        <Button type="button" variant="ghost" onClick={() => setAddOpen((p) => ({ ...p, [cat]: false }))}>
                          收起
                        </Button>
                      )}
                    </div>
                  </form>
                ) : (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="mt-3 self-start"
                    aria-label={`在${categoryLabel(cat)}添加字段`}
                    onClick={() => {
                      setAddOpen((p) => ({ ...p, [cat]: true }));
                      window.setTimeout(() => document.getElementById(`nf-${cat}`)?.focus(), 30);
                    }}
                  >
                    <Plus aria-hidden className="size-4" />
                    添加字段
                  </Button>
                )}
              </section>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>材料清单</CardTitle>
          <CardDescription>照片、扫描件、PDF 都可以。文件留在本机，只有名称和参数会被 AI 预审读取。</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div
            className={cn(
              "border-2 border-dashed rounded-xl p-4 transition-colors",
              dragging ? "border-primary bg-primary/10" : "border-border bg-muted/40",
            )}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              void ingest(e.dataTransfer.files);
            }}
          >
            <Field label="选择文件" htmlFor="mp-upload" hint="可多选；也可以直接把文件拖进这一框">
              <div className="flex flex-wrap items-center gap-3">
                <Input
                  id="mp-upload"
                  type="file"
                  multiple
                  accept="image/*,application/pdf"
                  data-mp-path="vault.materials.add"
                  aria-label="选择要保管的材料文件（可多选）"
                  onChange={(e) => {
                    void ingest(e.target.files);
                    e.target.value = "";
                  }}
                  className="max-w-md flex-1"
                />
                <span className="text-muted-foreground flex items-center gap-1.5 text-sm">
                  <Upload aria-hidden className="size-4" />
                  {dragging ? "松手就存进保管箱" : "拖拽也可用"}
                </span>
              </div>
            </Field>
          </div>

          {s.materials.length === 0 ? (
            <p className="text-muted-foreground rounded-lg bg-muted/60 p-4 text-sm leading-relaxed">
              保管箱里还没有材料。放一张照片或扫描件进来，然后在下面这一行给它选「目标规格」，预审才有判断依据。
            </p>
          ) : (
            <ul className="grid gap-3">
              {s.materials.map((m) => (
                <MaterialRow
                  key={m.key}
                  material={m}
                  highlighted={highlight === m.key}
                  onPreview={() => setPreviewKey(m.key)}
                  onDelete={() => setPendingDelete(m.key)}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <MaterialPreviewDialog material={previewMaterial} onClose={() => setPreviewKey(null)} />

      <Dialog
        open={!!deleting}
        onClose={() => setPendingDelete(null)}
        title="确认删除这份材料？"
        description={deleting ? `「${deleting.label}」（${mimeShort(deleting.mime)}，${fmt(deleting.bytes)}）会从本机保管箱里删掉，删不掉第二次。` : ""}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPendingDelete(null)}>
              先不删
            </Button>
            <Button variant="destructive" onClick={() => void confirmDelete()}>
              <Trash2 aria-hidden className="size-4" />
              确认删除
            </Button>
          </>
        }
      />
    </div>
  );
}

function MaterialRow({
  material: m,
  highlighted,
  onPreview,
  onDelete,
}: {
  material: StoredMaterial;
  highlighted: boolean;
  onPreview: () => void;
  onDelete: () => void;
}) {
  const spec = SPECS.find((x) => x.id === m.specId);
  return (
    <li
      id={`material-${m.key}`}
      data-mp-path={`vault.material.${m.key}`}
      tabIndex={-1}
      className={cn(
        "border-border bg-card grid gap-3 rounded-xl border p-3 focus-visible:outline-none",
        highlighted && "ring-2 ring-ring",
      )}
    >
      <div className="flex gap-3">
        <MaterialThumb material={m} path={`vault.material.${m.key}.preview`} onOpen={onPreview} />
        <div className="min-w-0 flex-1">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="名称" htmlFor={`label-${m.key}`}>
              <Input
                id={`label-${m.key}`}
                data-mp-path={`vault.material.${m.key}.label`}
                value={m.label}
                onChange={(e) => void updateMaterial(m.key, { label: e.target.value })}
              />
            </Field>
            <Field label="分类" htmlFor={`cat-${m.key}`}>
              <Select
                id={`cat-${m.key}`}
                data-mp-path={`vault.material.${m.key}.category`}
                value={m.category}
                onChange={(e) => void updateMaterial(m.key, { category: e.target.value })}
              >
                {Array.from(new Set([...MATERIAL_CATEGORIES, m.category])).map((c) => (
                  <option key={c} value={c}>
                    {categoryLabel(c)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="目标规格" htmlFor={`spec-${m.key}`}>
              <Select
                id={`spec-${m.key}`}
                data-mp-path={`vault.material.${m.key}.spec`}
                value={m.specId ?? ""}
                onChange={(e) => void updateMaterial(m.key, { specId: e.target.value || undefined })}
              >
                <option value="">未设定（无法校验）</option>
                {SPECS.map((sp) => (
                  <option key={sp.id} value={sp.id}>
                    {sp.group} · {sp.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="有效期" htmlFor={`expiry-${m.key}`} hint={spec?.needsExpiry ? "该规格要求登记有效期" : undefined}>
              <Input
                id={`expiry-${m.key}`}
                type="date"
                data-mp-path={`vault.material.${m.key}.expiry`}
                value={m.expiry ?? ""}
                onChange={(e) => void updateMaterial(m.key, { expiry: e.target.value || undefined })}
              />
            </Field>
          </div>

          <div className="mt-3 grid gap-2">
            <FindingBadges findings={m.findings} />
            <p className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
              <span className="truncate max-w-64">{m.fileName}</span>
              <Badge variant="outline">{mimeShort(m.mime)}</Badge>
              <span>{fmt(m.bytes)}</span>
              {m.width && m.height ? <span>{m.width} × {m.height} px</span> : <span>非图片，无像素</span>}
              <span>存入 {new Date(m.addedUnix).toLocaleString("zh-CN", { hour12: false })}</span>
              {m.operations.length > 0 && <span>处理痕迹 {m.operations.length} 条</span>}
            </p>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => navigate("process", m.key)} aria-label={`到材料处理页打开「${m.label}」`}>
              <WandSparkles aria-hidden className="size-3.5" />
              {m.mime.startsWith("image/") ? "去处理这一份" : "查看处理说明"}
            </Button>
            <Button size="sm" variant="ghost" className="text-destructive hover:bg-destructive/10" onClick={onDelete} aria-label={`删除材料「${m.label}」`}>
              <Trash2 aria-hidden className="size-3.5" />
              删除
            </Button>
          </div>
        </div>
      </div>
    </li>
  );
}
