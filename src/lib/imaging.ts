/** 材料处理：旋转 / 裁剪 / 缩放 / 压缩 / 格式转换，全在本机 Canvas 完成，文件不上传。 */

export type Transform = {
  /** 0 | 90 | 180 | 270，顺时针 */
  rotate?: number;
  /** 源图像素坐标 */
  crop?: { x: number; y: number; w: number; h: number };
  /** 目标像素尺寸；只给一个则等比 */
  width?: number;
  height?: number;
  /** 透明底转白底（很多报名系统不认透明 PNG） */
  whiteBg?: boolean;
  /** 输出格式 */
  mime?: "image/jpeg" | "image/png" | "image/webp";
  /** 目标体积上限，超出就降质量再降分辨率 */
  maxBytes?: number;
};

export type ProcessResult = {
  blob: Blob;
  width: number;
  height: number;
  mime: string;
  log: string[];
};

export async function probe(file: File | Blob): Promise<{ width?: number; height?: number }> {
  if (!file.type.startsWith("image/")) return {};
  try {
    const bmp = await createImageBitmap(file);
    const d = { width: bmp.width, height: bmp.height };
    bmp.close();
    return d;
  } catch {
    return {};
  }
}

function makeCanvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

/** 几何变换（裁剪 → 旋转 → 缩放），先出画布，再谈编码 */
function geometry(src: ImageBitmap | HTMLCanvasElement, t: Transform): { canvas: HTMLCanvasElement; log: string[] } {
  const log: string[] = [];
  let cur: HTMLCanvasElement | ImageBitmap = src;

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
    const from = `${cur.width}×${cur.height}`;
    const c = makeCanvas(tw, th);
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(cur, 0, 0, tw, th);
    cur = c;
    log.push(`缩放 ${from} → ${tw}×${th}`);
  }

  const out = makeCanvas(cur.width, cur.height);
  const ctx = out.getContext("2d")!;
  if (t.whiteBg) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, out.width, out.height);
    log.push("透明底已铺白");
  }
  ctx.drawImage(cur, 0, 0);
  return { canvas: out, log };
}

function encode(canvas: HTMLCanvasElement, mime: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error(`浏览器不支持输出 ${mime}`))),
      mime,
      mime === "image/png" ? undefined : quality,
    );
  });
}

export async function process(file: File | Blob, t: Transform): Promise<ProcessResult> {
  const src = await createImageBitmap(file as Blob);
  const { canvas, log } = geometry(src, t);
  src.close();

  const wantsLossy = t.mime !== "image/png";
  const mime = t.mime ?? (file.type === "image/png" ? "image/png" : "image/jpeg");

  let quality = 0.92;
  let scale = 1;
  let work = canvas;
  let blob = await encode(work, mime, quality);

  if (t.maxBytes && blob.size > t.maxBytes && wantsLossy) {
    // 先降质量（有损编码最便宜），质量见底再降分辨率
    for (let i = 0; i < 7 && blob.size > t.maxBytes; i++) {
      quality = Math.max(0.32, quality - 0.1);
      blob = await encode(work, mime, quality);
      log.push(`质量降至 ${Math.round(quality * 100)}`);
    }
    for (let i = 0; i < 8 && blob.size > t.maxBytes; i++) {
      scale *= 0.9;
      const c = makeCanvas(canvas.width * scale, canvas.height * scale);
      const ctx = c.getContext("2d")!;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(canvas, 0, 0, c.width, c.height);
      work = c;
      blob = await encode(work, mime, quality);
      log.push(`体积仍超，分辨率降至 ${Math.round(scale * 100)}% → ${(blob.size / 1024).toFixed(0)}KB`);
    }
  } else if (t.maxBytes && blob.size > t.maxBytes) {
    log.push("PNG 无损格式压不到目标体积，建议改选 JPG/WebP 输出");
  }

  return { blob, width: work.width, height: work.height, mime, log };
}
