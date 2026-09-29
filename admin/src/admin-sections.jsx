/* ─── Section components ─── */
import React from 'react'
const { useState, useEffect, useMemo, useRef } = React
import { marked } from 'marked'
import { sb, rpc, Icon, useAsync, relativeTime, fmtNum, Loader, ErrorBox, EmptyState } from './admin-lib.jsx'
import MarkdownEditor from './components/MarkdownEditor.jsx'
import { ExplanationDiff, ExplanationDrafts } from './components/ExplanationDrafts.jsx'
import {
  EXPLANATION_DRAFT_RPC_NAMES,
  buildExplanationDraftRpcParams,
} from './lib/explanation-drafts.js'
import { parseStemGivens, HANGUL_CONSONANTS, CIRCLED_HANGUL_KEYS, GEOMETRIC_MARKER_KEYS } from './lib/stem-givens-parse.js'
import {
  CONCEPT_TABLE_MERGE_LEFT,
  CONCEPT_TABLE_MERGE_UP,
  canMergeConceptTableSelection,
  conceptTableMergeDiscardCount,
  mergeConceptTableSelection,
  selectConceptTableRange,
  unmergeConceptTableSelection,
  createConceptTableCell,
  createEmptyConceptTable,
  conceptTableMergeGroups,
  normalizeConceptTableRows,
  parseConceptTableRows,
  sanitizeConceptTableCell,
  sanitizeConceptTableDiagonalLabel,
  serializeConceptTable,
  listConceptTableBlocks,
  splitTableCellLines,
} from './lib/concept-table.js'
import {
  choiceHeadersTruncation,
  deleteStemBlock,
  insertStemBlock,
  MAX_CHOICE_HEADER_COLUMNS,
  moveStemBlock,
  parseStemBlocks,
  resizeChoiceHeaders,
  serializeStemBlocks,
  updateStemBlock,
  validateStemBlocksForSave,
} from './lib/stem-blocks.js'
import {
  CHOICE_COLUMN_SEPARATOR,
  DEFAULT_CHOICE_COLUMNS,
  MAX_CHOICE_COLUMNS,
  appendChoiceHeadersBlock,
  choiceColumnMismatches,
  choiceColumnsTruncation,
  choiceColumnsWithLineBreak,
  choiceForSave,
  choiceLabel,
  choiceText,
  removeChoiceHeadersBlock,
  resizeAllChoiceColumns,
  resizeChoiceColumns,
  setChoiceColumn,
  splitChoiceColumns,
} from './lib/choice-columns.js'
import {
  MAX_QUESTION_IMAGE_BYTES,
  QUESTION_IMAGE_MAX_WIDTH,
  fitQuestionImageSize,
  formatByteSize,
  parseQuestionImage,
  questionImageAcceptAttribute,
  questionImageForSave,
} from './lib/question-image.js'

// marked 옵션은 MarkdownEditor.jsx에서 단일 설정 (중복 setOptions 금지)

/* ─── Overview ─── */
function Overview({ goto }) {
  const { loading, data, error, refetch } = useAsync(() => rpc('admin_get_dashboard_metrics', { p_days: 30 }));
  const audit = useAsync(() => rpc('admin_get_audit_log', { p_limit: 8 }));

  if (loading) return <Loader/>;
  if (error) return <ErrorBox error={error} retry={refetch}/>;

  const k = data?.kpi || {};
  const signups = data?.signups_daily || [];
  const subjectAct = data?.subject_activity || [];

  const kpis = [
    { label: 'DAU', value: fmtNum(k.dau), sub: 'WAU ' + fmtNum(k.wau) + ' · MAU ' + fmtNum(k.mau) },
    { label: '7일 신규', value: fmtNum(k.new_users_7d), sub: '30일 ' + fmtNum(k.new_users_30d) },
    { label: '스티키니스', value: (k.stickiness_pct ?? 0) + '%', sub: 'DAU / MAU' },
    { label: '유료 비중', value: (k.paid_ratio_pct ?? 0) + '%', sub: fmtNum(k.paid_users) + ' / ' + fmtNum(k.total_profiles) },
  ];

  return (
    <>
      <div className="kpi-grid">
        {kpis.map(kpi => (
          <div key={kpi.label} className="kpi">
            <div className="kpi-label">{kpi.label}</div>
            <div className="kpi-value">{kpi.value}</div>
            <div className="kpi-delta"><span>{kpi.sub}</span></div>
          </div>
        ))}
      </div>

      <div className="grid-2">
        <div className="sheet">
          <div className="sheet-head">
            <div><div className="sheet-title">일별 신규 가입</div><div className="sheet-sub">최근 30일</div></div>
            <button className="btn btn-xs" onClick={() => goto('analytics')}>분석 보기 →</button>
          </div>
          <div className="sheet-body" style={{padding:'0 8px 8px'}}>
            <BarChart data={signups.map(s => ({ date: Date.parse(s.date), value: s.count || 0 }))} color="var(--violet)"/>
          </div>
        </div>
        <div className="sheet">
          <div className="sheet-head"><div><div className="sheet-title">빠른 작업</div><div className="sheet-sub">자주 하는 업무</div></div></div>
          <div className="sheet-body" style={{display:'grid', gap:8}}>
            <QuickAction icon="flag" color="warning" title="신고 관리" sub="대기·처리중 검토" onClick={() => goto('reports')}/>
            <QuickAction icon="user" color="violet" title="관리자 승인 대기 확인" sub="가입 신청 검토" onClick={() => goto('admins')}/>
            <QuickAction icon="megaphone" color="info" title="공지사항 작성" sub="앱에 바로 발행" onClick={() => goto('announcements')}/>
            <QuickAction icon="phone" color="danger" title="앱 버전 설정" sub="force_update 주의" onClick={() => goto('app-version')}/>
          </div>
        </div>
      </div>

      <div className="grid-2">
        <div className="sheet">
          <div className="sheet-head">
            <div><div className="sheet-title">최근 활동</div><div className="sheet-sub">팀 전체 감사 로그</div></div>
            <button className="btn btn-xs" onClick={() => goto('audit-log')}>전체 →</button>
          </div>
          <div className="sheet-body flush feed">
            {audit.loading ? <Loader/> : audit.error ? <ErrorBox error={audit.error} retry={audit.refetch}/> :
              (audit.data || []).length === 0 ? <EmptyState icon="log" title="활동 내역 없음"/> :
              (audit.data || []).slice(0, 6).map((a, i) => (
                <div key={a.id || i} className="feed-item">
                  <div className="feed-av" style={{background:'var(--surface-3)', color:'var(--fg-muted)'}}>{(a.admin_name || a.admin_email || '?')[0]}</div>
                  <div className="feed-text">
                    <strong>{a.admin_name || a.admin_email?.split('@')[0] || '알 수 없음'}</strong>{' '}
                    <span className="action">{actionLabel(a.action)}</span>{' '}
                    <span className="target">{a.target_label || a.target_type + ' #' + (a.target_id || '').slice(0,8)}</span>
                  </div>
                  <div className="feed-time">{relativeTime(a.created_at)}</div>
                </div>
              ))
            }
          </div>
        </div>
        <div className="sheet">
          <div className="sheet-head"><div><div className="sheet-title">과목별 활동</div><div className="sheet-sub">30일 리뷰 수</div></div></div>
          <div className="sheet-body" style={{display:'flex', flexDirection:'column', gap:10}}>
            {subjectAct.length === 0 && <EmptyState icon="book" title="데이터 없음"/>}
            {(() => {
              const max = Math.max(1, ...subjectAct.map(s => s.review_count || 0));
              return subjectAct.slice(0, 6).map(s => (
                <div key={s.subject_id}>
                  <div style={{display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:4}}>
                    <span>{s.subject_name}</span>
                    <span style={{fontFamily:'var(--font-mono)', color:'var(--fg-muted)'}}>{fmtNum(s.review_count)} · {fmtNum(s.unique_users)}명</span>
                  </div>
                  <div style={{height:6, background:'var(--surface-2)', borderRadius:3, overflow:'hidden'}}>
                    <div style={{height:'100%', width:((s.review_count || 0)/max*100)+'%', background:'var(--accent)', borderRadius:3}}/>
                  </div>
                </div>
              ));
            })()}
          </div>
        </div>
      </div>
    </>
  );
}

function actionLabel(action) {
  const map = {
    resolve_report: '해결 처리:',
    reopen_report: '재오픈:',
    assign_report: '본인 배정:',
    unassign_report: '배정 해제:',
    bulk_resolve_reports: '일괄 해결:',
    bulk_assign_reports: '일괄 배정:',
    create_announcement: '공지 작성:',
    update_announcement: '공지 수정:',
    delete_announcement: '공지 삭제:',
    toggle_announcement_publish: '공지 상태 변경:',
    approve_user: '관리자 승인:',
    reject_user: '가입 거절:',
    revoke_user: '권한 해제:',
    assign_subject: '시험 배정:',
    unassign_subject: '시험 배정 해제:',
    grant_entitlement: '구독 부여',
    revoke_entitlement: '구독 해지',
    add_subject: '시험 추가:',
    remove_subject: '시험 삭제:',
    update_app_version: '앱 버전 설정:',
    update_question: '문항 수정:',
    apply_explanation_draft: '해설 변경안 반영:',
  };
  return map[action] || action;
}

function QuickAction({ icon, color, title, sub, onClick }) {
  const map = { warning: ['var(--warning-soft)','var(--warning)'], info: ['var(--accent-soft)','var(--accent)'], violet: ['var(--info-soft)','var(--info)'], danger: ['var(--danger-soft)','var(--danger)'] };
  const [bg, fg] = map[color];
  return (
    <button type="button" className="qa" onClick={onClick}>
      <span className="qa-ic" style={{background:bg, color:fg}}><Icon name={icon} size={16}/></span>
      <div className="qa-text">
        <div className="qa-t">{title}</div>
        <div className="qa-s">{sub}</div>
      </div>
      <span className="qa-ar">→</span>
    </button>
  );
}

function BarChart({ data, color }) {
  const h = 220, pad = { l: 32, r: 10, t: 14, b: 22 }, w = 560;
  const [hoverIdx, setHoverIdx] = useState(null);
  if (!data || data.length === 0) return <div style={{height:240, display:'grid', placeItems:'center', color:'var(--fg-faint)', fontSize:12}}>데이터 없음</div>;
  const max = Math.max(1, ...data.map(d => d.value)) * 1.15;
  const cellW = (w - pad.l - pad.r) / data.length;
  const bw = Math.max(1, cellW - 3);
  const fmtMMDD = (t) => {
    const dt = new Date(t);
    return String(dt.getMonth() + 1).padStart(2, '0') + '/' + String(dt.getDate()).padStart(2, '0');
  };
  let tip = null;
  if (hoverIdx != null && data[hoverIdx]) {
    const d = data[hoverIdx];
    const cx = pad.l + hoverIdx * cellW + 1.5 + bw / 2;
    const bh = (d.value / max) * (h - pad.t - pad.b);
    const by = h - pad.b - bh;
    const tipW = 72, tipH = 34;
    const tx = Math.max(pad.l, Math.min(w - pad.r - tipW, cx - tipW / 2));
    const ty = Math.max(0, by - tipH - 5);
    tip = { x: tx, y: ty, w: tipW, h: tipH, date: fmtMMDD(d.date), value: d.value };
  }
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{width:'100%', height:240}} preserveAspectRatio="none">
      {[0,1,2,3,4].map(i => {
        const y = pad.t + (h - pad.t - pad.b) * (i/4);
        const val = Math.round(max * (1 - i/4));
        return <g key={i}>
          <line x1={pad.l} x2={w-pad.r} y1={y} y2={y} stroke="var(--border)" strokeDasharray="2 3"/>
          <text x={pad.l-6} y={y+3} textAnchor="end" className="chart-axis">{val}</text>
        </g>;
      })}
      {data.map((d, i) => {
        const cellX = pad.l + i * cellW;
        const x = cellX + 1.5;
        const bh = (d.value / max) * (h - pad.t - pad.b);
        const y = h - pad.b - bh;
        const isHover = hoverIdx === i;
        return <g key={i} onMouseEnter={() => setHoverIdx(i)} onMouseLeave={() => setHoverIdx(null)}>
          <rect x={cellX} y={pad.t} width={cellW} height={h - pad.t - pad.b} fill="transparent"/>
          <rect x={x} y={y} width={bw} height={bh} fill={color} rx="1.5" opacity={hoverIdx != null && !isHover ? 0.45 : 1}>
            <title>{fmtMMDD(d.date)}: {d.value}명</title>
          </rect>
          {i % Math.ceil(data.length / 6) === 0 && <text x={x+bw/2} y={h-pad.b+14} textAnchor="middle" className="chart-axis">{new Date(d.date).getDate()}</text>}
        </g>;
      })}
      {tip && (
        <g pointerEvents="none">
          <rect x={tip.x} y={tip.y} width={tip.w} height={tip.h} fill="var(--surface-2)" stroke="var(--border)" rx="4"/>
          <text x={tip.x + tip.w/2} y={tip.y + 13} textAnchor="middle" style={{fontSize:10, fill:'var(--fg-subtle)', fontFamily:'var(--font-mono)'}}>{tip.date}</text>
          <text x={tip.x + tip.w/2} y={tip.y + 27} textAnchor="middle" style={{fontSize:12, fontWeight:600, fill:'var(--fg)'}}>{tip.value}명</text>
        </g>
      )}
    </svg>
  );
}

