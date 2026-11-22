import { useState } from "react";
import { Database, Download, Lock, ShieldCheck, TriangleAlert, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useStore } from "@/hooks/useStore";
import { download } from "@/lib/db";
import { fmt } from "@/lib/specs";
import { exportEncryptedVault, importEncryptedVault, removeMaterial, setProfileName, setSettings, state, touch } from "@/lib/store";

export default function SettingsPage() {
  const s = useStore();
  const [password, setPassword] = useState("");
  const [bundle, setBundle] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmWipe, setConfirmWipe] = useState(false);

  const totalBytes = s.materials.reduce((n, m) => n + m.bytes, 0);

  async function doExport() {
    if (!password) {
      toast.error("请先设置备份密码", { description: "没有密码就没有加密，宁可不导出。" });
      return;
    }
    setBusy(true);
    try {
      const blob = await exportEncryptedVault(password);
      download(blob, `materialpass-vault-${new Date().toISOString().slice(0, 10)}.enc.json`);
      toast.success("加密备份已导出", { description: "PBKDF2-SHA256 21 万次迭代 + AES-GCM-256，密码不会被写进任何文件。" });
    } catch (e) {
      toast.error(`导出失败：${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function doImport() {
    if (!bundle.trim()) {
      toast.error("请先选择备份文件，或把备份内容粘贴到下面");
      return;
    }
    if (!password) {
      toast.error("请输入这份备份的密码");
      return;
    }
    setBusy(true);
    try {
      const count = await importEncryptedVault(bundle, password);
      setBundle("");
      setPassword("");
      toast.success(`已导入备份，本机现在有 ${count} 份材料`, { description: "档案字段与材料原件都从这份加密文件里解出来了。" });
    } catch (e) {
      toast.error(`导入失败：${(e as Error).message}`, { description: "密码不对或文件不是材料通的备份格式。" });
    } finally {
      setBusy(false);
    }
  }

  async function wipeEverything() {
    setConfirmWipe(false);
    for (const key of state.materials.map((m) => m.key)) {
      try {
        await removeMaterial(key);
      } catch {
        /* 原件可能本来就不在 blobs 库里 */
      }
    }
    setProfileName("默认档案");
    state.profile.categories = Object.fromEntries(Object.keys(state.profile.categories).map((cat) => [cat, {}]));
    state.drafts = [];
    state.lastReport = null;
    setSettings({ aiEnabled: false, aiKey: "" });
    touch();
    setPassword("");
    setBundle("");
    toast.success("本机数据已清空", { description: "材料原件、档案字段、草稿都删掉了；这个操作没有撤销。" });
  }

  return (
    <div className="grid gap-5">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck aria-hidden className="text-primary size-5" />
            AI 预审配置
          </CardTitle>
          <CardDescription>
            默认关闭。关掉时预审只跑本机规则，完全不联网；打开后也仅把档案字段文本与材料元数据发往你自己填写的接口，图片二进制永远不出这台设备。
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <label className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/50 p-3">
            <input
              type="checkbox"
              data-mp-path="settings.ai.enabled"
              checked={s.settings.aiEnabled}
              onChange={(e) => setSettings({ aiEnabled: e.target.checked })}
              aria-label="启用 AI 语义预审"
            />
            <span className="text-sm font-medium">启用 AI 语义预审</span>
            <span className="text-muted-foreground ml-auto text-xs">
              当前：{s.settings.aiEnabled ? (s.settings.aiKey ? "已启用（Key 已填）" : "已启用但缺 Key，会回退到规则") : "未启用，仅本地规则"}
            </span>
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="接口地址（OpenAI 兼容）" htmlFor="ai-base" hint="默认走 lilyco 网关，也可以填自建地址">
              <Input
                id="ai-base"
                data-mp-path="settings.ai.base"
                value={s.settings.aiBase}
                onChange={(e) => setSettings({ aiBase: e.target.value })}
                placeholder="https://api.lain42.top/v1"
                spellCheck={false}
              />
            </Field>
            <Field label="模型名" htmlFor="ai-model">
              <Input
                id="ai-model"
                data-mp-path="settings.ai.model"
                value={s.settings.aiModel}
                onChange={(e) => setSettings({ aiModel: e.target.value })}
                placeholder="qwen3-max"
                spellCheck={false}
              />
            </Field>
            <Field
              label="API Key"
              htmlFor="ai-key"
              className="sm:col-span-2"
              hint="只存这台电脑的 IndexedDB，不进代码仓库、不进构建产物、不出现在任何日志里。留空即只用本地规则。"
            >
              <Input
                id="ai-key"
                type="password"
                data-mp-path="settings.ai.key"
                value={s.settings.aiKey}
                onChange={(e) => setSettings({ aiKey: e.target.value })}
                placeholder="sk-…（可选）"
                autoComplete="off"
                spellCheck={false}
              />
            </Field>
          </div>

          <p className="text-muted-foreground rounded-lg bg-muted/60 p-3 text-xs leading-relaxed">
            这个页面不发任何遥测请求：没有统计脚本、没有第三方资源、没有后台任务。除了你主动点「跑预审」时由你自己配置的接口发起一次调用，其他所有计算都在本地 Canvas 与 IndexedDB 完成。
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock aria-hidden className="text-muted-foreground size-5" />
            保管箱加密备份
          </CardTitle>
          <CardDescription>
            材料是隐私物，所以备份必须先加密：PBKDF2-SHA256 21 万次迭代派生密钥，AES-GCM-256 加密整包（含原件二进制）。密码只用于当场派生密钥，不保存。
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Field label="备份密码" htmlFor="vault-password" hint="导出和导入用同一个密码；忘了就解不开，这里没有找回通道">
            <Input
              id="vault-password"
              type="password"
              data-mp-path="settings.vault.password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              placeholder="至少想一组只有自己记得住的"
            />
          </Field>

          <div className="flex flex-wrap gap-3">
            <Button size="lg" data-mp-path="settings.vault.export" onClick={() => void doExport()} disabled={busy}>
              <Download aria-hidden className="size-4" />
              导出加密备份
            </Button>
            <span className="text-muted-foreground self-center text-sm">当前保管箱：{s.materials.length} 份材料，共 {fmt(totalBytes)}</span>
          </div>

          <Field label="导入备份文件" htmlFor="vault-import" hint="也可以把备份 JSON 文本粘贴到下面的框里，再从别的设备拷来的文件同样能用">
            <Input
              id="vault-import"
              type="file"
              data-mp-path="settings.vault.import"
              accept=".json,application/json"
              aria-label="选择材料通加密备份文件"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                void file
                  .text()
                  .then((text) => {
                    setBundle(text);
                    toast.success(`已读入备份文件 ${file.name}`, { description: "填好密码再点「导入这份备份」。" });
                  })
                  .catch((err: unknown) => toast.error(`读取文件失败：${(err as Error).message}`));
              }}
            />
          </Field>

          <Field label="备份内容" htmlFor="vault-bundle">
            <Textarea
              id="vault-bundle"
              value={bundle}
              onChange={(e) => setBundle(e.target.value)}
              placeholder='{"format":"materialpass-vault/1","cipher":"AES-GCM-256", …}'
              className="min-h-20 font-mono text-xs"
              spellCheck={false}
            />
          </Field>

          <Button variant="secondary" size="lg" onClick={() => void doImport()} disabled={busy}>
            <Upload aria-hidden className="size-4" />
            导入这份备份
          </Button>
        </CardContent>
      </Card>

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <Database aria-hidden className="size-5" />
            清空本机数据
          </CardTitle>
          <CardDescription>删除 IndexedDB 里的档案字段、材料原件与草稿。没有撤销，先做加密备份再清空。</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Button variant="destructive" onClick={() => setConfirmWipe(true)}>
            <Trash2 aria-hidden className="size-4" />
            清空所有数据
          </Button>
          <span className="text-muted-foreground text-sm">
            现在存着 {s.materials.length} 份材料、{Object.values(s.profile.categories).reduce((n, f) => n + Object.keys(f).length, 0)} 个字段、{s.drafts.length} 份草稿
          </span>
        </CardContent>
      </Card>

      <Dialog
        open={confirmWipe}
        onClose={() => setConfirmWipe(false)}
        title="确认清空这台设备上的全部材料？"
        description="档案字段、材料原件二进制、草稿历史都会被删除。这一步不可撤销，而且页面没有云端备份可以找回。"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmWipe(false)}>
              取消
            </Button>
            <Button variant="destructive" onClick={() => void wipeEverything()}>
              <TriangleAlert aria-hidden className="size-4" />
              我确认，清空
            </Button>
          </>
        }
      />
    </div>
  );
}
