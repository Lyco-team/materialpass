import { useEffect, type ComponentType } from "react";
import { BookOpen, Bot, FolderOpen, ListChecks, Moon, Settings, ShieldCheck, Sun, WandSparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { navigate, useRoute, type TabId } from "@/hooks/useRoute";
import { useStore } from "@/hooks/useStore";
import { useTheme } from "@/hooks/useTheme";
import { cn } from "@/lib/utils";
import AgentPage from "@/pages/AgentPage";
import GuidePage from "@/pages/GuidePage";
import ProcessPage from "@/pages/ProcessPage";
import ReviewPage from "@/pages/ReviewPage";
import SettingsPage from "@/pages/SettingsPage";
import VaultPage from "@/pages/VaultPage";

type NavItem = { id: TabId; label: string; hint: string; Icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }> };

const NAV: NavItem[] = [
  { id: "guide", label: "上手", hint: "五步跑通一遍", Icon: BookOpen },
  { id: "vault", label: "资料库", hint: "档案与材料清单", Icon: FolderOpen },
  { id: "process", label: "材料处理", hint: "裁剪缩放压缩", Icon: WandSparkles },
  { id: "review", label: "预审与复核", hint: "AI 挑错，人签字", Icon: ListChecks },
  { id: "agent", label: "Agent 通道", hint: "语义路径与控制台", Icon: Bot },
  { id: "settings", label: "设置", hint: "AI 与加密备份", Icon: Settings },
];

export default function App() {
  const s = useStore();
  const { tab, arg } = useRoute();
  const { theme, toggleTheme } = useTheme();
  const active = NAV.find((n) => n.id === tab) ?? NAV[0];

  useEffect(() => {
    document.title = `${active.label} · 材料通 MaterialPass`;
  }, [active.label]);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [tab]);

  if (!s.ready) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-8" aria-busy="true" aria-label="正在读取本机保管箱">
        <div className="text-muted-foreground text-lg">正在读取本机保管箱（IndexedDB）…</div>
        <div className="bg-muted h-24 animate-pulse rounded-xl" />
        <div className="bg-muted h-48 animate-pulse rounded-xl" />
      </div>
    );
  }

  const pending = s.drafts.filter((d) => d.status === "pending_review").length;

  return (
    <div className="min-h-screen">
      <a
        href="#main"
        className="bg-primary text-primary-foreground fixed top-3 left-3 z-60 -translate-y-24 rounded-lg px-4 py-2 font-medium focus-visible:translate-y-0 focus-visible:outline-none"
      >
        跳到主要内容
      </a>

      <header className="bg-card/85 border-border sticky top-0 z-40 border-b backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 lg:px-6">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <span className="bg-primary text-primary-foreground flex size-10 shrink-0 items-center justify-center rounded-xl">
              <ShieldCheck aria-hidden className="size-6" />
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-lg leading-tight font-semibold">材料通 MaterialPass</h1>
              <p className="text-muted-foreground truncate text-xs">AI 先把材料预审一遍，人类再签字提交；文件只存本机，不上传。</p>
            </div>
          </div>

          <div className="text-muted-foreground hidden items-center gap-3 text-xs xl:flex">
            <span>材料 {s.materials.length} 份</span>
            <span aria-hidden>·</span>
            <span>{pending ? `${pending} 份草稿待签字` : "无待签字草稿"}</span>
            <span aria-hidden>·</span>
            <span className={cn("rounded-md border px-1.5 py-0.5", s.settings.aiEnabled ? "border-primary/30 bg-primary/10 text-primary" : "border-border bg-muted")}>
              {s.settings.aiEnabled ? "AI 预审已开启" : "仅本地规则校验"}
            </span>
          </div>

          <Button
            variant="secondary"
            data-mp-path="app.theme"
            aria-label={theme === "dark" ? "切换到浅色主题" : "切换到深色主题"}
            onClick={toggleTheme}
          >
            {theme === "dark" ? <Sun aria-hidden className="size-4" /> : <Moon aria-hidden className="size-4" />}
            {theme === "dark" ? "浅色" : "深色"}
          </Button>
        </div>

        <nav aria-label="功能页签（窄屏）" className="border-border mx-auto flex max-w-7xl gap-1.5 overflow-x-auto px-4 pb-3 lg:hidden">
          {NAV.map((item) => (
            <TabButton key={item.id} item={item} active={item.id === tab} compact ns="app.tabbar" />
          ))}
        </nav>
      </header>

      <div className="mx-auto flex w-full max-w-7xl gap-6 px-4 py-6 lg:px-6">
        <nav aria-label="功能页签" className="hidden w-56 shrink-0 lg:block">
          <div className="sticky top-24">
            <ul className="grid gap-1.5">
              {NAV.map((item) => (
                <li key={item.id}>
                  <TabButton item={item} active={item.id === tab} />
                </li>
              ))}
            </ul>
            <p className="text-muted-foreground mt-5 border-t border-border/70 pt-4 text-xs leading-relaxed">
              所有按钮都带语义路径，Agent 用 <code className="text-foreground">window.__materialpass.invoke()</code> 走的是同一套动作。
            </p>
          </div>
        </nav>

        <main id="main" tabIndex={-1} className="min-w-0 flex-1 focus-visible:outline-none">
          {tab === "guide" && <GuidePage />}
          {tab === "vault" && <VaultPage focusKey={arg} />}
          {tab === "process" && <ProcessPage selectedKey={arg} />}
          {tab === "review" && <ReviewPage />}
          {tab === "agent" && <AgentPage />}
          {tab === "settings" && <SettingsPage />}
        </main>
      </div>

      <footer className="text-muted-foreground mx-auto max-w-7xl px-4 pb-10 text-xs lg:px-6">
        材料通 MaterialPass · 纯前端，零遥测 · 资料库格式与 lilyco-web2cli 互通
      </footer>
    </div>
  );
}

function TabButton({ item, active, compact, ns = "app.tab" }: { item: NavItem; active: boolean; compact?: boolean; ns?: string }) {
  const { id, label, hint, Icon } = item;
  return (
    <Button
      variant={active ? "default" : compact ? "secondary" : "ghost"}
      data-mp-path={`${ns}.${id}`}
      aria-current={active ? "page" : undefined}
      onClick={() => navigate(id)}
      className={cn(
        "justify-start",
        compact ? "h-10 shrink-0 rounded-full px-4" : "h-auto w-full flex-col items-start gap-0.5 px-3 py-3 text-left",
      )}
    >
      <span className="flex items-center gap-2 font-semibold">
        <Icon aria-hidden className={cn(compact ? "size-4" : "size-5")} />
        {label}
      </span>
      {!compact && <span className={cn("text-xs font-normal", active ? "text-primary-foreground/80" : "text-muted-foreground")}>{hint}</span>}
    </Button>
  );
}
