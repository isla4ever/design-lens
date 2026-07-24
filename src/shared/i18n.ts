export type Locale = "zh" | "en";

export type I18nMessages = {
  appName: string;
  tagline: string;
  eyebrow: string;
  primaryAction: string;
  secondaryAction: string;
  quickStart: string;
  pickHint: string;
  openPanel: string;
  opening: string;
  opened: string;
  picking: string;
  pickOpened: string;
  normalPageOnly: string;
  openHint: string;
  language: string;
  chinese: string;
  english: string;
  lightTheme: string;
  darkTheme: string;
  systemTheme: string;
  scanPage: string;
  pickElement: string;
  idleDescription: string;
  runningScan: string;
  scanTiming: string;
  scanNow: string;
  scanAfterDelay: string;
  recorderTitle: string;
  recorderDescription: string;
  startRecording: string;
  stopRecording: string;
  recordingActive: string;
  runningPick: string;
  tryAgain: string;
  close: string;
  colors: string;
  vars: string;
  components: string;
  motion: string;
  noComponents: string;
  overview: string;
  evidence: string;
  exports: string;
  exportHint: string;
  tokens: string;
  skill: string;
  tailwind: string;
  emptyCharacter: string;
};

export const DEFAULT_LOCALE: Locale = "zh";

export const messages: Record<Locale, I18nMessages> = {
  zh: {
    appName: "Design Lens",
    tagline: "把当前网页转成可复用的前端风格参考。",
    eyebrow: "网页设计采集器",
    primaryAction: "智能捕获",
    secondaryAction: "选取组件",
    quickStart: "一次点击自动收集页面结构、视觉与短时交互证据。",
    pickHint: "选取组件时会进入轻量遮罩模式，减少遮挡。",
    openPanel: "打开控制板",
    opening: "正在启动智能捕获...",
    opened: "已生成当前页面的设计参考。",
    picking: "正在进入组件选取...",
    pickOpened: "请在页面中选取要捕捉的组件或模块。",
    normalPageOnly: "请先打开普通 http/https 网页。Chrome 内部页面不能检查。",
    openHint: "打开任意网页，一次点击完成安全的基础捕获。",
    language: "语言",
    chinese: "中文",
    english: "English",
    lightTheme: "浅色模式",
    darkTheme: "深色模式",
    systemTheme: "跟随系统",
    scanPage: "扫描页面",
    pickElement: "选取组件",
    idleDescription: "从当前页面捕捉 token、组件、布局和动效。",
    runningScan: "正在生成设计分析...",
    scanTiming: "会合并你刚才浏览、滚动和悬停时出现的页面状态。",
    scanNow: "立即采集",
    scanAfterDelay: "结束录制",
    recorderTitle: "录制当前页面",
    recorderDescription: "点击开始后，手动滚动、悬停和触发页面动画；准备好后点结束录制生成结果。",
    startRecording: "开始录制",
    stopRecording: "结束录制",
    recordingActive: "正在录制：请浏览页面、滚动、悬停关键区域。",
    runningPick: "正在选取组件...",
    tryAgain: "重试",
    close: "关闭",
    colors: "颜色",
    vars: "变量",
    components: "组件",
    motion: "动效",
    noComponents: "未识别到组件",
    overview: "概览",
    evidence: "证据",
    exports: "导出",
    exportHint: "生成给设计或开发复用的资料。",
    tokens: "Tokens",
    skill: "Skill",
    tailwind: "Tailwind",
    emptyCharacter: "打开 Design Lens 并运行扫描来捕捉当前页面。"
  },
  en: {
    appName: "Design Lens",
    tagline: "Turn the current page into reusable frontend style references.",
    eyebrow: "Web design capture",
    primaryAction: "Smart Capture",
    secondaryAction: "Pick area",
    quickStart: "Collect structure, visuals, and a short passive interaction window in one click.",
    pickHint: "Picking a component uses a lighter overlay to reduce blockage.",
    openPanel: "Open panel",
    opening: "Starting Smart Capture...",
    opened: "Design reference generated for this page.",
    picking: "Starting component picker...",
    pickOpened: "Pick the component or module to capture on the page.",
    normalPageOnly: "Open a normal http/https webpage first. Chrome internal pages cannot be inspected.",
    openHint: "Open any website and capture a safe baseline in one click.",
    language: "Language",
    chinese: "中文",
    english: "English",
    lightTheme: "Light mode",
    darkTheme: "Dark mode",
    systemTheme: "System",
    scanPage: "Scan page",
    pickElement: "Pick area",
    idleDescription: "Capture tokens, components, layout, and motion from this page.",
    runningScan: "Generating design analysis...",
    scanTiming: "Merges the states you just browsed, scrolled, and hovered through.",
    scanNow: "Capture now",
    scanAfterDelay: "Finish recording",
    recorderTitle: "Record this page",
    recorderDescription: "Start recording, then scroll, hover, and trigger page motion. Finish recording when the important states have appeared.",
    startRecording: "Start recording",
    stopRecording: "Finish recording",
    recordingActive: "Recording: browse, scroll, and hover key areas.",
    runningPick: "Running component picker...",
    tryAgain: "Try again",
    close: "Close",
    colors: "Colors",
    vars: "Vars",
    components: "Components",
    motion: "Motion",
    noComponents: "No components detected",
    overview: "Overview",
    evidence: "Evidence",
    exports: "Export",
    exportHint: "Generate reusable references for design or development.",
    tokens: "Tokens",
    skill: "Skill",
    tailwind: "Tailwind",
    emptyCharacter: "Open Design Lens and run a scan to capture this page."
  }
};

export function normalizeLocale(value: unknown): Locale {
  return value === "en" ? "en" : "zh";
}
