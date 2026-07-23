export function isSmartCaptureProgressNotice(value: string) {
  return value === "智能捕获进行中" || value === "Smart Capture in progress" || value === "正在启动智能捕获..." || value === "Starting Smart Capture...";
}
