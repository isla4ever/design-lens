import React from "react";
import { Clock3, Trash2 } from "lucide-react";
import type { Locale } from "../../src/shared/i18n";
import type { WorkspaceCaptureRecord } from "../../src/storage/capture-project-store";

export function WorkspaceHistory({ records, selectedId, locale, onSelect, onDelete }: {
  records: WorkspaceCaptureRecord[];
  selectedId: string | null;
  locale: Locale;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const zh = locale === "zh";
  if (!records.length) return <p className="workspace-placeholder">{zh ? "暂无历史结果" : "No capture history"}</p>;
  return (
    <section className="history-list" aria-label={zh ? "最近捕获" : "Recent captures"}>
      {records.map((record) => (
        <article className={selectedId === record.id ? "history-item selected" : "history-item"} key={record.id}>
          <button className="history-select" type="button" onClick={() => onSelect(record.id)} aria-pressed={selectedId === record.id}>
            <span>{record.mode === "rebuild" ? (zh ? "重建" : "Rebuild") : (zh ? "参照" : "Reference")}</span>
            <strong>{record.title}</strong>
            <small><Clock3 aria-hidden="true" />{formatTime(record.updatedAt, locale)}</small>
          </button>
          <button className="history-delete" type="button" aria-label={zh ? `删除 ${record.title}` : `Delete ${record.title}`} onClick={() => onDelete(record.id)}><Trash2 aria-hidden="true" /></button>
        </article>
      ))}
    </section>
  );
}

function formatTime(value: string, locale: Locale) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}
