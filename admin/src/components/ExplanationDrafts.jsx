import React from 'react';
import { EmptyState, ErrorBox, Icon, Loader, rpc, useAsync } from '../admin-lib.jsx';
import {
  EXPLANATION_DRAFT_RPC_NAMES,
  buildExplanationDraftRpcParams,
  diffExplanationLines,
  explanationDraftsToCsv,
  explanationDraftsToJsonl,
} from '../lib/explanation-drafts.js';

const { useMemo, useState } = React;

function responseRows(value) {
  if (Array.isArray(value)) return value.filter(row => row && typeof row === 'object');
  return value && typeof value === 'object' ? [value] : [];
}

function alignedDiffRows(baseExplanation, draftExplanation) {
  const operations = diffExplanationLines(baseExplanation, draftExplanation);
  const rows = [];

  for (let index = 0; index < operations.length;) {
    const operation = operations[index];
    if (operation.type === 'equal') {
      rows.push({ base: operation, draft: operation, type: 'equal' });
      index += 1;
      continue;
    }

    const deleted = [];
    const inserted = [];
    while (index < operations.length && operations[index].type !== 'equal') {
      const changedOperation = operations[index];
      if (changedOperation.type === 'delete') deleted.push(changedOperation);
      if (changedOperation.type === 'insert') inserted.push(changedOperation);
      index += 1;
    }

    const changeCount = Math.max(deleted.length, inserted.length);
    for (let changeIndex = 0; changeIndex < changeCount; changeIndex += 1) {
      rows.push({
        base: deleted[changeIndex] || null,
        draft: inserted[changeIndex] || null,
        type: 'change',
      });
    }
  }

  return rows;
}

function DiffCell({ operation, side }) {
  const type = operation?.type || 'empty';
  const lineNumber = side === 'base'
    ? operation?.oldLineNumber
    : operation?.newLineNumber;
  const marker = type === 'delete' ? '−' : type === 'insert' ? '+' : '';

  return (
    <div className={`explanation-diff-cell ${type}`} data-side={side}>
      <span className="explanation-diff-line-number" aria-hidden="true">
        {lineNumber ?? '\u00a0'}
      </span>
      <span className="explanation-diff-marker" aria-hidden="true">
        {marker || '\u00a0'}
      </span>
      <span className="explanation-diff-text">
        {operation ? (operation.text || '\u00a0') : '\u00a0'}
      </span>
    </div>
  );
}

