/* ─── Section components ─── */
import React from 'react'
const { useState, useEffect, useMemo, useRef } = React
import { marked } from 'marked'
import { sb, rpc, Icon, useAsync, relativeTime, fmtNum, Loader, ErrorBox, EmptyState } from './admin-lib.jsx'
import MarkdownEditor from './components/MarkdownEditor.jsx'
import { parseStemGivens } from './lib/stem-givens-parse.js'

marked.setOptions({ gfm: true, breaks: false })

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
    add_subject: '시험 추가:',
    remove_subject: '시험 삭제:',
    update_app_version: '앱 버전 설정:',
    update_question: '문항 수정:',
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
  const reports = useAsync(() => rpc('admin_get_reports'), [subjectCode]);
  const savedViews = useAsync(() => rpc('admin_get_saved_views', { p_scope: 'reports' }));

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

function ReportItem({ r, open, onToggle, selected, onSelect, onChanged, pushToast }) {
  const [editing, setEditing] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [replyText, setReplyText] = useState('');
  const q = r.question || {
    id: r.question_id,
    stem: r.q_stem,
    choices: r.q_choices,
    correct_index: r.q_correct_answer ? 'ABCDE'.indexOf(r.q_correct_answer) : 0,
    explanation: r.q_explanation,
    year_session: r.year_session,
    question_number: r.question_number,
  };
  const choices = Array.isArray(q.choices) ? q.choices : (q.choices?.options || []);

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
              <QuestionBlock q={q} editing={editing} setEditing={setEditing} onSaved={() => { setEditing(false); onChanged(); pushToast('문항이 수정되었습니다'); }} pushToast={pushToast}/>
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
    return {
      label: boxed ? label : '',
      boxed,
      _box_type: boxed ? (label.trim() ? 'view' : 'simple') : 'plain',
      markdown_enabled: !!b?.markdown_enabled,
      items: Array.isArray(b?.items)
        ? b.items.map(it => ({ key: String(it?.key ?? ''), text: String(it?.text ?? '') }))
        : [],
    };
  });
}

