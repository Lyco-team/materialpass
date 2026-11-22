import { CircleAlert, CircleCheckBig, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { LEVEL_META, codeLabel } from "@/components/labels";
import { cn } from "@/lib/utils";
import type { Finding } from "@/lib/types";

const ICONS = { error: CircleAlert, warn: TriangleAlert, ok: CircleCheckBig } as const;

export function FindingBadge({ finding, className }: { finding: Finding; className?: string }) {
  const Icon = ICONS[finding.level];
  const meta = LEVEL_META[finding.level];
  return (
    <Badge variant={meta.tone} className={cn("max-w-full items-start whitespace-normal text-left leading-snug", className)}>
      <Icon aria-hidden className="mt-0.5 size-3.5 shrink-0" />
      <span>
        <span className="font-semibold">{meta.label}</span>
        <span className="opacity-70">（{codeLabel(finding.code)}）</span>：{finding.message}
      </span>
    </Badge>
  );
}

/** 只看非通过项；全绿时给一个「符合规格」徽标，避免只有颜色传达状态。 */
export function FindingBadges({ findings, className }: { findings: Finding[]; className?: string }) {
  if (!findings.length) {
    return <Badge variant="outline">尚未校验（未选目标规格）</Badge>;
  }
  const problems = findings.filter((f) => f.level !== "ok");
  const shown = problems.length ? problems : findings.filter((f) => f.code === "pass");
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {shown.map((f, i) => (
        <FindingBadge key={`${f.code}-${i}`} finding={f} />
      ))}
    </div>
  );
}
