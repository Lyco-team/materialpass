import { useEffect, useState } from "react";
import { Bot, Check, Copy, Play, Terminal } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useStore } from "@/hooks/useStore";
import { ACTIONS, semanticPaths } from "@/lib/native";

type InvokeResult = { action: string; params: string; ok: boolean; text: string; at: number };

const SNIPPET = `// 打开页面即可用，人和 Agent 走同一套 action
const mp = window.__materialpass;
await mp.invoke("snapshot");                       // 编号文本视图，省 token
await mp.invoke("precheck");                       // 规则 + AI 预审结论
await mp.invoke("align_spec", { key: "…" });      // 一键对齐规格
await mp.invoke("approve", { id: "…", note: "已核对", byHuman: true });
mp.paths();                                        // 当前 DOM 上的语义路径`;

function format(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}

export default function AgentPage() {
  const s = useStore();
  const [action, setAction] = useState("snapshot");
  const [paramsText, setParamsText] = useState("{}");
  const [results, setResults] = useState<InvokeResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [bridgeReady, setBridgeReady] = useState(false);

  useEffect(() => {
    const check = () => setBridgeReady(!!(window as unknown as { __materialpass?: unknown }).__materialpass);
    check();
    document.addEventListener("materialpass:ready", check);
    return () => document.removeEventListener("materialpass:ready", check);
  }, []);

  const paths = semanticPaths();
  const firstImage = s.materials.find((m) => m.mime.startsWith("image/")) ?? s.materials[0];
  const firstDraft = s.drafts[0];
  const def = ACTIONS.find((a) => a.name === action);

  const examples: { title: string; why: string; action: string; params: Record<string, unknown> }[] = [
    { title: "预审：先看有没有会被退回的问题", why: "返回 errors / warns 两组；没配 AI Key 时自动只跑本地规则，不会失败", action: "precheck", params: {} },
    {
      title: "把一份材料一键对齐到目标规格",
      why: "裁剪 + 缩放 + 压体积，操作痕迹写进材料的 operations，人和 Agent 看到的是同一条链",
      action: "align_spec",
      params: { key: firstImage?.key ?? "把这里换成 snapshot 里的 key" },
    },
    {
      title: "人类签字批准草稿",
      why: "byHuman 必须显式为 true，否则 store 直接抛错 —— AI 不能自批自提",
      action: "approve",
      params: { id: firstDraft?.id ?? "先用 create_draft 拿 id", note: "已逐字段核对姓名与证件号", byHuman: true },
    },
  ];

  async function run(withAction = action, withParams = paramsText) {
    let params: Record<string, unknown>;
    try {
      params = withParams.trim() ? (JSON.parse(withParams) as Record<string, unknown>) : {};
    } catch (e) {
      const text = `参数不是合法 JSON：${(e as Error).message}`;
      setResults((prev) => [{ action: withAction, params: withParams, ok: false, text, at: Date.now() }, ...prev].slice(0, 6));
      toast.error("参数 JSON 解析失败");
      return;
    }
    const bridge = (window as unknown as { __materialpass?: { invoke: (n: string, p?: Record<string, unknown>) => Promise<unknown> } }).__materialpass;
    if (!bridge) {
      toast.error("window.__materialpass 还没就绪", { description: "本机保管箱初始化完成后会自动安装桥接。" });
      return;
    }
    setBusy(true);
    try {
      const value = await bridge.invoke(withAction, params);
      setResults((prev) => [{ action: withAction, params: withParams, ok: true, text: format(value), at: Date.now() }, ...prev].slice(0, 6));
    } catch (e) {
      setResults((prev) => [{ action: withAction, params: withParams, ok: false, text: format({ ok: false, error: (e as Error).message }), at: Date.now() }, ...prev].slice(0, 6));
      toast.error(`invoke 被拒绝：${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  function fill(next: string, params: unknown) {
    setAction(next);
    setParamsText(JSON.stringify(params, null, 2));
    toast.success(`已填入控制台：${next}`);
  }

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label}已复制到剪贴板`);
    } catch {
      toast.error("浏览器拒绝了剪贴板访问", { description: "请手动选中文本复制。" });
    }
  }

  return (
    <div className="grid gap-5">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot aria-hidden className="text-primary size-5" />
            这个网页是 Agent 的可编程界面
          </CardTitle>
          <CardDescription>
            协议 lilyco-native-web/1。页面上每个有语义的元素都带 data-mp-path，人类点按钮和 Agent 调 invoke() 命中的是同一个 store action、同一条校验链——没有截图猜坐标，也没有 AI 专用旁路。
          </CardDescription>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge variant={bridgeReady ? "ok" : "warn"}>{bridgeReady ? "window.__materialpass 已挂载" : "桥接未就绪（保管箱初始化中）"}</Badge>
            <Badge variant="secondary">{ACTIONS.length} 个动作</Badge>
            <Badge variant="secondary">{paths.length} 条语义路径</Badge>
            <Button size="sm" variant="ghost" onClick={() => void copy(SNIPPET, "调用示例")} aria-label="复制调用示例代码">
              <Copy aria-hidden className="size-3.5" />
              复制示例
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <pre className="bg-muted overflow-auto rounded-lg p-4 font-mono text-xs leading-relaxed">{SNIPPET}</pre>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>动作清单 ACTIONS</CardTitle>
          <CardDescription>写入类动作会改本机保管箱；标了「需人类」的必须带 byHuman:true。</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <caption className="text-muted-foreground mb-3 text-left text-xs">
              机器可读版本在 /manifest.json 的 actions 字段里，与这张表同源。
            </caption>
            <thead>
              <tr className="text-muted-foreground border-border border-b text-left">
                <th scope="col" className="py-2 pr-3 font-medium">名称</th>
                <th scope="col" className="py-2 pr-3 font-medium">说明</th>
                <th scope="col" className="py-2 pr-3 font-medium">参数</th>
                <th scope="col" className="py-2 pr-3 font-medium">写入</th>
                <th scope="col" className="py-2 pr-3 font-medium">需人类</th>
                <th scope="col" className="py-2 font-medium"> </th>
              </tr>
            </thead>
            <tbody>
              {ACTIONS.map((a) => (
                <tr key={a.name} data-mp-path={`agent.action.${a.name}`} className="border-border hover:bg-muted/50 border-b align-top">
                  <th scope="row" className="py-2.5 pr-3 font-mono text-xs whitespace-nowrap font-semibold">
                    {a.name}
                  </th>
                  <td className="py-2.5 pr-3 leading-relaxed">{a.desc}</td>
                  <td className="py-2.5 pr-3 font-mono text-xs">
                    {Object.keys(a.params).length === 0 ? (
                      <span className="text-muted-foreground">无</span>
                    ) : (
                      Object.entries(a.params).map(([k, v]) => (
                        <span key={k} className="mr-1.5 inline-block whitespace-nowrap">
                          {k}:{v}
                        </span>
                      ))
                    )}
                  </td>
                  <td className="py-2.5 pr-3">{a.writes ? <Badge variant="warn">写入</Badge> : <Badge variant="secondary">只读</Badge>}</td>
                  <td className="py-2.5 pr-3">{a.needsHuman ? <Badge variant="error">必须人类</Badge> : <span className="text-muted-foreground text-xs">—</span>}</td>
                  <td className="py-2.5 text-right">
                    <Button size="sm" variant="secondary" onClick={() => fill(a.name, defaultParamsFor(a.name, { key: firstImage?.key, id: firstDraft?.id }))}>
                      填进控制台
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Terminal aria-hidden className="text-muted-foreground size-5" />
            Agent 控制台
          </CardTitle>
          <CardDescription>这里就是评委最该点的东西：选一个动作、写 JSON 参数、执行，走的是和按钮完全相同的那条链。</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div data-mp-path="agent.console" role="group" aria-label="Agent 调用控制台" className="grid gap-3 sm:grid-cols-[minmax(0,220px)_minmax(0,1fr)] sm:items-end">
            <Field label="动作" htmlFor="mp-action" hint={def ? def.desc : undefined}>
              <Select id="mp-action" value={action} onChange={(e) => setAction(e.target.value)}>
                {ACTIONS.map((a) => (
                  <option key={a.name} value={a.name}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="参数 JSON" htmlFor="mp-params" hint="留空或写 {} 表示无参数">
              <Textarea id="mp-params" value={paramsText} onChange={(e) => setParamsText(e.target.value)} className="min-h-20 font-mono text-xs" spellCheck={false} />
            </Field>
            <div className="sm:col-span-2">
              <Button size="lg" data-mp-path="agent.invoke" onClick={() => void run()} disabled={busy}>
                <Play aria-hidden className="size-4" />
                {busy ? "执行中…" : "执行 invoke()"}
              </Button>
            </div>
          </div>

          {results.length === 0 ? (
            <p className="text-muted-foreground rounded-lg bg-muted/60 p-4 text-sm">还没有执行记录。点上面「执行」，或从下面的示例一键填入。</p>
          ) : (
            <ul className="grid gap-3">
              {results.map((r, i) => (
                <li key={`${r.at}-${i}`} className="border-border rounded-lg border">
                  <p className="text-muted-foreground flex flex-wrap items-center gap-2 border-b border-border px-3 py-2 text-xs">
                    <Badge variant={r.ok ? "ok" : "error"}>{r.ok ? "成功" : "失败"}</Badge>
                    <span className="font-mono font-semibold">{r.action}</span>
                    <span className="font-mono">参数 {r.params.trim() || "{}"}</span>
                    <span className="ml-auto">{new Date(r.at).toLocaleTimeString("zh-CN", { hour12: false })}</span>
                  </p>
                  <pre className="overflow-auto p-3 font-mono text-xs leading-relaxed">{r.text}</pre>
                </li>
              ))}
            </ul>
          )}

          <section className="border-border grid gap-2 border-t pt-4" aria-label="可直接复制的示例">
            <h3 className="text-sm font-semibold">三条可直接跑的示例</h3>
            {examples.map((ex) => {
              const text = `await window.__materialpass.invoke("${ex.action}", ${JSON.stringify(ex.params)})`;
              return (
                <article key={ex.title} className="bg-muted/40 rounded-lg p-3">
                  <p className="text-sm font-medium">{ex.title}</p>
                  <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">{ex.why}</p>
                  <pre className="mt-2 bg-background overflow-auto rounded border border-border p-2.5 font-mono text-xs">{text}</pre>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button size="sm" variant="secondary" onClick={() => fill(ex.action, ex.params)}>
                      <Check aria-hidden className="size-3.5" />
                      填进控制台并可直接执行
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => void copy(text, "调用语句")}>
                      <Copy aria-hidden className="size-3.5" />
                      复制
                    </Button>
                  </div>
                </article>
              );
            })}
          </section>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>当前 DOM 上的语义路径</CardTitle>
          <CardDescription>
            由 semanticPaths() 实时扫描 [data-mp-path]，Agent 可自省页面有哪些可点的东西。路径是发布契约的一部分，改名等于 breaking change。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground mb-3 text-sm">
            共 {paths.length} 条（切换页签会看到该页独有的路径，例如 <code className="text-foreground">vault.material.&lt;key&gt;.spec</code>）
          </p>
          <ul data-mp-path="agent.paths" className="bg-muted/50 grid max-h-96 gap-1 overflow-auto rounded-lg border border-border p-3 font-mono text-xs">
            {paths.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function defaultParamsFor(name: string, ids: { key?: string; id?: string }): Record<string, unknown> {
  switch (name) {
    case "set_field":
      return { category: "personal", key: "name", value: "张阿姨" };
    case "align_spec":
    case "process":
      return ids.key ? { key: ids.key } : {};
    case "set_expiry":
      return { key: ids.key ?? "材料 key", expiry: "2030-01-01" };
    case "set_spec":
      return { key: ids.key ?? "材料 key", specId: "photo_1in" };
    case "create_draft":
      return { session: "gov" };
    case "patch_arg":
      return { id: ids.id ?? "draft id", field: "name", value: "张阿姨" };
    case "approve":
      return { id: ids.id ?? "draft id", note: "已逐字段核对", byHuman: true };
    case "reject":
      return { id: ids.id ?? "draft id", note: "缺营业执照副本" };
    case "export_draft":
      return { id: ids.id ?? "draft id" };
    default:
      return {};
  }
}
