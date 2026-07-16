export type Status = "idle" | "recording" | "loading" | "generating" | "error" | "ready";
export type PackKind = "ai-prompt" | "evidence-only" | "rebuild-draft" | "site-rebuild-draft";
export type PackDownload = { name: string; blob: Blob; kind: PackKind };
