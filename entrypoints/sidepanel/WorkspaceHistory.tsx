import React, { useState } from "react";
import { AlertTriangle, Clock3, Trash2 } from "lucide-react";
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
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
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
          <button className="history-delete" type="button" aria-label={zh ? `删除 ${record.title}` : `Delete ${record.title}`} onClick={() => setPendingDeleteId(record.id)}><Trash2 aria-hidden="true" /></button>
          {pendingDeleteId === record.id ? (
            <div className="history-confirmation" role="alertdialog" aria-labelledby={`delete-title-${record.id}`} onKeyDown={(event) => {
              if (event.key === "Escape") setPendingDeleteId(null);
            }}>
              <span id={`delete-title-${record.id}`}><AlertTriangle aria-hidden="true" />{zh ? "确认删除这条记录？" : "Delete this capture?"}</span>
              <div>
                <button className="history-cancel" type="button" onClick={() => setPendingDeleteId(null)}>{zh ? "取消" : "Cancel"}</button>
                <button className="history-confirm" type="button" autoFocus onClick={() => {
                  setPendingDeleteId(null);
                  onDelete(record.id);
                }}>{zh ? "删除" : "Delete"}</button>
              </div>
            </div>
          ) : null}
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
