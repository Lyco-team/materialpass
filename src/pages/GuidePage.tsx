import { ArrowRight, CircleCheckBig, IdCard, ImagePlus, Keyboard, Signature, SpellCheck, WandSparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { navigate, type TabId } from "@/hooks/useRoute";
import { useStore } from "@/hooks/useStore";
import { cn } from "@/lib/utils";

export default function GuidePage() {
  const s = useStore();

  const hasFields = Object.values(s.profile.categories).some((f) => Object.keys(f).length > 0);
  const hasMaterial = s.materials.length > 0;
  const hasSpec = s.materials.some((m) => !!m.specId);
  const hasAligned = s.materials.some((m) => m.operations.length > 0);
  const hasChecked = s.lastReport !== null || s.materials.some((m) => m.findings.length > 0);
  const hasApproved = s.drafts.some((d) => d.status === "approved" || d.status === "submitted");

  const steps: {
    n: 1 | 2 | 3 | 4 | 5;
    title: string;
    body: string;
    why: string;
    Icon: typeof IdCard;
    tab: TabId;
    done: boolean;
    doneText: string;
  }[] = [
    {
      n: 1,
      title: "建档案，填姓名和证件号",
      body: "把要反复抄的信息一次填好：姓名、身份证号、手机号、单位统一社会信用代码。以后每一份表都从这里取，不用在窗口重新想。",
      why: "窗口最常见的耗时来源，是同一组信息在每张表上重抄一遍。",
      Icon: IdCard,
      tab: "vault",
      done: hasFields,
      doneText: hasFields ? `已填 ${Object.values(s.profile.categories).reduce((n, f) => n + Object.keys(f).length, 0)} 个字段` : "还没有字段，可点「载入示例档案」",
    },
    {
      n: 2,
      title: "放进来一张照片或扫描件",
      body: "把身份证照片、一寸照、营业执照扫描件拖进上传框。文件只写进本机 IndexedDB，不会上传到任何服务器。",
      why: "材料散在手机、微信收藏、抽屉里，是先要找东西，不是先要填表。",
      Icon: ImagePlus,
      tab: "vault",
      done: hasMaterial,
      doneText: `已存 ${s.materials.length} 份`,
    },
    {
      n: 3,
      title: "选目标规格，点「一键对齐」",
      body: "给这份材料选它要交给哪个系统（一寸照 / 身份证扫描件 / ≤100KB 网页上传…），然后到「材料处理」点一键对齐：居中裁切、缩放、压体积，每一步留操作痕迹。",
      why: "「照片超过 100KB」被退回第三次，是很多办事人唯一会遇到的技术难题。",
      Icon: WandSparkles,
      tab: "process",
      done: hasAligned,
      doneText: hasSpec ? "已选规格，部分已处理" : "还没选规格",
    },
    {
      n: 4,
      title: "跑预审，看问题清单",
      body: "本地规则先查格式、体积、像素、有效期、空字段；在「设置」里填了 Key 才会再加一层 AI 语义审查。清单里每一条都能点回对应材料。",
      why: "问题要在人按下提交键之前说清楚，而不是在窗口被退回之后才知道。",
      Icon: SpellCheck,
      tab: "review",
      done: hasChecked,
      doneText: s.lastReport ? `上次预审 ${s.lastReport.findings.length} 条结论` : "规则结论已生成",
    },
    {
      n: 5,
      title: "生成草稿，人工批准后导出提交包",
      body: "草稿把档案字段和材料清单拼成一份待提交内容。逐字段核对后点「批准」——会弹二次确认，因为这一步是人在签字。只有 approved 的草稿才允许导出。",
      why: "AI 可以挑错，但不能替人签字。这是这个产品最重要的一条边界。",
      Icon: Signature,
      tab: "review",
      done: hasApproved,
      doneText: s.drafts.length ? `${s.drafts.length} 份草稿` : "还没有草稿",
    },
  ];

  const doneCount = steps.filter((x) => x.done).length;

  return (
    <div className="grid gap-5">
      <Card>
        <CardHeader>
          <CardTitle>五分钟跑通一遍</CardTitle>
          <CardDescription>
            按下面五步走，不需要账号、不需要后端。每一步右边的「带我去做」会直接跳到对应页面；也可以用键盘：
            <kbd className="bg-muted mx-1 rounded border border-border px-1.5 py-0.5 text-xs">Tab</kbd> 走到按钮、
            <kbd className="bg-muted mx-1 rounded border border-border px-1.5 py-0.5 text-xs">Enter</kbd> 触发。
          </CardDescription>
          <div className="mt-2 flex items-center gap-3">
            <div className="bg-muted h-2 w-full max-w-64 overflow-hidden rounded-full" role="img" aria-label={`已完成 ${doneCount} 步，共 5 步`}>
              <div className="bg-primary h-full rounded-full transition-all" style={{ width: `${(doneCount / 5) * 100}%` }} />
            </div>
            <span className="text-muted-foreground text-sm shrink-0">已完成 {doneCount} / 5</span>
          </div>
        </CardHeader>
      </Card>

      <ol className="grid gap-4">
        {steps.map((step) => (
          <li key={step.n}>
            <Card className={cn(step.done && "border-primary/40")}>
              <CardHeader className="gap-3 sm:flex-row sm:items-start">
                <span
                  className={cn(
                    "flex size-11 shrink-0 items-center justify-center rounded-xl border text-lg font-semibold",
                    step.done ? "border-transparent bg-primary text-primary-foreground" : "border-border bg-muted text-muted-foreground",
                  )}
                  aria-hidden
                >
                  {step.done ? <CircleCheckBig className="size-6" /> : step.n}
                </span>
                <div className="min-w-0 flex-1">
                  <CardTitle className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <step.Icon aria-hidden className="text-primary size-5" />
                    {step.title}
                    {step.done && <Badge variant="ok">已完成</Badge>}
                  </CardTitle>
                  <CardDescription className="mt-2">{step.body}</CardDescription>
                  <p className="text-foreground mt-3 rounded-lg bg-muted/70 px-3 py-2 text-sm leading-relaxed">
                    <span className="text-muted-foreground">为什么重要：</span>
                    {step.why}
                  </p>
                  <p className="text-muted-foreground mt-2 text-xs">当前状态：{step.doneText}</p>
                </div>
                <div className="shrink-0">
                  <Button
                    size="lg"
                    variant={step.done ? "secondary" : "default"}
                    data-mp-path={`guide.step.${step.n}`}
                    aria-label={`第 ${step.n} 步，带我去做：${step.title}`}
                    onClick={() => navigate(step.tab)}
                  >
                    带我去做
                    <ArrowRight aria-hidden className="size-4" />
                  </Button>
                </div>
              </CardHeader>
            </Card>
          </li>
        ))}
      </ol>

      <Card>
        <CardContent className="flex flex-wrap items-start gap-3 pt-6">
          <Keyboard aria-hidden className="text-muted-foreground mt-0.5 size-5" />
          <p className="text-muted-foreground min-w-60 flex-1 text-sm leading-relaxed">
            纯前端应用：材料不出本机，图片在浏览器 Canvas 里处理，没有任何统计脚本。
            想让 AI 帮你操作这个页面，去「Agent 通道」看语义路径与可执行控制台——人和 Agent 走的是同一套动作，不存在旁路。
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
