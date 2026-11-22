import { useEffect, useMemo, useState } from "react";
import { CircleAlert, History, RotateCcw, RotateCw, Undo2, WandSparkles } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useMaterialUrl } from "@/components/material";
import { mimeShort } from "@/components/labels";
import { navigate } from "@/hooks/useRoute";
import { useStore } from "@/hooks/useStore";
import type { Transform } from "@/lib/imaging";
import { fmt, specById, specTransform } from "@/lib/specs";
import { alignToSpec, getMaterialBlob, processMaterial } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { StoredMaterial } from "@/lib/types";

type Params = {
  rotate: number;
  useCrop: boolean;
  cropX: string;
  cropY: string;
  cropW: string;
  cropH: string;
  outW: string;
  outH: string;
  aspectLock: boolean;
  maxKb: number;
  mime: "image/jpeg" | "image/png" | "image/webp";
  whiteBg: boolean;
};

const RATIOS: { label: string; v: number }[] = [
  { label: "1 : 1", v: 1 },
  { label: "5 : 7（一寸）", v: 295 / 413 },
  { label: "35 : 49（二寸）", v: 413 / 579 },
  { label: "A4 竖版", v: 210 / 297 },
  { label: "A4 横版", v: 297 / 210 },
];

function toInt(v: string): number | null {
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function mimeOf(mime: string): Params["mime"] {
  if (mime === "image/png") return "image/png";
  if (mime === "image/webp") return "image/webp";
  return "image/jpeg";
}

/**
 * 与 src/lib/imaging.ts 的 process() 同一套几何与压缩顺序，只是不落库：
 * 「应用」仍走 store.processMaterial，预览只是让人在点之前就看到结果。
 */
async function renderPreview(src: Blob, t: Transform): Promise<{ blob: Blob; width: number; height: number; mime: string; log: string[] }> {
  const makeCanvas = (w: number, h: number) => {
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
  };
  const encode = (c: HTMLCanvasElement, mime: string, q: number) =>
    new Promise<Blob>((resolve, reject) =>
      c.toBlob((b) => (b ? resolve(b) : reject(new Error(`浏览器不支持输出 ${mime}`))), mime, mime === "image/png" ? undefined : q),
    );

  const bmp = await createImageBitmap(src);
  const log: string[] = [];
  let cur: HTMLCanvasElement | ImageBitmap = bmp;

  if (t.crop) {
    const { x, y, w, h } = t.crop;
    const c = makeCanvas(w, h);
    c.getContext("2d")!.drawImage(cur, x, y, w, h, 0, 0, w, h);
    cur = c;
    log.push(`裁剪 ${w}×${h} @(${x},${y})`);
  }

  const rot = ((t.rotate ?? 0) % 360 + 360) % 360;
  if (rot !== 0) {
    const swap = rot === 90 || rot === 270;
    const c = makeCanvas(swap ? cur.height : cur.width, swap ? cur.width : cur.height);
    const ctx = c.getContext("2d")!;
    ctx.translate(c.width / 2, c.height / 2);
    ctx.rotate((rot * Math.PI) / 180);
    ctx.drawImage(cur, -cur.width / 2, -cur.height / 2);
    cur = c;
    log.push(`旋转 ${rot}°`);
  }

  const tw = t.width ?? (t.height ? Math.round((cur.width * t.height) / cur.height) : cur.width);
  const th = t.height ?? (t.width ? Math.round((cur.height * t.width) / cur.width) : cur.height);
  if (tw !== cur.width || th !== cur.height) {
    const c = makeCanvas(tw, th);
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(cur, 0, 0, tw, th);
    cur = c;
    log.push(`缩放 ${tw}×${th}`);
  }

  const base = makeCanvas(cur.width, cur.height);
  const bctx = base.getContext("2d")!;
  if (t.whiteBg) {
    bctx.fillStyle = "#ffffff";
    bctx.fillRect(0, 0, base.width, base.height);
    log.push("透明底铺白");
  }
  bctx.drawImage(cur, 0, 0);
  bmp.close();

  const mime = t.mime ?? "image/jpeg";
  let quality = 0.92;
  let work = base;
  let blob = await encode(work, mime, quality);
  if (t.maxBytes && blob.size > t.maxBytes && mime !== "image/png") {
    for (let i = 0; i < 7 && blob.size > t.maxBytes; i++) {
      quality = Math.max(0.32, quality - 0.1);
      blob = await encode(work, mime, quality);
    }
    let scale = 1;
    for (let i = 0; i < 8 && blob.size > t.maxBytes; i++) {
      scale *= 0.9;
      const c = makeCanvas(base.width * scale, base.height * scale);
      const ctx = c.getContext("2d")!;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(base, 0, 0, c.width, c.height);
      work = c;
      blob = await encode(work, mime, quality);
    }
    if (blob.size > t.maxBytes) log.push("压到最低质量仍超体积，请改格式或放宽上限");
    else log.push(`压到目标体积 ${fmt(t.maxBytes)} 以内`);
  } else if (t.maxBytes && blob.size > t.maxBytes) {
    log.push("PNG 无损，压不到目标体积，建议输出格式改 JPG 或 WebP");
  }

  return { blob, width: work.width, height: work.height, mime, log };
}

export default function ProcessPage({ selectedKey }: { selectedKey: string | null }) {
  const s = useStore();
  const material =
    s.materials.find((m) => m.key === selectedKey) ??
    s.materials.find((m) => m.mime.startsWith("image/")) ??
    s.materials[0] ??
    null;

  const key = material?.key ?? null;
  const storedUrl = useMaterialUrl(key, `${material?.bytes}-${material?.mime}`);
  const [p, setP] = useState<Params | null>(null);
  const [preview, setPreview] = useState<{ url: string | null; bytes: number; width: number; height: number; mime: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  const isImage = !!material?.mime.startsWith("image/");
  const srcW = material?.width ?? 0;
  const srcH = material?.height ?? 0;

  useEffect(() => {
    if (!material) {
      setP(null);
      return;
    }
    const spec = specById(material.specId);
    // 预览默认就按规格给的目标比例/尺寸来，否则「处理后」看起来和「处理前」一样，而一键对齐实际会改
    const want = spec ? specTransform(material, spec) : null;
    setP({
      rotate: 0,
      useCrop: !!want?.crop,
      cropX: String(want?.crop?.x ?? 0),
      cropY: String(want?.crop?.y ?? 0),
      cropW: String(want?.crop?.w ?? material.width ?? 0),
      cropH: String(want?.crop?.h ?? material.height ?? 0),
      outW: want?.width ? String(want.width) : "",
      outH: want?.height ? String(want.height) : "",
      aspectLock: true,
      maxKb: spec?.maxBytes ? Math.floor(spec.maxBytes / 1024) : 0,
      mime: want?.mime ?? mimeOf(material.mime),
      whiteBg: false,
    });
    setError(null);
    // 只在换材料 / 换规格时重置参数，输入过程不能被覆盖
  }, [key, material?.specId]); // eslint-disable-line react-hooks/exhaustive-deps

  const transform = useMemo<Transform | null>(() => {
    if (!material || !p || !isImage) return null;
    const t: Transform = { mime: p.mime };
    if (p.useCrop) {
      const x = toInt(p.cropX) ?? 0;
      const y = toInt(p.cropY) ?? 0;
      const w = toInt(p.cropW) ?? 0;
      const h = toInt(p.cropH) ?? 0;
      if (w <= 0 || h <= 0 || x < 0 || y < 0 || x + w > srcW + 1 || y + h > srcH + 1) return null;
      t.crop = { x, y, w, h };
    }
    if (p.rotate) t.rotate = p.rotate;
    const ow = toInt(p.outW);
    const oh = toInt(p.outH);
    if (ow && ow > 0) t.width = ow;
    if (oh && oh > 0) t.height = oh;
    if (p.whiteBg) t.whiteBg = true;
    if (p.maxKb > 0) t.maxBytes = p.maxKb * 1024;
    return t;
  }, [material, p, isImage, srcW, srcH]);

  const signature = `${key}|${material?.bytes}|${JSON.stringify(transform)}`;

  useEffect(() => {
    if (!material || !transform) {
      setPreview(null);
      return;
    }
    let alive = true;
    let created: string | null = null;
    setBusy(true);
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const blob = await getMaterialBlob(material.key);
          if (!blob) throw new Error("本机没有读到这份文件的原件");
          const out = await renderPreview(blob, transform);
          if (!alive) return;
          created = URL.createObjectURL(out.blob);
          setPreview({ url: created, bytes: out.blob.size, width: out.width, height: out.height, mime: out.mime });
          setError(null);
        } catch (e) {
          if (alive) setError((e as Error).message);
          setPreview(null);
        } finally {
          if (alive) setBusy(false);
        }
      })();
    }, 250);
    return () => {
      alive = false;
      window.clearTimeout(timer);
      if (created) URL.revokeObjectURL(created);
    };
    // 参数变了才算预览，signature 已包含材料版本与全部参数
  }, [signature]); // eslint-disable-line react-hooks/exhaustive-deps

  function patch(next: Partial<Params>) {
    setP((prev) => (prev ? { ...prev, ...next } : prev));
  }

  function setOutWidth(v: string) {
    const w = toInt(v);
    const eff = effectiveAfterRotate(p, srcW, srcH);
    patch(p?.aspectLock && w && eff.w ? { outW: v, outH: String(Math.round((w * eff.h) / eff.w)) } : { outW: v });
  }

  function applyRatio(r: number) {
    if (!srcW || !srcH) return;
    let cw = srcW;
    let ch = srcW / r;
    if (ch > srcH) {
      ch = srcH;
      cw = srcH * r;
    }
    patch({
      useCrop: true,
      cropW: String(Math.round(cw)),
      cropH: String(Math.round(ch)),
      cropX: String(Math.round((srcW - cw) / 2)),
      cropY: String(Math.round((srcH - ch) / 2)),
    });
  }

  function fillCropFull() {
    patch({ useCrop: true, cropX: "0", cropY: "0", cropW: String(srcW), cropH: String(srcH) });
  }

  function useSpecSize() {
    const spec = specById(material?.specId);
    if (!spec) {
      toast.error("这份材料还没选目标规格", { description: "在资料库那一行选好规格，或直接用下面的宽高输入。" });
      return;
    }
    const next: Partial<Params> = {};
    if (spec.px) {
      next.outW = String(spec.px.w);
      next.outH = String(spec.px.h);
    }
    if (spec.maxBytes) next.maxKb = Math.floor(spec.maxBytes / 1024);
    next.mime = spec.mime.includes("image/png") ? "image/png" : "image/jpeg";
    patch(next);
    toast.success(`已按规格填入参数：${spec.label}`);
  }

  async function apply() {
    if (!material || !transform) return;
    setApplying(true);
    try {
      const out = await processMaterial(material.key, transform);
      toast.success(`已写回保管箱：${out.width}×${out.height}，${fmt(out.blob.size)}`, {
        description: out.log.length ? `操作痕迹：${out.log.join("；")}` : "结果与当前版本一致，未做改动",
      });
    } catch (e) {
      toast.error(`处理失败：${(e as Error).message}`);
    } finally {
      setApplying(false);
    }
  }

  async function align() {
    if (!material) return;
    if (!material.specId) {
      toast.error("还没选目标规格，无法一键对齐");
      navigate("vault", material.key);
      return;
    }
    setApplying(true);
    try {
      const out = await alignToSpec(material.key);
      toast.success(`已对齐到「${specById(material.specId)?.label}」：${out.width}×${out.height}，${fmt(out.blob.size)}`, {
        description: out.log.length ? out.log.join("；") : "原本就符合规格",
      });
    } catch (e) {
      toast.error(`对齐失败：${(e as Error).message}`);
    } finally {
      setApplying(false);
    }
  }

  if (!material) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>材料处理台还没有材料</CardTitle>
          <CardDescription>先去资料库放一张照片或扫描件，回到这里就能旋转、裁剪、缩放、压体积。</CardDescription>
          <Button className="mt-3 self-start" onClick={() => navigate("vault")}>
            去资料库上传
          </Button>
        </CardHeader>
      </Card>
    );
  }

  const spec = specById(material.specId);
  const eff = effectiveAfterRotate(p, srcW, srcH);
  const oversize = p && p.maxKb > 0 && material.bytes / 1024 > p.maxKb;

  return (
    <div className="grid gap-5">
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-3">
            图像工作台
            <Badge variant="outline">key：{material.key}</Badge>
          </CardTitle>
          <CardDescription>所有处理都在这台电脑的 Canvas 里完成，原件会被结果覆盖，操作痕迹保留在下方。</CardDescription>
          <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <Field label="要处理的材料" htmlFor="mp-target">
              <Select id="mp-target" value={material.key} onChange={(e) => navigate("process", e.target.value)}>
                {s.materials.map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.label}（{mimeShort(m.mime)}，{fmt(m.bytes)}）{m.mime.startsWith("image/") ? "" : " —— 非图片"}
                  </option>
                ))}
              </Select>
            </Field>
            <Button size="lg" data-mp-path={`process.material.${material.key}.align`} onClick={() => void align()} disabled={applying}>
              <WandSparkles aria-hidden className="size-4" />
              一键对齐规格
            </Button>
          </div>
          <p className="text-muted-foreground mt-2 text-sm">
            目标规格：{spec ? `${spec.label}（要求 ${spec.px ? `${spec.px.w}×${spec.px.h}px，` : ""}≤${spec.maxBytes ? fmt(spec.maxBytes) : "不限体积"}）` : "未设定"}
            <Button variant="ghost" size="sm" className="ml-2" onClick={() => navigate("vault", material.key)}>
              去资料库改规格
            </Button>
          </p>
        </CardHeader>
      </Card>

      {!isImage ? (
        <Card>
          <CardContent className="flex items-start gap-3 pt-6">
            <CircleAlert aria-hidden className="text-destructive mt-0.5 size-5 shrink-0" />
            <p className="text-sm leading-relaxed">
              这份文件是 {mimeShort(material.mime)}，浏览器 Canvas 无法逐像素处理，所以本工作台只对图片开放。
              PDF 请用系统自带工具（预览 / 打印到 PDF）压缩或裁剪，材料通的预审、草稿签字与提交包导出都不受影响。
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>处理前 / 处理后</CardTitle>
              <CardDescription>{busy ? "正在本机计算预览…" : error ? "预览未能完成，下方参数仍可应用" : "右边是应用后会得到的结果，未点「应用」不会写回保管箱"}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Panel
                label="处理前（保管箱当前版本）"
                url={storedUrl}
                meta={`${srcW} × ${srcH} px · ${fmt(material.bytes)} · ${mimeShort(material.mime)}`}
              />
              <Panel
                label="处理后（实时预览）"
                url={preview?.url ?? null}
                meta={preview ? `${preview.width} × ${preview.height} px · ${fmt(preview.bytes)} · ${mimeShort(preview.mime)}` : "等待参数"}
                highlight
                figurePath={`process.material.${material.key}.preview`}
              />
            </CardContent>
            {error && (
              <CardContent className="pt-0">
                <p className="text-destructive flex items-start gap-2 text-sm">
                  <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
                  {error}
                </p>
              </CardContent>
            )}
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle>处理参数</CardTitle>
                <Button variant="ghost" size="sm" onClick={() => setP(defaultParams(material))}>
                  <Undo2 aria-hidden className="size-4" />
                  恢复默认参数
                </Button>
              </div>
              <CardDescription>顺序固定：裁剪 → 旋转 → 缩放 → 铺白底 → 编码压缩（与「应用」写回时完全一致）。</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5">
              <section className="grid gap-3" aria-labelledby="sec-rotate">
                <h3 id="sec-rotate" className="text-sm font-semibold">
                  旋转
                </h3>
                <div role="group" aria-label="旋转角度" data-mp-path={`process.material.${material.key}.rotate`} className="flex flex-wrap gap-2">
                  {[0, 90, 180, 270].map((deg) => (
                    <Button
                      key={deg}
                      variant={p?.rotate === deg ? "default" : "secondary"}
                      aria-pressed={p?.rotate === deg}
                      aria-label={`顺时针旋转 ${deg} 度`}
                      onClick={() => patch({ rotate: deg })}
                    >
                      {deg === 0 ? <Undo2 aria-hidden className="size-4" /> : <RotateCw aria-hidden className="size-4" />}
                      {deg === 0 ? "不旋转" : `${deg}°`}
                    </Button>
                  ))}
                </div>
                <p className="text-muted-foreground text-xs">扫描时放倒了、上下颠倒了，先用这里转正再裁。</p>
              </section>

              <section className="grid gap-3 border-border border-t pt-4" aria-labelledby="sec-crop">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 id="sec-crop" className="text-sm font-semibold">
                    裁剪（坐标基于未旋转的原图）
                  </h3>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      data-mp-path={`process.material.${material.key}.crop`}
                      checked={!!p?.useCrop}
                      onChange={(e) => (e.target.checked ? fillCropFull() : patch({ useCrop: false }))}
                    />
                    启用裁剪
                  </label>
                </div>
                <div className="flex flex-wrap gap-2">
                  {RATIOS.map((r) => (
                    <Button key={r.label} size="sm" variant="secondary" onClick={() => applyRatio(r.v)} aria-label={`按比例居中裁剪 ${r.label}`}>
                      {r.label}
                    </Button>
                  ))}
                  <Button size="sm" variant="ghost" onClick={fillCropFull}>
                    <RotateCcw aria-hidden className="size-3.5" />
                    用整张原图
                  </Button>
                </div>
                <div className="grid gap-3 sm:grid-cols-4">
                  {(["cropX", "cropY", "cropW", "cropH"] as const).map((f, i) => (
                    <Field key={f} label={["左上 X", "左上 Y", "宽", "高"][i]} htmlFor={`crop-${f}`}>
                      <Input
                        id={`crop-${f}`}
                        type="number"
                        inputMode="numeric"
                        disabled={!p?.useCrop}
                        value={p?.[f] ?? ""}
                        onChange={(e) => patch({ [f]: e.target.value } as Partial<Params>)}
                      />
                    </Field>
                  ))}
                </div>
                <p className="text-muted-foreground text-xs">
                  原图 {srcW} × {srcH}px。裁剪框必须落在原图内，否则不会进入本次处理。
                </p>
              </section>

              <section className="grid gap-3 border-border border-t pt-4" aria-labelledby="sec-scale">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 id="sec-scale" className="text-sm font-semibold">
                    目标宽高（留空表示不缩放）
                  </h3>
                  <Button size="sm" variant="secondary" onClick={useSpecSize} data-mp-path={`process.material.${material.key}.scale`}>
                    按规格填充尺寸
                  </Button>
                </div>
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
                  <Field label="目标宽 px" htmlFor="out-w">
                    <Input id="out-w" type="number" inputMode="numeric" value={p?.outW ?? ""} onChange={(e) => setOutWidth(e.target.value)} placeholder={String(eff.w)} />
                  </Field>
                  <Field label="目标高 px" htmlFor="out-h">
                    <Input
                      id="out-h"
                      type="number"
                      inputMode="numeric"
                      value={p?.outH ?? ""}
                      onChange={(e) => patch({ outH: e.target.value })}
                      placeholder={String(eff.h)}
                    />
                  </Field>
                  <label className="flex items-center gap-2 pb-3 text-sm">
                    <input type="checkbox" checked={!!p?.aspectLock} onChange={(e) => patch({ aspectLock: e.target.checked })} />
                    等比
                  </label>
                </div>
                <p className="text-muted-foreground text-xs">旋转并裁剪之后的工作尺寸是 {eff.w} × {eff.h}px，只填一边时另一边自动等比。</p>
              </section>

              <section className="grid gap-3 border-border border-t pt-4" aria-labelledby="sec-compress">
                <h3 id="sec-compress" className="text-sm font-semibold">
                  体积上限（很多老系统只认 ≤100KB）
                </h3>
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,180px)] sm:items-end" data-mp-path={`process.material.${material.key}.compress`}>
                  <Field label="目标上限" htmlFor="max-kb" hint="先降质量，质量见底再降分辨率">
                    <input
                      id="max-kb"
                      type="range"
                      min={0}
                      max={Math.max(600, Math.ceil(material.bytes / 1024) * 2)}
                      step={10}
                      value={p?.maxKb ?? 0}
                      aria-label="目标体积上限（KB），0 表示不限制"
                      onChange={(e) => patch({ maxKb: Number(e.target.value) })}
                      className="w-full"
                    />
                  </Field>
                  <Field label="KB（0 = 不限制）" htmlFor="max-kb-num">
                    <Input id="max-kb-num" type="number" inputMode="numeric" value={String(p?.maxKb ?? 0)} onChange={(e) => patch({ maxKb: Math.max(0, toInt(e.target.value) ?? 0) })} />
                  </Field>
                </div>
                <p className={cn("text-xs", oversize ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground")}>
                  当前原件 {fmt(material.bytes)}
                  {p && p.maxKb > 0 ? `，上限 ${p.maxKb}KB${oversize ? " —— 超了，应用后会自动压" : " —— 已在限内"}` : "，未设上限"}
                </p>
              </section>

              <section className="grid gap-3 border-border border-t pt-4" aria-labelledby="sec-format">
                <h3 id="sec-format" className="text-sm font-semibold">
                  输出格式与透明底
                </h3>
                <fieldset className="grid gap-2 sm:grid-cols-3" data-mp-path={`process.material.${material.key}.format`}>
                  <legend className="text-muted-foreground mb-1 text-xs">图片格式</legend>
                  {(["image/jpeg", "image/png", "image/webp"] as const).map((m2) => (
                    <label key={m2} className="border-border hover:bg-accent/60 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                      <input
                        type="radio"
                        name="mp-mime"
                        checked={p?.mime === m2}
                        onChange={() => patch({ mime: m2 })}
                        aria-label={`输出为${mimeShort(m2)}`}
                      />
                      {mimeShort(m2)}
                      <span className="text-muted-foreground ml-auto text-xs">{m2 === "image/jpeg" ? "最小" : m2 === "image/png" ? "无损偏大" : "兼容一般"}</span>
                    </label>
                  ))}
                </fieldset>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={!!p?.whiteBg}
                    onChange={(e) => patch({ whiteBg: e.target.checked })}
                    aria-label="透明背景铺成白色"
                    data-mp-path={`process.material.${material.key}.whitebg`}
                  />
                  透明底铺白（很多报名系统不认透明 PNG）
                </label>
              </section>

              <div className="border-border flex flex-wrap items-center gap-3 border-t pt-4">
                <Button
                  size="lg"
                  data-mp-path={`process.material.${material.key}.apply`}
                  onClick={() => void apply()}
                  disabled={applying || busy || !transform}
                >
                  <WandSparkles aria-hidden className="size-4" />
                  {applying ? "正在写回保管箱…" : "应用并覆盖原件"}
                </Button>
                {!transform && <span className="text-destructive text-sm">参数有冲突（多半是裁剪框超出原图），先修正再应用。</span>}
                {transform && <span className="text-muted-foreground text-xs">将执行：{describeTransform(material, transform)}</span>}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <History aria-hidden className="text-muted-foreground size-5" />
                操作痕迹
              </CardTitle>
              <CardDescription>覆盖原件的每一次改动都在这里，随时能看清「这张图被动过什么」。</CardDescription>
            </CardHeader>
            <CardContent>
              {material.operations.length === 0 ? (
                <p className="text-muted-foreground text-sm">这份材料还没被处理过，是当前保存的原始版本。</p>
              ) : (
                <ol
                  data-mp-path={`process.material.${material.key}.log`}
                  aria-label={`「${material.label}」的处理历史，共 ${material.operations.length} 条`}
                  className="grid gap-1.5"
                >
                  {material.operations.map((line, i) => (
                    <li key={`${line}-${i}`} className="bg-muted/60 rounded-lg px-3 py-1.5 font-mono text-xs">
                      <span className="text-muted-foreground mr-2">{i + 1}.</span>
                      {line}
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function defaultParams(m: StoredMaterial): Params {
  const spec = specById(m.specId);
  return {
    rotate: 0,
    useCrop: false,
    cropX: "0",
    cropY: "0",
    cropW: String(m.width ?? 0),
    cropH: String(m.height ?? 0),
    outW: "",
    outH: "",
    aspectLock: true,
    maxKb: spec?.maxBytes ? Math.floor(spec.maxBytes / 1024) : 0,
    mime: mimeOf(m.mime),
    whiteBg: false,
  };
}

/** 裁剪 → 旋转之后的尺寸，缩放以它为基准 */
function effectiveAfterRotate(p: Params | null, srcW: number, srcH: number): { w: number; h: number } {
  let w = p?.useCrop ? toInt(p.cropW) ?? srcW : srcW;
  let h = p?.useCrop ? toInt(p.cropH) ?? srcH : srcH;
  const rot = p ? ((p.rotate % 360) + 360) % 360 : 0;
  if (rot === 90 || rot === 270) [w, h] = [h, w];
  return { w: w || srcW, h: h || srcH };
}

function describeTransform(m: StoredMaterial, t: Transform): string {
  const parts: string[] = [];
  if (t.crop) parts.push(`裁剪 ${t.crop.w}×${t.crop.h}`);
  if (t.rotate) parts.push(`旋转 ${t.rotate}°`);
  if (t.width || t.height) parts.push(`缩放 ${t.width ?? "等比"}×${t.height ?? "等比"}`);
  if (t.whiteBg) parts.push("铺白底");
  parts.push(`输出 ${mimeShort(t.mime ?? "image/jpeg")}`);
  if (t.maxBytes) parts.push(`≤${fmt(t.maxBytes)}`);
  return `${parts.join(" · ")}（原件 ${m.width}×${m.height}）`;
}

function Panel({
  label,
  url,
  meta,
  highlight,
  figurePath,
}: {
  label: string;
  url: string | null;
  meta: string;
  highlight?: boolean;
  figurePath?: string;
}) {
  return (
    <figure className={cn("bg-muted/50 rounded-xl border border-border p-2", highlight && "border-primary/40 bg-primary/5")} data-mp-path={figurePath}>
      <figcaption className="text-muted-foreground mb-2 px-1 text-xs font-medium">{label}</figcaption>
      <div className="bg-background flex h-64 items-center justify-center overflow-hidden rounded-lg border border-border">
        {url ? <img src={url} alt={`${label}的图片预览`} className="max-h-full max-w-full object-contain" /> : <span className="text-muted-foreground text-sm">暂无可显示的图像</span>}
      </div>
      <p className="text-muted-foreground mt-2 px-1 text-xs">{meta}</p>
    </figure>
  );
}
