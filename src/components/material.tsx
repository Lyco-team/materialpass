import { useEffect, useState } from "react";
import { FileText, WandSparkles, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { categoryLabel, mimeShort } from "@/components/labels";
import { navigate } from "@/hooks/useRoute";
import { getMaterialBlob } from "@/lib/store";
import { fmt, specById } from "@/lib/specs";
import { cn } from "@/lib/utils";
import type { StoredMaterial } from "@/lib/types";

/** 材料二进制只从本机 IndexedDB 取，转成临时 object URL 显示，卸载即释放。rev 变化时重新取（原件被处理覆盖后要刷新）。 */
export function useMaterialUrl(key: string | null | undefined, rev?: string | number): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    setUrl(null);
    if (!key) return;
    let alive = true;
    let created: string | null = null;
    void getMaterialBlob(key)
      .then((blob) => {
        if (!blob || !alive) return;
        created = URL.createObjectURL(blob);
        setUrl(created);
      })
      .catch((e: unknown) => console.error("读取本机材料失败", e));
    return () => {
      alive = false;
      if (created) URL.revokeObjectURL(created);
    };
  }, [key, rev]);

  return url;
}

export function MaterialThumb({
  material,
  path,
  onOpen,
  size = "md",
}: {
  material: StoredMaterial;
  path: string;
  onOpen: () => void;
  size?: "sm" | "md";
}) {
  const url = useMaterialUrl(material.key, `${material.bytes}-${material.mime}`);
  const box = size === "sm" ? "size-12" : "size-16";
  return (
    <button
      type="button"
      data-mp-path={path}
      onClick={onOpen}
      aria-label={`放大查看材料「${material.label}」（${mimeShort(material.mime)}，${fmt(material.bytes)}）`}
      className={cn(
        "shrink-0 overflow-hidden rounded-lg border border-border bg-muted",
        "flex items-center justify-center hover:ring-2 hover:ring-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        box,
      )}
    >
      {url && material.mime.startsWith("image/") ? (
        <img src={url} alt="" className="size-full object-cover" />
      ) : (
        <FileText aria-hidden className="text-muted-foreground size-6" />
      )}
    </button>
  );
}

export function MaterialPreviewDialog({
  material,
  onClose,
}: {
  material: StoredMaterial | null;
  onClose: () => void;
}) {
  const url = useMaterialUrl(material?.key, `${material?.bytes}-${material?.mime}`);
  const spec = specById(material?.specId);
  const isImage = !!material?.mime.startsWith("image/");

  return (
    <Dialog
      open={!!material}
      onClose={onClose}
      title={material ? `查看材料：${material.label}` : "查看材料"}
      description={material ? `${material.fileName} · ${mimeShort(material.mime)} · ${fmt(material.bytes)}` : undefined}
      className="max-w-3xl"
      footer={
        material && (
          <>
            <Button variant="secondary" onClick={onClose}>
              <X className="size-4" />
              关闭
            </Button>
            {isImage && (
              <Button onClick={() => navigate("process", material.key)}>
                <WandSparkles className="size-4" />
                去处理这一份
              </Button>
            )}
          </>
        )
      }
    >
      {material && (
        <div className="grid gap-4">
          <div className="bg-muted flex max-h-[52vh] items-center justify-center overflow-auto rounded-lg border border-border p-2">
            {url && isImage ? (
              <img src={url} alt={`材料「${material.label}」的预览图`} className="max-h-[50vh] w-auto object-contain" />
            ) : url ? (
              <iframe src={url} title={`材料「${material.label}」文档预览`} className="h-[50vh] w-full rounded-lg bg-white" />
            ) : (
              <p className="text-muted-foreground p-6 text-sm">本机没有读到这份文件的二进制，可能备份导入时未包含，请重新上传。</p>
            )}
          </div>
          <dl className="text-sm grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
            <div>
              <dt className="text-muted-foreground text-xs">分类</dt>
              <dd>{categoryLabel(material.category)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">像素</dt>
              <dd>{material.width && material.height ? `${material.width} × ${material.height}` : "非图片，无像素"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">有效期</dt>
              <dd>{material.expiry ?? "未登记"}</dd>
            </div>
            <div className="col-span-2 sm:col-span-3">
              <dt className="text-muted-foreground text-xs">目标规格</dt>
              <dd className="mt-1">
                {spec ? (
                  <Badge variant="secondary">{spec.label}</Badge>
                ) : (
                  <Badge variant="warn">未设定 —— 在资料库这一行选一个规格才能校验</Badge>
                )}
              </dd>
            </div>
          </dl>
        </div>
      )}
    </Dialog>
  );
}
