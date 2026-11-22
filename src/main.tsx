import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Toaster, toast } from "sonner";
import App from "@/App";
import { useTheme } from "@/hooks/useTheme";
import { installBridge } from "@/lib/native";
import { init } from "@/lib/store";
import "@/index.css";

function Root() {
  const { theme } = useTheme();
  return (
    <StrictMode>
      <App />
      <Toaster
        theme={theme}
        position="bottom-center"
        richColors
        closeButton
        containerAriaLabel="提示消息列表"
        customAriaLabel="提示消息"
        toastOptions={{ duration: 4500, closeButtonAriaLabel: "关闭这条提示" }}
      />
    </StrictMode>
  );
}

const container = document.getElementById("root");
if (!container) throw new Error("页面缺少 #root 挂载点");
createRoot(container).render(<Root />);

async function boot() {
  try {
    await init();
  } catch (e) {
    toast.error(`本机保管箱读取失败：${(e as Error).message}`, {
      description: "浏览器隐私模式或禁用 IndexedDB 时无法保存材料，页面仍可试用，但刷新会丢失。",
      duration: 10_000,
    });
  }
  installBridge();
}

void boot();