// Returns { payload } (bare Box[] or null) or { error } if validation fails.
function serializeGivens(boxes) {
  const out = [];
  for (const b of boxes) {
    const items = (b.items || [])
      .map(it => ({ key: (it.key || '').trim(), text: (it.text || '').trim() }))
      .filter(it => it.key !== '' || it.text !== '');
    if (items.length === 0) continue;
    if (items.some(it => it.key === '' || it.text === '')) {
      return { error: '보기 항목의 키와 내용을 모두 입력하세요.' };
    }
    const boxType = givenBoxType(b);
    const boxed = boxType !== 'plain';
    const label = boxType === 'view' ? ((b.label || '').trim() || '보기') : '';
    out.push({ label, markdown_enabled: !!b.markdown_enabled, boxed, items });
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
    return { label: '', boxed: true, _box_type: 'simple', markdown_enabled: false, items: [{ key: '', text: '' }] };
  }
  if (type === 'markdown') {
    return { label: '', boxed: true, _box_type: 'simple', markdown_enabled: true, items: [{ key: '', text: '' }] };
  }
  return { label: '보기', boxed: true, _box_type: 'view', markdown_enabled: false, items: [{ key: '', text: '' }] };
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

function QuestionBlock({ q, editing, setEditing, onSaved, pushToast }) {
  const [stem, setStem] = useState(q.stem || '');
  const [choices, setChoices] = useState(() => {
    const cs = Array.isArray(q.choices) ? q.choices : (q.choices?.options || []);
    return cs.map((c, i) => typeof c === 'string' ? { text: c } : c);
  });
  const [correct, setCorrect] = useState(q.correct_index ?? 0);
  const [explanation, setExplanation] = useState(q.explanation || '');
  const [busy, setBusy] = useState(false);
  // Inspection RPC returns stem_givens (so it's defined here); the Reports path does not
  // (q built from report fields → undefined). Only enable the givens editor + v2 RPC when loaded.
  const hasGivensField = q.stem_givens !== undefined;
  const [boxes, setBoxes] = useState(() => normalizeGivens(q.stem_givens));
  const [legacyImportHidden, setLegacyImportHidden] = useState(false);
  const legacyGivens = useMemo(() => {
    if (!hasGivensField || q.stem_givens !== null) return [];
    return parseStemGivens(stem);
  }, [hasGivensField, q.stem_givens, stem]);
  const showLegacyImport = hasGivensField && q.stem_givens === null && !legacyImportHidden && legacyGivens.length > 0;

  useEffect(() => {
    setLegacyImportHidden(false);
  }, [q.id]);

  const updateBox  = (bi, fn) => setBoxes(bs => bs.map((b, i) => i === bi ? fn(b) : b));
  const updateItem = (bi, ii, fn) => updateBox(bi, b => ({ ...b, items: b.items.map((x, j) => j === ii ? fn(x) : x) }));
  const addBox     = (type) => setBoxes(bs => [...bs, createGivenBox(type)]);
  const addItem    = (bi) => updateBox(bi, b => ({ ...b, items: [...(b.items || []), { key: '', text: '' }] }));
  const removeItem = (bi, ii) => updateBox(bi, b => ({ ...b, items: b.items.filter((_, j) => j !== ii) }));
  const removeBox  = (bi) => setBoxes(bs => bs.filter((_, i) => i !== bi));
  const moveBox    = (bi, dir) => setBoxes(bs => {
    const j = bi + dir; if (j < 0 || j >= bs.length) return bs;
    const c = [...bs]; [c[bi], c[j]] = [c[j], c[bi]]; return c;
  });
  const importLegacyGivens = () => {
    setBoxes(normalizeGivens(legacyGivens));
    setLegacyImportHidden(true);
    pushToast?.('감지된 보기를 편집 영역에 채웠습니다. 저장을 눌러 반영하세요.', 'info');
  };

  const save = async () => {
    setBusy(true);
    try {
      const p_choices = choices.map(c => c.text ? c : { text: String(c) });
      const p_correct_answer = String.fromCharCode(65 + correct);
      if (hasGivensField) {
        const { payload, error } = serializeGivens(boxes);
        if (error) { pushToast(error, 'info'); return; }
        await rpc('admin_update_question_v2', {
          p_id: q.id, p_stem: stem, p_stem_givens: payload,
          p_choices, p_correct_answer, p_explanation: explanation,
        });
      } else {
        await rpc('admin_update_question', {
          p_id: q.id, p_stem: stem, p_choices, p_correct_answer, p_explanation: explanation,
        });
      }
      onSaved();
    } catch (e) { pushToast(e.message, 'info'); }
    finally { setBusy(false); }
  };

  if (editing) {
    return (
      <div className="q-box">
        <textarea value={stem} onChange={e=>setStem(e.target.value)} style={{marginBottom:14, minHeight:150}}/>
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
              return (
                <div key={bi} style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', marginBottom: 8, background: 'var(--surface)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>
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
                        <input className="field-input" style={{ width: 58, padding: '7px 6px', textAlign: 'center', fontSize: 13 }} placeholder="ㄱ, ㉠ …"
                          value={it.key} onChange={e => updateItem(bi, ii, x => ({ ...x, key: e.target.value }))} />
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
        <div style={{display:'flex', flexDirection:'column', gap:8, marginBottom:14}}>
          {choices.map((c, i) => (
            <div key={i} style={{display:'flex', gap:10, alignItems:'center'}}>
              <input type="radio" name="correct-q" checked={correct === i} onChange={() => setCorrect(i)}/>
              <input className="field-input" style={{flex:1, padding:'9px 11px', fontSize:14}} value={c.text || ''} onChange={e => setChoices(cs => cs.map((x, j) => j === i ? { ...x, text: e.target.value } : x))}/>
            </div>
          ))}
        </div>
        <div className="field-label">해설</div>
        <textarea value={explanation} onChange={e=>setExplanation(e.target.value)} style={{minHeight:220}}/>
        <div style={{display:'flex', gap:6, justifyContent:'flex-end', marginTop:10}}>
          <button className="btn btn-sm" onClick={() => setEditing(false)}>취소</button>
          <button className="btn btn-sm btn-primary" onClick={save} disabled={busy}>{busy ? '저장 중...' : '저장'}</button>
        </div>
      </div>
    );
  }
  return (
    <div className="q-box">
      <button className="btn btn-xs q-edit" onClick={() => setEditing(true)}><Icon name="edit" size={10}/> 편집</button>
      <div className="q-stem">{q.stem}</div>
      {Array.isArray(q.stem_givens) && q.stem_givens.length > 0 && (
        <div style={{ margin: '8px 0 14px' }}>
          {q.stem_givens.map((box, bi) => {
            const { boxed, label } = givenPreviewBoxMeta(box);
            return (
              <div key={bi} style={boxed ? { border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '10px 12px', marginBottom: 6, background: 'var(--surface-2)' } : { padding: '2px 0', marginBottom: 6 }}>
                {label && <div style={{ fontSize: 11, color: 'var(--fg-subtle)', fontFamily: 'var(--font-mono)', marginBottom: 6 }}>〈{label}〉</div>}
                {(box.items || []).map((it, ii) => (
                  <div key={ii} style={{ display: 'grid', gridTemplateColumns: '40px minmax(0, 1fr)', gap: 8, alignItems: 'start', fontSize: 14, lineHeight: 1.7 }}>
                    <b>{it.key}.</b>
                    <GivenPreviewText text={it.text} markdown={!!box.markdown_enabled} />
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
      <ul className="choices-list">
        {choices.map((c, i) => {
          const text = typeof c === 'string' ? c : (c.text || '');
          return (
            <li key={i} className={"choice-item " + (i === (q.correct_index ?? -1) ? 'correct' : '')}>
              <span className="choice-id">{String.fromCharCode(65 + i)}.</span> {text}
              {i === (q.correct_index ?? -1) && <span style={{marginLeft:'auto', fontSize:10}}>정답</span>}
            </li>
          );
        })}
      </ul>
      {q.explanation && <div className="exp-box">{q.explanation}</div>}
    </div>
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
  const [yearSession, setYearSession] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsCode, setSettingsCode] = useState(null);
  const [activeTabPerCard, setActiveTabPerCard] = useState({});

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
    setSubjectCode(null);
    setSettingsCode(null);
    setYearSession(null);
    setOpenId(null);
    setActiveTabPerCard({});
  }, [currentExamId]);

  useEffect(() => {
    setYearSession(null);
    setOpenId(null);
    setActiveTabPerCard({});
  }, [selectedSubjectId]);

  useEffect(() => {
    if (!sessions.data || sessions.data.length === 0) return;
    const hasCurrent = sessions.data.some(s => Number(s.year_session) === Number(yearSession));
    if (!yearSession || !hasCurrent) {
      setYearSession(sessions.data[0].year_session);
    }
  }, [sessions.data, yearSession]);

  const setCardTab = (questionId, tab) => {
    setActiveTabPerCard(m => ({ ...m, [questionId]: tab }));
  };

  const handleExamSelect = (code) => {
    if (code === examCode) return;
    setExamCode(code);
    setSubjectCode(null);
    setSettingsCode(null);
    setYearSession(null);
    setOpenId(null);
    setActiveTabPerCard({});
  };

  const handleSubjectSelect = (code) => {
    setSubjectCode(code);
    setYearSession(null);
    setOpenId(null);
    setActiveTabPerCard({});
    setSettingsCode(c => c || code);
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
          onChange={e => { setYearSession(e.target.value ? Number(e.target.value) : null); setOpenId(null); }}
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
              onToggle={() => setOpenId(openId === q.id ? null : q.id)}
              activeTab={activeTabPerCard[q.id] || 'edit'}
              setActiveTab={(tab) => setCardTab(q.id, tab)}
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

function QuestionInspectionItem({ question, subject, exam, open, onToggle, activeTab, setActiveTab, onChanged, pushToast }) {
  const [editing, setEditing] = useState(false);
  const q = normalizeInspectionQuestion(question);
  const choices = questionChoices(q);
  const correctIdx = 'ABCDE'.indexOf(q.correct_answer || '');
  const status = q.check_status || 'unchecked';
  const statusMeta = {
    unchecked: ['badge-neutral', '미검수', 'var(--fg-faint)'],
    checked: ['badge-success', '검수 완료', 'var(--success)'],
    stale: ['badge-warning', '재검수', 'var(--warning)'],
  }[status] || ['badge-neutral', status, 'var(--fg-faint)'];

  const copyGeminiPrompt = async () => {
    const text = buildGeminiPrompt(subject, q);
    try {
      await navigator.clipboard.writeText(text);
      pushToast('🤖 Gemini 프롬프트 복사됨');
    } catch (e) {
      fallbackCopyText(text);
      pushToast('🤖 Gemini 프롬프트 복사됨');
    }
  };

  const toggleCheck = async () => {
    const isChecked = q.check_status !== 'unchecked';
    try {
      if (isChecked) {
        await rpc('admin_unmark_question_checked', { p_question_id: q.id });
        pushToast('검수 해제됨');
      } else {
        await rpc('admin_mark_question_checked', { p_question_id: q.id });
        pushToast('검수 완료');
      }
      onChanged();
    } catch (e) { pushToast(e.message, 'info'); }
  };

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
          <div className="qi-tabs">
            <div className={"qi-tab " + (activeTab === 'edit' ? 'active' : '')} onClick={() => setActiveTab('edit')}>편집</div>
            <div className={"qi-tab " + (activeTab === 'preview' ? 'active' : '')} onClick={() => setActiveTab('preview')}>미리보기</div>
          </div>

          {activeTab === 'edit' ? (
            <QuestionBlock
              q={q}
              editing={editing}
              setEditing={setEditing}
              onSaved={() => { setEditing(false); onChanged(); pushToast('문항이 수정되었습니다'); }}
              pushToast={pushToast}
            />
          ) : (
            <div className="q-box">
              <div className="q-stem">{q.stem}</div>
              <ul className="choices-list">
                {choices.map((c, i) => {
                  const text = typeof c === 'string' ? c : (c.text || '');
                  return (
                    <li key={i} className={"choice-item " + (i === correctIdx ? 'correct' : '')}>
                      <span className="choice-id">{'①②③④⑤'[i]}</span> {text}
                      {i === correctIdx && <span style={{marginLeft:'auto', fontSize:10}}>정답</span>}
                    </li>
                  );
                })}
              </ul>
              {q.explanation && <div className="exp-box">{q.explanation}</div>}
              <div className="qi-actions">
                <button className="btn btn-sm btn-gemini" onClick={copyGeminiPrompt}>🤖 Gemini에 보내기</button>
                <button className="btn btn-sm" onClick={() => { downloadMd(subject, q, exam); pushToast('.md 다운로드 생성됨'); }}>💾 .md 다운로드</button>
                <button className={"btn btn-sm " + (status === 'unchecked' ? 'btn-success' : '')} onClick={toggleCheck}>
                  {status === 'unchecked' ? '✓ 검수 완료' : '검수 해제'}
                </button>
              </div>
            </div>
          )}
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
    { key: 'approve_user', label: '관리자 승인' },
    { key: 'update_question', label: '문항 수정' },
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
      { label: '공지 · 업데이트', icon:'megaphone', action: () => setSection('announcements') },
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
  Overview, Analytics, Reports, QuestionInspector, Announcements, Subjects,
  Exams, ExamDates, AppVersion, Admins, AuditLog, Settings,
  CommandPalette, ShortcutsModal, NotifPanel,
  actionLabel,
}