export function ExplanationDiff({ baseExplanation, draftExplanation }) {
  const rows = useMemo(
    () => alignedDiffRows(baseExplanation, draftExplanation),
    [baseExplanation, draftExplanation],
  );

  return (
    <div className="explanation-diff">
      <div className="explanation-diff-headers" aria-hidden="true">
        <div className="explanation-diff-header base">원본</div>
        <div className="explanation-diff-header draft">초안</div>
      </div>
      {rows.length === 0 ? (
        <div className="explanation-diff-empty-state">원본과 초안이 모두 비어 있습니다.</div>
      ) : (
        <div className="explanation-diff-body">
          {rows.map((row, index) => (
            <div
              className={`explanation-diff-row ${row.type}`}
              key={`${row.base?.oldLineNumber ?? 'blank'}-${row.draft?.newLineNumber ?? 'blank'}-${index}`}
            >
              <DiffCell operation={row.base} side="base" />
              <DiffCell operation={row.draft} side="draft" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function subjectName(subject, fallback) {
  if (!subject) return fallback || '—';
  return subject.name || subject.subject_name || subject.code || subject.id || fallback || '—';
}

function subjectOptionLabel(subject) {
  const name = subjectName(subject);
  const exam = subject.exam_name || subject.exam_code || subject.exam_id;
  return exam ? `${exam} · ${name}` : name;
}

function directionPreview(value, maxLength = 72) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return '—';
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function localDateStamp() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function downloadText(text, filename, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function statusLabel(status) {
  if (status === 'draft') return '초안';
  if (status === 'applied') return '반영됨';
  return status || '—';
}

function DraftStatus({ status }) {
  const badgeClass = status === 'draft'
    ? 'badge-warning'
    : status === 'applied' ? 'badge-success' : 'badge-neutral';
  return <span className={`badge ${badgeClass}`}>{statusLabel(status)}</span>;
}

export function ExplanationDrafts({ pushToast }) {
  const [subjectId, setSubjectId] = useState('');
  const [status, setStatus] = useState('draft');
  const [openId, setOpenId] = useState(null);

  const subjectsRequest = useAsync(
    () => rpc('admin_get_inspection_subjects', { p_exam_id: null }),
  );
  const draftsRequest = useAsync(
    () => rpc(
      EXPLANATION_DRAFT_RPC_NAMES.list,
      buildExplanationDraftRpcParams('list', { subjectId, status }),
    ),
    [subjectId, status],
  );

  const subjects = useMemo(() => responseRows(subjectsRequest.data), [subjectsRequest.data]);
  const drafts = useMemo(() => responseRows(draftsRequest.data), [draftsRequest.data]);
  const subjectById = useMemo(
    () => new Map(subjects.map(subject => [String(subject.id), subject])),
    [subjects],
  );

  const exportDrafts = (format) => {
    try {
      const stamp = localDateStamp();
      if (format === 'jsonl') {
        downloadText(
          explanationDraftsToJsonl(drafts),
          `question-explanation-drafts-${stamp}.jsonl`,
          'application/x-ndjson;charset=utf-8',
        );
      } else {
        downloadText(
          explanationDraftsToCsv(drafts),
          `question-explanation-drafts-${stamp}.csv`,
          'text/csv;charset=utf-8',
        );
      }
      pushToast?.(`${drafts.length}건을 ${format.toUpperCase()}로 내보냈습니다`);
    } catch (error) {
      if (pushToast) pushToast(error?.message || '내보내기에 실패했습니다', 'info');
      else console.error(error);
    }
  };

  return (
    <div className="explanation-drafts">
      <div className="toolbar explanation-drafts-toolbar">
        <label className="explanation-drafts-filter">
          <span className="field-label">과목</span>
          <select
            className="field-input"
            value={subjectId}
            onChange={event => {
              setSubjectId(event.target.value);
              setOpenId(null);
            }}
            disabled={subjectsRequest.loading}
          >
            <option value="">{subjectsRequest.loading ? '과목 불러오는 중...' : '전체 과목'}</option>
            {subjects.map(subject => (
              <option key={subject.id || `${subject.exam_id}-${subject.code}`} value={subject.id}>
                {subjectOptionLabel(subject)}
              </option>
            ))}
          </select>
        </label>

        <label className="explanation-drafts-filter">
          <span className="field-label">상태</span>
          <select
            className="field-input"
            value={status}
            onChange={event => {
              setStatus(event.target.value);
              setOpenId(null);
            }}
          >
            <option value="draft">초안</option>
            <option value="applied">반영됨</option>
            <option value="">전체</option>
          </select>
        </label>

        <div className="spacer" />
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => exportDrafts('jsonl')}
          disabled={draftsRequest.loading || drafts.length === 0}
        >
          JSONL 내보내기
        </button>
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => exportDrafts('csv')}
          disabled={draftsRequest.loading || drafts.length === 0}
        >
          CSV 내보내기
        </button>
        <button
          type="button"
          className="icon-btn"
          onClick={() => {
            subjectsRequest.refetch();
            draftsRequest.refetch();
          }}
          title="새로고침"
        >
          <Icon name="refresh" />
        </button>
      </div>

      {subjectsRequest.error && (
        <div className="explanation-drafts-subject-error">
          <ErrorBox error={subjectsRequest.error} retry={subjectsRequest.refetch} />
        </div>
      )}

      {draftsRequest.loading ? (
        <Loader label="해설 변경안 불러오는 중..." />
      ) : draftsRequest.error ? (
        <ErrorBox error={draftsRequest.error} retry={draftsRequest.refetch} />
      ) : drafts.length === 0 ? (
        <EmptyState
          icon="edit"
          title="해설 변경안이 없습니다"
          sub="현재 필터에 맞는 변경안이 없어요."
        />
      ) : (
        <div className="sheet explanation-drafts-sheet">
          <div className="explanation-drafts-list-head" aria-hidden="true">
            <span>과목</span>
            <span>회차</span>
            <span>번호</span>
            <span>상태</span>
            <span>방향성</span>
            <span>수정일</span>
            <span />
          </div>
          <div className="explanation-drafts-list">
            {drafts.map((draft, index) => {
              const rowId = draft.id || `${draft.question_id}-${draft.status}-${index}`;
              const isOpen = openId === rowId;
              const detailsId = `explanation-draft-details-${String(rowId).replace(/[^a-zA-Z0-9_-]/g, '-')}`;
              const subject = subjectById.get(String(draft.subject_id));

              return (
                <article className={`explanation-draft-item ${isOpen ? 'open' : ''}`} key={rowId}>
                  <button
                    type="button"
                    className="explanation-draft-summary"
                    aria-expanded={isOpen}
                    aria-controls={detailsId}
                    onClick={() => setOpenId(isOpen ? null : rowId)}
                  >
                    <span className="explanation-draft-subject" title={draft.subject_id || undefined}>
                      {subjectName(subject, draft.subject_id)}
                    </span>
                    <span className="explanation-draft-session">
                      {draft.year_session == null ? '—' : `${draft.year_session}회`}
                    </span>
                    <span className="explanation-draft-question">
                      {draft.question_number == null ? '—' : `${draft.question_number}번`}
                    </span>
                    <span className="explanation-draft-status"><DraftStatus status={draft.status} /></span>
                    <span className="explanation-draft-note" title={draft.direction_note || undefined}>
                      {directionPreview(draft.direction_note)}
                    </span>
                    <time
                      className="explanation-draft-date"
                      dateTime={draft.updated_at || undefined}
                      title={draft.updated_at || undefined}
                    >
                      {formatDateTime(draft.updated_at)}
                    </time>
                    <span className="explanation-draft-chevron" aria-hidden="true">›</span>
                  </button>

                  {isOpen && (
                    <div className="explanation-draft-details" id={detailsId}>
                      <div className="explanation-draft-details-head">
                        <span>문항 ID</span>
                        <code>{draft.question_id || '—'}</code>
                      </div>
                      <ExplanationDiff
                        baseExplanation={draft.base_explanation}
                        draftExplanation={draft.draft_explanation}
                      />
                      <div className="explanation-draft-direction">
                        <div className="explanation-draft-direction-title">방향성</div>
                        <div className="explanation-draft-direction-body">
                          {draft.direction_note || '작성된 방향성이 없습니다.'}
                        </div>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