/* ─── Analytics ─── */
function Analytics() {
  const [days, setDays] = useState(30);
  const { loading, data, error, refetch } = useAsync(() => rpc('admin_get_dashboard_metrics', { p_days: days }), [days]);
  if (loading) return <Loader/>;
  if (error) return <ErrorBox error={error} retry={refetch}/>;
  const k = data?.kpi || {};
  const active = (data?.active_daily || []).map(d => ({ date: Date.parse(d.date), value: d.dau || 0 }));
  const signups = (data?.signups_daily || []).map(d => ({ date: Date.parse(d.date), value: d.count || 0 }));
  const retention = data?.retention_cohort || [];
  const topReports = data?.top_reported_questions || [];
  const ss = data?.session_stats || {};

  return (
    <>
      <div className="toolbar">
        {[7, 30, 90].map(d => (
          <div key={d} className={"filter-chip " + (days === d ? 'active' : '')} onClick={() => setDays(d)}>{d}일</div>
        ))}
      </div>
      <div className="kpi-grid">
        <div className="kpi"><div className="kpi-label">{days}D DAU 평균</div><div className="kpi-value">{fmtNum(Math.round(active.reduce((a,b)=>a+b.value,0) / (active.length||1)))}</div></div>
        <div className="kpi"><div className="kpi-label">{days}D 신규 가입</div><div className="kpi-value">{fmtNum(signups.reduce((a,b)=>a+b.value,0))}</div></div>
        <div className="kpi"><div className="kpi-label">30D 세션</div><div className="kpi-value">{fmtNum(ss.total_sessions_30d)}</div><div className="kpi-delta"><span>평균 {ss.avg_questions_per_session || 0}문항 · {ss.avg_duration_min || 0}분</span></div></div>
        <div className="kpi"><div className="kpi-label">정답률</div><div className="kpi-value">{(ss.avg_correct_rate_pct ?? 0)}%</div></div>
      </div>

      <div className="grid-2" style={{gridTemplateColumns:'1fr 1fr'}}>
        <div className="panel">
          <div className="panel-head"><div><div className="panel-title">DAU 추이</div><div className="panel-sub">{days}일</div></div></div>
          <div className="panel-body" style={{padding:'0 8px 8px'}}><BarChart data={active} color="var(--cyan)"/></div>
        </div>
        <div className="panel">
          <div className="panel-head"><div><div className="panel-title">신규 가입 추이</div><div className="panel-sub">{days}일</div></div></div>
          <div className="panel-body" style={{padding:'0 8px 8px'}}><BarChart data={signups} color="var(--violet)"/></div>
        </div>
      </div>

      {retention.length > 0 && (
        <div className="panel">
          <div className="panel-head"><div><div className="panel-title">리텐션 코호트</div><div className="panel-sub">가입 후 D1 / D7 / D30 재방문률</div></div></div>
          <div className="panel-body flush">
            <table style={{width:'100%', borderCollapse:'collapse'}}>
              <thead><tr style={{textAlign:'left'}}>
                {['코호트','사이즈','D1','D7','D30'].map(h => <th key={h} style={{padding:'10px 16px', borderBottom:'1px solid var(--border)', fontFamily:'var(--font-mono)', fontSize:10, fontWeight:500, letterSpacing:'.06em', textTransform:'uppercase', color:'var(--fg-subtle)'}}>{h}</th>)}
              </tr></thead>
              <tbody>
                {retention.map((r, i) => (
                  <tr key={i} style={{borderBottom:'1px solid var(--border)'}}>
                    <td style={{padding:'10px 16px', fontSize:12, fontFamily:'var(--font-mono)', color:'var(--fg-muted)'}}>{new Date(r.cohort_date).toLocaleDateString('ko-KR')}</td>
                    <td style={{padding:'10px 16px', fontSize:12, fontFamily:'var(--font-mono)'}}>{fmtNum(r.size)}</td>
                    <td style={{padding:'10px 16px', fontSize:12, fontFamily:'var(--font-mono)', color:'var(--accent)'}}>{r.d1}%</td>
                    <td style={{padding:'10px 16px', fontSize:12, fontFamily:'var(--font-mono)', color:'var(--violet)'}}>{r.d7}%</td>
                    <td style={{padding:'10px 16px', fontSize:12, fontFamily:'var(--font-mono)', color:'var(--cyan)'}}>{r.d30}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {topReports.length > 0 && (
        <div className="panel">
          <div className="panel-head"><div><div className="panel-title">상위 신고 문제 TOP 10</div><div className="panel-sub">가장 많이 신고된 문항</div></div></div>
          <div className="panel-body flush">
            <table style={{width:'100%', borderCollapse:'collapse'}}>
              <thead><tr style={{textAlign:'left'}}>
                {['과목','문항 ID','총 신고','대기','최근 신고'].map(h => <th key={h} style={{padding:'10px 16px', borderBottom:'1px solid var(--border)', fontFamily:'var(--font-mono)', fontSize:10, fontWeight:500, letterSpacing:'.06em', textTransform:'uppercase', color:'var(--fg-subtle)'}}>{h}</th>)}
              </tr></thead>
              <tbody>
                {topReports.map((r, i) => (
                  <tr key={i} style={{borderBottom:'1px solid var(--border)'}}>
                    <td style={{padding:'10px 16px', fontSize:12, fontFamily:'var(--font-mono)', color:'var(--accent)'}}>{r.subject_id}</td>
                    <td style={{padding:'10px 16px', fontSize:12, fontFamily:'var(--font-mono)'}}>#{(r.question_id || '').toString().slice(0,8)}</td>
                    <td style={{padding:'10px 16px', fontSize:12, fontFamily:'var(--font-mono)', fontWeight:600}}>{r.report_count}</td>
                    <td style={{padding:'10px 16px'}}>{r.pending_count > 0 ? <span className="badge badge-warning">{r.pending_count}</span> : <span style={{color:'var(--fg-faint)', fontSize:11, fontFamily:'var(--font-mono)'}}>0</span>}</td>
                    <td style={{padding:'10px 16px', fontSize:12, fontFamily:'var(--font-mono)', color:'var(--fg-subtle)'}}>{relativeTime(r.last_reported_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

/* ─── Reports ─── */
function Reports({ pushToast }) {
  const [filter, setFilter] = useState('pending'); // status filter or 'mine' / 'all'
  const [subjectCode, setSubjectCode] = useState(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [openId, setOpenId] = useState(null);

  const subjects = useAsync(() => rpc('admin_get_subjects'));
  const inspectionSubjects = useAsync(() => rpc('admin_get_inspection_subjects', { p_exam_id: null }));
  const reports = useAsync(() => rpc('admin_get_reports'), [subjectCode]);
  const savedViews = useAsync(() => rpc('admin_get_saved_views', { p_scope: 'reports' }));
  const inspectionSubjectById = useMemo(() => new Map(
    (inspectionSubjects.data || []).map(subject => [subject.id, subject]),
  ), [inspectionSubjects.data]);

  const filtered = useMemo(() => {
    let rs = reports.data || [];
    if (filter === 'mine') rs = rs.filter(r => r.assigned_to === currentAdminId());
    else if (filter !== 'all') rs = rs.filter(r => r.status === filter);
    if (search) {
      const s = search.toLowerCase();
      rs = rs.filter(r => ((r.reason || '') + (r.subject_display_name || '') + (r.assigned_name || '') + (r.detail || '')).toLowerCase().includes(s));
    }
    return rs;
  }, [reports.data, filter, search]);
  const filterCounts = useMemo(() => {
    const rs = reports.data || [];
    return {
      pending: rs.filter(r => r.status === 'pending').length,
      in_progress: rs.filter(r => r.status === 'in_progress').length,
      resolved: rs.filter(r => r.status === 'resolved').length,
      mine: rs.filter(r => r.assigned_to === currentAdminId()).length,
      all: rs.length,
    };
  }, [reports.data]);

  const toggleSelect = (id) => {
    const n = new Set(selected); n.has(id) ? n.delete(id) : n.add(id); setSelected(n);
  };
  const selectAllVisible = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map(r => r.report_id)));
  };

  const bulkResolve = async () => {
    try {
      await rpc('admin_bulk_resolve_reports', { p_ids: [...selected], p_resolution_type: 'fixed', p_resolution_note: null });
      pushToast(selected.size + '건 해결 처리 완료');
      setSelected(new Set()); reports.refetch();
    } catch (e) { pushToast(e.message, 'info'); }
  };
  const bulkAssign = async () => {
    try {
      await rpc('admin_bulk_assign_reports', { p_ids: [...selected], p_assignee: null });
      pushToast(selected.size + '건을 내가 담당으로 배정');
      setSelected(new Set()); reports.refetch();
    } catch (e) { pushToast(e.message, 'info'); }
  };

  const applySavedView = (v) => {
    const f = v.filter || {};
    if (f.status) setFilter(f.status);
    if (f.subject_code !== undefined) setSubjectCode(f.subject_code);
    if (f.search !== undefined) setSearch(f.search || '');
  };
  const saveCurrentView = async () => {
    const name = prompt('저장할 뷰 이름을 입력하세요');
    if (!name) return;
    try {
      await rpc('admin_save_view', { p_scope: 'reports', p_name: name, p_filter: { status: filter, subject_code: subjectCode, search } });
      pushToast('뷰 저장됨: ' + name); savedViews.refetch();
    } catch (e) { pushToast(e.message, 'info'); }
  };
  const deleteSavedView = async (id, name) => {
    if (!confirm(`"${name}" 뷰를 삭제하시겠습니까?`)) return;
    try { await rpc('admin_delete_saved_view', { p_id: id }); savedViews.refetch(); pushToast('뷰 삭제됨'); } catch (e) { pushToast(e.message, 'info'); }
  };

  return (
    <>
      <div className="toolbar">
        {[['pending','대기'], ['in_progress','처리중'], ['resolved','해결'], ['mine','내 담당'], ['all','전체']].map(([k, label]) => (
          <div key={k} className={"chip " + (filter === k ? 'active' : '')} onClick={() => setFilter(k)}>
            {label} <span className="ct">{filterCounts[k] || 0}</span>
          </div>
        ))}
        <div style={{width:4}}/>
        <select className="select input-sm" style={{width:130}} value={subjectCode || ''} onChange={e => setSubjectCode(e.target.value || null)}>
          <option value="">전체 시험</option>
          {(subjects.data || []).map(s => <option key={s.code} value={s.code}>{s.code}</option>)}
        </select>
        {(savedViews.data || []).map(v => (
          <div key={v.id} className="saved-view" onClick={() => applySavedView(v)} onContextMenu={(e) => { e.preventDefault(); deleteSavedView(v.id, v.name); }} title="우클릭으로 삭제">
            <span className="pin">★</span>{v.name}
          </div>
        ))}
        <div className="saved-view" onClick={saveCurrentView}>＋ 뷰 저장</div>
        <div className="spacer"/>
        <input className="search-input" placeholder="검색…" value={search} onChange={e => setSearch(e.target.value)}/>
        <button className="icon-btn" onClick={reports.refetch} title="새로고침"><Icon name="refresh"/></button>
      </div>

      {selected.size > 0 && (
        <div className="bulk-bar">
          <span className="cnt">{selected.size}개 선택됨</span>
          <button className="btn btn-sm" onClick={selectAllVisible}>{selected.size === filtered.length ? '전체 해제' : '화면 전체 선택'}</button>
          <button className="btn btn-sm" onClick={bulkAssign}><Icon name="user" size={12}/> 내가 담당</button>
          <button className="btn btn-sm btn-primary" onClick={bulkResolve}><Icon name="check" size={12}/> 일괄 해결</button>
          <div className="spacer"/>
          <button className="btn btn-sm" onClick={() => setSelected(new Set())}>취소</button>
        </div>
      )}

      {reports.loading ? <Loader/> : reports.error ? <ErrorBox error={reports.error} retry={reports.refetch}/> :
        filtered.length === 0 ? <EmptyState icon="flag" title="신고가 없습니다" sub="현재 필터에 맞는 신고가 없어요."/> :
        <div className="sheet" style={{margin:0}}>
          <div className="item-list">
            {filtered.map(r => (
              <ReportItem key={r.report_id} r={r} open={openId === r.report_id} onToggle={() => setOpenId(openId === r.report_id ? null : r.report_id)}
                selected={selected.has(r.report_id)} onSelect={() => toggleSelect(r.report_id)}
                subject={inspectionSubjectById.get(r.subject_id)}
                onChanged={() => { reports.refetch(); }} pushToast={pushToast}/>
            ))}
          </div>
        </div>
      }
    </>
  );
}

function currentAdminId() { return window.__adminId; }

const SUBJECT_SHORT = {
  gaeron: '개론', minbeob: '민법', junggae: '중개사법',
  gongbeob: '공법', gongsi: '공시법', sebeob: '세법',
};
function shortSubject(id) {
  if (!id) return '—';
  const suffix = id.split('_').pop();
  return SUBJECT_SHORT[suffix] || id;
}

function ReportItem({ r, subject, open, onToggle, selected, onSelect, onChanged, pushToast, draftRpc = rpc }) {
  const [resolving, setResolving] = useState(false);
  const [replyText, setReplyText] = useState('');
  const reportQuestion = r.question || {
    id: r.question_id,
    subject_id: r.subject_id,
    stem: r.q_stem,
    stem_givens: r.q_stem_givens,
    image_url: r.q_image_url,
    choices: r.q_choices,
    correct_index: r.q_correct_answer ? 'ABCDE'.indexOf(r.q_correct_answer) : 0,
    correct_answer: r.q_correct_answer,
    explanation: r.q_explanation,
    year_session: r.year_session,
    question_number: r.question_number,
    updated_at: r.q_updated_at,
    admin_checked_at: r.q_admin_checked_at,
    check_status: r.q_check_status,
  };
  const questionId = reportQuestion.id || r.question_id;
  const questionSubjectId = reportQuestion.subject_id || r.subject_id;
  const questionYearSession = reportQuestion.year_session || r.year_session;
  const hasCheckStatusData = reportQuestion.check_status != null
    || (reportQuestion.updated_at != null && Object.prototype.hasOwnProperty.call(reportQuestion, 'admin_checked_at'));
  const needsQuestionDetail = reportQuestion.stem_givens === undefined || !hasCheckStatusData;
  const canLoadQuestionDetail = Boolean(questionId && questionSubjectId && questionYearSession != null);
  const questionDetail = useAsync(async () => {
    if (!open || !needsQuestionDetail || !canLoadQuestionDetail) {
      return { question: null, skipped: true };
    }
    const rows = await rpc('admin_get_questions_for_inspection', {
      p_subject_id: questionSubjectId,
      p_year_session: Number(questionYearSession),
    });
    return {
      question: (rows || []).find(item => item.id === questionId) || null,
      skipped: false,
    };
  }, [open, needsQuestionDetail, canLoadQuestionDetail, questionId, questionSubjectId, questionYearSession]);
  const q = normalizeInspectionQuestion({
    ...reportQuestion,
    ...(questionDetail.data?.question || {}),
    id: questionId,
    subject_id: questionSubjectId,
    year_session: questionYearSession,
  });

  const resolve = async () => {
    try {
      await rpc('admin_resolve_report', { report_id: r.report_id, response: replyText.trim() || null, note: null });
      pushToast('해결 처리되었습니다');
      setResolving(false);
      setReplyText('');
      onChanged();
    } catch (e) { pushToast(e.message, 'info'); }
  };
  const assign = async () => {
    try { await rpc('admin_assign_report', { report_id: r.report_id }); pushToast('내가 담당으로 배정됨'); onChanged(); } catch (e) { pushToast(e.message, 'info'); }
  };
  const reopen = async () => {
    try { await rpc('admin_reopen_report', { report_id: r.report_id }); pushToast('재오픈됨'); onChanged(); } catch (e) { pushToast(e.message, 'info'); }
  };

  return (
    <div className={"item " + (open ? 'open cur' : '') + (selected ? ' selected' : '')}>
      <div className="item-head" onClick={onToggle}>
        <div className={"item-check " + (selected ? 'checked' : '')} onClick={(e) => { e.stopPropagation(); onSelect(); }}>
          {selected && <Icon name="check" size={10}/>}
        </div>
        <div className={"dot " + (r.status || 'pending')}/>
        <div className="item-meta">
          <div className="item-title">{r.reason || '신고'}</div>
          <div className="item-sub">
            <span style={{color:'var(--accent)'}}>{shortSubject(r.subject_id)}</span> · {r.year_session || q.year_session || '—'} · #{r.question_number || q.question_number || '—'} · {r.user_id ? (r.user_id + '').slice(0,8) : '익명'}
          </div>
        </div>
        <div className="item-right">
          {r.assigned_name && <span className="badge badge-info">{r.assigned_name}</span>}
          {r.status === 'pending' && <span className="badge badge-warning"><span className="bdot"></span>대기</span>}
          {r.status === 'in_progress' && <span className="badge badge-info"><span className="bdot"></span>처리중</span>}
          {r.status === 'resolved' && <span className="badge badge-success"><span className="bdot"></span>해결</span>}
          <span className="item-time">{relativeTime(r.created_at)}</span>
        </div>
      </div>
      {open && (
        <div className="item-body">
          <div className="det-section">
            <div className="det-label">상세 사유</div>
            <div className="det-text">{r.detail || r.message || '(상세 없음)'}</div>
          </div>
          {q.stem && (
            <div className="det-section">
              <div className="det-label">문제 원문 <span className="new-tag">인라인 편집</span></div>
              {needsQuestionDetail && canLoadQuestionDetail && !questionDetail.data && !questionDetail.error ?
                <Loader label="문항 상세 불러오는 중..."/> :
               questionDetail.error ?
                <RpcNotApplied message="문항 상세를 불러오지 못해 안전한 편집을 중단했습니다." error={questionDetail.error} retry={questionDetail.refetch}/> :
                <QuestionBlock
                  q={q}
                  subject={subject}
                  onSaved={() => { onChanged(); pushToast('문항이 수정되었습니다'); }}
                  onChanged={onChanged}
                  pushToast={pushToast}
                  draftRpc={draftRpc}
                />
              }
            </div>
          )}
          <div className="tracking">
            {r.assigned_name && <div className="tr-item"><Icon name="user" size={11}/> {r.assigned_name} 담당</div>}
            <div className="tr-item"><Icon name="clock" size={11}/> 신고 {relativeTime(r.created_at)}</div>
            {r.resolved_at && <div className="tr-item"><Icon name="check" size={11}/> 해결 {relativeTime(r.resolved_at)}</div>}
          </div>
          {resolving && (
            <div className="det-section">
              <div className="det-label">유저에게 전달할 답변 <span style={{fontWeight:400, opacity:.6}}>(선택)</span></div>
              <MarkdownEditor
                compact
                value={replyText}
                onChange={md => setReplyText(md)}
                placeholder="답변을 입력하세요. 비워두면 앱에 답변이 표시되지 않습니다."
              />
            </div>
          )}
          {r.status === 'resolved' && r.admin_response && (
            <div className="det-section">
              <div className="det-label">전달된 답변</div>
              <div className="det-text" style={{color:'var(--success)'}}>{r.admin_response}</div>
            </div>
          )}
          <div className="form-actions" style={{marginTop:14}}>
            {r.status !== 'resolved' && !r.assigned_name && !resolving && <button className="btn btn-sm" onClick={assign}>내가 담당</button>}
            {r.status !== 'resolved' && !resolving && <button className="btn btn-sm btn-primary" onClick={() => setResolving(true)}><Icon name="check" size={12}/> 해결 처리</button>}
            {r.status !== 'resolved' && resolving && <>
              <button className="btn btn-sm btn-primary" onClick={resolve}><Icon name="check" size={12}/> 처리 완료</button>
              <button className="btn btn-sm" onClick={() => { setResolving(false); setReplyText(''); }}>취소</button>
            </>}
            {r.status === 'resolved' && <button className="btn btn-sm" onClick={reopen}>재오픈</button>}
          </div>
        </div>
      )}
    </div>
  );
}

function normalizeGivens(sg) {
  if (!Array.isArray(sg)) return [];
  return sg.map(b => {
    const label = typeof b?.label === 'string' ? b.label : '';
    const boxed = typeof b?.boxed === 'boolean' ? b.boxed : label.trim() !== '';
    const rawItems = Array.isArray(b?.items)
      ? b.items.map(it => ({
          key: String(it?.key ?? ''),
          text: String(it?.text ?? ''),
          _auto_key: Boolean(it?._auto_key),
        }))
      : [];
    const markerFamily = inferGivenMarkerFamilyFromItems(rawItems);
    return {
      label: boxed ? label : '',
      boxed,
      _box_type: boxed ? (label.trim() ? 'view' : 'simple') : 'plain',
      _marker_family: markerFamily,
      markdown_enabled: !!b?.markdown_enabled,
      items: rawItems.map((it, index) => normalizeGivenItemForMarkerFamily(it, markerFamily, index)),
    };
  });
}

const FIRST_GIVEN_MARKER_KEY = `${HANGUL_CONSONANTS[0]}.`;
const GEOMETRIC_MARKER_PATTERN = /^[\u25A0-\u25FF☆★×]$/u;
const CIRCLED_NUMBER_MARKER_KEYS = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩', '⑪', '⑫', '⑬', '⑭', '⑮', '⑯', '⑰', '⑱', '⑲', '⑳'];
const SHAPE_GIVEN_MARKER_KEYS = ['○', '●', '■', '□', '◆', '◇'];
const GIVEN_MARKER_FAMILY_CONSONANTS = '자음';
const GIVEN_MARKER_FAMILY_CIRCLED_HANGUL = '원문자';
const GIVEN_MARKER_FAMILY_CIRCLED_NUMBER = '원숫자';
const GIVEN_MARKER_FAMILY_NONE = '없음';
const SHAPE_MARKER_FAMILY_PREFIX = '도형:';
const DEFAULT_GIVEN_MARKER_FAMILY = GIVEN_MARKER_FAMILY_CONSONANTS;
const GIVEN_MARKER_SEQUENCES = {
  [GIVEN_MARKER_FAMILY_CONSONANTS]: HANGUL_CONSONANTS.map(key => `${key}.`),
  [GIVEN_MARKER_FAMILY_CIRCLED_HANGUL]: CIRCLED_HANGUL_KEYS,
  [GIVEN_MARKER_FAMILY_CIRCLED_NUMBER]: CIRCLED_NUMBER_MARKER_KEYS,
  [GIVEN_MARKER_FAMILY_NONE]: [''],
};
const GIVEN_MARKER_FAMILY_OPTIONS = [
  { value: GIVEN_MARKER_FAMILY_CONSONANTS, label: '자음 ㄱㄴㄷ' },
  { value: GIVEN_MARKER_FAMILY_CIRCLED_HANGUL, label: '원문자 ㉠㉡㉢' },
  { value: GIVEN_MARKER_FAMILY_CIRCLED_NUMBER, label: '원숫자 ①②③' },
  { value: GIVEN_MARKER_FAMILY_NONE, label: '기호 없음' },
  ...SHAPE_GIVEN_MARKER_KEYS.map(key => ({ value: `${SHAPE_MARKER_FAMILY_PREFIX}${key}`, label: `도형 ${key}` })),
];

function createGivenItem(key = FIRST_GIVEN_MARKER_KEY, text = '') {
  return { key, text, _auto_key: true };
}

function stripGivenMarkerPunctuation(key) {
  return String(key ?? '').trim().replace(/\s*[.:)]\s*$/u, '').trim();
}

function isGeometricMarkerKey(key) {
  const value = String(key ?? '').trim();
  return GEOMETRIC_MARKER_KEYS.includes(value) || GEOMETRIC_MARKER_PATTERN.test(value);
}

function formatGivenMarkerKey(key) {
  const value = String(key ?? '').trim();
  const base = stripGivenMarkerPunctuation(value);
  if (HANGUL_CONSONANTS.includes(base)) return `${base}.`;
  if (CIRCLED_HANGUL_KEYS.includes(base)) return base;
  if (CIRCLED_NUMBER_MARKER_KEYS.includes(base)) return base;
  if (isGeometricMarkerKey(base)) return base;
  return value;
}

function displayGivenMarkerKey(key) {
  const value = String(key ?? '').trim();
  const formatted = formatGivenMarkerKey(value);
  if (!formatted || formatted !== value || /[.:)]$/u.test(value)) return formatted;
  if (/^(?:[A-Za-z]|\d{1,2}|[가나다라마바사아자차카타파하]|[①-⑳]|[ⓐ-ⓩ]|[㉮-㉻])$/u.test(value)) {
    return `${value}.`;
  }
  return value;
}

function nextGivenMarkerKey(items) {
  const markerFamily = inferGivenMarkerFamilyFromItems(items);
  return givenMarkerKeyForIndex(markerFamily, (items || []).length);
}

function isShapeGivenMarkerFamily(family) {
  const value = String(family ?? '');
  if (!value.startsWith(SHAPE_MARKER_FAMILY_PREFIX)) return false;
  return SHAPE_GIVEN_MARKER_KEYS.includes(value.slice(SHAPE_MARKER_FAMILY_PREFIX.length));
}

function isGivenMarkerFamily(family) {
  return Boolean(GIVEN_MARKER_SEQUENCES[family]) || isShapeGivenMarkerFamily(family);
}

function shapeGivenMarkerFromFamily(family) {
  const value = String(family ?? '');
  const marker = value.startsWith(SHAPE_MARKER_FAMILY_PREFIX)
    ? value.slice(SHAPE_MARKER_FAMILY_PREFIX.length)
    : '';
  return SHAPE_GIVEN_MARKER_KEYS.includes(marker) ? marker : SHAPE_GIVEN_MARKER_KEYS[0];
}

function givenMarkerCellOptions(family) {
  if (isShapeGivenMarkerFamily(family)) return SHAPE_GIVEN_MARKER_KEYS;
  return GIVEN_MARKER_SEQUENCES[family] || GIVEN_MARKER_SEQUENCES[DEFAULT_GIVEN_MARKER_FAMILY];
}

function givenMarkerKeyForIndex(family, index) {
  if (isShapeGivenMarkerFamily(family)) return shapeGivenMarkerFromFamily(family);
  const sequence = givenMarkerCellOptions(family);
  if (sequence.length === 0) return '';
  const safeIndex = Math.max(0, Number(index) || 0);
  return sequence[Math.min(safeIndex, sequence.length - 1)];
}

function inferGivenMarkerFamilyFromKey(key) {
  const value = formatGivenMarkerKey(key);
  const base = stripGivenMarkerPunctuation(value);
  if (GIVEN_MARKER_SEQUENCES[GIVEN_MARKER_FAMILY_CONSONANTS].includes(value) || HANGUL_CONSONANTS.includes(base)) {
    return GIVEN_MARKER_FAMILY_CONSONANTS;
  }
  if (CIRCLED_HANGUL_KEYS.includes(value)) return GIVEN_MARKER_FAMILY_CIRCLED_HANGUL;
  if (CIRCLED_NUMBER_MARKER_KEYS.includes(value)) return GIVEN_MARKER_FAMILY_CIRCLED_NUMBER;
  if (SHAPE_GIVEN_MARKER_KEYS.includes(value)) return `${SHAPE_MARKER_FAMILY_PREFIX}${value}`;
  return null;
}

function inferGivenMarkerFamilyFromItems(items) {
  const itemList = items || [];
  for (const item of itemList) {
    const family = inferGivenMarkerFamilyFromKey(item?.key);
    if (family) return family;
  }
  if (itemList.length > 0 && itemList.every(item => String(item?.key ?? '').trim() === '')) {
    return GIVEN_MARKER_FAMILY_NONE;
  }
  return DEFAULT_GIVEN_MARKER_FAMILY;
}

function givenMarkerFamily(box) {
  return isGivenMarkerFamily(box?._marker_family)
    ? box._marker_family
    : inferGivenMarkerFamilyFromItems(box?.items);
}

function normalizeGivenItemForMarkerFamily(item, family, index) {
  if (String(item?.text ?? '').trim() && String(item?.key ?? '').trim() === '') {
    return { ...item, key: '', _auto_key: false };
  }
  const key = formatGivenMarkerKey(item?.key);
  if (key && givenMarkerCellOptions(family).includes(key)) {
    return { ...item, key };
  }
  return { ...item, key: givenMarkerKeyForIndex(family, index), _auto_key: true };
}

function applyGivenMarkerFamily(box, family) {
  const markerFamily = isGivenMarkerFamily(family) ? family : DEFAULT_GIVEN_MARKER_FAMILY;
  return {
    ...box,
    _marker_family: markerFamily,
    items: (box.items || []).map((item, index) => ({
      ...item,
      key: givenMarkerKeyForIndex(markerFamily, index),
      _auto_key: true,
    })),
  };
}

// Returns { payload } (bare Box[] or null) or { error } if validation fails.
function serializeGivens(boxes) {
  const out = [];
  for (const b of boxes) {
    const items = (b.items || [])
      .map(it => ({ key: (it.key || '').trim(), text: (it.text || '').trim(), _auto_key: Boolean(it?._auto_key) }))
      .filter(it => !(it._auto_key && it.text === ''))
      .filter(it => it.key !== '' || it.text !== '');
    if (items.length === 0) continue;
    if (items.some(it => it.text === '')) {
      return { error: '보기 항목의 내용을 입력하세요.' };
    }
    const boxType = givenBoxType(b);
    const boxed = boxType !== 'plain';
    const label = boxType === 'view' ? ((b.label || '').trim() || '보기') : '';
    out.push({ label, markdown_enabled: !!b.markdown_enabled, boxed, items: items.map(({ key, text }) => ({ key, text })) });
  }
  return { payload: out.length ? out : null };
}

function givenBoxType(box) {
  if (box?._box_type === 'plain' || box?._box_type === 'simple' || box?._box_type === 'view') {
    return box._box_type;
  }
  if (box?.boxed === false) return 'plain';
  const label = typeof box?.label === 'string' ? box.label.trim() : '';
  return label ? 'view' : 'simple';
}

function applyGivenBoxType(box, type) {
  if (type === 'plain') return { ...box, boxed: false, label: '', _box_type: 'plain' };
  if (type === 'simple') return { ...box, boxed: true, label: '', _box_type: 'simple' };
  return { ...box, boxed: true, label: (box.label || '').trim() || '보기', _box_type: 'view' };
}

function createGivenBox(type) {
  if (type === 'simple') {
    return { label: '', boxed: true, _box_type: 'simple', _marker_family: DEFAULT_GIVEN_MARKER_FAMILY, markdown_enabled: false, items: [createGivenItem()] };
  }
  if (type === 'markdown') {
    return { label: '', boxed: true, _box_type: 'simple', _marker_family: DEFAULT_GIVEN_MARKER_FAMILY, markdown_enabled: true, items: [createGivenItem()] };
  }
  return { label: '보기', boxed: true, _box_type: 'view', _marker_family: DEFAULT_GIVEN_MARKER_FAMILY, markdown_enabled: false, items: [createGivenItem()] };
}

function givenPreviewBoxMeta(box) {
  const label = typeof box?.label === 'string' ? box.label.trim() : '';
  const boxed = typeof box?.boxed === 'boolean' ? box.boxed : label !== '';
  return { boxed, label: boxed ? label : '' };
}

function GivenPreviewText({ text, markdown }) {
  if (markdown) {
    return (
      <div
        style={{ color: 'var(--fg-muted)', minWidth: 0, lineHeight: 1.7, overflowX: 'auto' }}
        dangerouslySetInnerHTML={{ __html: marked.parse(text || '') }}
      />
    );
  }
  return <div style={{ color: 'var(--fg-muted)', whiteSpace: 'pre-wrap', minWidth: 0 }}>{text}</div>;
}

function LegacyGivensImportPreview({ boxes, onImport, onIgnore }) {
  return (
    <div className="sheet marked" style={{ margin: '0 0 var(--sp-3)', background: 'var(--surface-2)' }}>
      <div className="sheet-head" style={{ padding: 'var(--sp-3) var(--sp-4)', background: 'var(--surface-2)' }}>
        <div>
          <div className="sheet-title" style={{ fontSize: 'var(--fs-base)' }}>📦 기존 stem에서 감지된 보기</div>
          <div className="sheet-sub">{boxes.length}개 박스 · import 전까지 저장되지 않음</div>
        </div>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-xs)', color: 'var(--fg-subtle)' }}>저장 안 됨</span>
      </div>
      <div className="sheet-body" style={{ padding: 'var(--sp-3)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
        {boxes.map((box, bi) => (
          <div key={bi} style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', background: 'var(--surface)', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--sp-2)', padding: 'var(--sp-2) var(--sp-3)', borderBottom: '1px solid var(--rule)' }}>
              <div style={{ fontFamily: 'var(--font-serif)', fontWeight: 600, fontSize: 'var(--fs-base)' }}>〈{box.label || '보기'}〉</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-xs)', color: 'var(--fg-subtle)' }}>{(box.items || []).length} items</div>
            </div>
            <div style={{ padding: 'var(--sp-2) var(--sp-3)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
              {(box.items || []).map((it, ii) => (
                <div key={ii} style={{ display: 'grid', gridTemplateColumns: '40px minmax(0, 1fr)', gap: 'var(--sp-2)', alignItems: 'start', fontSize: 'var(--fs-sm)', lineHeight: 1.7 }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--accent)', background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', borderRadius: 'var(--r-sm)', textAlign: 'center', padding: '2px 0' }}>{it.key}</div>
                  <div style={{ color: 'var(--fg-muted)', whiteSpace: 'pre-wrap', minWidth: 0 }}>{it.text}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--sp-2)', paddingTop: 'var(--sp-1)' }}>
          <button type="button" className="btn btn-sm btn-ghost" onClick={onIgnore}>✕ 무시</button>
          <button type="button" className="btn btn-sm btn-primary" onClick={onImport}>✓ 이대로 가져오기</button>
        </div>
      </div>
    </div>
  );
}

function inspectionCheckStatus(item) {
  if (item?.check_status) return item.check_status;
  if (!item?.admin_checked_at) return 'unchecked';
  if (item?.updated_at && Date.parse(item.admin_checked_at) < Date.parse(item.updated_at)) return 'stale';
  return 'checked';
}

function inspectionStatusMeta(status) {
  return {
    unchecked: ['badge-neutral', '미검수', 'var(--fg-faint)'],
    checked: ['badge-success', '검수 완료', 'var(--success)'],
    stale: ['badge-warning', '재검수', 'var(--warning)'],
  }[status] || ['badge-neutral', status || '미검수', 'var(--fg-faint)'];
}

let stemEditorBlockSequence = 0;
const STEM_BLOCK_MARKER_INPUT_PATTERN = /\[\/?(?:TABLE|CHOICE_HEADERS|SVG)\]/;

function stemEditorBlocks(source) {
  return parseStemBlocks(source).map(block => ({
    ...block,
    _editorKey: `stem-block-${++stemEditorBlockSequence}`,
  }));
}

function newStemEditorBlock(block) {
  return {
    ...block,
    _editorKey: `stem-block-${++stemEditorBlockSequence}`,
  };
}

/**
 * 고른 파일을 권장 가로폭으로 줄여 PNG data URI 로 만든다.
 *
 * 캔버스·FileReader 경로라 브라우저에서만 동작한다. 그래서 순수 계산(크기 환산·검증)은
 * lib/question-image.js 에 두고, 여기는 브라우저 API 호출만 남긴다.
 */
function questionImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read-failed'));
    reader.onload = () => {
      const image = new window.Image();
      image.onerror = () => reject(new Error('decode-failed'));
      image.onload = () => {
        const { width, height } = fitQuestionImageSize(image.naturalWidth, image.naturalHeight);
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        if (!context) {
          reject(new Error('canvas-unavailable'));
          return;
        }
        // 기출 도형은 흰 바탕이 기본이다. 투명 PNG 를 그대로 두면 다크 테마에서 선이 묻힌다.
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, width, height);
        context.drawImage(image, 0, 0, width, height);
        resolve(canvas.toDataURL('image/png'));
      };
      image.src = String(reader.result ?? '');
    };
    reader.readAsDataURL(file);
  });
}

/** Names the exact choice content a narrower column count would delete. */
function describeDroppedChoiceColumns(columns) {
  return columns
    .map(column => `${column.label} ${column.columnIndex + 1}칸: ${column.value}`)
    .join(', ');
}

function AutoHeightTextarea({ value, onChange, className = '', ...props }) {
  const textareaRef = useRef(null);

  const resize = textarea => {
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  };

  useEffect(() => { resize(textareaRef.current); }, [value]);

  return (
    <textarea
      {...props}
      ref={textareaRef}
      className={className}
      value={value}
      onChange={event => {
        resize(event.currentTarget);
        onChange(event);
      }}
    />
  );
}

// 칸 안 `\n` 토큰을 줄바꿈으로 보여 준다(앱은 좁은 화면에서 이 자리에서 줄을 바꾼다).
function TableCellLines({ value }) {
  const lines = splitTableCellLines(value);
  return lines.map((line, index) => (
    <React.Fragment key={index}>
      {index > 0 && <br />}
      {line}
    </React.Fragment>
  ));
}

function StemTablePreview({ rows }) {
  const normalizedRows = normalizeConceptTableRows(rows);
  const headerRows = conceptTableHeaderRows(normalizedRows);
  const cellsByRow = normalizedRows.map(() => []);

  conceptTableMergeGroups(normalizedRows).forEach(group => {
    const row = Math.min(...group.map(cell => cell.row));
    const column = Math.min(...group.map(cell => cell.column));
    const rowEnd = Math.max(...group.map(cell => cell.row));
    const columnEnd = Math.max(...group.map(cell => cell.column));
    cellsByRow[row].push({
      row,
      column,
      rowSpan: rowEnd - row + 1,
      columnSpan: columnEnd - column + 1,
      cell: normalizedRows[row][column],
    });
  });
  cellsByRow.forEach(cells => cells.sort((a, b) => a.column - b.column));

  return (
    <div className="stem-table-preview-wrap">
      <table className="stem-table-preview" aria-label="표 미리보기">
        <tbody>
          {cellsByRow.map((cells, rowIndex) => (
            <tr key={rowIndex}>
              {cells.map(({ cell, column, rowSpan, columnSpan }) => {
                const Cell = headerRows[rowIndex] ? 'th' : 'td';
                return (
                  <Cell key={column} rowSpan={rowSpan} colSpan={columnSpan}>
                    {cell.diagonal ? (
                      <div className="stem-table-diagonal-preview">
                        <span className="column-label">{cell.diagonal.columnLabel ? <TableCellLines value={cell.diagonal.columnLabel} /> : '\u00a0'}</span>
                        <span className="row-label">{cell.diagonal.rowLabel ? <TableCellLines value={cell.diagonal.rowLabel} /> : '\u00a0'}</span>
                      </div>
                    ) : (cell.value ? <TableCellLines value={cell.value} /> : '\u00a0')}
                  </Cell>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StemBlockInsertControls({ index, onInsertText, onInsertTable }) {
  return (
    <div className="stem-block-insert" aria-label={`${index + 1}번째 위치에 블록 삽입`}>
      <span />
      <button type="button" className="btn btn-xs" onClick={() => onInsertText(index)}>+ 텍스트</button>
      <button type="button" className="btn btn-xs" onClick={() => onInsertTable(index)}>+ 표</button>
      <span />
    </div>
  );
}

function StemBlockEditor({
  blocks,
  onUpdateText,
  onUpdateFigure,
  onUpdateChoiceHeader,
  onResizeChoiceHeaders,
  onEditTable,
  onInsertText,
  onInsertTable,
  onDelete,
  onMove,
}) {
  const kindLabel = {
    text: '텍스트',
    table: '표',
    choiceHeaders: '선택지 헤더',
    figure: '도형',
  };

  return (
    <div className="stem-block-editor">
      {blocks.length === 0 && <div className="stem-block-empty">지문 블록이 없습니다. 텍스트 또는 표를 추가하세요.</div>}
      {blocks.map((block, index) => (
        <React.Fragment key={block._editorKey || `${block.kind}-${index}`}>
          <StemBlockInsertControls index={index} onInsertText={onInsertText} onInsertTable={onInsertTable}/>
          <section className={`stem-block-card stem-block-${block.kind}`}>
            <div className="stem-block-head">
              <div className="stem-block-title">
                <span className={`badge ${block.kind === 'figure' ? 'badge-info' : 'badge-neutral'}`}>
                  {block.kind === 'figure' ? 'SVG' : kindLabel[block.kind] || block.kind}
                </span>
                <span>블록 {index + 1}</span>
              </div>
              <div className="stem-block-actions">
                {block.kind === 'table' && (
                  <button type="button" className="btn btn-xs btn-primary" onClick={() => onEditTable(index)}>편집</button>
                )}
                <button type="button" className="btn btn-xs" onClick={() => onMove(index, -1)} disabled={index === 0}>위</button>
                <button type="button" className="btn btn-xs" onClick={() => onMove(index, 1)} disabled={index === blocks.length - 1}>아래</button>
                <button type="button" className="btn btn-xs btn-danger" onClick={() => onDelete(index)}>삭제</button>
              </div>
            </div>
            <div className="stem-block-body">
              {block.kind === 'text' && (
                <AutoHeightTextarea
                  className="stem-block-textarea"
                  value={block.text || ''}
                  onChange={event => onUpdateText(index, event.target.value)}
                  aria-label={`텍스트 블록 ${index + 1}`}
                  placeholder="지문 텍스트"
                />
              )}
              {block.kind === 'table' && <StemTablePreview rows={block.rows}/>}
              {block.kind === 'choiceHeaders' && (
                <div className="stem-choice-headers" aria-label="선택지 헤더">
                  <div className="stem-choice-headers-toolbar">
                    <span>열 수</span>
                    <button
                      type="button"
                      className="btn btn-xs"
                      aria-label={`선택지 헤더 블록 ${index + 1} 열 하나 줄이기`}
                      disabled={(block.headers || []).length <= 1}
                      onClick={() => onResizeChoiceHeaders(index, Math.max(1, (block.headers || []).length - 1))}
                    >−</button>
                    <input
                      type="number"
                      min="1"
                      max={MAX_CHOICE_HEADER_COLUMNS}
                      step="1"
                      value={Math.max(1, (block.headers || []).length)}
                      onChange={event => {
                        const nextCount = Number(event.target.value);
                        if (Number.isInteger(nextCount)
                          && nextCount >= 1
                          && nextCount <= MAX_CHOICE_HEADER_COLUMNS) {
                          onResizeChoiceHeaders(index, nextCount);
                        }
                      }}
                      aria-label={`선택지 헤더 블록 ${index + 1} 열 수`}
                    />
                    <button
                      type="button"
                      className="btn btn-xs"
                      aria-label={`선택지 헤더 블록 ${index + 1} 열 하나 늘리기`}
                      disabled={(block.headers || []).length >= MAX_CHOICE_HEADER_COLUMNS}
                      onClick={() => onResizeChoiceHeaders(index, Math.max(1, (block.headers || []).length) + 1)}
                    >+</button>
                  </div>
                  <div
                    className="stem-choice-header-fields"
                    style={{ gridTemplateColumns: `repeat(${Math.max(1, (block.headers || []).length)}, minmax(110px, 1fr))` }}
                  >
                    {((block.headers || []).length ? block.headers : ['']).map((header, headerIndex) => (
                      <label key={headerIndex}>
                        <span>{headerIndex + 1}열</span>
                        <AutoHeightTextarea
                          rows={1}
                          className="field-input stem-choice-header-input"
                          value={header ?? ''}
                          onChange={event => onUpdateChoiceHeader(index, headerIndex, event.target.value)}
                          aria-label={`선택지 헤더 블록 ${index + 1} 라벨 ${headerIndex + 1}`}
                          placeholder={`라벨 ${headerIndex + 1}`}
                        />
                      </label>
                    ))}
                  </div>
                  <div className="stem-choice-headers-help">열 수를 바꾸면 아래 선지 본문의 칸 수도 함께 맞춰집니다.</div>
                </div>
              )}
              {block.kind === 'figure' && (
                <details className="stem-figure-details">
                  <summary>SVG 내용 원문 {block.standalone ? '(자리표시자)' : ''}</summary>
                  <textarea
                    className="stem-figure-source"
                    value={block.content || ''}
                    onChange={event => onUpdateFigure(index, event.target.value)}
                    aria-label={`SVG 블록 ${index + 1} 원문`}
                    placeholder="SVG 내용을 입력하세요."
                    spellCheck={false}
                  />
                </details>
              )}
            </div>
          </section>
        </React.Fragment>
      ))}
      <StemBlockInsertControls index={blocks.length} onInsertText={onInsertText} onInsertTable={onInsertTable}/>
    </div>
  );
}

/**
 * 기출 원본 사진 편집기.
 *
 * questions.image_url 은 stem 문자열이 아니라 별도 컬럼이라 지문 블록으로 만들 수 없다.
 * 보기 박스(stem_givens)와 같은 자리, 같은 모양의 독립 섹션으로 둔다.
 */
function QuestionImageEditor({ imageUrl, hasSvgBlock, busy, onPick, onClear }) {
  const parsed = parseQuestionImage(imageUrl);
  const inputRef = useRef(null);
  // 형식 검사를 통과해도 바이트가 깨져 있으면 브라우저가 디코드에 실패한다.
  // 어드민에서는 조용히 넘기면 안 되는 상태라 드러낸다.
  const [decodeFailed, setDecodeFailed] = useState(false);

  useEffect(() => { setDecodeFailed(false); }, [imageUrl]);

  return (
    <div className="question-image-editor">
      <div className="field-label">기출 원본 사진 (image_url)</div>

      {parsed.ok ? (
        <div className="question-image-preview">
          {decodeFailed ? (
            <div className="question-image-empty">
              저장된 값이 PNG·JPEG 로 열리지 않습니다 (데이터 손상). 새 사진을 올리거나 제거하세요.
            </div>
          ) : (
            <img
              src={parsed.dataUrl}
              alt="문항에 첨부된 기출 원본 사진"
              onError={() => setDecodeFailed(true)}
            />
          )}
          <div className="question-image-meta">
            <span>{parsed.mime === 'image/png' ? 'PNG' : 'JPEG'} · {formatByteSize(parsed.byteLength)}</span>
            <button type="button" className="btn btn-xs btn-danger" disabled={busy} onClick={onClear}>사진 제거</button>
          </div>
        </div>
      ) : (
        <div className="question-image-empty">
          {parsed.reason === 'empty'
            ? '첨부된 사진이 없습니다.'
            : '저장된 값이 PNG·JPEG data URI 가 아닙니다. 새 사진을 올리거나 제거하세요.'}
        </div>
      )}

      <div className="question-image-actions">
        <input
          ref={inputRef}
          type="file"
          accept={questionImageAcceptAttribute()}
          style={{ display: 'none' }}
          onChange={event => {
            const file = event.target.files?.[0];
            // 같은 파일을 다시 골라도 change 가 뜨도록 값을 비운다.
            event.target.value = '';
            if (file) onPick(file);
          }}
        />
        <button
          type="button"
          className="btn btn-sm"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          <Icon name="plus" size={12} /> {parsed.ok ? '사진 교체' : '사진 올리기'}
        </button>
        <span className="question-image-help">
          PNG·JPEG. 가로 {QUESTION_IMAGE_MAX_WIDTH}px 로 줄여 PNG 로 저장합니다 (최대 {formatByteSize(MAX_QUESTION_IMAGE_BYTES)}).
        </span>
      </div>

      {hasSvgBlock && (
        <div className="question-image-note">
          이 문항에는 [SVG] 도형 블록이 있습니다. 사진을 넣어도 지문의 SVG 는 지우지 마세요 — 앱 렌더러가
          붙으면 사진이 있을 때 SVG 를 가리도록 되어 있고, 구버전 앱은 계속 SVG 를 그립니다.
        </div>
      )}
      <div className="question-image-note">
        🚧 앱 렌더러는 아직 없습니다. 지금 올린 사진은 DB 에만 저장되고 앱 화면에는 나오지 않습니다.
      </div>
    </div>
  );
}

/**
 * One choice rendered as one input per column.
 *
 * A choice carrying more columns than the header declares keeps those extra
 * inputs on screen, so overflow can be read and fixed instead of being hidden
 * behind a warning the author cannot act on.
 */
function ChoiceColumnInputs({ choice, index, columnCount, renderedCount, onChangeColumn }) {
  const stored = splitChoiceColumns(choiceText(choice));
  const label = choiceLabel(choice, index);

  return (
    <div
      className="choice-editor-columns"
      style={{ gridTemplateColumns: `repeat(${renderedCount}, minmax(110px, 1fr))` }}
    >
      {resizeChoiceColumns(stored, renderedCount).map((column, columnIndex) => {
        const isExtra = columnIndex >= columnCount;
        return (
          <input
            key={columnIndex}
            className={`field-input${isExtra ? ' choice-editor-extra' : ''}`}
            value={column}
            onChange={event => onChangeColumn(index, columnIndex, event.target.value)}
            aria-label={`선지 ${label} ${columnIndex + 1}칸${isExtra ? ' (헤더에 없는 열)' : ''}`}
            placeholder={`${columnIndex + 1}칸`}
          />
        );
      })}
    </div>
  );
}

/**
 * Choice editor. Without choice headers this stays the original single input
 * per choice. With headers it splits each choice into one input per column, so
 * the separator never has to be typed by hand.
 */
export function ChoiceListEditor({
  choices,
  correct,
  headers,
  onSelectCorrect,
  onChangeText,
  onChangeColumn,
  onAddHeaders,
  onRemoveHeaders,
  onResizeHeaders,
  onSyncColumns,
}) {
  // Clamped because a throw here would take the whole admin screen down, and
  // header width comes straight from stored stem text.
  const columnCount = headers
    ? Math.min(MAX_CHOICE_COLUMNS, Math.max(1, headers.length))
    : 0;
  // One grid width for the label row and every choice row, widened to the
  // widest choice so overflow columns stay aligned and readable.
  const renderedCount = headers
    ? Math.min(MAX_CHOICE_COLUMNS, choices.reduce(
      (widest, choice) => Math.max(widest, splitChoiceColumns(choiceText(choice)).length),
      columnCount,
    ))
    : 0;
  const mismatches = headers ? choiceColumnMismatches(choices, columnCount) : [];
  const lineBreaks = headers ? choiceColumnsWithLineBreak(choices) : [];

  return (
    <div className="choice-editor">
      <div className="choice-editor-toolbar">
        {headers ? (
          <>
            <span className="choice-editor-state">헤더 {columnCount}칸</span>
            <button
              type="button"
              className="btn btn-xs"
              aria-label="선택지 헤더 한 칸 줄이기"
              disabled={columnCount <= 1}
              onClick={() => onResizeHeaders(Math.max(1, columnCount - 1))}
            >−</button>
            <button
              type="button"
              className="btn btn-xs"
              aria-label="선택지 헤더 한 칸 늘리기"
              disabled={columnCount >= MAX_CHOICE_COLUMNS}
              onClick={() => onResizeHeaders(Math.min(MAX_CHOICE_COLUMNS, columnCount + 1))}
            >+</button>
            <button type="button" className="btn btn-xs" onClick={onRemoveHeaders}>헤더 제거</button>
          </>
        ) : (
          <>
            <span className="choice-editor-state">선지를 열로 나누지 않습니다</span>
            <button type="button" className="btn btn-xs" onClick={onAddHeaders}>선택지 헤더 추가</button>
          </>
        )}
      </div>

      {mismatches.length > 0 && (
        <div className="choice-editor-warning">
          <span>
            칸 수가 헤더와 다른 선지 {mismatches.length}개:{' '}
            {mismatches.map(item => `${item.label}(${item.columnCount}칸)`).join(', ')}.
            모자란 칸은 빈 칸으로 보여주며, 입력하기 전에는 저장값이 바뀌지 않습니다.
          </span>
          <button type="button" className="btn btn-xs" onClick={onSyncColumns}>{columnCount}열로 맞추기</button>
        </div>
      )}

      {lineBreaks.length > 0 && (
        <div className="choice-editor-warning">
          <span>
            줄바꿈이 들어 있는 칸 {lineBreaks.length}개:{' '}
            {lineBreaks.map(item => `${item.label} ${item.columnIndex + 1}칸`).join(', ')}.
            입력칸에는 줄바꿈이 보이지 않으며, 그 칸을 편집하면 줄바꿈이 사라집니다.
          </span>
        </div>
      )}

      {headers && (
        <div
          className="choice-editor-header-row"
          style={{ gridTemplateColumns: `repeat(${renderedCount}, minmax(110px, 1fr))` }}
        >
          {Array.from({ length: renderedCount }, (_, headerIndex) => (
            <span
              key={headerIndex}
              className={headerIndex >= columnCount ? 'choice-editor-extra-label' : ''}
            >
              {headerIndex >= columnCount
                ? '헤더 없음'
                : String(headers[headerIndex] ?? '').trim() || `${headerIndex + 1}열`}
            </span>
          ))}
        </div>
      )}

      {choices.map((choice, index) => (
        <div key={index} className="choice-editor-row">
          <input
            type="radio"
            name="correct-q"
            checked={correct === index}
            onChange={() => onSelectCorrect(index)}
            aria-label={`선지 ${choiceLabel(choice, index)} 정답으로 지정`}
          />
          {headers ? (
            <ChoiceColumnInputs
              choice={choice}
              index={index}
              columnCount={columnCount}
              renderedCount={renderedCount}
              onChangeColumn={onChangeColumn}
            />
          ) : (
            <input
              className="field-input choice-editor-single"
              value={choiceText(choice)}
              onChange={event => onChangeText(index, event.target.value)}
              aria-label={`선지 ${choiceLabel(choice, index)} 본문`}
            />
          )}
        </div>
      ))}
    </div>
  );
}

function QuestionBlock({ q, subject, exam, onSaved, onChanged, pushToast, draftRpc = rpc }) {
  const initialStem = String(q.stem ?? '');
  const [editing, setEditing] = useState(false);
  const [previewQuestion, setPreviewQuestion] = useState(q);
  const originalStemRef = useRef(initialStem);
  const [stem, setStem] = useState(initialStem);
  const [stemBlocks, setStemBlocks] = useState(() => stemEditorBlocks(initialStem));
  const [stemEditorMode, setStemEditorMode] = useState('blocks');
  const [stemTouched, setStemTouched] = useState(false);
  const stemTextareaRef = useRef(null);
  const stemCursorOffsetRef = useRef(initialStem.length);
  const stemCursorKnownRef = useRef(false);
  const [stemTableDialog, setStemTableDialog] = useState(null);
  const stemTableBlocks = useMemo(() => listConceptTableBlocks(stem), [stem]);
  const [choices, setChoices] = useState(() => {
    const cs = Array.isArray(q.choices) ? q.choices : (q.choices?.options || []);
    return cs.map((c, i) => typeof c === 'string' ? { text: c } : c);
  });
  const [correct, setCorrect] = useState(q.correct_index ?? 0);
  // Derived from the stem string rather than stemBlocks so the choice editor
  // stays correct in source mode too, where stemBlocks is intentionally stale.
  // The app honours only the first marker, so extra ones are ignored here too.
  const choiceHeaderLabels = useMemo(() => {
    const block = parseStemBlocks(stem).find(candidate => candidate.kind === 'choiceHeaders');
    if (!block) return null;
    return block.headers?.length ? block.headers : [''];
  }, [stem]);
  const [explanation, setExplanation] = useState(q.explanation || '');
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checkStatus, setCheckStatus] = useState(() => inspectionCheckStatus(q));
  const [explanationDraftRecord, setExplanationDraftRecord] = useState(null);
  const [explanationDraftText, setExplanationDraftText] = useState(q.explanation || '');
  const [explanationDirectionNote, setExplanationDirectionNote] = useState('');
  const [savedExplanationDraftText, setSavedExplanationDraftText] = useState(q.explanation || '');
  const [savedExplanationDirectionNote, setSavedExplanationDirectionNote] = useState('');
  const [explanationDraftOpen, setExplanationDraftOpen] = useState(false);
  const [explanationDraftReview, setExplanationDraftReview] = useState(false);
  const [explanationDraftLoading, setExplanationDraftLoading] = useState(true);
  const [explanationDraftLoadError, setExplanationDraftLoadError] = useState(null);
  const [explanationDraftAction, setExplanationDraftAction] = useState(null);
  const [explanationDraftMessage, setExplanationDraftMessage] = useState(null);
  const [explanationDraftConflict, setExplanationDraftConflict] = useState(false);
  const [explanationDraftConfirm, setExplanationDraftConfirm] = useState(null);
  const [explanationDraftReload, setExplanationDraftReload] = useState(0);
  // Inspection RPC returns stem_givens (so it's defined here); the Reports path does not
  // (q built from report fields → undefined). Only enable the givens editor + v2 RPC when loaded.
  // 신고 화면이 쓰는 admin_get_reports 는 image_url 을 안 내려준다. 값이 없는 채로 저장하면
  // 사진이 지워지므로, 이 필드가 실려 온 경로(검수 화면)에서만 편집·저장한다.
  const hasImageField = q.image_url !== undefined;
  const [imageUrl, setImageUrl] = useState(() => questionImageForSave(q.image_url));
  const [imageBusy, setImageBusy] = useState(false);
  const stemHasFigure = useMemo(
    () => parseStemBlocks(stem).some(block => block.kind === 'figure'),
    [stem],
  );
  const hasGivensField = q.stem_givens !== undefined;
  const [boxes, setBoxes] = useState(() => normalizeGivens(q.stem_givens));
  const [legacyImportHidden, setLegacyImportHidden] = useState(false);
  const legacyGivens = useMemo(() => {
    if (!hasGivensField || previewQuestion.stem_givens !== null) return [];
    const stemWithoutTables = stem.replace(/\[TABLE\][\s\S]*?\[\/TABLE\]/g, '');
    return parseStemGivens(stemWithoutTables);
  }, [hasGivensField, previewQuestion.stem_givens, stem]);
  const showLegacyImport = hasGivensField && previewQuestion.stem_givens === null && !legacyImportHidden && legacyGivens.length > 0;

  const resetDraft = sourceQuestion => {
    const source = String(sourceQuestion.stem ?? '');
    const sourceCorrectIndex = sourceQuestion.correct_index ?? 'ABCDE'.indexOf(sourceQuestion.correct_answer || '');
    originalStemRef.current = source;
    setStem(source);
    setStemBlocks(stemEditorBlocks(source));
    setStemEditorMode('blocks');
    setStemTouched(false);
    setStemTableDialog(null);
    stemCursorKnownRef.current = false;
    stemCursorOffsetRef.current = source.length;
    setChoices(questionChoices(sourceQuestion).map(choice => (
      typeof choice === 'string' ? { text: choice } : choice
    )));
    setCorrect(sourceCorrectIndex >= 0 ? sourceCorrectIndex : 0);
    setExplanation(sourceQuestion.explanation || '');
    setBoxes(normalizeGivens(sourceQuestion.stem_givens));
    setLegacyImportHidden(false);
    setImageUrl(questionImageForSave(sourceQuestion.image_url));
    setImageBusy(false);
  };

  useEffect(() => {
    setPreviewQuestion(q);
    resetDraft(q);
  }, [q.id, q.updated_at]);

  useEffect(() => {
    setCheckStatus(inspectionCheckStatus(q));
  }, [q.id, q.check_status, q.admin_checked_at, q.updated_at]);

  useEffect(() => {
    let cancelled = false;
    setExplanationDraftLoading(true);
    setExplanationDraftLoadError(null);
    draftRpc(
      EXPLANATION_DRAFT_RPC_NAMES.get,
      buildExplanationDraftRpcParams('get', { questionId: q.id }),
    ).then(result => {
      if (cancelled) return;
      const row = Array.isArray(result) ? (result[0] || null) : (result || null);
      const nextDraft = row?.draft_explanation ?? q.explanation ?? '';
      const nextDirection = row?.direction_note ?? '';
      setExplanationDraftRecord(row);
      setExplanationDraftText(nextDraft);
      setExplanationDirectionNote(nextDirection);
      setSavedExplanationDraftText(nextDraft);
      setSavedExplanationDirectionNote(nextDirection);
      setExplanationDraftMessage(null);
      setExplanationDraftConflict(false);
      setExplanationDraftConfirm(null);
    }).catch(error => {
      if (!cancelled) setExplanationDraftLoadError(error);
    }).finally(() => {
      if (!cancelled) setExplanationDraftLoading(false);
    });
    return () => { cancelled = true; };
  }, [q.id, explanationDraftReload, draftRpc]);

  useEffect(() => {
    stemCursorOffsetRef.current = Math.min(stemCursorOffsetRef.current, stem.length);
  }, [stem]);

  const beginEditing = () => {
    resetDraft(previewQuestion);
    setEditing(true);
  };

  const cancelEditing = () => {
    resetDraft(previewQuestion);
    setEditing(false);
  };

  const rememberStemCursor = event => {
    stemCursorKnownRef.current = true;
    stemCursorOffsetRef.current = event.currentTarget.selectionStart ?? stem.length;
  };

  const focusStemAt = offset => {
    window.requestAnimationFrame(() => {
      const textarea = stemTextareaRef.current;
      if (!textarea) return;
      const safeOffset = Math.max(0, Math.min(offset, textarea.value.length));
      stemCursorKnownRef.current = true;
      stemCursorOffsetRef.current = safeOffset;
      textarea.focus();
      textarea.setSelectionRange(safeOffset, safeOffset);
    });
  };

  const commitStemBlocks = nextBlocks => {
    const nextStem = serializeStemBlocks(nextBlocks);
    setStemBlocks(nextBlocks);
    setStem(nextStem);
    setStemTouched(true);
  };

  const switchStemEditorMode = nextMode => {
    if (nextMode === stemEditorMode) return;

    try {
      if (nextMode === 'source') {
        const source = serializeStemBlocks(stemBlocks);
        setStem(source);
        stemCursorKnownRef.current = false;
        stemCursorOffsetRef.current = source.length;
      } else {
        setStemBlocks(stemEditorBlocks(stem));
      }
      setStemEditorMode(nextMode);
    } catch {
      pushToast?.('지문 편집 모드를 전환하지 못했습니다. 원문을 확인하세요.', 'info');
    }
  };

  const openSourceStemTableDialog = (block = null) => {
    const source = String(stem || '');
    const textareaOffset = stemCursorKnownRef.current
      ? stemTextareaRef.current?.selectionStart
      : stemCursorOffsetRef.current;
    const cursorOffset = Math.max(0, Math.min(
      textareaOffset ?? stemCursorOffsetRef.current,
      source.length,
    ));
    stemCursorOffsetRef.current = cursorOffset;
    setStemTableDialog(block ? {
      editorMode: 'source',
      start: block.start,
      end: block.end,
      insertAt: block.start,
      originalBlock: block.full,
      canonicalBlockAtOpen: serializeConceptTable(parseConceptTableRows(block.content)),
      sourceAtOpen: source,
      rows: parseConceptTableRows(block.content),
    } : {
      editorMode: 'source',
      start: null,
      end: null,
      insertAt: cursorOffset,
      sourceAtOpen: source,
      rows: createEmptyConceptTable(),
    });
  };

  const openBlockStemTableDialog = blockIndex => {
    const block = stemBlocks[blockIndex];
    if (block?.kind !== 'table') return;
    setStemTableDialog({
      editorMode: 'blocks',
      blockIndex,
      insertIndex: null,
      sourceAtOpen: serializeStemBlocks(stemBlocks),
      canonicalBlockAtOpen: serializeConceptTable(block.rows),
      rows: block.rows,
    });
  };

  const openNewBlockStemTableDialog = insertIndex => {
    setStemTableDialog({
      editorMode: 'blocks',
      blockIndex: null,
      insertIndex,
      sourceAtOpen: serializeStemBlocks(stemBlocks),
      rows: createEmptyConceptTable(),
    });
  };

  const closeStemTableDialog = () => {
    const returnOffset = stemTableDialog?.insertAt ?? stemCursorOffsetRef.current;
    const returnToSource = stemTableDialog?.editorMode === 'source';
    setStemTableDialog(null);
    if (returnToSource) focusStemAt(returnOffset);
  };

  const applyStemTable = rows => {
    if (!stemTableDialog) return;
    const containsStemBlockMarker = rows.some(row => row.some(cell => (
      STEM_BLOCK_MARKER_INPUT_PATTERN.test(String(cell?.value ?? ''))
      || STEM_BLOCK_MARKER_INPUT_PATTERN.test(String(cell?.diagonal?.rowLabel ?? ''))
      || STEM_BLOCK_MARKER_INPUT_PATTERN.test(String(cell?.diagonal?.columnLabel ?? ''))
    )));
    if (containsStemBlockMarker) {
      pushToast?.('표 셀에는 지문 블록 마커를 입력할 수 없습니다. 필요하면 원문 편집을 사용하세요.', 'info');
      return;
    }

    if (stemTableDialog.editorMode === 'blocks') {
      if (serializeStemBlocks(stemBlocks) !== stemTableDialog.sourceAtOpen) {
        pushToast?.('지문 블록이 바뀌었습니다. 표를 다시 열어 편집하세요.', 'info');
        setStemTableDialog(null);
        return;
      }

      const nextTableBlock = serializeConceptTable(rows);
      if (stemTableDialog.blockIndex != null
        && nextTableBlock === stemTableDialog.canonicalBlockAtOpen) {
        setStemTableDialog(null);
        return;
      }

      const nextBlocks = stemTableDialog.blockIndex == null
        ? insertStemBlock(
          stemBlocks,
          stemTableDialog.insertIndex,
          newStemEditorBlock({ kind: 'table', rows }),
        )
        : updateStemBlock(stemBlocks, stemTableDialog.blockIndex, { rows });
      commitStemBlocks(nextBlocks);
      setStemTableDialog(null);
      return;
    }

    const source = String(stem || '');
    const tableBlock = serializeConceptTable(rows);
    let nextStem;
    let nextCursor;

    if (stemTableDialog.start != null
      && tableBlock === stemTableDialog.canonicalBlockAtOpen) {
      closeStemTableDialog();
      return;
    }

    if (stemTableDialog.start == null) {
      if (source !== stemTableDialog.sourceAtOpen) {
        pushToast?.('지문 내용이 바뀌었습니다. 표를 다시 열어 추가하세요.', 'info');
        closeStemTableDialog();
        return;
      }
      const insertAt = Math.max(0, Math.min(stemTableDialog.insertAt, source.length));
      nextStem = source.slice(0, insertAt) + tableBlock + source.slice(insertAt);
      nextCursor = insertAt + tableBlock.length;
    } else {
      const { start, end } = stemTableDialog;
      if (source !== stemTableDialog.sourceAtOpen) {
        pushToast?.('지문 내용이 바뀌었습니다. 표를 다시 열어 편집하세요.', 'info');
        closeStemTableDialog();
        return;
      }
      nextStem = source.slice(0, start) + tableBlock + source.slice(end);
      nextCursor = start + tableBlock.length;
    }

    stemCursorOffsetRef.current = nextCursor;
    setStem(nextStem);
    setStemTouched(true);
    setStemTableDialog(null);
    focusStemAt(nextCursor);
  };

  const updateStemTextBlock = (blockIndex, text) => {
    if (STEM_BLOCK_MARKER_INPUT_PATTERN.test(text)) {
      pushToast?.('텍스트 블록에는 지문 블록 마커를 입력할 수 없습니다. 필요하면 원문 편집을 사용하세요.', 'info');
      return;
    }
    commitStemBlocks(updateStemBlock(stemBlocks, blockIndex, { text }));
  };

  const updateStemFigureBlock = (blockIndex, content) => {
    if (STEM_BLOCK_MARKER_INPUT_PATTERN.test(content)) {
      pushToast?.('SVG 내용에는 지문 블록 마커를 입력할 수 없습니다. 필요하면 원문 편집을 사용하세요.', 'info');
      return;
    }
    commitStemBlocks(updateStemBlock(stemBlocks, blockIndex, {
      content,
      // Editing a standalone [SVG] placeholder promotes it to a paired block,
      // otherwise serializeStemBlocks would intentionally discard its content.
      standalone: false,
    }));
  };

  const updateStemChoiceHeader = (blockIndex, headerIndex, value) => {
    if (value.includes('|') || STEM_BLOCK_MARKER_INPUT_PATTERN.test(value)) {
      pushToast?.('헤더 라벨에는 | 또는 지문 블록 마커를 입력할 수 없습니다.', 'info');
      return;
    }
    const block = stemBlocks[blockIndex];
    const headers = [...(block?.headers?.length ? block.headers : [''])];
    headers[headerIndex] = value;
    commitStemBlocks(updateStemBlock(stemBlocks, blockIndex, { headers }));
  };

  const resizeStemChoiceHeaders = (blockIndex, nextCount, sourceBlocks = stemBlocks) => {
    const block = sourceBlocks[blockIndex];
    if (block?.kind !== 'choiceHeaders'
      || !Number.isInteger(nextCount)
      || nextCount < 1
      || nextCount > MAX_CHOICE_HEADER_COLUMNS) return;
    const headers = block.headers?.length ? block.headers : [''];
    if (headers.length === nextCount) return;

    if (nextCount < headers.length) {
      const removedColumnCount = headers.length - nextCount;
      const truncated = choiceHeadersTruncation(headers, nextCount);
      const labelNotice = truncated.count > 0
        ? `\n삭제될 라벨 ${truncated.count}개: ${truncated.labels.join(', ')}`
        : '\n삭제될 열의 라벨은 모두 비어 있습니다.';
      const droppedColumns = choiceColumnsTruncation(choices, nextCount);
      const choiceNotice = droppedColumns.count > 0
        ? `\n삭제될 선지 내용 ${droppedColumns.count}개: ${describeDroppedChoiceColumns(droppedColumns.columns)}`
        : '\n삭제될 선지 칸은 모두 비어 있습니다.';
      const confirmed = window.confirm(
        `열 수를 ${headers.length}개에서 ${nextCount}개로 줄이면 뒤의 ${removedColumnCount}개 열이 삭제됩니다.${labelNotice}${choiceNotice}\n\n계속하시겠습니까?`,
      );
      if (!confirmed) return;
    }

    commitStemBlocks(updateStemBlock(sourceBlocks, blockIndex, {
      headers: resizeChoiceHeaders(headers, nextCount),
    }));
    // Header width and choice column count must move together: the app renders
    // each side from its own count and never cross-checks them.
    setChoices(current => resizeAllChoiceColumns(current, nextCount));
  };

  // Mirrors save(): in source mode the stem string is authoritative and
  // stemBlocks is stale, so re-parse before touching the block array.
  const editableStemBlocks = () => (
    stemEditorMode === 'blocks' ? stemBlocks : stemEditorBlocks(stem)
  );

  const resizeChoiceHeadersFromToolbar = nextCount => {
    const blocks = editableStemBlocks();
    const blockIndex = blocks.findIndex(block => block.kind === 'choiceHeaders');
    if (blockIndex < 0) return;
    resizeStemChoiceHeaders(blockIndex, nextCount, blocks);
  };

  // Named apart from the imported block helpers: a handler sharing their name
  // shadows the import and silently recurses into itself.
  const addChoiceHeaders = () => {
    const blocks = editableStemBlocks();
    if (blocks.some(block => block.kind === 'choiceHeaders')) {
      pushToast?.('이미 선택지 헤더가 있습니다.', 'info');
      return;
    }

    commitStemBlocks(appendChoiceHeadersBlock(blocks, DEFAULT_CHOICE_COLUMNS, newStemEditorBlock));
  };

  const removeChoiceHeaders = () => {
    const blocks = editableStemBlocks();
    const blockIndex = blocks.findIndex(block => block.kind === 'choiceHeaders');
    if (blockIndex < 0) return;

    const pipedCount = choices.filter(
      choice => splitChoiceColumns(choiceText(choice)).length > 1,
    ).length;
    const choiceNotice = pipedCount > 0
      ? `\n\n선지 ${pipedCount}개에 남아 있는 ${CHOICE_COLUMN_SEPARATOR} 는 그대로 유지됩니다. 헤더 없이는 그 기호가 본문에 그대로 보입니다.`
      : '';
    if (!window.confirm(`선택지 헤더를 제거하시겠습니까?${choiceNotice}`)) return;

    commitStemBlocks(removeChoiceHeadersBlock(blocks));
  };

  const updateChoiceText = (choiceIndex, value) => {
    setChoices(current => current.map((choice, index) => (
      index === choiceIndex ? { ...choice, text: value } : choice
    )));
  };

  const updateChoiceColumn = (choiceIndex, columnIndex, value) => {
    if (value.includes(CHOICE_COLUMN_SEPARATOR)) {
      pushToast?.(`선지 칸에는 ${CHOICE_COLUMN_SEPARATOR} 를 입력할 수 없습니다. 열을 늘리려면 헤더의 열 수를 바꾸세요.`, 'info');
      return;
    }
    setChoices(current => setChoiceColumn(current, choiceIndex, columnIndex, value));
  };

  const syncChoiceColumns = () => {
    const columnCount = choiceHeaderLabels?.length;
    if (!columnCount) return;

    const droppedColumns = choiceColumnsTruncation(choices, columnCount);
    if (droppedColumns.count > 0) {
      const confirmed = window.confirm(
        `선지 칸을 ${columnCount}개로 맞추면 내용 ${droppedColumns.count}개가 삭제됩니다.\n${describeDroppedChoiceColumns(droppedColumns.columns)}\n\n계속하시겠습니까?`,
      );
      if (!confirmed) return;
    }
    setChoices(current => resizeAllChoiceColumns(current, columnCount));
  };

  const insertStemTextBlock = insertIndex => {
    commitStemBlocks(insertStemBlock(
      stemBlocks,
      insertIndex,
      newStemEditorBlock({ kind: 'text', text: '' }),
    ));
  };

  const deleteStemEditorBlock = blockIndex => {
    if (!window.confirm(`블록 ${blockIndex + 1}을 삭제하시겠습니까?`)) return;
    commitStemBlocks(deleteStemBlock(stemBlocks, blockIndex));
  };

  const moveStemEditorBlock = (blockIndex, direction) => {
    const targetIndex = blockIndex + direction;
    if (targetIndex < 0 || targetIndex >= stemBlocks.length) return;
    commitStemBlocks(moveStemBlock(stemBlocks, blockIndex, targetIndex));
  };

  const updateBox  = (bi, fn) => setBoxes(bs => bs.map((b, i) => i === bi ? fn(b) : b));
  const updateItem = (bi, ii, fn) => updateBox(bi, b => ({ ...b, items: (b.items || []).map((x, j) => j === ii ? fn(x) : x) }));
  const addBox     = (type) => setBoxes(bs => [...bs, createGivenBox(type)]);
  const addItem    = (bi) => updateBox(bi, b => {
    const markerFamily = givenMarkerFamily(b);
    const items = b.items || [];
    return {
      ...b,
      _marker_family: markerFamily,
      items: [...items, createGivenItem(givenMarkerKeyForIndex(markerFamily, items.length))],
    };
  });
  const removeItem = (bi, ii) => updateBox(bi, b => ({ ...b, items: (b.items || []).filter((_, j) => j !== ii) }));
  const removeBox  = (bi) => setBoxes(bs => bs.filter((_, i) => i !== bi));
  const moveBox    = (bi, dir) => setBoxes(bs => {
    const j = bi + dir; if (j < 0 || j >= bs.length) return bs;
    const c = [...bs]; [c[bi], c[j]] = [c[j], c[bi]]; return c;
  });
  const pickQuestionImage = async file => {
    if (imageBusy) return;
    setImageBusy(true);
    try {
      const parsed = parseQuestionImage(await questionImageFromFile(file));
      if (!parsed.ok) {
        pushToast?.(parsed.reason === 'too-large'
          ? `사진이 너무 큽니다 (${formatByteSize(parsed.byteLength)}). 최대 ${formatByteSize(MAX_QUESTION_IMAGE_BYTES)} 입니다.`
          : '사진을 PNG 로 변환하지 못했습니다.', 'info');
        return;
      }
      setImageUrl(parsed.dataUrl);
      pushToast?.(`사진을 불러왔습니다 (${formatByteSize(parsed.byteLength)}). 저장을 눌러야 반영됩니다.`, 'info');
    } catch {
      pushToast?.('사진 파일을 읽지 못했습니다. PNG 또는 JPEG 인지 확인하세요.', 'info');
    } finally {
      setImageBusy(false);
    }
  };

  const clearQuestionImage = () => {
    if (!window.confirm('첨부된 기출 원본 사진을 제거하시겠습니까?\n\n저장을 눌러야 DB 에 반영됩니다.')) return;
    setImageUrl(null);
  };

  const importLegacyGivens = () => {
    setBoxes(normalizeGivens(legacyGivens));
    setLegacyImportHidden(true);
    pushToast?.('감지된 보기를 편집 영역에 채웠습니다. 저장을 눌러 반영하세요.', 'info');
  };

  const save = async () => {
    setBusy(true);
    try {
      const blocksForSave = stemEditorMode === 'blocks'
        ? stemBlocks
        : parseStemBlocks(stem);
      const stemValidation = validateStemBlocksForSave(
        originalStemRef.current,
        blocksForSave,
        !stemTouched,
      );
      if (!stemValidation.ok) {
        pushToast?.('지문 안전 검증에 실패했습니다. 저장하지 않았습니다.', 'info');
        return;
      }

      // Object entries pass through untouched so a blank column keeps its id —
      // the app matches correct_answer against that id when grading.
      const p_choices = choices.map(choiceForSave);
      const p_correct_answer = String.fromCharCode(65 + correct);
      const { payload, error } = serializeGivens(boxes);
      if (error) { pushToast(error, 'info'); return; }
      const common = {
        p_id: q.id, p_stem: stemValidation.stem, p_stem_givens: payload,
        p_choices, p_correct_answer, p_explanation: explanation,
      };
      // image_url 을 싣고 온 경로에서만 v3 을 쓴다. 신고 화면은 그 값을 못 받으므로
      // v2 로 보내 image_url 을 건드리지 않는다.
      await (hasImageField
        ? rpc('admin_update_question_v3', { ...common, p_image_url: questionImageForSave(imageUrl) })
        : rpc('admin_update_question_v2', common));
      const savedCheckStatus = checkStatus === 'checked' ? 'stale' : checkStatus;
      const savedQuestion = {
        ...previewQuestion,
        stem: stemValidation.stem,
        stem_givens: payload,
        choices: p_choices,
        correct_answer: p_correct_answer,
        correct_index: correct,
        explanation,
        check_status: savedCheckStatus,
        ...(hasImageField ? { image_url: questionImageForSave(imageUrl) } : {}),
      };
      originalStemRef.current = stemValidation.stem;
      setStem(stemValidation.stem);
      setStemTouched(false);
      setPreviewQuestion(savedQuestion);
      setCheckStatus(savedCheckStatus);
      setEditing(false);
      onSaved?.(savedQuestion);
    } catch (e) { pushToast(e.message, 'info'); }
    finally { setBusy(false); }
  };

  const toggleCheck = async () => {
    if (checking) return;
    const isChecked = checkStatus !== 'unchecked';
    setChecking(true);
    try {
      if (isChecked) {
        await rpc('admin_unmark_question_checked', { p_question_id: q.id });
        setCheckStatus('unchecked');
        pushToast('검수 해제됨');
      } else {
        await rpc('admin_mark_question_checked', { p_question_id: q.id });
        setCheckStatus('checked');
        pushToast('검수 완료');
      }
      onChanged?.();
    } catch (e) { pushToast(e.message, 'info'); }
    finally { setChecking(false); }
  };

  const explanationDraftDirty = explanationDraftText !== savedExplanationDraftText
    || explanationDirectionNote !== savedExplanationDirectionNote;

  const restoreExplanationDraftForm = () => {
    const nextDraft = explanationDraftRecord?.draft_explanation ?? previewQuestion.explanation ?? '';
    const nextDirection = explanationDraftRecord?.direction_note ?? '';
    setExplanationDraftText(nextDraft);
    setExplanationDirectionNote(nextDirection);
    setSavedExplanationDraftText(nextDraft);
    setSavedExplanationDirectionNote(nextDirection);
  };

  const finishClosingExplanationDraft = () => {
    restoreExplanationDraftForm();
    setExplanationDraftOpen(false);
    setExplanationDraftReview(false);
    setExplanationDraftMessage(null);
    setExplanationDraftConflict(false);
    setExplanationDraftConfirm(null);
  };

  const requestCloseExplanationDraft = () => {
    if (explanationDraftDirty) {
      setExplanationDraftConfirm('close');
      return;
    }
    finishClosingExplanationDraft();
  };

  const toggleExplanationDraft = () => {
    if (explanationDraftOpen) {
      requestCloseExplanationDraft();
      return;
    }
    if (!explanationDraftRecord) {
      const currentExplanation = previewQuestion.explanation || '';
      setExplanationDraftText(currentExplanation);
      setExplanationDirectionNote('');
      setSavedExplanationDraftText(currentExplanation);
      setSavedExplanationDirectionNote('');
    }
    setExplanationDraftReview(false);
    setExplanationDraftMessage(null);
    setExplanationDraftConflict(false);
    setExplanationDraftConfirm(null);
    setExplanationDraftOpen(true);
  };

  const ensureExplanationDraftGeneration = async expectedDraft => {
    const result = await draftRpc(
      EXPLANATION_DRAFT_RPC_NAMES.get,
      buildExplanationDraftRpcParams('get', { questionId: q.id }),
    );
    const currentDraft = Array.isArray(result) ? (result[0] || null) : (result || null);
    const sameGeneration = expectedDraft
      ? currentDraft?.id === expectedDraft.id
        && (currentDraft.updated_at || null) === (expectedDraft.updated_at || null)
      : currentDraft === null;
    if (!sameGeneration) {
      throw new Error('변경안이 다른 곳에서 바뀌었습니다. 카드를 다시 열어 최신 초안을 확인해 주세요.');
    }
  };

  const persistExplanationDraft = async () => {
    if (explanationDraftAction) return null;
    setExplanationDraftAction('saving');
    setExplanationDraftMessage(null);
    setExplanationDraftConflict(false);
    try {
      await ensureExplanationDraftGeneration(explanationDraftRecord);
      const result = await draftRpc(
        EXPLANATION_DRAFT_RPC_NAMES.save,
        buildExplanationDraftRpcParams('save', {
          questionId: q.id,
          draft: explanationDraftText,
          directionNote: explanationDirectionNote,
        }),
      );
      const row = Array.isArray(result) ? result[0] : result;
      if (!row) throw new Error('저장된 변경안을 불러오지 못했습니다.');
      setExplanationDraftRecord(row);
      setExplanationDraftText(row.draft_explanation ?? '');
      setExplanationDirectionNote(row.direction_note ?? '');
      setSavedExplanationDraftText(row.draft_explanation ?? '');
      setSavedExplanationDirectionNote(row.direction_note ?? '');
      setExplanationDraftMessage({ kind: 'success', text: '초안이 저장되었습니다.' });
      return row;
    } catch (error) {
      setExplanationDraftMessage({ kind: 'danger', text: error?.message || '초안을 저장하지 못했습니다.' });
      return null;
    } finally {
      setExplanationDraftAction(null);
    }
  };

  const reviewExplanationDraft = async () => {
    const row = (!explanationDraftRecord || explanationDraftDirty)
      ? await persistExplanationDraft()
      : explanationDraftRecord;
    if (!row) return;
    setExplanationDraftRecord(row);
    setExplanationDraftReview(true);
    setExplanationDraftMessage(null);
    setExplanationDraftConflict(false);
    setExplanationDraftConfirm(null);
  };

  const applyExplanationDraft = async () => {
    if (!explanationDraftRecord || explanationDraftAction) return;
    setExplanationDraftAction('applying');
    setExplanationDraftMessage(null);
    setExplanationDraftConflict(false);
    try {
      await ensureExplanationDraftGeneration(explanationDraftRecord);
      const result = await draftRpc(
        EXPLANATION_DRAFT_RPC_NAMES.apply,
        buildExplanationDraftRpcParams('apply', { questionId: q.id }),
      );
      const row = Array.isArray(result) ? result[0] : result;
      const appliedExplanation = row?.draft_explanation ?? explanationDraftText;
      const nextCheckStatus = checkStatus === 'checked' ? 'stale' : checkStatus;
      setPreviewQuestion(current => ({
        ...current,
        explanation: appliedExplanation,
        check_status: nextCheckStatus,
        updated_at: row?.applied_at || current.updated_at,
      }));
      setExplanation(appliedExplanation);
      setCheckStatus(nextCheckStatus);
      setExplanationDraftRecord(null);
      setExplanationDraftText(appliedExplanation);
      setExplanationDirectionNote('');
      setSavedExplanationDraftText(appliedExplanation);
      setSavedExplanationDirectionNote('');
      setExplanationDraftOpen(false);
      setExplanationDraftReview(false);
      setExplanationDraftConfirm(null);
      pushToast?.('해설 변경안이 반영되었습니다.');
      onChanged?.();
    } catch (error) {
      const message = error?.message || '변경안을 반영하지 못했습니다.';
      const conflict = message.includes('해설이 변경안 생성 이후 바뀌었습니다');
      setExplanationDraftConflict(conflict);
      setExplanationDraftMessage({ kind: 'danger', text: message });
    } finally {
      setExplanationDraftAction(null);
    }
  };

  const rebaseExplanationDraft = async () => {
    if (!explanationDraftRecord || explanationDraftAction) return;
    setExplanationDraftAction('rebasing');
    setExplanationDraftMessage(null);
    try {
      await ensureExplanationDraftGeneration(explanationDraftRecord);
      const result = await draftRpc(
        EXPLANATION_DRAFT_RPC_NAMES.rebase,
        buildExplanationDraftRpcParams('rebase', { questionId: q.id }),
      );
      const row = Array.isArray(result) ? result[0] : result;
      if (!row) throw new Error('다시 비교할 변경안을 불러오지 못했습니다.');
      setExplanationDraftRecord(row);
      setExplanationDraftText(row.draft_explanation ?? '');
      setExplanationDirectionNote(row.direction_note ?? '');
      setSavedExplanationDraftText(row.draft_explanation ?? '');
      setSavedExplanationDirectionNote(row.direction_note ?? '');
      setPreviewQuestion(current => ({ ...current, explanation: row.base_explanation ?? '' }));
      setExplanation(row.base_explanation ?? '');
      setCheckStatus(current => current === 'checked' ? 'stale' : current);
      setExplanationDraftConflict(false);
      setExplanationDraftMessage({ kind: 'success', text: '현재 해설을 새 원본으로 가져왔습니다.' });
      setExplanationDraftReview(true);
    } catch (error) {
      setExplanationDraftMessage({ kind: 'danger', text: error?.message || '현재 해설을 가져오지 못했습니다.' });
    } finally {
      setExplanationDraftAction(null);
    }
  };

  const deleteExplanationDraft = async () => {
    if (!explanationDraftRecord || explanationDraftAction) return;
    setExplanationDraftAction('deleting');
    setExplanationDraftMessage(null);
    try {
      await ensureExplanationDraftGeneration(explanationDraftRecord);
      await draftRpc(
        EXPLANATION_DRAFT_RPC_NAMES.delete,
        buildExplanationDraftRpcParams('delete', { questionId: q.id }),
      );
      setExplanationDraftRecord(null);
      setExplanationDraftText(previewQuestion.explanation || '');
      setExplanationDirectionNote('');
      setSavedExplanationDraftText(previewQuestion.explanation || '');
      setSavedExplanationDirectionNote('');
      setExplanationDraftOpen(false);
      setExplanationDraftReview(false);
      setExplanationDraftConfirm(null);
      pushToast?.('해설 초안이 삭제되었습니다.');
    } catch (error) {
      setExplanationDraftMessage({ kind: 'danger', text: error?.message || '초안을 삭제하지 못했습니다.' });
      setExplanationDraftConfirm(null);
    } finally {
      setExplanationDraftAction(null);
    }
  };

  const statusMeta = inspectionStatusMeta(checkStatus);
  const hasGeminiTemplate = Boolean(subject?.gemini_prompt_template?.trim());
  const previewChoices = questionChoices(previewQuestion);
  const copyGeminiPrompt = async () => {
    if (!hasGeminiTemplate) return;
    const text = buildGeminiPrompt(subject, previewQuestion);
    try {
      await navigator.clipboard.writeText(text);
      pushToast?.('🤖 Gemini 프롬프트 복사됨');
    } catch {
      fallbackCopyText(text);
      pushToast?.('🤖 Gemini 프롬프트 복사됨');
    }
  };
  const actionBar = (
    <div className="qi-actions question-block-actions" style={{marginTop:0, marginBottom:14, alignItems:'center'}}>
      <button type="button" className="btn btn-sm" onClick={beginEditing}>✏️ 편집</button>
      <button
        type="button"
        className="btn btn-sm btn-gemini"
        onClick={copyGeminiPrompt}
        disabled={!hasGeminiTemplate}
        title={hasGeminiTemplate ? undefined : '과목에 Gemini 템플릿 없음'}
      >🤖 Gemini에 보내기</button>
      <button type="button" className="btn btn-sm" onClick={() => {
        downloadMd(subject, previewQuestion, exam);
        pushToast?.('.md 다운로드 생성됨');
      }}>💾 .md 다운로드</button>
      <button
        type="button"
        className={"btn btn-sm " + (explanationDraftRecord ? 'explanation-draft-present' : '')}
        onClick={toggleExplanationDraft}
        disabled={explanationDraftLoading}
      >
        📝 변경안{explanationDraftRecord && <span className="explanation-draft-button-state">초안 있음</span>}
      </button>
      <button className={"btn btn-sm " + (checkStatus === 'unchecked' ? 'btn-success' : '')} onClick={toggleCheck} disabled={checking}>
        {checking ? '처리 중...' : checkStatus === 'unchecked' ? '✓ 검수 완료' : '검수 해제'}
      </button>
      <span className={"badge " + statusMeta[0]} style={{marginLeft:'auto'}}>{statusMeta[1]}</span>
    </div>
  );

  if (editing) {
    return (
      <>
      <div className="q-box">
        <div className="question-stem-editor-tools" style={{ flexWrap: 'wrap' }}>
          <div className="field-label">문항 지문</div>
          <div className="stem-editor-mode-toggle" role="group" aria-label="지문 편집 방식">
            <button
              type="button"
              className={stemEditorMode === 'blocks' ? 'active' : ''}
              aria-pressed={stemEditorMode === 'blocks'}
              onClick={() => switchStemEditorMode('blocks')}
            >블록 편집</button>
            <button
              type="button"
              className={stemEditorMode === 'source' ? 'active' : ''}
              aria-pressed={stemEditorMode === 'source'}
              onClick={() => switchStemEditorMode('source')}
            >원문 편집</button>
          </div>
        </div>
        {stemEditorMode === 'blocks' ? (
          <StemBlockEditor
            blocks={stemBlocks}
            onUpdateText={updateStemTextBlock}
            onUpdateFigure={updateStemFigureBlock}
            onUpdateChoiceHeader={updateStemChoiceHeader}
            onResizeChoiceHeaders={resizeStemChoiceHeaders}
            onEditTable={openBlockStemTableDialog}
            onInsertText={insertStemTextBlock}
            onInsertTable={openNewBlockStemTableDialog}
            onDelete={deleteStemEditorBlock}
            onMove={moveStemEditorBlock}
          />
        ) : (
          <div className="stem-source-editor">
            <div className="stem-source-table-tools">
              {stemTableBlocks.map(block => {
                const firstRow = (block.content.split(/\r?\n/).find(row => row.trim()) || '')
                  .split('|').map(cell => cell.trim()).join(' | ');
                const preview = firstRow.length > 30 ? firstRow.slice(0, 29) + '…' : firstRow;
                return (
                  <button type="button" className="btn btn-xs" key={block.start}
                    onClick={() => openSourceStemTableDialog(block)}>
                    표 {block.index + 1} 편집{preview ? ` · ${preview}` : ''}
                  </button>
                );
              })}
              <button type="button" className="btn btn-xs" onClick={() => openSourceStemTableDialog()}>
                {stemTableBlocks.length ? '+ 새 표' : '표 삽입'}
              </button>
            </div>
            <textarea
              ref={stemTextareaRef}
              value={stem}
              onChange={event => {
                setStem(event.target.value);
                setStemTouched(true);
                rememberStemCursor(event);
              }}
              onSelect={rememberStemCursor}
              onClick={rememberStemCursor}
              onKeyUp={rememberStemCursor}
              aria-label="문항 지문 원문"
              spellCheck={false}
            />
          </div>
        )}
        {hasGivensField && (
          <div style={{ marginBottom: 14 }}>
            <div className="field-label">보기 박스 (stem_givens)</div>
            {showLegacyImport && (
              <LegacyGivensImportPreview
                boxes={legacyGivens}
                onImport={importLegacyGivens}
                onIgnore={() => setLegacyImportHidden(true)}
              />
            )}
            {boxes.length === 0 && (
              <div style={{ fontSize: 12, color: 'var(--fg-subtle)', padding: '6px 0' }}>
                필요한 유형을 골라 박스를 추가하세요.
              </div>
            )}
            {boxes.map((box, bi) => {
              const boxType = givenBoxType(box);
              const markerFamily = givenMarkerFamily(box);
              const markerOptions = givenMarkerCellOptions(markerFamily);
              return (
                <div key={bi} style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', marginBottom: 8, background: 'var(--surface)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>
                    <select
                      className="field-input"
                      style={{ width: 150, padding: '5px 8px', fontSize: 12 }}
                      value={boxType}
                      onChange={e => updateBox(bi, b => applyGivenBoxType(b, e.target.value))}
                    >
                      <option value="plain">평문(박스 없음)</option>
                      <option value="simple">단순 박스</option>
                      <option value="view">〈보기〉 박스</option>
                    </select>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--fg-muted)' }}>
                      마커:
                      <select
                        className="field-input"
                        style={{ width: 132, padding: '5px 8px', fontSize: 12 }}
                        value={markerFamily}
                        onChange={e => updateBox(bi, b => applyGivenMarkerFamily(b, e.target.value))}
                      >
                        {GIVEN_MARKER_FAMILY_OPTIONS.map(option => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                    {boxType === 'view' && (
                      <input className="field-input" style={{ width: 120, padding: '5px 8px', fontSize: 12 }} placeholder="보기"
                        value={box.label}
                        onChange={e => updateBox(bi, b => ({ ...b, boxed: true, _box_type: 'view', label: e.target.value }))}
                        onBlur={e => {
                          if (!e.target.value.trim()) updateBox(bi, b => ({ ...b, label: '보기' }));
                        }} />
                    )}
                    <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--fg-muted)' }}>
                      <input type="checkbox" checked={box.markdown_enabled}
                        onChange={e => updateBox(bi, b => ({ ...b, markdown_enabled: e.target.checked }))} />
                      마크다운
                    </label>
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                      <button className="btn btn-xs" disabled={bi === 0} onClick={() => moveBox(bi, -1)} title="위로">▲</button>
                      <button className="btn btn-xs" disabled={bi === boxes.length - 1} onClick={() => moveBox(bi, 1)} title="아래로">▼</button>
                      <button className="btn btn-xs btn-danger" onClick={() => removeBox(bi)} title="박스 삭제"><Icon name="trash" size={11} /></button>
                    </div>
                  </div>
                  <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 7 }}>
                    {(box.items || []).map((it, ii) => (
                      <div key={ii} style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                        {markerFamily !== GIVEN_MARKER_FAMILY_NONE && (
                          <select
                            className="field-input"
                            style={{ width: 78, padding: '7px 6px', textAlign: 'center', fontSize: 13, color: 'var(--accent)', fontWeight: 700 }}
                            value={it.key === '' ? '' : (markerOptions.includes(it.key) ? it.key : givenMarkerKeyForIndex(markerFamily, ii))}
                            onChange={e => updateItem(bi, ii, x => ({ ...x, key: e.target.value, _auto_key: false }))}
                          >
                            {markerOptions.map(key => (
                              <option key={key} value={key}>{key}</option>
                            ))}
                            <option key="__none__" value="">(없음)</option>
                          </select>
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          {box.markdown_enabled
                            ? <MarkdownEditor compact value={it.text} onChange={md => updateItem(bi, ii, x => ({ ...x, text: md }))} placeholder="항목 내용 (마크다운)" />
                            : <input className="field-input" style={{ width: '100%', padding: '7px 9px', fontSize: 14 }}
                                value={it.text} onChange={e => updateItem(bi, ii, x => ({ ...x, text: e.target.value }))} placeholder="항목 내용" />}
                        </div>
                        <button className="btn btn-xs" onClick={() => removeItem(bi, ii)} title="항목 삭제"><Icon name="x" size={11} /></button>
                      </div>
                    ))}
                    <button className="btn btn-xs" style={{ alignSelf: 'flex-start' }} onClick={() => addItem(bi)}>＋ 항목 추가</button>
                  </div>
                </div>
              );
            })}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button className="btn btn-sm" onClick={() => addBox('simple')}><Icon name="plus" size={12} /> 단순 박스</button>
              <button className="btn btn-sm" onClick={() => addBox('markdown')}><Icon name="plus" size={12} /> 마크다운 박스</button>
              <button className="btn btn-sm" onClick={() => addBox('view')}><Icon name="plus" size={12} /> 〈보기〉 박스</button>
            </div>
          </div>
        )}
        {hasImageField && (
          <QuestionImageEditor
            imageUrl={imageUrl}
            hasSvgBlock={stemHasFigure}
            busy={imageBusy}
            onPick={pickQuestionImage}
            onClear={clearQuestionImage}
          />
        )}
        <ChoiceListEditor
          choices={choices}
          correct={correct}
          headers={choiceHeaderLabels}
          onSelectCorrect={setCorrect}
          onChangeText={updateChoiceText}
          onChangeColumn={updateChoiceColumn}
          onAddHeaders={addChoiceHeaders}
          onRemoveHeaders={removeChoiceHeaders}
          onResizeHeaders={resizeChoiceHeadersFromToolbar}
          onSyncColumns={syncChoiceColumns}
        />
        <div className="field-label">해설</div>
        <textarea value={explanation} onChange={e=>setExplanation(e.target.value)} style={{minHeight:220}}/>
        <div style={{display:'flex', gap:6, justifyContent:'flex-end', marginTop:10}}>
          <button className="btn btn-sm" onClick={cancelEditing}>취소</button>
          <button className="btn btn-sm btn-primary" onClick={save} disabled={busy}>{busy ? '저장 중...' : '저장'}</button>
        </div>
      </div>
      {stemTableDialog && (
        <ConceptTableEditorModal
          rows={stemTableDialog.rows}
          editing={stemTableDialog.editorMode === 'blocks'
            ? stemTableDialog.blockIndex != null
            : stemTableDialog.start != null}
          onCancel={closeStemTableDialog}
          onApply={applyStemTable}
        />
      )}
      </>
    );
  }
  return (
    <>
    {actionBar}
    <div className="q-box">
      <div className="q-stem">{previewQuestion.stem}</div>
      {Array.isArray(previewQuestion.stem_givens) && previewQuestion.stem_givens.length > 0 && (
        <div style={{ margin: '8px 0 14px' }}>
          {previewQuestion.stem_givens.map((box, bi) => {
            const { boxed, label } = givenPreviewBoxMeta(box);
            return (
              <div key={bi} style={boxed ? { border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '10px 12px', marginBottom: 6, background: 'var(--surface-2)' } : { padding: '2px 0', marginBottom: 6 }}>
                {label && <div style={{ fontSize: 11, color: 'var(--fg-subtle)', fontFamily: 'var(--font-mono)', marginBottom: 6 }}>〈{label}〉</div>}
                {(box.items || []).map((it, ii) => {
                  const hasKey = String(it.key ?? '').trim() !== '';
                  return (
                    <div key={ii} style={{ display: 'grid', gridTemplateColumns: hasKey ? '40px minmax(0, 1fr)' : 'minmax(0, 1fr)', gap: 8, alignItems: 'start', fontSize: 14, lineHeight: 1.7 }}>
                      {hasKey && <b>{String(it.key ?? '')}</b>}
                      <GivenPreviewText text={it.text} markdown={!!box.markdown_enabled} />
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
      <ul className="choices-list">
        {previewChoices.map((c, i) => {
          const text = typeof c === 'string' ? c : (c.text || '');
          return (
            <li key={i} className={"choice-item " + (i === (previewQuestion.correct_index ?? -1) ? 'correct' : '')}>
              <span className="choice-id">{'①②③④⑤'[i]}</span> {text}
              {i === (previewQuestion.correct_index ?? -1) && <span style={{marginLeft:'auto', fontSize:10}}>정답</span>}
            </li>
          );
        })}
      </ul>
      {previewQuestion.explanation && <div className="exp-box">{previewQuestion.explanation}</div>}
      {explanationDraftOpen && (
        <div className="explanation-draft-panel">
          <div className="explanation-draft-panel-head">
            <div>
              <div className="explanation-draft-panel-title">
                {explanationDraftReview ? '해설 변경안 비교' : '해설 변경안'}
              </div>
              <div className="explanation-draft-panel-sub">
                라이브 해설은 ‘이대로 반영’을 누르기 전까지 바뀌지 않습니다.
              </div>
            </div>
            {explanationDraftRecord && <span className="badge badge-info">초안 있음</span>}
          </div>

          {explanationDraftLoadError && (
            <div className="explanation-draft-notice danger">
              <span>{explanationDraftLoadError.message || '변경안을 불러오지 못했습니다.'}</span>
              <button
                type="button"
                className="btn btn-xs"
                onClick={() => setExplanationDraftReload(value => value + 1)}
              >다시 시도</button>
            </div>
          )}

          {explanationDraftMessage && (
            <div className={"explanation-draft-notice " + explanationDraftMessage.kind}>
              <span>{explanationDraftMessage.text}</span>
              {explanationDraftConflict && (
                <button
                  type="button"
                  className="btn btn-xs"
                  onClick={rebaseExplanationDraft}
                  disabled={Boolean(explanationDraftAction)}
                >현재 해설 기준으로 다시 비교</button>
              )}
            </div>
          )}

          {!explanationDraftLoadError && explanationDraftReview && explanationDraftRecord ? (
            <>
              <div className="explanation-draft-direction-preview">
                <div className="field-label">방향성</div>
                <div>{explanationDirectionNote || '(작성된 방향성 없음)'}</div>
              </div>
              <ExplanationDiff
                baseExplanation={explanationDraftRecord.base_explanation}
                draftExplanation={explanationDraftText}
              />
              <div className="explanation-draft-actions">
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => {
                    setExplanationDraftReview(false);
                    setExplanationDraftMessage(null);
                    setExplanationDraftConflict(false);
                  }}
                  disabled={Boolean(explanationDraftAction)}
                >취소</button>
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  onClick={applyExplanationDraft}
                  disabled={Boolean(explanationDraftAction)}
                >{explanationDraftAction === 'applying' ? '반영 중...' : '이대로 반영'}</button>
              </div>
            </>
          ) : !explanationDraftLoadError && (
            <>
              <label className="explanation-draft-field">
                <span className="field-label">해설 초안</span>
                <textarea
                  className="explanation-draft-textarea"
                  value={explanationDraftText}
                  onChange={event => {
                    setExplanationDraftText(event.target.value);
                    setExplanationDraftMessage(null);
                    setExplanationDraftConfirm(null);
                  }}
                  placeholder="반영할 해설을 작성하세요."
                />
              </label>
              <label className="explanation-draft-field">
                <span className="field-label">방향성</span>
                <textarea
                  className="explanation-direction-textarea"
                  value={explanationDirectionNote}
                  onChange={event => {
                    setExplanationDirectionNote(event.target.value);
                    setExplanationDraftMessage(null);
                    setExplanationDraftConfirm(null);
                  }}
                  placeholder="정착물 정의 한 줄 + 표로만 정리, ㄱ~ㅂ 하나씩 설명 금지"
                />
              </label>

              <div className={"explanation-draft-save-state " + (explanationDraftDirty ? 'dirty' : '')}>
                {explanationDraftAction === 'saving'
                  ? '저장 중...'
                  : explanationDraftDirty
                    ? '저장되지 않은 변경이 있습니다.'
                    : explanationDraftRecord
                      ? `저장됨${explanationDraftRecord.updated_at ? ` · ${relativeTime(explanationDraftRecord.updated_at)}` : ''}`
                      : '아직 DB에 저장되지 않았습니다.'}
              </div>

              {explanationDraftConfirm === 'close' && (
                <div className="explanation-draft-inline-confirm">
                  <span>저장하지 않은 변경을 버리고 닫을까요?</span>
                  <div>
                    <button type="button" className="btn btn-xs" onClick={() => setExplanationDraftConfirm(null)}>계속 작성</button>
                    <button type="button" className="btn btn-xs btn-danger" onClick={finishClosingExplanationDraft}>변경 버리기</button>
                  </div>
                </div>
              )}

              {explanationDraftConfirm === 'delete' && (
                <div className="explanation-draft-inline-confirm danger">
                  <span>저장된 초안을 삭제할까요? 이 작업은 되돌릴 수 없습니다.</span>
                  <div>
                    <button type="button" className="btn btn-xs" onClick={() => setExplanationDraftConfirm(null)}>취소</button>
                    <button type="button" className="btn btn-xs btn-danger" onClick={deleteExplanationDraft}>초안 삭제</button>
                  </div>
                </div>
              )}

              <div className="explanation-draft-actions">
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={persistExplanationDraft}
                  disabled={Boolean(explanationDraftAction) || !explanationDraftDirty && Boolean(explanationDraftRecord)}
                >{explanationDraftAction === 'saving' ? '저장 중...' : '초안 저장'}</button>
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  onClick={reviewExplanationDraft}
                  disabled={Boolean(explanationDraftAction)}
                >반영…</button>
                <button
                  type="button"
                  className="btn btn-sm btn-danger"
                  onClick={() => setExplanationDraftConfirm('delete')}
                  disabled={Boolean(explanationDraftAction) || !explanationDraftRecord}
                >초안 삭제</button>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={requestCloseExplanationDraft}
                  disabled={Boolean(explanationDraftAction)}
                >닫기</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
    </>
  );
}

/* ─── Announcements ─── */
function Announcements({ pushToast }) {
  const list = useAsync(() => rpc('admin_list_announcements'));
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [tag, setTag] = useState('notice');
  const [busy, setBusy] = useState(false);

  const publish = async (pub) => {
    if (!title.trim()) { pushToast('제목을 입력하세요', 'info'); return; }
    setBusy(true);
    try {
      const annId = await rpc('admin_create_announcement', { p_title: title, p_body: body, p_type: tag, p_expires_at: null });
      if (pub && annId) {
        try { await rpc('admin_toggle_announcement_publish', { p_id: annId, p_publish: true }); } catch (e) {}
      }
      setTitle(''); setBody(''); setTag('notice');
      pushToast(pub ? '공지 발행됨' : '초안 저장됨');
      list.refetch();
    } catch (e) { pushToast(e.message, 'info'); }
    finally { setBusy(false); }
  };

  const togglePub = async (a) => {
    try { await rpc('admin_toggle_announcement_publish', { p_id: a.id, p_publish: !a.is_published }); list.refetch(); } catch (e) { pushToast(e.message, 'info'); }
  };
  const del = async (a) => {
    if (!confirm('삭제하시겠습니까?')) return;
    try { await rpc('admin_delete_announcement', { p_id: a.id }); list.refetch(); pushToast('삭제됨'); } catch (e) { pushToast(e.message, 'info'); }
  };

  return (
    <>
      <div className="ann-grid">
        <section>
          <div className="sheet marked" style={{margin:0}}>
            <div className="sheet-head">
              <div><div className="sheet-title">새 공지사항 작성</div><div className="sheet-sub">작성 후 초안 저장 또는 바로 발행</div></div>
              <span className="badge badge-neutral">초안</span>
            </div>
            <div className="sheet-body">
              <div style={{marginBottom:16}}>
                <div className="field-label">제목</div>
                <input className="ann-title-input" value={title} onChange={e=>setTitle(e.target.value)} placeholder="제목을 입력하세요"/>
              </div>
              <div><div className="field-label">내용</div><MarkdownEditor value={body} onChange={md => setBody(md)} placeholder="마크다운 지원" /></div>
            </div>
          </div>
        </section>

        <aside className="ann-side">
          <div className="sheet" style={{margin:0}}>
            <div className="sheet-head" style={{padding:'12px 16px'}}><div className="sheet-title" style={{fontSize:'var(--fs-base)'}}>발행 설정</div></div>
            <div className="sheet-body" style={{padding:'6px 16px 16px'}}>
              <div className="pub-row">
                <span className="pl">유형</span>
                <div className="seg">
                  <button type="button" className={tag === 'notice' ? 'on' : ''} onClick={() => setTag('notice')}>공지</button>
                  <button type="button" className={tag === 'update' ? 'on' : ''} onClick={() => setTag('update')}>업데이트</button>
                </div>
              </div>
              <div style={{display:'flex', flexDirection:'column', gap:8, marginTop:14}}>
                <button className="btn" onClick={() => publish(false)} disabled={busy}>초안 저장</button>
                <button className="btn btn-primary" onClick={() => publish(true)} disabled={busy}><Icon name="send" size={12}/> 발행</button>
              </div>
            </div>
          </div>
        </aside>
      </div>

      <div className="sheet" style={{marginTop:'var(--sp-4)'}}>
        <div className="sheet-head"><div><div className="sheet-title">공지 목록</div><div className="sheet-sub">{(list.data || []).length}건</div></div><button className="icon-btn" onClick={list.refetch}><Icon name="refresh"/></button></div>
        <div className="sheet-body flush">
          {list.loading ? <Loader/> : list.error ? <ErrorBox error={list.error} retry={list.refetch}/> :
            (list.data || []).length === 0 ? <EmptyState icon="megaphone" title="공지가 없습니다"/> :
            <div className="ruled">
              {(list.data || []).map(a => (
                <div key={a.id} className="ruled-row">
                  <div className="ln-body" style={{display:'flex', alignItems:'center', gap:12}}>
                    <span className={"badge " + (a.type === 'update' ? 'badge-info' : 'badge-accent')}>{a.type === 'update' ? '업데이트' : '공지'}</span>
                    {a.is_published ? <span className="badge badge-success">발행됨</span> : <span className="badge badge-neutral">초안</span>}
                    <span style={{fontWeight:600, flex:1, minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{a.title}</span>
                    <span className="item-time">{relativeTime(a.created_at)}</span>
                    <button className="btn btn-xs" onClick={() => togglePub(a)}>{a.is_published ? '내리기' : '발행'}</button>
                    <button className="btn btn-xs btn-danger" onClick={() => del(a)}><Icon name="trash" size={11}/></button>
                  </div>
                </div>
              ))}
            </div>
          }
        </div>
      </div>
    </>
  );
}

/* ─── Subscriptions ─── */
const MANUAL_EXAMS = [
  { id: 'gongjungaesa', label: '공인중개사' },
  { id: 'gampyeongsa', label: '감정평가사' },
];
const MANUAL_EXAM_LABELS = Object.fromEntries(MANUAL_EXAMS.map(e => [e.id, e.label]));

function manualExamLabel(id) {
  return MANUAL_EXAM_LABELS[id] || id || '—';
}

function formatKstDateTime(ts) {
  if (!ts) return '무기한';
  return new Date(ts).toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function dateStringFromTodayPlusMonths(months) {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function Subscriptions({ pushToast }) {
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [entitlements, setEntitlements] = useState([]);
  const [entitlementsLoading, setEntitlementsLoading] = useState(false);
  const [entitlementsTick, setEntitlementsTick] = useState(0);
  const [examId, setExamId] = useState('gongjungaesa');
  const [expiresDate, setExpiresDate] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [revokingExam, setRevokingExam] = useState(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setUsers([]);
      setSearching(false);
      return;
    }

    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const rows = await rpc('admin_search_app_users', { p_query: q });
        if (!cancelled) setUsers(rows || []);
      } catch (e) {
        if (!cancelled) {
          setUsers([]);
          pushToast(e.message || '실패', 'info');
        }
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, pushToast]);

  useEffect(() => {
    if (!selectedUser?.user_id) {
      setEntitlements([]);
      setEntitlementsLoading(false);
      return;
    }

    let cancelled = false;
    setEntitlements([]);
    setEntitlementsLoading(true);
    rpc('admin_list_manual_entitlements', { p_user_id: selectedUser.user_id }).then(
      rows => { if (!cancelled) setEntitlements(rows || []); },
      e => {
        if (!cancelled) {
          setEntitlements([]);
          pushToast(e.message || '실패', 'info');
        }
      }
    ).finally(() => {
      if (!cancelled) setEntitlementsLoading(false);
    });

    return () => { cancelled = true; };
  }, [selectedUser?.user_id, entitlementsTick, pushToast]);

  const grant = async (e) => {
    e.preventDefault();
    if (!selectedUser?.email) { pushToast('유저를 선택하세요', 'info'); return; }
    if (!examId) { pushToast('시험을 선택하세요', 'info'); return; }

    setBusy(true);
    try {
      await rpc('admin_grant_entitlement', {
        p_email: selectedUser.email,
        p_exam_id: examId,
        p_expires_at: expiresDate ? `${expiresDate}T23:59:59+09:00` : null,
        p_note: note.trim() || null,
      });
      pushToast('구독 부여 완료');
      setEntitlementsTick(t => t + 1);
    } catch (err) {
      pushToast(err.message || '실패', 'info');
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (row) => {
    if (!selectedUser?.user_id) { pushToast('유저를 선택하세요', 'info'); return; }
    if (!confirm(`${manualExamLabel(row.exam_id)} 구독을 해지하시겠습니까?`)) return;

    setRevokingExam(row.exam_id);
    try {
      await rpc('admin_revoke_entitlement', {
        p_user_id: selectedUser.user_id,
        p_exam_id: row.exam_id,
      });
      pushToast('구독 해지 완료');
      setEntitlementsTick(t => t + 1);
    } catch (e) {
      pushToast(e.message || '실패', 'info');
    } finally {
      setRevokingExam(null);
    }
  };

  const showSearchHint = query.trim().length < 2;

  return (
    <>
      <div className="toolbar">
        <input
          className="search-input"
          style={{maxWidth:520}}
          placeholder="이메일 또는 닉네임 검색..."
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        <button className="icon-btn" onClick={() => setEntitlementsTick(t => t + 1)} title="부여 현황 새로고침" disabled={!selectedUser}>
          <Icon name="refresh"/>
        </button>
      </div>

      <div className="grid-2" style={{alignItems:'start'}}>
        <div className="sheet" style={{margin:0}}>
          <div className="sheet-head">
            <div><div className="sheet-title">유저 검색</div><div className="sheet-sub">{showSearchHint ? '2자 이상 입력' : `${users.length}명`}</div></div>
            {searching && <span className="badge badge-neutral">검색 중</span>}
          </div>
          <div className="sheet-body flush">
            {showSearchHint ? <EmptyState icon="search" title="검색어를 입력하세요" sub="이메일 또는 닉네임 2자 이상"/> :
              searching ? <Loader/> :
              users.length === 0 ? <EmptyState icon="users" title="검색 결과 없음"/> :
              users.map(u => {
                const selected = selectedUser?.user_id === u.user_id;
                return (
                  <button
                    type="button"
                    key={u.user_id}
                    className="urow"
                    style={{width:'100%', textAlign:'left', background:selected ? 'var(--accent-soft)' : undefined}}
                    onClick={() => setSelectedUser(u)}
                  >
                    <div className="uav" style={{background:selected ? 'var(--accent)' : 'var(--surface-3)', color:selected ? '#fff' : 'var(--fg-muted)', border:'1px solid var(--border-strong)'}}>
                      {(u.display_name || u.email || '?')[0]}
                    </div>
                    <div className="uinfo">
                      <div className="uname-line">
                        <span className="uname">{u.display_name || '(닉네임 없음)'}</span>
                        <span className="uemail">{u.email}</span>
                      </div>
                      <div className="utags">
                        <span className="badge badge-info">{u.subscription_tier || 'free'}</span>
                        {u.selected_exam_id && <span className="badge badge-neutral">{manualExamLabel(u.selected_exam_id)}</span>}
                        {u.has_used_trial && <span className="badge badge-neutral">trial used</span>}
                      </div>
                    </div>
                  </button>
                );
              })
            }
          </div>
        </div>

        <div style={{display:'grid', gap:'var(--sp-4)'}}>
          <div className="sheet" style={{margin:0}}>
            <div className="sheet-head">
              <div>
                <div className="sheet-title">구독 부여 · 연장</div>
                <div className="sheet-sub">{selectedUser ? selectedUser.email : '유저를 먼저 선택하세요'}</div>
              </div>
            </div>
            <div className="sheet-body">
              <form onSubmit={grant} style={{display:'grid', gap:12}}>
                <div>
                  <div className="field-label">시험</div>
                  <select className="field-input" style={{width:'100%'}} value={examId} onChange={e => setExamId(e.target.value)}>
                    {MANUAL_EXAMS.map(e => <option key={e.id} value={e.id}>{e.label}</option>)}
                  </select>
                </div>
                <div>
                  <div className="field-label">만료일</div>
                  <div style={{display:'flex', gap:6, flexWrap:'wrap', marginBottom:8}}>
                    <button type="button" className="btn btn-xs" onClick={() => setExpiresDate(dateStringFromTodayPlusMonths(1))}>1개월</button>
                    <button type="button" className="btn btn-xs" onClick={() => setExpiresDate(dateStringFromTodayPlusMonths(6))}>6개월</button>
                    <button type="button" className="btn btn-xs" onClick={() => setExpiresDate(dateStringFromTodayPlusMonths(12))}>1년</button>
                    <button type="button" className="btn btn-xs" onClick={() => setExpiresDate('')}>무기한</button>
                  </div>
                  <input type="date" className="field-input" style={{width:'100%'}} value={expiresDate} onChange={e => setExpiresDate(e.target.value)}/>
                  <div className="sheet-sub" style={{marginTop:6}}>비우면 무기한, 선택 시 해당일 23:59:59 KST까지</div>
                </div>
                <div>
                  <div className="field-label">메모</div>
                  <textarea className="textarea" style={{width:'100%', minHeight:78}} value={note} onChange={e => setNote(e.target.value)} placeholder="계좌이체 확인 메모"/>
                </div>
                <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? '처리 중...' : '부여/연장'}</button>
              </form>
            </div>
          </div>

          <div className="sheet" style={{margin:0}}>
            <div className="sheet-head">
              <div><div className="sheet-title">현재 부여 현황</div><div className="sheet-sub">{selectedUser ? `${entitlements.length}건 활성` : '선택된 유저 없음'}</div></div>
            </div>
            <div className="sheet-body flush">
              {!selectedUser ? <EmptyState icon="users" title="유저를 선택하세요"/> :
                entitlementsLoading ? <Loader/> :
                entitlements.length === 0 ? <EmptyState icon="info" title="활성 부여 없음"/> :
                <div className="ruled">
                  {entitlements.map(row => (
                    <div key={row.id || row.exam_id} className="ruled-row">
                      <div className="ln">{manualExamLabel(row.exam_id).slice(0, 2)}</div>
                      <div className="ln-body" style={{display:'flex', alignItems:'center', gap:12, flexWrap:'wrap'}}>
                        <div style={{flex:1, minWidth:180}}>
                          <div style={{display:'flex', alignItems:'center', gap:8, flexWrap:'wrap'}}>
                            <span style={{fontWeight:600}}>{manualExamLabel(row.exam_id)}</span>
                            <span className="badge badge-success">{formatKstDateTime(row.expires_at)}</span>
                          </div>
                          <div className="ustat" style={{marginTop:6}}>
                            <span>부여: {formatKstDateTime(row.granted_at)}</span>
                          </div>
                          {row.note && <div style={{fontSize:12, color:'var(--fg-muted)', marginTop:6, wordBreak:'break-word'}}>{row.note}</div>}
                        </div>
                        <button className="btn btn-xs btn-danger" onClick={() => revoke(row)} disabled={revokingExam === row.exam_id}>
                          {revokingExam === row.exam_id ? '해지 중' : '해지'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              }
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/* ─── Subjects ─── */
function normalizeExamIdPrefix(value) {
  return String(value || '').toLowerCase().replace(/[^a-z_]/g, '');
}

function Subjects({ pushToast }) {
  const exams = useAsync(() => rpc('admin_get_exams'));
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [examIdPrefix, setExamIdPrefix] = useState('');
  const [openCode, setOpenCode] = useState(null);

  const add = async () => {
    const cleanCode = code.trim().toUpperCase();
    const cleanName = name.trim();
    const cleanPrefix = normalizeExamIdPrefix(examIdPrefix.trim());
    if (!cleanCode || !cleanName || !cleanPrefix) { pushToast('코드, 이름, 시험 ID prefix를 입력하세요', 'info'); return; }
    if (!/^[A-Z]+$/.test(cleanCode)) { pushToast('코드는 대문자 영문만 사용할 수 있습니다', 'info'); return; }
    if (!/^[a-z_]+$/.test(cleanPrefix)) { pushToast('시험 ID prefix는 소문자 영문과 underscore만 사용할 수 있습니다', 'info'); return; }
    try {
      await rpc('admin_add_subject', {
        subject_code: cleanCode,
        subject_name: cleanName,
        subject_desc: null,
        exam_id_prefix: cleanPrefix,
      });
      setCode('');
      setName('');
      setExamIdPrefix('');
      pushToast('시험 추가됨');
      exams.refetch();
    } catch (e) { pushToast(e.message, 'info'); }
  };

  const remove = async (c) => {
    if (!confirm(c + ' 시험을 삭제하시겠습니까?')) return;
    try {
      await rpc('admin_remove_subject', { subject_code: c });
      pushToast('삭제됨');
      setOpenCode(v => v === c ? null : v);
      exams.refetch();
    } catch (e) { pushToast(e.message, 'info'); }
  };

  return (
    <>
      <div className="panel">
        <div className="panel-head"><div><div className="panel-title">시험 추가</div><div className="panel-sub">코드는 대문자 영문, ID prefix는 소문자 영문과 underscore</div></div></div>
        <div className="panel-body" style={{display:'flex', gap:8, alignItems:'flex-end', flexWrap:'wrap'}}>
          <div style={{width:140}}><div className="field-label">코드</div><input className="field-input" placeholder="HSK" style={{width:'100%', textTransform:'uppercase'}} value={code} onChange={e => setCode(e.target.value.toUpperCase())}/></div>
          <div style={{flex:1, minWidth:180}}><div className="field-label">시험명</div><input className="field-input" placeholder="한국사능력검정시험" style={{width:'100%'}} value={name} onChange={e => setName(e.target.value)}/></div>
          <div style={{width:220}}><div className="field-label">ID prefix</div><input className="field-input" placeholder="gongjungaesa, gampyeongsa, jutaek..." style={{width:'100%', fontFamily:'var(--font-mono)'}} value={examIdPrefix} onChange={e => setExamIdPrefix(normalizeExamIdPrefix(e.target.value))}/></div>
          <button className="btn btn-primary" onClick={add}><Icon name="plus" size={12}/> 추가</button>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head"><div><div className="panel-title">등록된 시험</div><div className="panel-sub">{(exams.data || []).length}개</div></div></div>
        <div className="panel-body">
          {exams.loading ? <Loader/> : exams.error ? <ErrorBox error={exams.error} retry={exams.refetch}/> :
            (exams.data || []).length === 0 ? <EmptyState icon="book" title="등록된 시험이 없습니다"/> :
            <div className="exam-list">
              {(exams.data || []).map(exam => {
                const subjectCount = Number(exam.subject_count ?? exam.total_count ?? 0);
                const open = openCode === exam.code;
                return (
                  <div key={exam.code} className={"exam-card " + (open ? 'open' : '')}>
                    <div className="exam-card-head" onClick={() => setOpenCode(open ? null : exam.code)}>
                      <div className="exam-card-main">
                        <span className="exam-chev">›</span>
                        <span className="exam-code">{exam.code}</span>
                        <div className="exam-title">
                          <div className="exam-name">{exam.name}</div>
                          {exam.description && <div className="exam-desc">{exam.description}</div>}
                        </div>
                      </div>
                      <div className="exam-actions">
                        {exam.exam_id_prefix ? <span className="badge badge-neutral">{exam.exam_id_prefix}</span> : <span className="badge badge-warning">prefix 없음</span>}
                        <span className="badge badge-info">{fmtNum(subjectCount)} 과목</span>
                        <button className="btn btn-xs btn-danger" onClick={e => { e.stopPropagation(); remove(exam.code); }}><Icon name="trash" size={10}/></button>
                      </div>
                    </div>
                    {open && (
                      <ExamSubjectsList
                        exam={exam}
                        examId={exam.exam_id_prefix}
                        pushToast={pushToast}
                        onChange={() => { exams.refetch(); }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          }
        </div>
      </div>
    </>
  );
}

function ExamSubjectsList({ exam, examId, pushToast, onChange }) {
  const activeExamId = String(examId || '').trim();
  const [form, setForm] = useState({ code: '', name: '', level: '1', sort_order: '', file_code: '' });
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(null);
  const subjects = useAsync(
    () => activeExamId ? rpc('admin_get_inspection_subjects', { p_exam_id: activeExamId }) : Promise.resolve([]),
    [activeExamId]
  );

  const rows = useMemo(() => {
    return [...(subjects.data || [])].sort((a, b) => {
      const ao = a.sort_order ?? 9999;
      const bo = b.sort_order ?? 9999;
      if (ao !== bo) return ao - bo;
      if (Number(a.level) !== Number(b.level)) return Number(a.level) - Number(b.level);
      return String(a.code || '').localeCompare(String(b.code || ''));
    });
  }, [subjects.data]);

  const setField = (key, value) => {
    setForm(f => ({ ...f, [key]: value }));
  };

  const addSubject = async () => {
    const sortOrder = parseOptionalNumber(form.sort_order);
    const payload = {
      p_exam_id: activeExamId,
      p_code: form.code.trim(),
      p_name: form.name.trim(),
      p_level: Number(form.level),
      p_sort_order: sortOrder,
      p_file_code: nullableText(form.file_code),
      p_gemini_prompt_template: null,
    };
    if (!payload.p_exam_id) { pushToast('시험 ID prefix가 없어 과목을 추가할 수 없습니다', 'info'); return; }
    if (!payload.p_code || !payload.p_name || !payload.p_level) { pushToast('코드, 이름, 차수를 입력하세요', 'info'); return; }
    if (Number.isNaN(sortOrder)) { pushToast('정렬 순서는 숫자로 입력하세요', 'info'); return; }

    setBusy(true);
    try {
      await rpc('admin_add_subject_to_exam', payload);
      setForm({ code: '', name: '', level: '1', sort_order: '', file_code: '' });
      pushToast('과목 추가됨');
      subjects.refetch();
      onChange?.();
    } catch (e) { pushToast(subjectRpcMessage(e, 'add'), 'info'); }
    finally { setBusy(false); }
  };

  const removeSubject = async (subject) => {
    if (!confirm(subject.code + ' 과목을 삭제하시겠습니까?')) return;
    try {
      await rpc('admin_remove_subject_from_exam', { p_id: subject.id });
      pushToast('과목 삭제됨');
      subjects.refetch();
      onChange?.();
    } catch (e) { pushToast(subjectRpcMessage(e, 'remove'), 'info'); }
  };

  return (
    <div className="exam-card-body">
      <div className="subj-id-bar">
        <div className="subj-id-field">
          <div className="field-label">시험 ID prefix</div>
          <input
            className="field-input"
            style={{width:'100%', fontFamily:'var(--font-mono)'}}
            value={activeExamId}
            readOnly
            placeholder="prefix 없음"
          />
        </div>
        {!activeExamId && (
          <div className="subj-warning">
            <Icon name="info" size={14}/>
            이 시험의 ID prefix가 없습니다. 시험 추가 시 ID prefix(소문자 영문)를 입력하세요.
          </div>
        )}
      </div>

      {!activeExamId ? null :
       subjects.loading ? <Loader label="과목 불러오는 중..."/> :
       subjects.error ? <ErrorBox error={subjects.error} retry={subjects.refetch}/> :
        <div className="subj-row-list">
          {rows.length === 0 ? <EmptyState icon="book" title="등록된 과목이 없습니다"/> :
            rows.map(subject => (
              <SubjectRow
                key={subject.id || `${subject.exam_id}-${subject.level}-${subject.code}`}
                subject={subject}
                onEdit={() => setEditing(subject)}
                onRemove={() => removeSubject(subject)}
              />
            ))
          }
        </div>
      }

      <div className="subj-add-box">
        <div className="subj-add-title"><Icon name="plus" size={12}/> 과목 추가</div>
        <div className="subj-form-grid">
          <div>
            <div className="field-label">코드</div>
            <input className="field-input" value={form.code} onChange={e => setField('code', e.target.value)} placeholder="gaeron" disabled={!activeExamId}/>
          </div>
          <div>
            <div className="field-label">과목명</div>
            <input className="field-input" value={form.name} onChange={e => setField('name', e.target.value)} placeholder="부동산학개론" disabled={!activeExamId}/>
          </div>
          <div>
            <div className="field-label">차수</div>
            <select className="field-input" value={form.level} onChange={e => setField('level', e.target.value)} disabled={!activeExamId}>
              <option value="1">1차</option>
              <option value="2">2차</option>
            </select>
          </div>
          <div>
            <div className="field-label">정렬</div>
            <input className="field-input" type="number" value={form.sort_order} onChange={e => setField('sort_order', e.target.value)} placeholder="10" disabled={!activeExamId}/>
          </div>
          <div>
            <div className="field-label">파일 코드</div>
            <input className="field-input" value={form.file_code} onChange={e => setField('file_code', e.target.value.toUpperCase())} placeholder="GR/M/CG/GB/GS/SB..." disabled={!activeExamId}/>
          </div>
          <div className="subj-form-actions">
            <button className="btn btn-sm btn-primary" onClick={addSubject} disabled={busy || !activeExamId}>
              {busy ? '추가 중...' : '추가'}
            </button>
          </div>
        </div>
      </div>

      {editing && (
        <SubjectEditModal
          subject={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); subjects.refetch(); onChange?.(); }}
          pushToast={pushToast}
        />
      )}
    </div>
  );
}

function SubjectRow({ subject, onEdit, onRemove }) {
  return (
    <div className="subj-row">
      <div className="subj-row-main">
        <span className="subj-row-code">{subject.code}</span>
        <span className="subj-row-name">{subject.name}</span>
        <span className="badge badge-neutral">{formatSubjectLevel(subject.level)}</span>
        <span className="subj-row-file">{subject.file_code || 'file_code —'}</span>
        {subject.sort_order != null && <span className="subj-row-sort">#{subject.sort_order}</span>}
      </div>
      <div className="subj-row-actions">
        <button className="btn btn-xs" onClick={onEdit}><Icon name="edit" size={10}/> 편집</button>
        <button className="btn btn-xs btn-danger" onClick={onRemove}><Icon name="trash" size={10}/></button>
      </div>
    </div>
  );
}

function SubjectEditModal({ subject, onClose, onSaved, pushToast }) {
  const [name, setName] = useState(subject.name || '');
  const [sortOrder, setSortOrder] = useState(subject.sort_order ?? '');
  const [fileCode, setFileCode] = useState(subject.file_code || '');
  const [template, setTemplate] = useState(subject.gemini_prompt_template || '');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setName(subject.name || '');
    setSortOrder(subject.sort_order ?? '');
    setFileCode(subject.file_code || '');
    setTemplate(subject.gemini_prompt_template || '');
  }, [subject.id]);

  const save = async () => {
    const cleanName = name.trim();
    const parsedSort = parseOptionalNumber(sortOrder);
    if (!cleanName) { pushToast('과목명을 입력하세요', 'info'); return; }
    if (Number.isNaN(parsedSort)) { pushToast('정렬 순서는 숫자로 입력하세요', 'info'); return; }

    setBusy(true);
    try {
      await rpc('admin_update_subject_full', {
        p_id: subject.id,
        p_name: cleanName,
        p_sort_order: parsedSort,
        p_file_code: nullableText(fileCode),
        p_gemini_prompt_template: nullableText(template),
      });
      pushToast('과목 수정됨');
      onSaved?.();
    } catch (e) { pushToast(subjectRpcMessage(e, 'update'), 'info'); }
    finally { setBusy(false); }
  };

  return (
    <div className="palette-backdrop" onClick={onClose}>
      <div className="subject-edit-modal" onClick={e => e.stopPropagation()}>
        <div className="subject-edit-head">
          <div>
            <div className="panel-title">과목 편집</div>
            <div className="panel-sub">{subject.exam_id} · {subject.code} · {formatSubjectLevel(subject.level)}</div>
          </div>
          <button onClick={onClose} style={{color:'var(--fg-subtle)', padding:4}}><Icon name="x" size={16}/></button>
        </div>
        <div className="subject-edit-body">
          <div className="subject-edit-grid">
            <div>
              <div className="field-label">과목명</div>
              <input className="field-input" style={{width:'100%'}} value={name} onChange={e => setName(e.target.value)}/>
            </div>
            <div>
              <div className="field-label">정렬</div>
              <input className="field-input" type="number" style={{width:'100%'}} value={sortOrder} onChange={e => setSortOrder(e.target.value)}/>
            </div>
            <div>
              <div className="field-label">파일 코드</div>
              <input className="field-input" style={{width:'100%', fontFamily:'var(--font-mono)'}} value={fileCode} onChange={e => setFileCode(e.target.value.toUpperCase())} placeholder="GR/M/CG/GB/GS/SB..."/>
            </div>
          </div>
          <div style={{marginTop:14}}>
            <div className="field-label">Gemini 프롬프트 템플릿</div>
            <textarea
              className="subj-template-textarea"
              value={template}
              onChange={e => setTemplate(e.target.value)}
              placeholder="{round} {number} {stem} {choices} {correct} {explanation}"
            />
          </div>
          <div className="form-actions">
            <button className="btn btn-sm" onClick={onClose}>취소</button>
            <button className="btn btn-sm btn-primary" onClick={save} disabled={busy}>{busy ? '저장 중...' : '저장'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatSubjectLevel(level) {
  const n = Number(level);
  if (n === 1) return '1차';
  if (n === 2) return '2차';
  return level || '—';
}

function parseOptionalNumber(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : NaN;
}

function nullableText(value) {
  const text = String(value ?? '').trim();
  return text ? text : null;
}

function subjectRpcMessage(error, action) {
  const msg = error?.message || String(error || '');
  if (error?.code === '23505' || /duplicate key|unique/i.test(msg)) return '같은 시험에 이미 등록된 과목 코드입니다';
  if (error?.code === '23503' || /foreign key/i.test(msg)) return '연결된 문항이 있어 삭제할 수 없습니다';
  if (action === 'add') return msg || '과목 추가에 실패했습니다';
  if (action === 'update') return msg || '과목 수정에 실패했습니다';
  if (action === 'remove') return msg || '과목 삭제에 실패했습니다';
  return msg || '요청을 처리하지 못했습니다';
}

/* ─── Question Inspector ─── */
function QuestionInspector({ pushToast }) {
  const exams = useAsync(() => rpc('admin_get_exams'));
  const [examCode, setExamCode] = useState(localStorage.getItem('qi.examCode') || null);
  const [subjectCode, setSubjectCode] = useState(localStorage.getItem('qi.subjectCode') || null);
  const [yearSession, setYearSession] = useState(() => {
    const stored = Number(localStorage.getItem('qi.yearSession'));
    return Number.isFinite(stored) && stored > 0 ? stored : null;
  });
  const [openId, setOpenId] = useState(localStorage.getItem('qi.openId') || null);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsCode, setSettingsCode] = useState(null);
  const previousExamId = useRef(null);
  const previousSubjectId = useRef(null);

  const sortedExams = useMemo(() => {
    return [...(exams.data || [])];
  }, [exams.data]);
  const currentExam = useMemo(() => {
    return sortedExams.find(e => e.code === examCode) || sortedExams[0] || null;
  }, [sortedExams, examCode]);
  const currentExamId = currentExam?.exam_id_prefix || null;
  const subjects = useAsync(
    () => currentExamId ? rpc('admin_get_inspection_subjects', { p_exam_id: currentExamId }) : Promise.resolve([]),
    [currentExamId]
  );
  const sortedSubjects = useMemo(() => {
    return [...(subjects.data || [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  }, [subjects.data]);
  const selectedSubject = useMemo(() => sortedSubjects.find(s => s.code === subjectCode), [sortedSubjects, subjectCode]);
  const selectedSubjectId = selectedSubject ? selectedSubject.id : null;

  const sessions = useAsync(
    () => selectedSubjectId ? rpc('admin_get_question_year_sessions', { p_subject_id: selectedSubjectId }) : Promise.resolve([]),
    [selectedSubjectId]
  );

  const selectedSession = useMemo(() => {
    return (sessions.data || []).find(s => Number(s.year_session) === Number(yearSession));
  }, [sessions.data, yearSession]);

  const questions = useAsync(
    () => (selectedSubjectId && yearSession) ? rpc('admin_get_questions_for_inspection', { p_subject_id: selectedSubjectId, p_year_session: yearSession }) : Promise.resolve([]),
    [selectedSubjectId, yearSession]
  );

  useEffect(() => {
    if (examCode) localStorage.setItem('qi.examCode', examCode);
  }, [examCode]);

  useEffect(() => {
    if (subjectCode) localStorage.setItem('qi.subjectCode', subjectCode);
  }, [subjectCode]);

  useEffect(() => {
    if (yearSession) localStorage.setItem('qi.yearSession', String(yearSession));
  }, [yearSession]);

  useEffect(() => {
    if (openId) localStorage.setItem('qi.openId', openId);
  }, [openId]);

  useEffect(() => {
    if (!sortedExams.length) return;
    const hasExam = sortedExams.some(e => e.code === examCode);
    if (!examCode || !hasExam) {
      setExamCode(sortedExams[0].code);
    }
  }, [sortedExams, examCode]);

  useEffect(() => {
    if (!sortedSubjects.length) {
      if (!subjects.loading) {
        if (subjectCode) setSubjectCode(null);
        if (settingsCode) setSettingsCode(null);
      }
      return;
    }
    const hasSubject = sortedSubjects.some(s => s.code === subjectCode);
    const hasSettings = sortedSubjects.some(s => s.code === settingsCode);
    const nextCode = hasSubject ? subjectCode : sortedSubjects[0].code;
    if (!subjectCode || !hasSubject) {
      setSubjectCode(nextCode);
    }
    if (!settingsCode || !hasSettings) {
      setSettingsCode(nextCode);
    }
  }, [sortedSubjects, subjects.loading, subjectCode, settingsCode]);

  useEffect(() => {
    if (!currentExamId) return;
    if (previousExamId.current === null) {
      previousExamId.current = currentExamId;
      return;
    }
    if (previousExamId.current === currentExamId) return;
    previousExamId.current = currentExamId;
    setSubjectCode(null);
    setSettingsCode(null);
    setYearSession(null);
    setOpenId(null);
  }, [currentExamId]);

  useEffect(() => {
    if (!selectedSubjectId) return;
    if (previousSubjectId.current === null) {
      previousSubjectId.current = selectedSubjectId;
      return;
    }
    if (previousSubjectId.current === selectedSubjectId) return;
    previousSubjectId.current = selectedSubjectId;
    setYearSession(null);
    setOpenId(null);
  }, [selectedSubjectId]);

  useEffect(() => {
    if (!sessions.data || sessions.data.length === 0) return;
    const hasCurrent = sessions.data.some(s => Number(s.year_session) === Number(yearSession));
    if (!yearSession || !hasCurrent) {
      setYearSession(sessions.data[0].year_session);
    }
  }, [sessions.data, yearSession]);

  const handleExamSelect = (code) => {
    if (code === examCode) return;
    localStorage.setItem('qi.examCode', code);
    localStorage.removeItem('qi.subjectCode');
    localStorage.removeItem('qi.yearSession');
    localStorage.removeItem('qi.openId');
    setExamCode(code);
    setSubjectCode(null);
    setSettingsCode(null);
    setYearSession(null);
    setOpenId(null);
  };

  const handleSubjectSelect = (code) => {
    localStorage.setItem('qi.subjectCode', code);
    localStorage.removeItem('qi.yearSession');
    localStorage.removeItem('qi.openId');
    setSubjectCode(code);
    setYearSession(null);
    setOpenId(null);
    setSettingsCode(c => c || code);
  };

  const handleQuestionToggle = (questionId) => {
    const nextId = openId === questionId ? null : questionId;
    if (nextId) localStorage.setItem('qi.openId', nextId);
    else localStorage.removeItem('qi.openId');
    setOpenId(nextId);
  };

  const handleQuestionsChanged = () => {
    questions.refetch();
    sessions.refetch();
  };

  const total = Number(selectedSession?.total_count) || 0;
  const checked = Number(selectedSession?.checked_count) || 0;
  const stale = Number(selectedSession?.stale_count) || 0;
  const unchecked = Number(selectedSession?.unchecked_count) || 0;
  const checkedPct = total ? (checked / total) * 100 : 0;
  const stalePct = total ? (stale / total) * 100 : 0;

  return (
    <>
      <div className="toolbar qi-exam-tabs">
        {exams.loading ? <span style={{fontSize:12, color:'var(--fg-subtle)'}}>시험 불러오는 중...</span> :
          sortedExams.map(exam => (
            <div
              key={exam.code}
              className={"filter-chip " + (currentExam?.code === exam.code ? 'active' : '')}
              onClick={() => handleExamSelect(exam.code)}
              title={exam.exam_id_prefix || 'ID prefix 없음'}
            >
              {exam.name || exam.code}
            </div>
          ))
        }
        <div style={{flex:1}}/>
        <button className="btn btn-sm" onClick={() => setShowSettings(v => !v)}>
          🤖 프롬프트 템플릿 설정
        </button>
        <button className="icon-btn" onClick={() => { exams.refetch(); subjects.refetch(); sessions.refetch(); questions.refetch(); }} title="새로고침"><Icon name="refresh"/></button>
      </div>

      {exams.error && <ErrorBox error={exams.error} retry={exams.refetch}/>}

      {currentExam && !currentExamId && (
        <div className="subj-warning qi-warning">
          <Icon name="info" size={14}/>
          선택한 시험의 ID prefix가 없어 과목을 불러올 수 없습니다.
        </div>
      )}

      <div className="toolbar qi-subject-tabs">
        {subjects.loading ? <span style={{fontSize:12, color:'var(--fg-subtle)'}}>과목 불러오는 중...</span> :
          sortedSubjects.length === 0 ? <span style={{fontSize:12, color:'var(--fg-subtle)'}}>표시할 과목이 없습니다</span> :
          sortedSubjects.map(s => (
            <div
              key={s.id || s.code}
              className={"filter-chip " + (subjectCode === s.code ? 'active' : '')}
              onClick={() => handleSubjectSelect(s.code)}
              title={s.name || s.code}
            >
              {s.name || SUBJECT_SHORT[s.code] || s.code}
            </div>
          ))
        }
      </div>

      {subjects.error && <ErrorBox error={subjects.error} retry={subjects.refetch}/>}

      {showSettings && (
        <QuestionInspectorSettings
          key={currentExam?.code || 'no-exam'}
          subjects={sortedSubjects}
          activeCode={settingsCode || subjectCode}
          setActiveCode={setSettingsCode}
          onSaved={subjects.refetch}
          pushToast={pushToast}
        />
      )}

      <div className="toolbar" style={{alignItems:'center'}}>
        <select
          className="field-input"
          style={{minWidth:150, padding:'6px 10px', fontSize:12}}
          value={yearSession || ''}
          onChange={e => {
            const nextSession = e.target.value ? Number(e.target.value) : null;
            if (nextSession) localStorage.setItem('qi.yearSession', String(nextSession));
            else localStorage.removeItem('qi.yearSession');
            localStorage.removeItem('qi.openId');
            setYearSession(nextSession);
            setOpenId(null);
          }}
          disabled={!selectedSubjectId || sessions.loading}
        >
          <option value="">{sessions.loading ? '회차 불러오는 중...' : '회차 선택'}</option>
          {(sessions.data || []).map(s => (
            <option key={s.year_session} value={s.year_session}>{s.year_session}회</option>
          ))}
        </select>
        <div className="qi-progress" style={{flex:1}}>
          <div className="qi-stat"><span>총</span><strong>{fmtNum(total)}</strong><span>문항</span></div>
          <div className="qi-stat checked"><span>검수</span><strong>{fmtNum(checked)}</strong></div>
          <div className="qi-stat stale"><span>재검수</span><strong>{fmtNum(stale)}</strong></div>
          <div className="qi-stat unchecked"><span>미검수</span><strong>{fmtNum(unchecked)}</strong></div>
          <div className="qi-progress-bar" aria-label="검수 진행률">
            <span className="seg seg-checked" style={{width: checkedPct + '%'}}/>
            <span className="seg seg-stale" style={{width: stalePct + '%'}}/>
          </div>
        </div>
      </div>

      {sessions.error ? <ErrorBox error={sessions.error} retry={sessions.refetch}/> :
       !selectedSubjectId ? <EmptyState icon="book" title="과목을 선택하세요"/> :
       sessions.loading && !(sessions.data || []).length ? <Loader/> :
       !yearSession ? <EmptyState icon="edit" title="회차가 없습니다" sub="선택한 과목에 등록된 문항 회차가 없습니다."/> :
       questions.loading ? <Loader label="문항 불러오는 중..."/> :
       questions.error ? <ErrorBox error={questions.error} retry={questions.refetch}/> :
       (questions.data || []).length === 0 ? <EmptyState icon="edit" title="문항이 없습니다" sub="선택한 회차에 검수할 문항이 없습니다."/> :
        <div className="item-list">
          {(questions.data || []).map(q => (
            <QuestionInspectionItem
              key={q.id}
              question={q}
              subject={selectedSubject}
              exam={currentExam}
              open={openId === q.id}
              onToggle={() => handleQuestionToggle(q.id)}
              onChanged={handleQuestionsChanged}
              pushToast={pushToast}
            />
          ))}
        </div>
      }
    </>
  );
}

function QuestionInspectorSettings({ subjects, activeCode, setActiveCode, onSaved, pushToast }) {
  const activeSubject = subjects.find(s => s.code === activeCode) || subjects[0];
  const [fileCode, setFileCode] = useState('');
  const [template, setTemplate] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!activeSubject) return;
    setFileCode(activeSubject.file_code || '');
    setTemplate(activeSubject.gemini_prompt_template || '');
  }, [activeSubject?.id, activeSubject?.code, activeSubject?.file_code, activeSubject?.gemini_prompt_template]);

  const save = async () => {
    if (!activeSubject) return;
    setBusy(true);
    try {
      await rpc('admin_update_subject_full', {
        p_id: activeSubject.id,
        p_name: activeSubject.name,
        p_sort_order: activeSubject.sort_order ?? null,
        p_file_code: nullableText(fileCode),
        p_gemini_prompt_template: nullableText(template),
      });
      pushToast('프롬프트 템플릿 저장됨');
      onSaved?.();
    } catch (e) { pushToast(e.message, 'info'); }
    finally { setBusy(false); }
  };

  if (!activeSubject) return null;

  return (
    <div className="qi-tpl-panel">
      <div className="qi-tpl-tabs">
        {subjects.map(s => (
          <div
            key={s.id || s.code}
            className={"filter-chip " + (activeSubject.code === s.code ? 'active' : '')}
            onClick={() => setActiveCode(s.code)}
          >
            {s.name || SUBJECT_SHORT[s.code] || s.code}
          </div>
        ))}
      </div>
      <div className="panel-body">
        <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(180px, 1fr))', gap:12, alignItems:'end', marginBottom:12}}>
          <div>
            <div className="field-label">파일 코드</div>
            <input
              className="field-input"
              style={{width:'100%', fontFamily:'var(--font-mono)'}}
              value={fileCode}
              onChange={e => setFileCode(e.target.value)}
              placeholder={activeSubject.code}
            />
          </div>
          <div className="qi-tpl-vars">
            변수: {'{round}'} {'{number}'} {'{stem}'} {'{choices}'} {'{correct}'} {'{explanation}'}
          </div>
        </div>
        <div className="field-label">Gemini 프롬프트 템플릿</div>
        <textarea
          className="qi-tpl-textarea"
          value={template}
          onChange={e => setTemplate(e.target.value)}
          placeholder="{round}회 {number}번&#10;&#10;{stem}&#10;&#10;{choices}&#10;&#10;정답: {correct}&#10;&#10;해설: {explanation}"
        />
        <div className="form-actions">
          <button className="btn btn-sm btn-primary" onClick={save} disabled={busy}>
            {busy ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  );
}

function QuestionInspectionItem({ question, subject, exam, open, onToggle, onChanged, pushToast }) {
  const q = normalizeInspectionQuestion(question);
  const status = inspectionCheckStatus(q);
  const statusMeta = inspectionStatusMeta(status);

  const stemLine = firstLine(q.stem || '(문제 지문 없음)');

  return (
    <div className={"item " + (open ? 'open' : '')}>
      <div className="item-head" onClick={onToggle}>
        <div className="dot" style={{background: statusMeta[2]}}/>
        <div className="item-meta">
          <div className="item-title">{q.question_number}번 · {stemLine}</div>
          <div className="item-sub">
            {q.year_session}회 · v{q.version || 1} · 수정 {relativeTime(q.updated_at)}
          </div>
        </div>
        <div className="item-right">
          <span className={"badge " + statusMeta[0]}>{statusMeta[1]}</span>
          <span className="item-time">#{(q.id || '').toString().slice(0,8)}</span>
          <span className="chev">›</span>
        </div>
      </div>
      {open && (
        <div className="item-body">
          <QuestionBlock
            q={q}
            subject={subject}
            exam={exam}
            onSaved={() => { onChanged(); pushToast('문항이 수정되었습니다'); }}
            onChanged={onChanged}
            pushToast={pushToast}
          />
        </div>
      )}
    </div>
  );
}

function normalizeInspectionQuestion(question) {
  const correctIndex = 'ABCDE'.indexOf(question.correct_answer || '');
  return {
    ...question,
    correct_index: correctIndex >= 0 ? correctIndex : 0,
    choices: questionChoices(question),
  };
}

function questionChoices(question) {
  return Array.isArray(question.choices) ? question.choices : (question.choices?.options || []);
}

function firstLine(text) {
  return String(text || '').split(/\r?\n/).find(Boolean) || String(text || '');
}

function buildGeminiPrompt(subject, question) {
  const template = subject?.gemini_prompt_template || '';
  const correctIdx = 'ABCDE'.indexOf(question.correct_answer);
  const choicesArr = Array.isArray(question.choices) ? question.choices : (question.choices?.options || []);
  const choicesText = choicesArr.map((c, i) => {
    const t = typeof c === 'string' ? c : (c.text || '');
    return `${'①②③④⑤'[i]} ${t}`;
  }).join('\n\n');
  const correctText = (() => {
    const c = choicesArr[correctIdx];
    const t = typeof c === 'string' ? c : (c?.text || '');
    return `${'①②③④⑤'[correctIdx] || '?'} ${t}`;
  })();

  return template
    .replace(/\{round\}/g, String(question.year_session))
    .replace(/\{number\}/g, String(question.question_number))
    .replace(/\{stem\}/g, question.stem || '')
    .replace(/\{choices\}/g, choicesText)
    .replace(/\{correct\}/g, correctText)
    .replace(/\{explanation\}/g, question.explanation || '(없음)');
}

function downloadMd(subject, question, exam) {
  const text = buildGeminiPrompt(subject, question);
  const fileCode = subject?.file_code || subject?.code || 'subject';
  const examCode = exam?.code || subject?.exam_code || 'EXAM';
  const filename = `${examCode}_${subject?.level || ''}_${fileCode}_${question.year_session}_${question.question_number}.md`;
  const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function fallbackCopyText(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
}

/* ─── Concept Inspector ─── */
function ConceptInspector({ pushToast, setSection }) {
  const exams = useAsync(() => rpc('admin_get_exams'));
  const [examCode, setExamCode] = useState(localStorage.getItem('ci.examCode') || null);
  const [subjectCode, setSubjectCode] = useState(localStorage.getItem('ci.subjectCode') || null);
  const [unitId, setUnitId] = useState(localStorage.getItem('ci.unitId') || null);
  const [openId, setOpenId] = useState(null);
  const [activeTabPerCard, setActiveTabPerCard] = useState({});

  const sortedExams = useMemo(() => [...(exams.data || [])], [exams.data]);
  const currentExam = useMemo(() => {
    return sortedExams.find(exam => exam.code === examCode) || sortedExams[0] || null;
  }, [sortedExams, examCode]);
  const currentExamId = currentExam?.exam_id_prefix || null;

  const subjects = useAsync(
    () => currentExamId ? rpc('admin_get_concept_subjects', { p_exam_id: currentExamId }) : Promise.resolve([]),
    [currentExamId]
  );
  const sortedSubjects = useMemo(() => {
    return [...(subjects.data || [])].sort((a, b) => {
      const levelDiff = (a.level ?? 0) - (b.level ?? 0);
      return levelDiff || (a.sort_order ?? 0) - (b.sort_order ?? 0) || String(a.code || '').localeCompare(String(b.code || ''));
    });
  }, [subjects.data]);
  const selectedSubject = useMemo(() => {
    return sortedSubjects.find(subject => subject.code === subjectCode) || null;
  }, [sortedSubjects, subjectCode]);
  const selectedSubjectId = selectedSubject?.id || null;

  const units = useAsync(
    () => selectedSubjectId ? rpc('admin_get_concept_units', { p_subject_id: selectedSubjectId }) : Promise.resolve([]),
    [selectedSubjectId]
  );
  const sortedUnits = useMemo(() => {
    return [...(units.data || [])].sort((a, b) => {
      return (a.sort_order ?? 0) - (b.sort_order ?? 0) || String(a.code || '').localeCompare(String(b.code || ''));
    });
  }, [units.data]);
  const selectedUnit = useMemo(() => sortedUnits.find(unit => unit.id === unitId) || null, [sortedUnits, unitId]);
  const selectedUnitId = selectedUnit?.id || null;

  const concepts = useAsync(
    () => (selectedSubjectId && selectedUnitId)
      ? rpc('admin_get_concepts_for_inspection', { p_subject_id: selectedSubjectId, p_category_id: selectedUnitId })
      : Promise.resolve([]),
    [selectedSubjectId, selectedUnitId]
  );

  useEffect(() => {
    if (examCode) localStorage.setItem('ci.examCode', examCode);
  }, [examCode]);

  useEffect(() => {
    if (subjectCode) localStorage.setItem('ci.subjectCode', subjectCode);
  }, [subjectCode]);

  useEffect(() => {
    if (unitId) localStorage.setItem('ci.unitId', unitId);
  }, [unitId]);

  useEffect(() => {
    if (!sortedExams.length) return;
    if (!examCode || !sortedExams.some(exam => exam.code === examCode)) {
      setExamCode(sortedExams[0].code);
    }
  }, [sortedExams, examCode]);

  useEffect(() => {
    if (subjects.error || subjects.loading) return;
    if (!sortedSubjects.length) {
      setSubjectCode(null);
      return;
    }
    if (!subjectCode || !sortedSubjects.some(subject => subject.code === subjectCode)) {
      setSubjectCode(sortedSubjects[0].code);
    }
  }, [sortedSubjects, subjects.loading, subjects.error, subjectCode]);

  useEffect(() => {
    if (units.error || units.loading) return;
    if (!sortedUnits.length) {
      setUnitId(null);
      return;
    }
    if (!unitId || !sortedUnits.some(unit => unit.id === unitId)) {
      setUnitId(sortedUnits[0].id);
    }
  }, [sortedUnits, units.loading, units.error, unitId]);

  useEffect(() => {
    setOpenId(null);
    setActiveTabPerCard({});
  }, [selectedSubjectId, selectedUnitId]);

  const handleExamSelect = (code) => {
    if (code === examCode) return;
    localStorage.setItem('ci.examCode', code);
    localStorage.removeItem('ci.subjectCode');
    localStorage.removeItem('ci.unitId');
    setExamCode(code);
    setSubjectCode(null);
    setUnitId(null);
    setOpenId(null);
    setActiveTabPerCard({});
  };

  const handleSubjectSelect = (code) => {
    localStorage.setItem('ci.subjectCode', code);
    localStorage.removeItem('ci.unitId');
    setSubjectCode(code);
    setUnitId(null);
    setOpenId(null);
    setActiveTabPerCard({});
  };

  const handleUnitSelect = (nextUnitId) => {
    if (nextUnitId) localStorage.setItem('ci.unitId', nextUnitId);
    else localStorage.removeItem('ci.unitId');
    setUnitId(nextUnitId || null);
    setOpenId(null);
    setActiveTabPerCard({});
  };

  const handleConceptsChanged = () => {
    concepts.refetch();
    units.refetch();
  };

  const conceptRows = concepts.data || [];
  const total = conceptRows.length;
  const checked = conceptRows.filter(concept => inspectionCheckStatus(concept) === 'checked').length;
  const stale = conceptRows.filter(concept => inspectionCheckStatus(concept) === 'stale').length;
  const unchecked = conceptRows.filter(concept => inspectionCheckStatus(concept) === 'unchecked').length;
  const checkedPct = total ? (checked / total) * 100 : 0;
  const stalePct = total ? (stale / total) * 100 : 0;

  return (
    <>
      <div className="toolbar qi-exam-tabs">
        {exams.loading ? <span style={{fontSize:12, color:'var(--fg-subtle)'}}>시험 불러오는 중...</span> :
          sortedExams.map(exam => (
            <div
              key={exam.code}
              className={"filter-chip " + (currentExam?.code === exam.code ? 'active' : '')}
              onClick={() => handleExamSelect(exam.code)}
              title={exam.exam_id_prefix || 'ID prefix 없음'}
            >
              {exam.name || exam.code}
            </div>
          ))
        }
        <div style={{flex:1}}/>
        <button className="icon-btn" onClick={() => { exams.refetch(); subjects.refetch(); units.refetch(); concepts.refetch(); }} title="새로고침"><Icon name="refresh"/></button>
      </div>

      {currentExam && !currentExamId && !exams.error && (
        <div className="subj-warning qi-warning">
          <Icon name="info" size={14}/>
          선택한 시험의 ID prefix가 없어 개념 과목을 불러올 수 없습니다.
        </div>
      )}

      <div className="toolbar qi-subject-tabs">
        {subjects.loading ? <span style={{fontSize:12, color:'var(--fg-subtle)'}}>과목 불러오는 중...</span> :
          sortedSubjects.length === 0 ? <span style={{fontSize:12, color:'var(--fg-subtle)'}}>표시할 과목이 없습니다</span> :
          sortedSubjects.map(subject => (
            <div
              key={subject.id || subject.code}
              className={"filter-chip " + (subjectCode === subject.code ? 'active' : '')}
              onClick={() => handleSubjectSelect(subject.code)}
              title={`${subject.name || subject.code} · 개념 ${fmtNum(subject.concept_count || 0)}개`}
            >
              {subject.name || SUBJECT_SHORT[subject.code] || subject.code}
            </div>
          ))
        }
      </div>

      <div className="toolbar" style={{alignItems:'center'}}>
        <select
          className="field-input"
          style={{minWidth:220, padding:'6px 10px', fontSize:12}}
          value={selectedUnitId || ''}
          onChange={event => handleUnitSelect(event.target.value)}
          disabled={!selectedSubjectId || units.loading}
        >
          <option value="">{units.loading ? '단원 불러오는 중...' : '단원 선택'}</option>
          {sortedUnits.map(unit => (
            <option key={unit.id} value={unit.id}>
              {unit.name || unit.code} · 개념 {fmtNum(unit.concept_count || 0)} · 문항 {fmtNum(unit.question_count || 0)}
            </option>
          ))}
        </select>
        <div className="qi-progress" style={{flex:1}}>
          <div className="qi-stat"><span>총</span><strong>{fmtNum(total)}</strong><span>개념</span></div>
          <div className="qi-stat checked"><span>검수</span><strong>{fmtNum(checked)}</strong></div>
          <div className="qi-stat stale"><span>재검수</span><strong>{fmtNum(stale)}</strong></div>
          <div className="qi-stat unchecked"><span>미검수</span><strong>{fmtNum(unchecked)}</strong></div>
          <div className="qi-progress-bar" aria-label="개념 검수 진행률">
            <span className="seg seg-checked" style={{width: checkedPct + '%'}}/>
            <span className="seg seg-stale" style={{width: stalePct + '%'}}/>
          </div>
        </div>
      </div>

      {exams.error ? <RpcNotApplied message="시험 목록 RPC가 아직 적용되지 않았습니다." error={exams.error} retry={exams.refetch}/> :
       !currentExam ? <EmptyState icon="book" title="시험이 없습니다"/> :
       subjects.error ? <RpcNotApplied message="개념 과목 RPC가 아직 적용되지 않았습니다." error={subjects.error} retry={subjects.refetch}/> :
       !selectedSubjectId ? <EmptyState icon="book" title="과목을 선택하세요"/> :
       units.error ? <RpcNotApplied message="개념 단원 RPC가 아직 적용되지 않았습니다." error={units.error} retry={units.refetch}/> :
       units.loading && !sortedUnits.length ? <Loader label="단원 불러오는 중..."/> :
       !selectedUnitId ? <EmptyState icon="book" title="단원이 없습니다" sub="선택한 과목에 등록된 단원이 없습니다."/> :
       concepts.loading ? <Loader label="개념 불러오는 중..."/> :
       concepts.error ? <RpcNotApplied message="개념 검수 목록 RPC가 아직 적용되지 않았습니다." error={concepts.error} retry={concepts.refetch}/> :
       conceptRows.length === 0 ? <EmptyState icon="book" title="개념이 없습니다" sub="선택한 단원에 검수할 개념이 없습니다."/> :
        <div className="item-list">
          {conceptRows.map(concept => (
            <ConceptInspectionItem
              key={concept.id}
              concept={concept}
              unit={selectedUnit}
              subject={selectedSubject}
              exam={currentExam}
              open={openId === concept.id}
              onToggle={() => setOpenId(openId === concept.id ? null : concept.id)}
              activeTab={activeTabPerCard[concept.id] || 'edit'}
              setActiveTab={tab => setActiveTabPerCard(tabs => ({ ...tabs, [concept.id]: tab }))}
              onChanged={handleConceptsChanged}
              pushToast={pushToast}
              setSection={setSection}
            />
          ))}
        </div>
      }
    </>
  );
}

function ConceptInspectionItem({ concept, unit, subject, exam, open, onToggle, activeTab, setActiveTab, onChanged, pushToast, setSection }) {
  const [title, setTitle] = useState(concept.title || '');
  const [summary, setSummary] = useState(concept.summary || '');
  const [definition, setDefinition] = useState(concept.definition || '');
  const [examPoint, setExamPoint] = useState(concept.exam_point || '');
  const [realLifeExample, setRealLifeExample] = useState(concept.real_life_example || '');
  const [keyPointsText, setKeyPointsText] = useState(() => formatJsonDraft(concept.key_points));
  const [relatedLaws, setRelatedLaws] = useState(() => normalizeRelatedLawDrafts(concept.related_laws));
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [rpcError, setRpcError] = useState(null);

  useEffect(() => {
    setTitle(concept.title || '');
    setSummary(concept.summary || '');
    setDefinition(concept.definition || '');
    setExamPoint(concept.exam_point || '');
    setRealLifeExample(concept.real_life_example || '');
    setKeyPointsText(formatJsonDraft(concept.key_points));
    setRelatedLaws(normalizeRelatedLawDrafts(concept.related_laws));
    setRpcError(null);
  }, [concept]);

  const keyPointsJson = useMemo(() => parseJsonDraft(keyPointsText, '핵심 포인트'), [keyPointsText]);
  const serializedRelatedLaws = useMemo(() => serializeRelatedLaws(relatedLaws), [relatedLaws]);
  const relatedLawsError = useMemo(() => validateRelatedLaws(serializedRelatedLaws), [serializedRelatedLaws]);
  const previewConcept = useMemo(() => ({
    ...concept,
    title,
    summary,
    definition,
    exam_point: examPoint,
    real_life_example: realLifeExample,
    key_points: keyPointsJson.error ? concept.key_points : keyPointsJson.value,
    related_laws: serializedRelatedLaws,
  }), [concept, title, summary, definition, examPoint, realLifeExample, keyPointsJson, serializedRelatedLaws]);
  const status = inspectionCheckStatus(concept);
  const statusMeta = inspectionStatusMeta(status);
  const unitName = concept.category_name || unit?.name || concept.chapter_label || concept.page_title || '단원 미지정';

  const linkedQuestions = useAsync(
    () => (open && activeTab === 'questions')
      ? rpc('admin_get_concept_questions', { p_concept_id: concept.id })
      : Promise.resolve([]),
    [open, activeTab, concept.id]
  );
  const sortedQuestions = useMemo(() => {
    return [...(linkedQuestions.data || [])].sort((a, b) => {
      return Number(a.year_session || 0) - Number(b.year_session || 0)
        || Number(a.question_number || 0) - Number(b.question_number || 0)
        || String(a.question_id || '').localeCompare(String(b.question_id || ''));
    });
  }, [linkedQuestions.data]);

  const addRelatedLaw = () => {
    setRelatedLaws(current => renumberRelatedLaws([...current, createEmptyRelatedLawDraft()]));
  };

  const updateRelatedLaw = (index, field, value) => {
    setRelatedLaws(current => current.map((law, lawIndex) => {
      if (lawIndex !== index) return law;
      if (field !== 'title') return { ...law, [field]: value };
      return { ...law, title: value, id: relatedLawIdFromTitle(value) || law.id || createCustomRelatedLawId() };
    }));
  };

  const moveRelatedLaw = (index, direction) => {
    setRelatedLaws(current => {
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return renumberRelatedLaws(next);
    });
  };

  const removeRelatedLaw = (index) => {
    setRelatedLaws(current => renumberRelatedLaws(current.filter((_, lawIndex) => lawIndex !== index)));
  };

  const save = async () => {
    if (keyPointsJson.error || relatedLawsError) return;
    setBusy(true);
    setRpcError(null);
    try {
      await rpc('admin_update_concept_note', {
        p_id: concept.id,
        p_title: title.trim(),
        p_summary: nullableText(summary),
        p_definition: nullableText(definition),
        p_key_points: keyPointsJson.value,
        p_exam_point: nullableText(examPoint),
        p_real_life_example: nullableText(realLifeExample),
        p_related_laws: serializedRelatedLaws,
      });
      pushToast('개념노트가 수정되었습니다');
      onChanged();
    } catch (error) {
      setRpcError(error);
      pushToast(error.message, 'info');
    } finally { setBusy(false); }
  };

  const toggleCheck = async () => {
    if (checking) return;
    const isChecked = status !== 'unchecked';
    setChecking(true);
    setRpcError(null);
    try {
      if (isChecked) {
        await rpc('admin_unmark_concept_checked', { p_concept_id: concept.id });
        pushToast('개념 검수 해제됨');
      } else {
        await rpc('admin_mark_concept_checked', { p_concept_id: concept.id });
        pushToast('개념 검수 완료');
      }
      onChanged();
    } catch (error) {
      setRpcError(error);
      pushToast(error.message, 'info');
    } finally { setChecking(false); }
  };

  return (
    <div className={"item " + (open ? 'open' : '')}>
      <div className="item-head" onClick={onToggle}>
        <div className="dot" style={{background:statusMeta[2]}}/>
        <div className="item-meta">
          <div className="item-title">{concept.title || '(제목 없는 개념)'}</div>
          <div className="item-sub">{unitName} · {concept.page_title || concept.chapter_label || '개념노트'} · 수정 {relativeTime(concept.updated_at) || '이력 없음'}</div>
        </div>
        <div className="item-right">
          <span className="badge badge-info">{fmtNum(concept.question_count || 0)}문항</span>
          <span className={"badge " + statusMeta[0]}>{statusMeta[1]}</span>
          <span className="item-time">#{String(concept.id || '').slice(0,8)}</span>
          <span className="chev">›</span>
        </div>
      </div>
      {open && (
        <div className="item-body">
          <div className="qi-tabs">
            <div className={"qi-tab " + (activeTab === 'edit' ? 'active' : '')} onClick={() => setActiveTab('edit')}>편집</div>
            <div className={"qi-tab " + (activeTab === 'preview' ? 'active' : '')} onClick={() => setActiveTab('preview')}>미리보기</div>
            <div className={"qi-tab " + (activeTab === 'questions' ? 'active' : '')} onClick={() => setActiveTab('questions')}>기출</div>
          </div>

          {activeTab === 'edit' ? (
            <div className="q-box">
              <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(260px, 1fr))', gap:12}}>
                <div>
                  <div className="field-label">제목</div>
                  <input className="field-input" style={{width:'100%'}} value={title} onChange={event => setTitle(event.target.value)}/>
                </div>
                <div>
                  <div className="field-label">요약</div>
                  <textarea style={{minHeight:90}} value={summary} onChange={event => setSummary(event.target.value)}/>
                </div>
              </div>
              <div style={{marginTop:14}}>
                <div className="field-label">정의</div>
                <ConceptDefinitionEditor value={definition} onChange={setDefinition}/>
              </div>
              <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(260px, 1fr))', gap:12, marginTop:14}}>
                <div>
                  <div className="field-label">구별</div>
                  <textarea
                    style={{minHeight:130}}
                    value={examPoint}
                    onChange={event => setExamPoint(event.target.value)}
                    placeholder={'**설정 전후를 묻지 않는다**\n  ○ 저당권 설정 후에 부합한 물건에도 미친다\n  × 설정 당시 존재한 것에만 미친다'}
                  />
                </div>
                <div>
                  <div className="field-label">실생활 예시</div>
                  <textarea style={{minHeight:110}} value={realLifeExample} onChange={event => setRealLifeExample(event.target.value)}/>
                </div>
              </div>
              <RelatedLawsEditor
                laws={relatedLaws}
                onAdd={addRelatedLaw}
                onUpdate={updateRelatedLaw}
                onMove={moveRelatedLaw}
                onRemove={removeRelatedLaw}
                error={relatedLawsError}
              />
              <details className="concept-advanced">
                <summary>고급 (JSON 직접 편집)</summary>
                <div className="concept-advanced-body">
                  <div className="field-label">핵심 포인트</div>
                  <textarea className="qi-tpl-textarea" style={{minHeight:180}} value={keyPointsText} onChange={event => setKeyPointsText(event.target.value)} placeholder="[]"/>
                  {keyPointsJson.error && <div className="concept-field-error">{keyPointsJson.error}</div>}
                </div>
              </details>
            </div>
          ) : activeTab === 'preview' ? (
            <ConceptPreview concept={previewConcept}/>
          ) : (
            <div className="q-box">
              {linkedQuestions.loading ? <Loader label="기출 문항 불러오는 중..."/> :
               linkedQuestions.error ? <RpcNotApplied message="개념 연결 문항 RPC가 아직 적용되지 않았습니다." error={linkedQuestions.error} retry={linkedQuestions.refetch}/> :
               sortedQuestions.length === 0 ? <EmptyState icon="edit" title="연결된 기출이 없습니다" sub="이 개념에 매핑된 문항이 없습니다."/> :
                <div style={{display:'flex', flexDirection:'column', gap:8}}>
                  {sortedQuestions.map(question => (
                    <ConceptQuestionAccordion
                      key={question.question_id}
                      question={question}
                      subject={subject}
                      exam={exam}
                      setSection={setSection}
                    />
                  ))}
                </div>
              }
            </div>
          )}

          {rpcError && <RpcNotApplied message="개념노트 RPC가 아직 적용되지 않았습니다." error={rpcError}/>}
          <div className="qi-actions" style={{justifyContent:'flex-end'}}>
            <button className={"btn btn-sm " + (status === 'unchecked' ? 'btn-success' : '')} onClick={toggleCheck} disabled={checking}>
              {checking ? '처리 중...' : status === 'unchecked' ? '✓ 검수 완료' : '검수 해제'}
            </button>
            <button className="btn btn-sm btn-primary" onClick={save} disabled={busy || Boolean(keyPointsJson.error || relatedLawsError)}>
              {busy ? '저장 중...' : '저장'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

let relatedLawDraftSequence = 0;
let lastCustomRelatedLawTimestamp = 0;

function nextRelatedLawDraftKey() {
  relatedLawDraftSequence += 1;
  return `related-law-${relatedLawDraftSequence}`;
}

function createCustomRelatedLawId() {
  const timestamp = Math.max(Date.now(), lastCustomRelatedLawTimestamp + 1);
  lastCustomRelatedLawTimestamp = timestamp;
  return `custom_${timestamp}`;
}

function relatedLawIdFromTitle(title) {
  const match = String(title || '').match(/^\s*(.+?법)\s+(제\s*\d+\s*조(?:\s*의\s*\d+)?)(?=\s|\(|$)/);
  if (!match) return null;
  return `${match[1].trim()} ${match[2].trim()}`.replace(/\s+/g, '_');
}

function normalizeRelatedLawDrafts(value) {
  let source = value;
  if (typeof source === 'string') {
    try { source = JSON.parse(source); }
    catch (error) { source = []; }
  }
  if (!Array.isArray(source)) return [];
  const drafts = source.map((item, index) => {
    const law = item && typeof item === 'object' && !Array.isArray(item) ? item : {};
    const title = String(law.title ?? '');
    const parsedSortOrder = law.sort_order == null || law.sort_order === '' ? index + 1 : Number(law.sort_order);
    return {
      ...law,
      _editorKey: nextRelatedLawDraftKey(),
      id: relatedLawIdFromTitle(title) || String(law.id || '') || createCustomRelatedLawId(),
      title,
      article_text: String(law.article_text ?? ''),
      commentary: law.commentary == null ? '' : String(law.commentary),
      sort_order: Number.isFinite(parsedSortOrder) ? parsedSortOrder : index + 1,
      real_life_example: Object.prototype.hasOwnProperty.call(law, 'real_life_example') ? law.real_life_example : null,
    };
  });
  return drafts
    .map((law, sourceIndex) => ({ law, sourceIndex }))
    .sort((a, b) => a.law.sort_order - b.law.sort_order || a.sourceIndex - b.sourceIndex)
    .map(({ law }) => law);
}

function createEmptyRelatedLawDraft() {
  return {
    _editorKey: nextRelatedLawDraftKey(),
    id: createCustomRelatedLawId(),
    title: '',
    article_text: '',
    commentary: '',
    sort_order: 1,
    real_life_example: null,
  };
}

function renumberRelatedLaws(laws) {
  return laws.map((law, index) => ({ ...law, sort_order: index + 1 }));
}

function serializeRelatedLaws(laws) {
  return laws.map((draft, index) => {
    const { _editorKey, ...law } = draft;
    const title = String(law.title ?? '').trim();
    return {
      ...law,
      id: relatedLawIdFromTitle(title) || String(law.id || '') || createCustomRelatedLawId(),
      title,
      article_text: String(law.article_text ?? '').trim(),
      commentary: nullableText(law.commentary),
      sort_order: index + 1,
      real_life_example: Object.prototype.hasOwnProperty.call(law, 'real_life_example') ? law.real_life_example : null,
    };
  });
}

function validateRelatedLaws(laws) {
  const usedIds = new Set();
  for (let index = 0; index < laws.length; index += 1) {
    const law = laws[index];
    if (!law.title) return `조문 ${index + 1}의 제목을 입력하세요.`;
    if (!law.article_text) return `조문 ${index + 1}의 조문 본문을 입력하세요.`;
    if (usedIds.has(law.id)) return `같은 조문이 두 번 등록되어 있습니다: ${law.title}`;
    usedIds.add(law.id);
  }
  return null;
}

function RelatedLawsEditor({ laws, onAdd, onUpdate, onMove, onRemove, error }) {
  return (
    <section className="concept-laws-editor">
      <div className="concept-laws-toolbar">
        <div>
          <div className="field-label">관련 법령</div>
          <div className="concept-laws-help">조문은 위에서부터 앱에 표시됩니다.</div>
        </div>
        <button type="button" className="btn btn-xs" onClick={onAdd}>+ 조문 추가</button>
      </div>

      <div className="concept-law-list">
        {laws.length === 0 && <div className="concept-law-empty">등록된 조문이 없습니다.</div>}
        {laws.map((law, index) => (
          <div className="concept-law-card" key={law._editorKey}>
            <div className="concept-law-card-head">
              <strong>조문 {index + 1}</strong>
              <div className="concept-law-actions">
                <button type="button" className="btn btn-xs" onClick={() => onMove(index, -1)} disabled={index === 0}>위로</button>
                <button type="button" className="btn btn-xs" onClick={() => onMove(index, 1)} disabled={index === laws.length - 1}>아래로</button>
                <button type="button" className="btn btn-xs btn-danger" onClick={() => onRemove(index)}>삭제</button>
              </div>
            </div>
            <label className="concept-law-field">
              <span className="field-label">제목</span>
              <input
                className="field-input"
                value={law.title}
                onChange={event => onUpdate(index, 'title', event.target.value)}
                placeholder="민법 제358조 (저당권의 효력의 범위)"
              />
            </label>
            <label className="concept-law-field">
              <span className="field-label">조문 본문</span>
              <textarea
                value={law.article_text}
                onChange={event => onUpdate(index, 'article_text', event.target.value)}
                placeholder="제358조(저당권의 효력의 범위) 저당권의 효력은 …"
              />
            </label>
            <label className="concept-law-field">
              <span className="field-label">해설</span>
              <textarea
                value={law.commentary}
                onChange={event => onUpdate(index, 'commentary', event.target.value)}
                placeholder="비워둘 수 있습니다."
              />
            </label>
          </div>
        ))}
      </div>

      {error && <div className="concept-field-error">{error}</div>}
      <button type="button" className="btn btn-xs concept-law-add-bottom" onClick={onAdd}>+ 조문 추가</button>
    </section>
  );
}

function ConceptDefinitionEditor({ value, onChange }) {
  const wrapperRef = useRef(null);
  const cursorOffsetRef = useRef(String(value || '').length);
  const pointerOpenedRef = useRef(false);
  const [tableDialog, setTableDialog] = useState(null);
  const [editorRevision, setEditorRevision] = useState(0);
  const [editorNotice, setEditorNotice] = useState(null);
  const editorModel = useMemo(() => createConceptDefinitionEditorModel(value), [value]);

  useEffect(() => {
    cursorOffsetRef.current = Math.min(cursorOffsetRef.current, String(value || '').length);
  }, [value]);

  useEffect(() => {
    const root = wrapperRef.current;
    if (!root) return undefined;
    const enableConceptTableButton = () => {
      const button = [...root.querySelectorAll('.md-toolbar button')]
        .find(candidate => candidate.textContent.trim() === 'Table');
      if (button?.disabled) button.disabled = false;
      if (button) button.title = '표 편집';
    };
    enableConceptTableButton();
    const observer = new MutationObserver(enableConceptTableButton);
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled'] });
    return () => observer.disconnect();
  }, []);

  const rememberCursor = () => {
    cursorOffsetRef.current = conceptDefinitionCursorOffset(wrapperRef.current, editorModel, cursorOffsetRef.current);
  };

  const handleDefinitionChange = nextValue => {
    if (!conceptTablePlaceholdersIntact(editorModel, nextValue)) {
      setEditorNotice('표는 자리표시자를 수정하지 말고 Table 버튼으로 편집하세요.');
      setEditorRevision(revision => revision + 1);
      return;
    }
    setEditorNotice(null);
    onChange(restoreConceptTablePlaceholders(editorModel, nextValue));
  };

  const openTableDialog = () => {
    const source = String(value || '');
    const cursorOffset = conceptDefinitionCursorOffset(wrapperRef.current, editorModel, cursorOffsetRef.current);
    cursorOffsetRef.current = cursorOffset;
    const block = findConceptTableBlock(source, cursorOffset);
    setTableDialog(block ? {
      start: block.start,
      end: block.end,
      insertAt: block.start,
      originalBlock: block.full,
      sourceAtOpen: source,
      rows: parseConceptTableRows(block.content),
    } : {
      start: null,
      end: null,
      insertAt: cursorOffset,
      sourceAtOpen: source,
      rows: createEmptyConceptTable(),
    });
  };

  const isTableToolbarTarget = target => {
    const button = target instanceof Element ? target.closest('.md-toolbar button') : null;
    return Boolean(button && button.textContent.trim() === 'Table');
  };

  const interceptTablePointer = event => {
    if (!isTableToolbarTarget(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    pointerOpenedRef.current = true;
    openTableDialog();
    window.setTimeout(() => { pointerOpenedRef.current = false; }, 0);
  };

  const interceptTableClick = event => {
    if (!isTableToolbarTarget(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    event.nativeEvent?.stopImmediatePropagation?.();
    if (!pointerOpenedRef.current) openTableDialog();
  };

  const closeTableDialog = () => {
    setTableDialog(null);
    window.requestAnimationFrame(() => {
      const button = [...(wrapperRef.current?.querySelectorAll('.md-toolbar button') || [])]
        .find(candidate => candidate.textContent.trim() === 'Table');
      button?.focus();
    });
  };

  const applyTable = rows => {
    const source = String(value || '');
    const block = serializeConceptTable(rows);
    let nextValue;
    let nextCursor;
    if (tableDialog.start == null && source !== tableDialog.sourceAtOpen) {
      setEditorNotice('정의 내용이 바뀌었습니다. 표를 다시 열어 추가하세요.');
      closeTableDialog();
      return;
    }
    if (tableDialog.start != null && tableDialog.end != null) {
      let start = tableDialog.start;
      let end = tableDialog.end;
      if (source.slice(start, end) !== tableDialog.originalBlock) {
        const currentBlock = tableBlockMatches(source).find(match => match.full === tableDialog.originalBlock);
        if (!currentBlock) {
          setEditorNotice('정의 내용이 바뀌었습니다. 표를 다시 열어 편집하세요.');
          closeTableDialog();
          return;
        }
        start = currentBlock.start;
        end = currentBlock.end;
      }
      nextValue = source.slice(0, start) + block + source.slice(end);
      nextCursor = start + block.length;
    } else {
      const insertAt = Math.max(0, Math.min(tableDialog.insertAt ?? source.length, source.length));
      const before = source.slice(0, insertAt);
      const after = source.slice(insertAt);
      const prefix = !before ? '' : before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
      const suffix = !after ? '' : after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : '\n\n';
      nextValue = before + prefix + block + suffix + after;
      nextCursor = before.length + prefix.length + block.length;
    }
    cursorOffsetRef.current = nextCursor;
    onChange(nextValue);
    closeTableDialog();
  };

  return (
    <>
      <div
        ref={wrapperRef}
        className="concept-definition-editor"
        onPointerDownCapture={interceptTablePointer}
        onClickCapture={interceptTableClick}
        onKeyUpCapture={rememberCursor}
        onMouseUpCapture={rememberCursor}
        onSelectCapture={rememberCursor}
      >
        <MarkdownEditor key={editorRevision} value={editorModel.editorValue} onChange={handleDefinitionChange} placeholder="정의를 입력하세요. 표는 도구 모음의 Table 버튼으로 편집할 수 있습니다."/>
      </div>
      {editorNotice && <div className="concept-field-error">{editorNotice}</div>}
      {tableDialog && (
        <ConceptTableEditorModal
          rows={tableDialog.rows}
          editing={tableDialog.start != null}
          onCancel={closeTableDialog}
          onApply={applyTable}
        />
      )}
    </>
  );
}

function conceptDefinitionCursorOffset(root, editorModel, fallback) {
  const source = editorModel.source;
  const editorValue = editorModel.editorValue;
  const fallbackSourceOffset = Math.min(fallback ?? source.length, source.length);
  if (!root) return fallbackSourceOffset;

  const rawTextarea = root.querySelector('.md-raw-textarea');
  if (rawTextarea && document.activeElement === rawTextarea) {
    const editorOffset = rawTextarea.selectionStart ?? editorValue.length;
    const selectedTable = editorModel.tableMappings.find(mapping => (
      editorOffset >= mapping.editorStart && editorOffset < mapping.editorEnd
    ));
    if (selectedTable) return selectedTable.sourceStart;
    return conceptEditorOffsetToSource(editorModel, safeMarkdownBlockEnd(editorValue, editorOffset));
  }

  if (document.activeElement instanceof Element && document.activeElement.closest('.md-toolbar') && root.contains(document.activeElement)) {
    return fallbackSourceOffset;
  }

  const selection = window.getSelection();
  const editor = root.querySelector('.ProseMirror');
  if (!selection?.rangeCount || !selection.anchorNode || !editor?.contains(selection.anchorNode)) {
    return fallbackSourceOffset;
  }

  try {
    const anchorElement = selection.anchorNode.nodeType === Node.ELEMENT_NODE
      ? selection.anchorNode
      : selection.anchorNode.parentElement;
    const renderedBlock = anchorElement?.closest('p, h1, h2, h3, li, pre, blockquote') || editor;
    const range = document.createRange();
    range.setStart(renderedBlock, 0);
    range.setEnd(selection.anchorNode, selection.anchorOffset);
    const renderedOffset = range.toString().length;
    const renderedText = renderedBlock.textContent || '';

    for (const mapping of editorModel.tableMappings) {
      const tokenOffset = renderedText.indexOf(mapping.token);
      if (tokenOffset !== -1 && renderedOffset >= tokenOffset && renderedOffset <= tokenOffset + mapping.token.length) {
        return mapping.sourceStart;
      }
    }

    const editorChildren = [...editor.children];
    let directChild = selection.anchorNode.nodeType === Node.ELEMENT_NODE
      ? selection.anchorNode
      : selection.anchorNode.parentElement;
    while (directChild?.parentElement && directChild.parentElement !== editor) directChild = directChild.parentElement;
    const blockIndex = directChild?.parentElement === editor ? editorChildren.indexOf(directChild) : -1;
    if (blockIndex >= 0) {
      const blockRanges = markdownBlockRanges(editorValue);
      const blockRange = blockRanges[blockIndex];
      if (blockRange) return conceptEditorOffsetToSource(editorModel, blockRange.end);
    }
    return source.length;
  } catch (error) {
    // Selection mapping is best-effort; a safe previous block boundary is retained.
  }

  return fallbackSourceOffset;
}

function markdownBlockRanges(value) {
  const ranges = [];
  let offset = 0;
  for (const token of marked.lexer(String(value || ''))) {
    const raw = String(token.raw || '');
    const start = offset;
    offset += raw.length;
    if (token.type !== 'space') ranges.push({ start, end: offset });
  }
  return ranges;
}

function safeMarkdownBlockEnd(value, cursorOffset) {
  const safeOffset = Math.max(0, Math.min(cursorOffset, String(value || '').length));
  for (const range of markdownBlockRanges(value)) {
    if (safeOffset >= range.start && safeOffset <= range.end) return range.end;
  }
  return safeOffset;
}

function tableBlockMatches(value) {
  const matches = [];
  const pattern = /\[TABLE\]([\s\S]*?)\[\/TABLE\]/g;
  let match;
  while ((match = pattern.exec(String(value || ''))) !== null) {
    matches.push({ full: match[0], content: match[1], start: match.index, end: match.index + match[0].length });
  }
  return matches;
}

function createConceptDefinitionEditorModel(value) {
  const source = String(value || '');
  const blocks = tableBlockMatches(source);
  const tableMappings = [];
  let editorValue = '';
  let sourceOffset = 0;
  blocks.forEach((block, index) => {
    editorValue += source.slice(sourceOffset, block.start);
    const invisibleKey = '\u2060'.repeat(index + 1);
    const token = `${invisibleKey}〈표 ${index + 1} · Table 버튼으로 편집〉${invisibleKey}`;
    const editorStart = editorValue.length;
    editorValue += token;
    const beforeBlock = source.slice(0, block.start);
    const afterBlock = source.slice(block.end);
    const isolatedBefore = !beforeBlock.trim() || /\n[ \t]*\n[ \t]*$/.test(beforeBlock);
    const isolatedAfter = !afterBlock.trim() || /^[ \t]*\n[ \t]*\n/.test(afterBlock);
    tableMappings.push({
      token,
      full: block.full,
      standalone: isolatedBefore && isolatedAfter,
      sourceStart: block.start,
      sourceEnd: block.end,
      editorStart,
      editorEnd: editorStart + token.length,
    });
    sourceOffset = block.end;
  });
  editorValue += source.slice(sourceOffset);
  return { source, editorValue, tableMappings };
}

function conceptTablePlaceholdersIntact(editorModel, nextValue) {
  const text = String(nextValue || '');
  return editorModel.tableMappings.every(mapping => {
    const occurrences = text.split(mapping.token).length - 1;
    if (occurrences !== 1) return false;
    if (!mapping.standalone) return true;
    return text.split(/\r?\n/).some(line => line.trim() === mapping.token);
  });
}

function restoreConceptTablePlaceholders(editorModel, nextValue) {
  let restored = String(nextValue || '');
  editorModel.tableMappings.forEach(mapping => {
    restored = restored.replace(mapping.token, mapping.full);
  });
  return restored;
}

function conceptEditorOffsetToSource(editorModel, editorOffset) {
  const safeOffset = Math.max(0, Math.min(editorOffset, editorModel.editorValue.length));
  let lengthDelta = 0;
  for (const mapping of editorModel.tableMappings) {
    if (safeOffset < mapping.editorStart) return safeOffset + lengthDelta;
    if (safeOffset < mapping.editorEnd) return mapping.sourceStart;
    if (safeOffset === mapping.editorEnd) return mapping.sourceEnd;
    lengthDelta += mapping.full.length - mapping.token.length;
  }
  return Math.min(safeOffset + lengthDelta, editorModel.source.length);
}

function findConceptTableBlock(value, cursorOffset) {
  return tableBlockMatches(value).find(match => cursorOffset >= match.start && cursorOffset < match.end) || null;
}

function conceptTableRowGroups(row) {
  const groups = [];
  let column = 0;
  while (column < row.length) {
    let columnSpan = 1;
    while (column + columnSpan < row.length && row[column + columnSpan].merge === CONCEPT_TABLE_MERGE_LEFT) {
      columnSpan += 1;
    }
    groups.push({ cell: row[column], column, columnSpan });
    column += columnSpan;
  }
  return groups;
}

function conceptTableHeaderRows(rows) {
  const result = [];
  rows.forEach((row, rowIndex) => {
    result[rowIndex] = rowIndex === 0 || (
      result[rowIndex - 1] && row.some(cell => cell.merge === CONCEPT_TABLE_MERGE_UP)
    );
  });
  return result;
}

function ConceptTableEditorModal({ rows: initialRows, editing, onCancel, onApply }) {
  const [rows, setRows] = useState(() => normalizeConceptTableRows(initialRows));
  const [activeCell, setActiveCell] = useState({ row: 0, column: 0 });
  const firstCellRef = useRef(null);
  const onCancelRef = useRef(onCancel);
  const columnCount = rows[0]?.length || 1;
  const rowGroups = useMemo(() => rows.map(conceptTableRowGroups), [rows]);
  const headerRows = useMemo(() => conceptTableHeaderRows(rows), [rows]);
  const [rangeEnd, setRangeEnd] = useState({ row: 0, column: 0 });
  const dragAnchorRef = useRef(null);
  const selection = useMemo(() => selectConceptTableRange(rows, activeCell, rangeEnd), [rows, activeCell, rangeEnd]);
  const selectedKeys = new Set(selection.map(({ row, column }) => `${row},${column}`));
  const canMerge = canMergeConceptTableSelection(rows, selection);
  const hasVerticalMerges = rows.some(row => row.some(cell => cell.merge === CONCEPT_TABLE_MERGE_UP));
  const hasHorizontalMerges = rows.some(row => row.some(cell => cell.merge === CONCEPT_TABLE_MERGE_LEFT));
  const selectionHasMerge = selection.some(({ row, column }) => rows[row][column].merge);
  const selectCell = cell => {
    if (dragAnchorRef.current) return;
    setActiveCell(cell);
    setRangeEnd(cell);
  };

  useEffect(() => {
    const stopDrag = () => { dragAnchorRef.current = null; };
    window.addEventListener('mouseup', stopDrag);
    window.addEventListener('blur', stopDrag);
    return () => {
      window.removeEventListener('mouseup', stopDrag);
      window.removeEventListener('blur', stopDrag);
    };
  }, []);

  useEffect(() => { onCancelRef.current = onCancel; }, [onCancel]);

  useEffect(() => {
    firstCellRef.current?.focus();
    const handleKeyDown = event => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      onCancelRef.current();
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, []);

  const updateCell = (rowIndex, columnIndex, value) => {
    setRows(current => current.map((row, index) => index === rowIndex
      ? row.map((cell, cellIndex) => cellIndex === columnIndex
        ? { ...cell, value: sanitizeConceptTableCell(value) }
        : cell)
      : row
    ));
  };

  const updateDiagonalLabel = (field, value) => {
    setRows(current => current.map((row, rowIndex) => rowIndex === 0
      ? row.map((cell, columnIndex) => columnIndex === 0
        ? {
            ...cell,
            value: '',
            diagonal: {
              ...cell.diagonal,
              [field]: sanitizeConceptTableDiagonalLabel(value),
            },
          }
        : cell)
      : row
    ));
  };

  const toggleDiagonal = () => {
    setRows(current => current.map((row, rowIndex) => rowIndex === 0
      ? row.map((cell, columnIndex) => {
          if (columnIndex !== 0) return cell;
          if (cell.diagonal) {
            const labels = [cell.diagonal.rowLabel, cell.diagonal.columnLabel]
              .map(label => label.trim())
              .filter(Boolean);
            return {
              ...cell,
              value: labels.join(' / '),
              diagonalDraft: cell.diagonal,
              diagonal: null,
            };
          }
          return {
            ...cell,
            value: '',
            merge: null,
            diagonal: cell.diagonalDraft || {
              rowLabel: sanitizeConceptTableDiagonalLabel(cell.value),
              columnLabel: '',
              beforeSlash: ' ',
              afterSlash: ' ',
            },
            diagonalDraft: null,
          };
        })
      : row
    ));
    selectCell({ row: 0, column: 0 });
  };

  const mergeSelection = () => {
    if (!canMerge) return;
    const discarded = conceptTableMergeDiscardCount(rows, selection);
    if (discarded && !window.confirm(`좌상단 값만 남기고 다른 ${discarded}개 셀의 내용을 삭제합니다. 병합하시겠습니까?`)) return;
    setRows(current => mergeConceptTableSelection(current, selection));
  };
  const unmergeSelection = () => {
    setRows(current => unmergeConceptTableSelection(current, selection));
  };

  const addRow = () => setRows(current => [
    ...current,
    Array.from({ length: current[0]?.length || 1 }, () => createConceptTableCell()),
  ]);
  const addColumn = () => setRows(current => current.map(row => [...row, createConceptTableCell()]));
  const removeRow = () => {
    if (rows.length <= 1 || hasVerticalMerges) return;
    setRows(current => {
      const next = current.filter((_, index) => index !== activeCell.row);
      if (activeCell.row === 0) {
        return next.map((row, rowIndex) => rowIndex === 0
          ? row.map(cell => cell.merge === CONCEPT_TABLE_MERGE_UP ? { ...cell, merge: null } : cell)
          : row);
      }
      return next;
    });
    selectCell({ row: Math.min(activeCell.row, rows.length - 2), column: activeCell.column });
  };
  const removeColumn = () => {
    if (columnCount <= 1 || hasHorizontalMerges) return;
    setRows(current => current.map(row => {
      const next = row.filter((_, index) => index !== activeCell.column);
      if (activeCell.column === 0 && next[0]?.merge === CONCEPT_TABLE_MERGE_LEFT) {
        next[0] = { ...next[0], merge: null };
      }
      return next;
    }));
    selectCell({ row: activeCell.row, column: Math.min(activeCell.column, columnCount - 2) });
  };

  return (
    <div className="palette-backdrop concept-table-backdrop" onMouseDown={onCancel}>
      <form
        className="concept-table-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="concept-table-title"
        onMouseDown={event => event.stopPropagation()}
        onKeyDown={event => {
          if (event.key === 'Enter' && event.target?.tagName === 'INPUT') event.preventDefault();
        }}
        onSubmit={event => { event.preventDefault(); onApply(rows); }}
      >
        <div className="concept-table-modal-head">
          <div>
            <div className="panel-title" id="concept-table-title">{editing ? '표 편집' : '표 추가'}</div>
            <div className="panel-sub">첫 행은 머리글입니다. 드래그 또는 Shift+방향키로 병합할 범위를 선택하세요.</div>
          </div>
          <button type="button" onClick={onCancel} aria-label="닫기"><Icon name="x" size={16}/></button>
        </div>
        <div className="concept-table-modal-body">
          <div className="concept-table-tools">
            <button type="button" className="btn btn-xs" onClick={addRow}>행 추가</button>
            <button type="button" className="btn btn-xs" onClick={addColumn}>열 추가</button>
            <button type="button" className="btn btn-xs" onClick={removeRow} disabled={rows.length <= 1 || hasVerticalMerges} title={hasVerticalMerges ? '위 병합을 먼저 해제하세요.' : ''}>행 삭제</button>
            <button type="button" className="btn btn-xs" onClick={removeColumn} disabled={columnCount <= 1 || hasHorizontalMerges} title={hasHorizontalMerges ? '왼쪽 병합을 먼저 해제하세요.' : ''}>열 삭제</button>
            <span>{rows.length}행 × {columnCount}열</span>
          </div>
          <div className="concept-table-merge-tools" aria-label="셀 병합 도구">
            <button type="button" className="btn btn-xs" onClick={mergeSelection} disabled={!canMerge}>선택 영역 병합</button>
            <button type="button" className="btn btn-xs" onClick={unmergeSelection} disabled={!selectionHasMerge}>병합 해제</button>
            <button
              type="button"
              className={'btn btn-xs ' + (rows[0]?.[0]?.diagonal ? 'btn-primary' : '')}
              aria-pressed={Boolean(rows[0]?.[0]?.diagonal)}
              onClick={toggleDiagonal}
              title="좌상단 머리글 전용"
            >대각선 분할</button>
            <div className="concept-table-merge-help">
              <span role="status">{selection.length}칸 선택 · {selection.length > 1 && !canMerge
                ? '사각형 범위만 병합할 수 있습니다.'
                : '병합 시 좌상단 값만 남습니다. 대각선은 좌상단 전용입니다.'}</span>
            </div>
          </div>
          <div className="concept-table-grid-wrap">
            <div
              className="concept-table-grid"
              style={{
                gridTemplateColumns: `repeat(${columnCount}, minmax(150px, 1fr))`,
                gridTemplateRows: `repeat(${rows.length}, minmax(48px, auto))`,
              }}
            >
              {rowGroups.flatMap((groups, rowIndex) => groups.map(group => {
                const { cell, column, columnSpan } = group;
                const selected = selectedKeys.has(`${rowIndex},${column}`);
                const mergedUp = cell.merge === CONCEPT_TABLE_MERGE_UP;
                const diagonal = rowIndex === 0 && column === 0 ? cell.diagonal : null;
                const label = `${rowIndex + 1}행 ${column + 1}열${columnSpan > 1 ? `부터 ${columnSpan}칸 병합` : ''}`;
                return (
                  <div
                    key={`${rowIndex}-${column}`}
                    className={'concept-table-grid-cell '
                      + (headerRows[rowIndex] ? 'header-cell ' : '')
                      + (selected ? 'active-cell ' : '')
                      + (mergedUp ? 'merged-up ' : '')
                      + (columnSpan > 1 ? 'merged-left ' : '')}
                    style={{
                      gridColumn: `${column + 1} / span ${columnSpan}`,
                      gridRow: rowIndex + 1,
                    }}
                    onDragStart={event => event.preventDefault()}
                    onMouseMove={event => {
                      if (dragAnchorRef.current && event.buttons & 1) event.preventDefault();
                    }}
                    onMouseDown={event => {
                      if (event.button !== 0) return;
                      const cell = { row: rowIndex, column };
                      dragAnchorRef.current = cell;
                      setActiveCell(cell);
                      setRangeEnd(cell);
                    }}
                    onMouseEnter={event => {
                      if (!dragAnchorRef.current) return;
                      if (!(event.buttons & 1)) { dragAnchorRef.current = null; return; }
                      window.getSelection()?.removeAllRanges();
                      setRangeEnd({ row: rowIndex, column });
                    }}
                    onKeyDown={event => {
                      const direction = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[event.key];
                      if (!event.shiftKey || !direction) return;
                      event.preventDefault();
                      setRangeEnd(current => ({
                        row: Math.max(0, Math.min(rows.length - 1, current.row + direction[0])),
                        column: Math.max(0, Math.min(columnCount - 1, current.column + direction[1])),
                      }));
                    }}
                  >
                    {diagonal ? (
                      <div className="concept-table-diagonal-editor">
                        <input
                          ref={firstCellRef}
                          className="concept-table-diagonal-column"
                          value={diagonal.columnLabel}
                          onChange={event => updateDiagonalLabel('columnLabel', event.target.value)}
                          onFocus={() => selectCell({ row: 0, column: 0 })}
                          aria-label="열 라벨"
                          placeholder="열 라벨"
                        />
                        <input
                          className="concept-table-diagonal-row"
                          value={diagonal.rowLabel}
                          onChange={event => updateDiagonalLabel('rowLabel', event.target.value)}
                          onFocus={() => selectCell({ row: 0, column: 0 })}
                          aria-label="행 라벨"
                          placeholder="행 라벨"
                        />
                      </div>
                    ) : mergedUp ? (
                      <div
                        className="concept-table-merged-placeholder"
                        role="button"
                        tabIndex={0}
                        aria-label={`${label}, 위 셀과 병합됨`}
                        onFocus={() => selectCell({ row: rowIndex, column })}
                        onKeyDown={event => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            selectCell({ row: rowIndex, column });
                          }
                        }}
                      />
                    ) : (
                      <input
                        ref={rowIndex === 0 && column === 0 ? firstCellRef : null}
                        className="concept-table-cell-input"
                        value={cell.value}
                        onChange={event => updateCell(rowIndex, column, event.target.value)}
                        onFocus={() => selectCell({ row: rowIndex, column })}
                        aria-label={label}
                        placeholder={headerRows[rowIndex] ? '머리글' : '내용'}
                      />
                    )}
                  </div>
                );
              }))}
            </div>
          </div>
        </div>
        <div className="concept-table-modal-foot">
          <button type="button" className="btn btn-sm" onClick={onCancel}>취소</button>
          <button type="submit" className="btn btn-sm btn-primary">적용</button>
        </div>
      </form>
    </div>
  );
}

function formatJsonDraft(value) {
  if (value == null || value === '') return '';
  try { return JSON.stringify(value, null, 2); }
  catch (error) { return String(value); }
}

function parseJsonDraft(text, fieldName) {
  const value = String(text || '').trim();
  if (!value) return { value: null, error: null };
  try { return { value: JSON.parse(value), error: null }; }
  catch (error) { return { value: null, error: `${fieldName}: 형식이 올바르지 않습니다 (${error.message})` }; }
}

function ConceptPreview({ concept }) {
  return (
    <div className="q-box">
      <div style={{fontFamily:'var(--font-serif)', fontSize:24, fontWeight:700, lineHeight:1.35}}>{concept.title || '(제목 없는 개념)'}</div>
      {concept.summary && <div style={{marginTop:10, color:'var(--fg-muted)', fontSize:14, lineHeight:1.7, whiteSpace:'pre-wrap'}}>{concept.summary}</div>}

      <div className="det-section">
        <div className="det-label">핵심 개념</div>
        <ConceptDefinitionPreview value={concept.definition}/>
      </div>

      {concept.exam_point && (
        <div className="det-section">
          <div className="det-label">구별</div>
          <ConceptExamPointPreview value={concept.exam_point}/>
        </div>
      )}

      {concept.real_life_example && (
        <div className="det-section">
          <div className="det-label">실생활 예시</div>
          <div style={{padding:'14px 16px', background:'var(--warning-soft)', border:'1px solid var(--border)', borderRadius:'var(--r-sm)', color:'var(--fg-muted)', lineHeight:1.75, whiteSpace:'pre-wrap'}}>{concept.real_life_example}</div>
        </div>
      )}

      {concept.key_points != null && (
        <div className="det-section">
          <div className="det-label">핵심 포인트</div>
          <ConceptJsonPreview value={concept.key_points}/>
        </div>
      )}

      {concept.related_laws != null && (
        <div className="det-section">
          <div className="det-label">관련 법령</div>
          <ConceptRelatedLawsPreview value={concept.related_laws}/>
        </div>
      )}
    </div>
  );
}

function ConceptDefinitionPreview({ value }) {
  const segments = parseConceptDefinition(value || '');
  if (!segments.length) return <div style={{fontSize:12, color:'var(--fg-faint)'}}>등록된 정의가 없습니다.</div>;
  return (
    <div style={{display:'flex', flexDirection:'column', gap:12}}>
      {segments.map((segment, index) => segment.type === 'table' ? (
        <div key={index} style={{overflowX:'auto', border:'1px solid var(--border)', borderRadius:'var(--r-sm)'}}>
          <table style={{width:'100%', borderCollapse:'collapse', fontSize:13}}>
            <tbody>
              {segment.rows.map((row, rowIndex) => (
                <tr key={rowIndex} style={rowIndex === 0 ? {background:'var(--surface-2)'} : null}>
                  {row.map((cell, cellIndex) => {
                    const Cell = rowIndex === 0 ? 'th' : 'td';
                    return <Cell key={cellIndex} style={{borderRight:'1px solid var(--border)', borderBottom:'1px solid var(--border)', padding:'9px 11px', textAlign:'center', whiteSpace:'pre-wrap'}}>{cell}</Cell>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div key={index} className="det-text" style={{lineHeight:1.8}} dangerouslySetInnerHTML={{__html:marked.parse(segment.text)}}/>
      ))}
    </div>
  );
}

function ConceptExamPointPreview({ value }) {
  const lines = String(value || '').split(/\r?\n/);
  return (
    <div className="concept-exam-point-preview">
      {lines.map((line, index) => {
        const trimmed = line.trim();
        const boldMatch = trimmed.match(/^\*\*(.+)\*\*$/);
        const marker = line.trimStart().charAt(0);
        const className = marker === '○' ? 'correct' : marker === '×' ? 'incorrect' : '';
        return (
          <div key={index} className={className}>
            {boldMatch ? <strong>{boldMatch[1]}</strong> : (line || '\u00a0')}
          </div>
        );
      })}
    </div>
  );
}

function ConceptRelatedLawsPreview({ value }) {
  const laws = Array.isArray(value) ? value : [];
  if (!laws.length) return <div style={{fontSize:12, color:'var(--fg-faint)'}}>등록된 법령이 없습니다.</div>;
  return (
    <div className="concept-law-preview-list">
      {laws.map((law, index) => (
        <div className="concept-law-preview-card" key={`${law?.id || 'law'}-${index}`}>
          <div className="concept-law-preview-title">{law?.title || `조문 ${index + 1}`}</div>
          {law?.article_text && <div className="concept-law-preview-article">{law.article_text}</div>}
          {law?.commentary && (
            <div className="concept-law-preview-commentary">
              <span>해설</span>
              {law.commentary}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function parseConceptDefinition(value) {
  const text = String(value || '');
  const pattern = /\[TABLE\]([\s\S]*?)\[\/TABLE\]/g;
  const segments = [];
  let lastEnd = 0;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    const before = text.slice(lastEnd, match.index).trim();
    if (before) segments.push({ type: 'text', text: before });
    const tableBody = match[1].replace(/^\r?\n/, '').replace(/\r?\n$/, '');
    const rows = tableBody.split(/\r?\n/).map(row => row.split('|').map(cell => cell.trim()));
    if (rows.length) segments.push({ type: 'table', rows });
    lastEnd = match.index + match[0].length;
  }
  const after = text.slice(lastEnd).trim();
  if (after) segments.push({ type: 'text', text: after });
  return segments;
}

function ConceptJsonPreview({ value }) {
  const entries = Array.isArray(value)
    ? value.map((item, index) => [String(index + 1), item])
    : value && typeof value === 'object' ? Object.entries(value) : [['', value]];
  if (!entries.length) return <div style={{fontSize:12, color:'var(--fg-faint)'}}>등록된 내용이 없습니다.</div>;
  return (
    <div style={{display:'flex', flexDirection:'column', gap:7}}>
      {entries.map(([label, item], index) => {
        const isObject = item && typeof item === 'object' && !Array.isArray(item);
        const heading = isObject ? (item.title || item.name || item.label || label) : label;
        const detail = isObject
          ? Object.entries(item).filter(([key]) => !['title','name','label'].includes(key)).map(([key, nested]) => `${key}: ${jsonPreviewText(nested)}`).join('\n')
          : jsonPreviewText(item);
        return (
          <div key={`${label}-${index}`} style={{padding:'10px 12px', background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:'var(--r-sm)', lineHeight:1.65}}>
            {heading && <div style={{fontWeight:600, color:'var(--fg)', marginBottom:detail ? 3 : 0}}>{heading}</div>}
            {detail && <div style={{fontSize:12.5, color:'var(--fg-muted)', whiteSpace:'pre-wrap'}}>{detail}</div>}
          </div>
        );
      })}
    </div>
  );
}

function jsonPreviewText(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try { return JSON.stringify(value, null, 2); }
  catch (error) { return String(value); }
}

function ConceptQuestionAccordion({ question, subject, exam, setSection }) {
  const [expanded, setExpanded] = useState(false);
  const choices = questionChoices(question);
  const correctIndex = 'ABCDE'.indexOf(question.correct_answer || '');

  const openInQuestionInspector = (event) => {
    event.stopPropagation();
    if (exam?.code) localStorage.setItem('qi.examCode', exam.code);
    if (subject?.code) localStorage.setItem('qi.subjectCode', subject.code);
    localStorage.setItem('qi.yearSession', String(question.year_session));
    localStorage.setItem('qi.openId', String(question.question_id));
    setSection?.('question-inspector');
  };

  return (
    <div style={{border:'1px solid var(--border)', borderRadius:'var(--r-sm)', background:'var(--surface)', overflow:'hidden'}}>
      <div onClick={() => setExpanded(value => !value)} style={{display:'flex', alignItems:'center', gap:10, padding:'10px 12px', cursor:'pointer'}}>
        <span style={{fontFamily:'var(--font-mono)', fontWeight:600}}>{question.year_session}회 · {question.question_number}번</span>
        {question.is_primary && <span className="badge badge-violet">주개념</span>}
        <span style={{flex:1, minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', color:'var(--fg-muted)'}}>{firstLine(question.stem)}</span>
        <button className="btn btn-xs" onClick={openInQuestionInspector}>문제 전수조사에서 열기</button>
        <span style={{color:'var(--fg-faint)', transform:expanded ? 'rotate(90deg)' : 'none', transition:'transform .15s'}}>›</span>
      </div>
      {expanded && (
        <div style={{padding:'0 12px 12px', borderTop:'1px solid var(--border)'}}>
          <div className="q-stem" style={{paddingTop:14, paddingRight:0}}>{question.stem}</div>
          {Array.isArray(question.stem_givens) && question.stem_givens.length > 0 && (
            <div style={{margin:'8px 0 14px'}}>
              {question.stem_givens.map((box, boxIndex) => {
                const { boxed, label } = givenPreviewBoxMeta(box);
                return (
                  <div key={boxIndex} style={boxed ? {border:'1px solid var(--border)', borderRadius:'var(--r-sm)', padding:'10px 12px', marginBottom:6, background:'var(--surface-2)'} : {padding:'2px 0', marginBottom:6}}>
                    {label && <div style={{fontSize:11, color:'var(--fg-subtle)', fontFamily:'var(--font-mono)', marginBottom:6}}>〈{label}〉</div>}
                    {(box.items || []).map((item, itemIndex) => {
                      const hasKey = String(item.key ?? '').trim() !== '';
                      return (
                        <div key={itemIndex} style={{display:'grid', gridTemplateColumns:hasKey ? '40px minmax(0, 1fr)' : 'minmax(0, 1fr)', gap:8, alignItems:'start', fontSize:14, lineHeight:1.7}}>
                          {hasKey && <b>{String(item.key ?? '')}</b>}
                          <GivenPreviewText text={item.text} markdown={Boolean(box.markdown_enabled)}/>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
          <ul className="choices-list">
            {choices.map((choice, index) => {
              const text = typeof choice === 'string' ? choice : (choice.text || '');
              return (
                <li key={index} className={"choice-item " + (index === correctIndex ? 'correct' : '')}>
                  <span className="choice-id">{'①②③④⑤'[index] || `${index + 1}.`}</span> {text}
                  {index === correctIndex && <span style={{marginLeft:'auto', fontSize:10}}>정답</span>}
                </li>
              );
            })}
          </ul>
          {question.explanation && <div className="exp-box">{question.explanation}</div>}
        </div>
      )}
    </div>
  );
}

function RpcNotApplied({ message, error, retry }) {
  return (
    <div className="q-box" style={{borderColor:'var(--warning)', marginBottom:12}}>
      <div style={{display:'flex', gap:10, alignItems:'flex-start'}}>
        <Icon name="info" size={15} style={{color:'var(--warning)', flexShrink:0, marginTop:2}}/>
        <div style={{flex:1, minWidth:0}}>
          <div style={{fontWeight:600, color:'var(--fg)'}}>RPC 미적용</div>
          <div style={{fontSize:12, color:'var(--fg-muted)', marginTop:3}}>{message || '필요한 관리자 RPC가 아직 적용되지 않았습니다.'}</div>
          {error && <div style={{fontFamily:'var(--font-mono)', fontSize:10.5, color:'var(--fg-faint)', marginTop:5, overflowWrap:'anywhere'}}>{error.message || String(error)}</div>}
        </div>
        {retry && <button className="btn btn-xs" onClick={retry}>다시 시도</button>}
      </div>
    </div>
  );
}

/* ─── Exam Dates ─── */
function ddayText(dateStr) {
  if (!dateStr) return { text: '—', kind: 'muted' };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + 'T00:00:00');
  const diff = Math.round((target - today) / 86400000);
  if (diff > 0) return { text: 'D-' + diff, kind: 'future' };
  if (diff === 0) return { text: 'D-DAY', kind: 'today' };
  return { text: 'D+' + Math.abs(diff), kind: 'past' };
}

function formatExamDate(dateStr) {
  if (!dateStr) return '미설정';
  const d = new Date(dateStr + 'T00:00:00');
  const weekday = ['일','월','화','수','목','금','토'][d.getDay()];
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day} (${weekday})`;
}

/* ─── Exam Management (exams 테이블 직접 관리) ─── */
//
// 필요한 Supabase RPC (사용자가 Supabase SQL Editor에서 직접 실행):
//
//   CREATE OR REPLACE FUNCTION public.admin_upsert_exam(
//     p_id text, p_name text, p_is_active boolean
//   ) RETURNS void
//   LANGUAGE plpgsql SECURITY DEFINER
//   SET search_path = public AS $$
//   BEGIN
//     IF NOT EXISTS (SELECT 1 FROM public.admins WHERE id = auth.uid() AND status = 'approved') THEN
//       RAISE EXCEPTION 'Forbidden';
//     END IF;
//     INSERT INTO public.exams (id, name, is_active, created_at)
//     VALUES (p_id, p_name, p_is_active, now())
//     ON CONFLICT (id) DO UPDATE SET
//       name = EXCLUDED.name,
//       is_active = EXCLUDED.is_active;
//   END; $$;
//
//   GRANT EXECUTE ON FUNCTION public.admin_upsert_exam(text, text, boolean) TO authenticated;
//
function Exams({ pushToast }) {
  const list = useAsync(async () => {
    const { data, error } = await sb.from('exams').select('id, name, is_active, description, total_questions').order('id');
    if (error) throw error;
    return data || [];
  });
  const [editingId, setEditingId] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const exams = list.data || [];

  return (
    <>
      <div style={{padding:'12px 16px', background:'var(--accent-soft)', border:'1px solid var(--border)', borderRadius:'var(--r)', marginBottom:16, display:'flex', gap:10, alignItems:'flex-start', fontSize:12, color:'var(--fg-muted)', lineHeight:1.65}}>
        <Icon name="info" size={15} style={{color:'var(--accent)', flexShrink:0, marginTop:2}}/>
        <div>여기서 추가/수정한 시험은 모바일 앱과 웹사이트 양쪽에 즉시 반영됩니다. 시험 일자는 별도 페이지(<strong style={{color:'var(--fg)'}}>시험 일자 설정</strong>)에서 등록하세요.</div>
      </div>
      <div className="panel">
        <div className="panel-head">
          <div><div className="panel-title">등록된 시험</div><div className="panel-sub">{exams.length}개</div></div>
          <div style={{display:'flex', gap:6}}>
            <button className="icon-btn" onClick={list.refetch} title="새로고침"><Icon name="refresh"/></button>
            <button className="btn btn-sm btn-primary" onClick={() => setShowAddModal(true)}><Icon name="plus" size={12}/> 새 시험 추가</button>
          </div>
        </div>
        <div className="panel-body">
          {list.loading ? <Loader/> : list.error ? <ErrorBox error={list.error} retry={list.refetch}/> :
            exams.length === 0 ? <EmptyState icon="database" title="등록된 시험이 없습니다"/> :
            <div className="plat-grid">
              {exams.map(exam => (
                <ExamCard
                  key={exam.id}
                  exam={exam}
                  onSave={() => { list.refetch(); pushToast(`${exam.name} 저장됨`); }}
                  editing={editingId === exam.id}
                  setEditing={(v) => setEditingId(v ? exam.id : null)}
                  pushToast={pushToast}
                />
              ))}
            </div>
          }
        </div>
      </div>
      {showAddModal && (
        <NewExamModal
          existingIds={exams.map(e => e.id)}
          onClose={() => setShowAddModal(false)}
          onCreated={() => { setShowAddModal(false); list.refetch(); pushToast('새 시험이 추가됨'); }}
          pushToast={pushToast}
        />
      )}
    </>
  );
}

function ExamCard({ exam, onSave, editing, setEditing, pushToast }) {
  const currentForm = () => ({
    name: exam.name || '',
    is_active: exam.is_active !== false,
  });
  const [form, setForm] = useState(currentForm);
  const [busy, setBusy] = useState(false);

  const save = async (overrides) => {
    const next = { ...form, ...(overrides || {}) };
    if (!next.name.trim()) { pushToast('시험명을 입력하세요', 'info'); return; }
    setBusy(true);
    try {
      await rpc('admin_upsert_exam', {
        p_id: exam.id,
        p_name: next.name.trim(),
        p_is_active: !!next.is_active,
      });
      setEditing(false);
      onSave();
    } catch (e) {
      pushToast(e.message || String(e), 'info');
    } finally {
      setBusy(false);
    }
  };

  // 인라인 토글 (VersionCard 패턴): 편집 중이 아닐 때 클릭하면 곧바로 저장
  const toggleActive = async () => {
    if (busy) return;
    const next = !form.is_active;
    setForm(f => ({ ...f, is_active: next }));
    await save({ is_active: next });
  };

  const startEditing = () => {
    setForm(currentForm());
    setEditing(true);
  };

  return (
    <div className="plat-card">
      <div className="plat-head">
        <div className="plat-ic">{(exam.id || '?').slice(0, 2).toUpperCase()}</div>
        <div>
          <div className="plat-name">{exam.name}</div>
          <div className="plat-updated" style={{fontFamily:'var(--font-mono)', fontSize:10.5}}>{exam.id}</div>
        </div>
        <div style={{marginLeft:'auto'}}>
          <label className={"toggle " + (form.is_active ? 'on' : '')} onClick={editing ? () => setForm(f => ({ ...f, is_active: !f.is_active })) : toggleActive}>
            <span className="toggle-track"/>
            <span style={{fontSize:11, fontFamily:'var(--font-mono)', color: form.is_active ? 'var(--success)' : 'var(--fg-subtle)', fontWeight:600}}>{form.is_active ? 'ACTIVE' : 'INACTIVE'}</span>
          </label>
        </div>
      </div>
      {editing ? (
        <div style={{display:'flex', flexDirection:'column', gap:8}}>
          <div><div className="field-label">시험명</div><input type="text" className="field-input" placeholder="예: 변호사" style={{width:'100%'}} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}/></div>
          <div style={{display:'flex', gap:6, justifyContent:'flex-end'}}>
            <button className="btn btn-sm" onClick={() => setEditing(false)} disabled={busy}>취소</button>
            <button className="btn btn-sm btn-primary" onClick={() => save()} disabled={busy}>{busy ? '저장 중...' : '저장'}</button>
          </div>
        </div>
      ) : (
        <>
          <dl>
            <dt>시험명</dt><dd>{exam.name}</dd>
            <dt>설명</dt><dd style={!exam.description ? {color:'var(--fg-faint)'} : undefined}>{exam.description || '미설정'}</dd>
            <dt>문제 수</dt><dd style={{fontFamily:'var(--font-mono)'}}>{exam.total_questions != null ? fmtNum(exam.total_questions) + '개' : '—'}</dd>
            <dt>상태</dt><dd style={{color: exam.is_active ? 'var(--success)' : 'var(--fg-faint)', fontWeight:600}}>{exam.is_active ? 'ACTIVE' : 'INACTIVE'}</dd>
          </dl>
          <button className="btn btn-sm" onClick={startEditing}>설정 편집</button>
        </>
      )}
    </div>
  );
}

function NewExamModal({ existingIds, onClose, onCreated, pushToast }) {
  const [form, setForm] = useState({ id: '', name: '', is_active: true });
  const [busy, setBusy] = useState(false);
  const idValid = /^[a-z_]+$/.test(form.id) && form.id.length >= 2;
  const idDuplicate = existingIds.includes(form.id);

  const submit = async () => {
    const cleanId = form.id.trim();
    const cleanName = form.name.trim();
    if (!cleanId || !cleanName) { pushToast('id와 시험명을 입력하세요', 'info'); return; }
    if (!/^[a-z_]+$/.test(cleanId)) { pushToast('id는 소문자 영문과 underscore만 사용할 수 있습니다', 'info'); return; }
    if (existingIds.includes(cleanId)) { pushToast('이미 존재하는 id 입니다', 'info'); return; }
    setBusy(true);
    try {
      await rpc('admin_upsert_exam', {
        p_id: cleanId,
        p_name: cleanName,
        p_is_active: !!form.is_active,
      });
      onCreated();
    } catch (e) {
      pushToast(e.message || String(e), 'info');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="palette-backdrop" onClick={onClose}>
      <div className="palette" style={{maxWidth:480}} onClick={e => e.stopPropagation()}>
        <div style={{padding:'16px 18px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
          <div><div style={{fontSize:14, fontWeight:600}}>새 시험 추가</div><div style={{fontSize:11, color:'var(--fg-subtle)', fontFamily:'var(--font-mono)', marginTop:2}}>exams 테이블에 신규 행 등록</div></div>
          <button onClick={onClose} style={{color:'var(--fg-subtle)', padding:4}}><Icon name="x" size={16}/></button>
        </div>
        <div style={{padding:'16px 18px', display:'flex', flexDirection:'column', gap:12}}>
          <div>
            <div className="field-label">id <span style={{color:'var(--fg-faint)', fontWeight:400}}>(소문자 영문 + underscore)</span></div>
            <input
              type="text"
              className="field-input"
              placeholder="예: byeonhosa"
              style={{width:'100%', fontFamily:'var(--font-mono)'}}
              value={form.id}
              onChange={e => setForm(f => ({ ...f, id: e.target.value.toLowerCase().replace(/[^a-z_]/g, '') }))}
              autoFocus
            />
            {form.id && !idValid && <div style={{fontSize:11, color:'var(--danger)', marginTop:4}}>id는 소문자 영문과 _ 만, 2자 이상</div>}
            {idValid && idDuplicate && <div style={{fontSize:11, color:'var(--danger)', marginTop:4}}>이미 존재하는 id 입니다</div>}
          </div>
          <div>
            <div className="field-label">시험명 (한국어)</div>
            <input
              type="text"
              className="field-input"
              placeholder="예: 변호사"
              style={{width:'100%'}}
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div style={{display:'flex', alignItems:'center', gap:10}}>
            <label className={"toggle " + (form.is_active ? 'on' : '')} onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))}>
              <span className="toggle-track"/>
              <span style={{fontSize:11, fontFamily:'var(--font-mono)', color: form.is_active ? 'var(--success)' : 'var(--fg-subtle)', fontWeight:600}}>{form.is_active ? 'ACTIVE' : 'INACTIVE'}</span>
            </label>
            <span style={{fontSize:12, color:'var(--fg-muted)'}}>활성 상태로 등록할까요?</span>
          </div>
        </div>
        <div style={{padding:'12px 18px', borderTop:'1px solid var(--border)', display:'flex', gap:6, justifyContent:'flex-end'}}>
          <button className="btn btn-sm" onClick={onClose} disabled={busy}>취소</button>
          <button className="btn btn-sm btn-primary" onClick={submit} disabled={busy || !idValid || idDuplicate || !form.name.trim()}>{busy ? '추가 중...' : '추가'}</button>
        </div>
      </div>
    </div>
  );
}

function ExamDates({ pushToast }) {
  const list = useAsync(async () => {
    const [examsRes, datesRes] = await Promise.all([
      sb.from('exams').select('id, name, is_active').order('id'),
      sb.from('exam_dates').select('exam_id, next_exam_date, exam_name_ko, updated_at'),
    ]);
    if (examsRes.error) throw examsRes.error;
    if (datesRes.error) throw datesRes.error;
    const byId = new Map((datesRes.data || []).map(d => [d.exam_id, d]));
    return (examsRes.data || []).map(e => ({ ...e, exam_date: byId.get(e.id) || null }));
  });
  const [editingId, setEditingId] = useState(null);
  const exams = (list.data || []).filter(exam => exam.is_active !== false);

  return (
    <>
      <div style={{padding:'12px 16px', background:'var(--accent-soft)', border:'1px solid var(--border)', borderRadius:'var(--r)', marginBottom:16, display:'flex', gap:10, alignItems:'flex-start', fontSize:12, color:'var(--fg-muted)', lineHeight:1.65}}>
        <Icon name="info" size={15} style={{color:'var(--accent)', flexShrink:0, marginTop:2}}/>
        <div>D-day 및 모바일 앱 회차 표시는 이 값으로 갱신됩니다. 저장 즉시 적용.</div>
      </div>
      <div className="panel">
        <div className="panel-head">
          <div><div className="panel-title">시험별 회차·일자</div><div className="panel-sub">{exams.length}개</div></div>
          <button className="icon-btn" onClick={list.refetch} title="새로고침"><Icon name="refresh"/></button>
        </div>
        <div className="panel-body">
          {list.loading ? <Loader/> : list.error ? <ErrorBox error={list.error} retry={list.refetch}/> :
            exams.length === 0 ? <EmptyState icon="calendar" title="표시할 시험이 없습니다"/> :
            <div className="plat-grid">
              {exams.map(exam => (
                <ExamDateCard
                  key={exam.id}
                  exam={exam}
                  onSave={() => { list.refetch(); pushToast(`${exam.name} 시험 일자 저장됨`); }}
                  editing={editingId === exam.id}
                  setEditing={(v) => setEditingId(v ? exam.id : null)}
                  pushToast={pushToast}
                />
              ))}
            </div>
          }
        </div>
      </div>
    </>
  );
}

function ExamDateCard({ exam, onSave, editing, setEditing, pushToast }) {
  const examDate = exam.exam_date || null;
  const currentForm = () => ({
    exam_date: examDate?.next_exam_date || '',
    exam_name_ko: examDate?.exam_name_ko || '',
  });
  const [form, setForm] = useState(currentForm);
  const [busy, setBusy] = useState(false);
  const dday = ddayText(examDate?.next_exam_date);
  const ddayColor = dday.kind === 'future' ? 'var(--fg-muted)'
    : dday.kind === 'today' ? 'var(--success)'
    : dday.kind === 'past' ? 'var(--danger)'
    : 'var(--fg-faint)';

  const save = async () => {
    if (!form.exam_date) { pushToast('시험일을 선택하세요', 'info'); return; }
    if (!form.exam_name_ko.trim()) { pushToast('회차 명칭을 입력하세요', 'info'); return; }
    setBusy(true);
    try {
      await rpc('admin_upsert_exam_date', {
        p_exam_id: exam.id,
        p_exam_date: form.exam_date,
        p_exam_name_ko: form.exam_name_ko.trim(),
      });
      setEditing(false);
      onSave();
    } catch (e) {
      pushToast(e.message || String(e), 'info');
    } finally {
      setBusy(false);
    }
  };

  const startEditing = () => {
    setForm(currentForm());
    setEditing(true);
  };

  return (
    <div className="plat-card">
      <div className="plat-head">
        <div className="plat-ic">{(exam.id || '?').slice(0, 2).toUpperCase()}</div>
        <div><div className="plat-name">{exam.name}</div><div className="plat-updated">마지막 업데이트 {relativeTime(examDate?.updated_at) || '없음'}</div></div>
      </div>
      {editing ? (
        <div style={{display:'flex', flexDirection:'column', gap:8}}>
          <div><div className="field-label">다음 시험일</div><input type="date" className="field-input" style={{width:'100%'}} value={form.exam_date} onChange={e => setForm(f => ({ ...f, exam_date: e.target.value }))}/></div>
          <div><div className="field-label">회차 명칭</div><input type="text" className="field-input" placeholder="예: 제38회 감정평가사 1차" style={{width:'100%'}} value={form.exam_name_ko} onChange={e => setForm(f => ({ ...f, exam_name_ko: e.target.value }))}/></div>
          <div style={{display:'flex', gap:6, justifyContent:'flex-end'}}>
            <button className="btn btn-sm" onClick={() => setEditing(false)} disabled={busy}>취소</button>
            <button className="btn btn-sm btn-primary" onClick={save} disabled={busy}>{busy ? '저장 중...' : '저장'}</button>
          </div>
        </div>
      ) : (
        <>
          <dl>
            <dt>다음 시험일</dt><dd style={!examDate?.next_exam_date ? {color:'var(--fg-faint)'} : undefined}>{formatExamDate(examDate?.next_exam_date)}</dd>
            <dt>회차 명칭</dt><dd style={!examDate?.exam_name_ko ? {color:'var(--fg-faint)'} : undefined}>{examDate?.exam_name_ko || '미설정'}</dd>
            <dt>남은 기간</dt><dd style={{color:ddayColor, fontWeight:600}}>{dday.text}</dd>
          </dl>
          <button className="btn btn-sm" onClick={startEditing}>설정 편집</button>
        </>
      )}
    </div>
  );
}

/* ─── App Version ─── */
function AppVersion({ pushToast }) {
  const cfg = useAsync(async () => {
    const { data, error } = await sb.from('app_client_config').select('*');
    if (error) throw error;
    return data || [];
  });
  const [editing, setEditing] = useState(null); // platform being edited

  return (
    <>
      <div style={{padding:'12px 16px', background:'var(--warning-soft)', border:'1px solid rgba(245,158,11,.3)', borderRadius:'var(--r)', marginBottom:16, display:'flex', gap:10, alignItems:'flex-start', fontSize:12, color:'var(--fg-muted)', lineHeight:1.65}}>
        <Icon name="info" size={15} style={{color:'var(--warning)', flexShrink:0, marginTop:2}}/>
        <div><strong style={{color:'var(--fg)'}}>force_update = ON</strong> 설정 시 최소 버전 미만의 모든 유저에게 <strong>즉시 전체화면 업데이트 요구</strong>가 표시됩니다. 스토어 심사 반영 확인 후 신중히 활성화하세요.</div>
      </div>
      {cfg.loading ? <Loader/> : cfg.error ? <ErrorBox error={cfg.error} retry={cfg.refetch}/> :
        <div className="plat-grid">
          {(cfg.data || []).map(p => (
            <VersionCard key={p.platform} p={p} onSave={() => { cfg.refetch(); pushToast(p.platform + ' 설정 저장됨'); }} editing={editing === p.platform} setEditing={(v) => setEditing(v ? p.platform : null)} pushToast={pushToast}/>
          ))}
        </div>
      }
    </>
  );
}

function VersionCard({ p, onSave, editing, setEditing, pushToast }) {
  const [form, setForm] = useState({
    minimum_supported_version: p.minimum_supported_version || '',
    latest_version: p.latest_version || '',
    force_update: !!p.force_update,
    update_message: p.update_message || '',
    store_url: p.store_url || '',
    minimum_supported_build: p.minimum_supported_build || 0,
  });
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await rpc('admin_update_app_version', {
        p_platform: p.platform,
        p_minimum_supported_version: form.minimum_supported_version,
        p_latest_version: form.latest_version,
        p_force_update: form.force_update,
        p_update_message: form.update_message,
        p_store_url: form.store_url,
        p_minimum_supported_build: Number(form.minimum_supported_build) || 0,
      });
      setEditing(false); onSave();
    } catch (e) { pushToast(e.message, 'info'); }
    finally { setBusy(false); }
  };

  return (
    <div className="plat-card">
      <div className="plat-head">
        <div className="plat-ic">{(p.platform || '?').slice(0,2).toUpperCase()}</div>
        <div><div className="plat-name">{p.platform}</div><div className="plat-updated">업데이트 {relativeTime(p.updated_at)}</div></div>
        <div style={{marginLeft:'auto'}}>
          <label className={"toggle " + (form.force_update ? 'on' : '')} onClick={editing ? () => setForm(f => ({ ...f, force_update: !f.force_update })) : undefined}>
            <span className="toggle-track"/>
            <span style={{fontSize:11, fontFamily:'var(--font-mono)', color: form.force_update ? 'var(--danger)' : 'var(--fg-subtle)', fontWeight:600}}>FORCE {form.force_update ? 'ON' : 'OFF'}</span>
          </label>
        </div>
      </div>
      {editing ? (
        <div style={{display:'flex', flexDirection:'column', gap:8}}>
          <div><div className="field-label">최신 버전</div><input className="field-input" style={{width:'100%'}} value={form.latest_version} onChange={e => setForm(f => ({ ...f, latest_version: e.target.value }))}/></div>
          <div><div className="field-label">최소 지원 버전</div><input className="field-input" style={{width:'100%'}} value={form.minimum_supported_version} onChange={e => setForm(f => ({ ...f, minimum_supported_version: e.target.value }))}/></div>
          <div><div className="field-label">최소 지원 빌드</div><input className="field-input" style={{width:'100%'}} type="number" value={form.minimum_supported_build} onChange={e => setForm(f => ({ ...f, minimum_supported_build: e.target.value }))}/></div>
          <div><div className="field-label">스토어 URL</div><input className="field-input" style={{width:'100%'}} value={form.store_url} onChange={e => setForm(f => ({ ...f, store_url: e.target.value }))}/></div>
          <div><div className="field-label">업데이트 메시지</div><textarea value={form.update_message} onChange={e => setForm(f => ({ ...f, update_message: e.target.value }))} style={{minHeight:60}}/></div>
          <div style={{display:'flex', gap:6, justifyContent:'flex-end'}}>
            <button className="btn btn-sm" onClick={() => setEditing(false)}>취소</button>
            <button className="btn btn-sm btn-primary" onClick={save} disabled={busy}>{busy ? '저장 중...' : '저장'}</button>
          </div>
        </div>
      ) : (
        <>
          <dl>
            <dt>최신 버전</dt><dd>{p.latest_version}</dd>
            <dt>최소 버전</dt><dd>{p.minimum_supported_version}</dd>
            <dt>최소 빌드</dt><dd>{p.minimum_supported_build}</dd>
            <dt>강제 업데이트</dt><dd className={p.force_update ? 'force-on' : ''}>{p.force_update ? 'ON (즉시 노출)' : 'OFF'}</dd>
            <dt>스토어</dt><dd style={{fontSize:10.5, color:'var(--fg-subtle)', overflow:'hidden', textOverflow:'ellipsis'}}>{p.store_url || '—'}</dd>
          </dl>
          <button className="btn btn-sm" onClick={() => setEditing(true)}>설정 편집</button>
        </>
      )}
    </div>
  );
}

/* ─── Admins ─── */
function Admins({ pushToast }) {
  const users = useAsync(() => rpc('admin_list_users'));
  const stats = useAsync(() => rpc('admin_get_stats').catch(() => []));
  const subjects = useAsync(() => rpc('admin_get_subjects'));

  const approve = async (id) => { try { await rpc('admin_approve_user', { target_id: id }); pushToast('승인됨'); users.refetch(); } catch (e) { pushToast(e.message, 'info'); } };
  const reject = async (id) => { if (!confirm('거절하시겠습니까?')) return; try { await rpc('admin_reject_user', { target_id: id }); pushToast('거절됨'); users.refetch(); } catch (e) { pushToast(e.message, 'info'); } };
  const revoke = async (id) => { if (!confirm('권한을 해제하시겠습니까?')) return; try { await rpc('admin_revoke_user', { target_id: id }); pushToast('권한 해제됨'); users.refetch(); } catch (e) { pushToast(e.message, 'info'); } };

  if (users.loading) return <Loader/>;
  if (users.error) return <ErrorBox error={users.error} retry={users.refetch}/>;

  const pending = (users.data || []).filter(u => u.status === 'pending');
  const approved = (users.data || []).filter(u => u.status === 'approved');
  const statsMap = Object.fromEntries((stats.data || []).map(s => [s.admin_id || s.id, s]));

  return (
    <>
      {pending.length > 0 && (
        <div className="sheet marked" style={{marginBottom:'var(--sp-4)', borderColor:'var(--accent-border)'}}>
          <div className="sheet-head" style={{background:'var(--accent-soft)'}}>
            <div><div className="sheet-title" style={{color:'var(--accent)'}}>승인 대기 {pending.length}명</div><div className="sheet-sub">가입 신청 검토</div></div>
          </div>
          <div className="sheet-body flush">
            {pending.map(u => (
              <div key={u.id} className="urow">
                <div className="uav" style={{background:'var(--surface-3)', color:'var(--fg-muted)', border:'1px solid var(--border-strong)'}}>{(u.name || u.email || '?')[0]}</div>
                <div className="uinfo">
                  <div className="uname-line"><span className="uname">{u.name || '(이름 없음)'}</span><span className="uemail">{u.email}</span></div>
                  <div className="ustat"><span>요청: {relativeTime(u.created_at)}</span></div>
                </div>
                <button className="btn btn-sm btn-danger" onClick={() => reject(u.id)}>거절</button>
                <button className="btn btn-sm btn-primary" onClick={() => approve(u.id)}><Icon name="check" size={12}/> 승인</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="sheet" style={{margin:0}}>
        <div className="sheet-head">
          <div><div className="sheet-title">관리자 목록</div><div className="sheet-sub">{approved.length}명 활성</div></div>
          <div className="perm-legend">
            <div className="pi"><span className="badge badge-accent">SUPER</span> 전체 권한</div>
            <div className="pi"><span className="badge badge-info">ADMIN</span> 배정 시험</div>
          </div>
        </div>
        <div className="sheet-body flush">
          {approved.map(u => (
            <AdminRow key={u.id} u={u} stats={statsMap[u.id]} subjects={subjects.data || []} onChanged={users.refetch} onRevoke={() => revoke(u.id)} pushToast={pushToast}/>
          ))}
        </div>
      </div>
    </>
  );
}

function AdminRow({ u, stats, subjects, onChanged, onRevoke, pushToast }) {
  const mySubs = useAsync(() => rpc('admin_get_user_subjects', { target_id: u.id }).catch(() => []), [u.id]);
  const [adding, setAdding] = useState(false);

  const addSubject = async (code) => {
    try { await rpc('admin_assign_subject', { target_id: u.id, subject_code: code }); mySubs.refetch(); setAdding(false); } catch (e) { pushToast(e.message, 'info'); }
  };
  const removeSubject = async (code) => {
    try { await rpc('admin_unassign_subject', { target_id: u.id, subject_code: code }); mySubs.refetch(); } catch (e) { pushToast(e.message, 'info'); }
  };
  const assignedCodes = (mySubs.data || []).map(s => s.subject_code || s.code);

  return (
    <div className="urow">
      <div className="uav" style={{background:'var(--accent)', color:'#fff'}}>{(u.name || u.email || '?')[0]}</div>
      <div className="uinfo">
        <div className="uname-line">
          <span className="uname">{u.name || '(이름 없음)'}</span>
          {u.role === 'super_admin' && <span className="badge badge-accent">SUPER ADMIN</span>}
          {u.role === 'admin' && <span className="badge badge-info">ADMIN</span>}
          <span className="uemail">{u.email}</span>
        </div>
        {stats && <div className="ustat"><span>해결 {fmtNum(stats.resolved_count)}건</span><span>담당중 {fmtNum(stats.assigned_count)}건</span></div>}
        <div className="utags">
          {assignedCodes.map(c => (
            <span key={c} className="tag-cat blue">{c} <span style={{marginLeft:4, cursor:'pointer', color:'var(--fg-faint)'}} onClick={() => removeSubject(c)}>×</span></span>
          ))}
          {adding ? (
            <select autoFocus className="field-input" style={{padding:'2px 6px', fontSize:11, height:22}} onChange={e => e.target.value && addSubject(e.target.value)} onBlur={() => setAdding(false)}>
              <option value="">+ 시험 선택</option>
              {subjects.filter(s => !assignedCodes.includes(s.code)).map(s => <option key={s.code} value={s.code}>{s.code}</option>)}
            </select>
          ) : (
            <button type="button" className="tag-cat" style={{borderStyle:'dashed', cursor:'pointer'}} onClick={() => setAdding(true)}>+ 시험 배정</button>
          )}
        </div>
      </div>
      {u.role !== 'super_admin' && <button className="btn btn-sm btn-danger" onClick={onRevoke}>해제</button>}
    </div>
  );
}

/* ─── Audit Log ─── */
function AuditLog() {
  const [action, setAction] = useState(null);
  const log = useAsync(() => rpc('admin_get_audit_log', { p_limit: 100, p_action: action }), [action]);
  const actions = [
    { key: null, label: '전체' },
    { key: 'resolve_report', label: '신고 해결' },
    { key: 'bulk_resolve_reports', label: '일괄 해결' },
    { key: 'create_announcement', label: '공지 작성' },
    { key: 'update_app_version', label: '앱 버전' },
    { key: 'grant_entitlement', label: '구독 부여' },
    { key: 'revoke_entitlement', label: '구독 해지' },
    { key: 'approve_user', label: '관리자 승인' },
    { key: 'update_question', label: '문항 수정' },
    { key: 'apply_explanation_draft', label: '해설 변경안 반영' },
  ];
  return (
    <>
      <div className="toolbar">
        {actions.map(a => (
          <div key={a.key || 'all'} className={"filter-chip " + (action === a.key ? 'active' : '')} onClick={() => setAction(a.key)}>{a.label}</div>
        ))}
        <div style={{flex:1}}/>
        <button className="icon-btn" onClick={log.refetch}><Icon name="refresh"/></button>
      </div>
      <div className="panel">
        <div className="panel-body flush feed">
          {log.loading ? <Loader/> : log.error ? <ErrorBox error={log.error} retry={log.refetch}/> :
            (log.data || []).length === 0 ? <EmptyState icon="log" title="로그 없음"/> :
            (log.data || []).map((a, i) => (
              <div key={a.id || i} className="feed-item">
                <div className="feed-av" style={{background:'var(--surface-3)', color:'var(--fg-muted)'}}>{(a.admin_name || a.admin_email || '?')[0]}</div>
                <div className="feed-text">
                  <strong>{a.admin_name || a.admin_email?.split('@')[0] || '?'}</strong>{' '}
                  <span className="action">{actionLabel(a.action)}</span>{' '}
                  <span className="target">{a.target_label || a.target_type + ' ' + (a.target_id || '').toString().slice(0,8)}</span>
                </div>
                <div className="feed-time">{relativeTime(a.created_at)}</div>
              </div>
            ))
          }
        </div>
      </div>
    </>
  );
}

/* ─── Settings ─── */
function Settings({ admin, pushToast }) {
  const [pw, setPw] = useState(''); const [pw2, setPw2] = useState(''); const [busy, setBusy] = useState(false);
  const changePw = async () => {
    if (pw.length < 6) return pushToast('6자 이상', 'info');
    if (pw !== pw2) return pushToast('비밀번호 불일치', 'info');
    setBusy(true);
    try { const { error } = await sb.auth.updateUser({ password: pw }); if (error) throw error; pushToast('비밀번호 변경됨'); setPw(''); setPw2(''); } catch (e) { pushToast(e.message, 'info'); } finally { setBusy(false); }
  };
  return (
    <>
      <div className="panel" style={{maxWidth:520}}>
        <div className="panel-head"><div><div className="panel-title">프로필</div><div className="panel-sub">내 계정 정보</div></div></div>
        <div className="panel-body">
          <div style={{display:'flex', gap:14, alignItems:'center', marginBottom:8}}>
            <div style={{width:56, height:56, borderRadius:'50%', background:'linear-gradient(135deg, var(--violet), var(--pink))', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:600, fontSize:20}}>{(admin.name || admin.email || '?')[0]}</div>
            <div>
              <div style={{fontSize:15, fontWeight:600}}>{admin.name || '(이름 없음)'} {admin.role === 'super_admin' && <span className="badge badge-violet">SUPER ADMIN</span>}</div>
              <div style={{fontSize:12, color:'var(--fg-subtle)', fontFamily:'var(--font-mono)'}}>{admin.email}</div>
            </div>
          </div>
        </div>
      </div>
      <div className="panel" style={{maxWidth:520}}>
        <div className="panel-head"><div><div className="panel-title">비밀번호 변경</div><div className="panel-sub">6자 이상</div></div></div>
        <div className="panel-body">
          <div className="field-label">새 비밀번호</div>
          <input type="password" className="field-input" style={{width:'100%', marginBottom:10}} value={pw} onChange={e=>setPw(e.target.value)}/>
          <div className="field-label">확인</div>
          <input type="password" className="field-input" style={{width:'100%', marginBottom:12}} value={pw2} onChange={e=>setPw2(e.target.value)}/>
          <button className="btn btn-primary btn-sm" onClick={changePw} disabled={busy}>{busy ? '변경 중...' : '비밀번호 변경'}</button>
        </div>
      </div>
    </>
  );
}

/* ─── Command Palette ─── */
function CommandPalette({ onClose, setSection }) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const groups = [
    { name: '페이지로 이동', items: [
      { label: '개요', icon:'home', action: () => setSection('overview') },
      { label: '분석', icon:'chart', action: () => setSection('analytics') },
      { label: '신고 관리', icon:'flag', action: () => setSection('reports') },
      { label: '문제 전수조사', icon:'edit', action: () => setSection('question-inspector') },
      { label: '해설 변경안', icon:'edit', action: () => setSection('explanation-drafts') },
      { label: '개념노트 편집', icon:'book', action: () => setSection('concept-inspector') },
      { label: '공지 · 업데이트', icon:'megaphone', action: () => setSection('announcements') },
      { label: '구독 관리', icon:'users', action: () => setSection('subscriptions') },
      { label: '시험 과목', icon:'book', action: () => setSection('subjects') },
      { label: '앱 버전', icon:'phone', action: () => setSection('app-version') },
      { label: '관리자 관리', icon:'users', action: () => setSection('admins') },
      { label: '감사 로그', icon:'log', action: () => setSection('audit-log') },
      { label: '설정', icon:'settings', action: () => setSection('settings') },
    ]},
  ];
  const filtered = groups.map(g => ({ ...g, items: g.items.filter(it => it.label.toLowerCase().includes(q.toLowerCase())) })).filter(g => g.items.length);
  const flat = filtered.flatMap(g => g.items);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(s+1, flat.length-1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(s-1, 0)); }
      else if (e.key === 'Enter') { e.preventDefault(); flat[sel]?.action(); onClose(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [flat, sel, onClose]);

  let idx = -1;
  return (
    <div className="palette-backdrop" onClick={onClose}>
      <div className="palette" onClick={e=>e.stopPropagation()}>
        <input ref={inputRef} className="palette-input" placeholder="명령 검색, 이동, 빠른 작업..." value={q} onChange={e=>{setQ(e.target.value); setSel(0);}}/>
        <div className="palette-list">
          {filtered.length === 0 && <div style={{padding:'24px', textAlign:'center', color:'var(--fg-faint)', fontSize:12}}>결과 없음</div>}
          {filtered.map(g => (
            <div key={g.name}>
              <div className="palette-section">{g.name}</div>
              {g.items.map(it => {
                idx++; const i = idx;
                return (
                  <div key={i} className={"palette-item " + (i === sel ? 'selected' : '')} onMouseEnter={() => setSel(i)} onClick={() => { it.action(); onClose(); }}>
                    <Icon name={it.icon} size={14} className="p-ic"/><span>{it.label}</span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <div className="palette-foot">
          <span><span className="kbd">↑↓</span>이동</span>
          <span><span className="kbd">↵</span>선택</span>
          <span><span className="kbd">ESC</span>닫기</span>
        </div>
      </div>
    </div>
  );
}

function ShortcutsModal({ onClose }) {
  const shortcuts = [
    ['명령 팔레트', ['⌘', 'K']], ['단축키 도움말', ['?']],
    ['개요로 이동', ['G', 'O']], ['분석으로 이동', ['G', 'A']],
    ['신고 관리로 이동', ['G', 'R']], ['문제 전수조사로 이동', ['G', 'I']],
    ['개념노트 편집으로 이동', ['G', 'C']],
    ['공지사항으로 이동', ['G', 'N']],
    ['감사 로그로 이동', ['G', 'U']], ['설정으로 이동', ['G', 'S']],
    ['모달/패널 닫기', ['ESC']],
  ];
  return (
    <div className="palette-backdrop" onClick={onClose}>
      <div className="palette" style={{maxWidth:440}} onClick={e=>e.stopPropagation()}>
        <div style={{padding:'16px 18px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
          <div><div style={{fontSize:14, fontWeight:600}}>키보드 단축키</div><div style={{fontSize:11, color:'var(--fg-subtle)', fontFamily:'var(--font-mono)', marginTop:2}}>팀이 더 빠르게 일할 수 있도록</div></div>
          <button onClick={onClose} style={{color:'var(--fg-subtle)', padding:4}}><Icon name="x" size={16}/></button>
        </div>
        <div className="shortcut-list">
          {shortcuts.map(([label, keys]) => (
            <div key={label} className="shortcut"><span>{label}</span><span className="keys">{keys.map((k, i) => <span key={i} className="k">{k}</span>)}</span></div>
          ))}
        </div>
      </div>
    </div>
  );
}

function NotifPanel({ onClose, onBadgeChange }) {
  const list = useAsync(() => rpc('admin_get_notifications', { p_limit: 20 }));
  useEffect(() => {
    const h = (e) => { if (!e.target.closest('.notif-panel')) onClose(); };
    setTimeout(() => document.addEventListener('click', h), 0);
    return () => document.removeEventListener('click', h);
  }, [onClose]);
  useEffect(() => {
    if (list.data) onBadgeChange?.((list.data || []).filter(n => !n.read_at).length);
  }, [list.data]);

  const markAll = async () => { try { await rpc('admin_mark_all_notifications_read'); list.refetch(); } catch (e) {} };
  const markOne = async (id) => { try { await rpc('admin_mark_notification_read', { p_id: id }); list.refetch(); } catch (e) {} };

  return (
    <div className="notif-panel" onClick={e => e.stopPropagation()}>
      <div className="notif-head">
        <div className="notif-head-title">알림</div>
        <button className="btn btn-xs" onClick={markAll}>모두 읽음</button>
      </div>
      <div className="notif-list">
        {list.loading ? <Loader/> : list.error ? <ErrorBox error={list.error} retry={list.refetch}/> :
          (list.data || []).length === 0 ? <EmptyState icon="bell" title="알림이 없습니다"/> :
          (list.data || []).map(n => {
            const icMap = { new_report: ['🚩','var(--warning-soft)'], pending_admin_signup: ['👤','var(--accent-soft)'], report_escalated: ['⚠️','var(--danger-soft)'] };
            const [ic, bg] = icMap[n.type] || ['🔔','var(--surface-2)'];
            return (
              <div key={n.id} className={"notif-item " + (!n.read_at ? 'unread' : '')} onClick={() => markOne(n.id)}>
                <div className="notif-av" style={{background: bg}}>{ic}</div>
                <div className="notif-text">
                  <div><strong>{n.title}</strong></div>
                  {n.body && <div style={{color:'var(--fg-muted)', marginTop:2}}>{n.body}</div>}
                  <div className="notif-time">{relativeTime(n.created_at)}</div>
                </div>
              </div>
            );
          })
        }
      </div>
    </div>
  );
}

export {
  Overview, Analytics, Reports, QuestionInspector, ExplanationDrafts, ConceptInspector, Announcements, Subjects,
  Exams, ExamDates, AppVersion, Subscriptions, Admins, AuditLog, Settings,
  CommandPalette, ShortcutsModal, NotifPanel,
  QuestionBlock, ReportItem, buildGeminiPrompt, actionLabel,
}
