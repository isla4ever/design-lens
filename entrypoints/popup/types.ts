export type Status = "idle" | "recording" | "loading" | "generating" | "error" | "ready";
export type PackKind = "ai-prompt" | "evidence-only";
export type PackDownload = { name: string; blob: Blob; kind: PackKind };
