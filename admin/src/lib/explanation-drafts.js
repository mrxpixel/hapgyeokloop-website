/**
 * Pure helpers shared by the explanation-draft editor and export screen.
 */

export const EXPLANATION_DRAFT_RPC_NAMES = Object.freeze({
  get: 'admin_get_explanation_draft',
  save: 'admin_save_explanation_draft',
  delete: 'admin_delete_explanation_draft',
  apply: 'admin_apply_explanation_draft',
  rebase: 'admin_rebase_explanation_draft',
  list: 'admin_list_explanation_drafts',
});

export const EXPLANATION_DRAFT_EXPORT_FIELDS = Object.freeze([
  'id',
  'question_id',
  'subject_id',
  'year_session',
  'question_number',
  'status',
  'base_explanation',
  'draft_explanation',
  'direction_note',
  'created_at',
  'updated_at',
  'applied_at',
]);

function explanationLines(value) {
  const source = String(value ?? '').replace(/\r\n?/g, '\n');
  return source === '' ? [] : source.split('\n');
}

/**
 * Produces a stable line-level diff without mutating either input.
 *
 * A trailing newline is represented by an empty final line. Replacements are
 * emitted as delete operations followed by insert operations, which lets the
 * comparison UI put the old text on the left and the new text on the right.
 */
export function diffExplanationLines(baseExplanation, draftExplanation) {
  const baseLines = explanationLines(baseExplanation);
  const draftLines = explanationLines(draftExplanation);
  const baseCount = baseLines.length;
  const draftCount = draftLines.length;

  // Longest-common-subsequence lengths for every remaining pair of suffixes.
  const lcs = Array.from(
    { length: baseCount + 1 },
    () => new Uint32Array(draftCount + 1),
  );

  for (let baseIndex = baseCount - 1; baseIndex >= 0; baseIndex -= 1) {
    for (let draftIndex = draftCount - 1; draftIndex >= 0; draftIndex -= 1) {
      lcs[baseIndex][draftIndex] = baseLines[baseIndex] === draftLines[draftIndex]
        ? lcs[baseIndex + 1][draftIndex + 1] + 1
        : Math.max(lcs[baseIndex + 1][draftIndex], lcs[baseIndex][draftIndex + 1]);
    }
  }

  const operations = [];
  let baseIndex = 0;
  let draftIndex = 0;

  while (baseIndex < baseCount || draftIndex < draftCount) {
    if (
      baseIndex < baseCount
      && draftIndex < draftCount
      && baseLines[baseIndex] === draftLines[draftIndex]
    ) {
      operations.push({
        type: 'equal',
        text: baseLines[baseIndex],
        oldLineNumber: baseIndex + 1,
        newLineNumber: draftIndex + 1,
      });
      baseIndex += 1;
      draftIndex += 1;
    } else if (
      baseIndex < baseCount
      && (
        draftIndex >= draftCount
        || lcs[baseIndex + 1][draftIndex] >= lcs[baseIndex][draftIndex + 1]
      )
    ) {
      operations.push({
        type: 'delete',
        text: baseLines[baseIndex],
        oldLineNumber: baseIndex + 1,
        newLineNumber: null,
      });
      baseIndex += 1;
    } else {
      operations.push({
        type: 'insert',
        text: draftLines[draftIndex],
        oldLineNumber: null,
        newLineNumber: draftIndex + 1,
      });
      draftIndex += 1;
    }
  }

  return operations;
}

function assertDraftRows(rows, operation) {
  if (!Array.isArray(rows)) {
    throw new TypeError(`${operation} expects an array of draft rows`);
  }
}

/** Serializes one complete draft object per line, with a final line break. */
export function explanationDraftsToJsonl(rows) {
  assertDraftRows(rows, 'explanationDraftsToJsonl');
  if (rows.length === 0) return '';
  return `${rows.map(row => JSON.stringify(row)).join('\n')}\n`;
}

function exportFields(rows) {
  const fields = [...EXPLANATION_DRAFT_EXPORT_FIELDS];
  const seen = new Set(fields);

  rows.forEach(row => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return;
    Object.keys(row).forEach(field => {
      if (!seen.has(field)) {
        seen.add(field);
        fields.push(field);
      }
    });
  });

  return fields;
}

function csvValue(value) {
  if (value === null || value === undefined) return '';
  const source = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return /[",\r\n]/.test(source) ? `"${source.replace(/"/g, '""')}"` : source;
}

/**
 * Serializes draft rows as Excel-friendly UTF-8 CSV.
 *
 * The BOM is always present, including for an empty result. Known RPC fields
 * keep a stable order and any additional own fields are appended to the CSV.
 */
export function explanationDraftsToCsv(rows) {
  assertDraftRows(rows, 'explanationDraftsToCsv');
  const fields = exportFields(rows);
  const lines = [fields.map(csvValue).join(',')];

  rows.forEach(row => {
    lines.push(fields.map(field => csvValue(row?.[field])).join(','));
  });

  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

function requiredQuestionId(values, action) {
  const questionId = String(values?.questionId ?? '').trim();
  if (questionId === '') {
    throw new TypeError(`${action} requires a questionId`);
  }
  return questionId;
}

function nullableFilter(value) {
  const normalized = String(value ?? '').trim();
  return normalized === '' ? null : normalized;
}

/**
 * Maps UI-shaped values to the exact PostgreSQL RPC parameter names.
 * Supported actions: get, save, delete, apply, rebase, list.
 */
export function buildExplanationDraftRpcParams(action, values = {}) {
  if (!Object.hasOwn(EXPLANATION_DRAFT_RPC_NAMES, action)) {
    throw new TypeError(`Unsupported explanation-draft RPC action: ${action}`);
  }

  if (action === 'list') {
    const status = nullableFilter(values.status);
    if (status !== null && status !== 'draft' && status !== 'applied') {
      throw new RangeError(`Unsupported explanation-draft status: ${status}`);
    }
    return {
      p_subject_id: nullableFilter(values.subjectId),
      p_status: status,
    };
  }

  const params = { p_question_id: requiredQuestionId(values, action) };
  if (action === 'save') {
    params.p_draft = String(values.draft ?? '');
    params.p_direction_note = String(values.directionNote ?? '');
  }
  return params;
}
