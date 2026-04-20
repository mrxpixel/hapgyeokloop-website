/* ─── Section components ─── */

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
    { label: 'DAU', value: fmtNum(k.dau), sub: 'WAU ' + fmtNum(k.wau) + ' · MAU ' + fmtNum(k.mau), soft: 'var(--accent-soft)', stroke: 'var(--accent)' },
    { label: '7일 신규', value: fmtNum(k.new_users_7d), sub: '30일 ' + fmtNum(k.new_users_30d), soft: 'var(--violet-soft)', stroke: 'var(--violet)' },
    { label: '스티키니스', value: (k.stickiness_pct ?? 0) + '%', sub: 'DAU / MAU', soft: 'var(--cyan-soft)', stroke: 'var(--cyan)' },
    { label: '유료 비중', value: (k.paid_ratio_pct ?? 0) + '%', sub: fmtNum(k.paid_users) + ' / ' + fmtNum(k.total_profiles), soft: 'var(--success-soft)', stroke: 'var(--success)' },
  ];

  return (
    <>
      <div className="kpi-grid">
        {kpis.map(kpi => (
          <div key={kpi.label} className="kpi">
            <div className="kpi-label">{kpi.label}</div>
            <div className="kpi-value">{kpi.value}</div>
            <div className="kpi-delta"><span style={{color:'var(--fg-subtle)'}}>{kpi.sub}</span></div>
          </div>
        ))}
      </div>

      <div className="grid-2">
        <div className="panel">
          <div className="panel-head">
            <div><div className="panel-title">일별 신규 가입</div><div className="panel-sub">최근 30일</div></div>
            <button className="btn btn-xs" onClick={() => goto('analytics')}>분석 보기 →</button>
          </div>
          <div className="panel-body" style={{padding:'0 8px 8px'}}>
            <BarChart data={signups.map(s => ({ date: Date.parse(s.date), value: s.count || 0 }))} color="var(--violet)"/>
          </div>
        </div>
        <div className="panel">
          <div className="panel-head"><div><div className="panel-title">빠른 작업</div><div className="panel-sub">자주 하는 업무</div></div></div>
          <div className="panel-body" style={{display:'grid', gap:8}}>
            <QuickAction icon="flag" color="warning" title="신고 관리" sub="대기·처리중 검토" onClick={() => goto('reports')}/>
            <QuickAction icon="user" color="violet" title="관리자 승인 대기 확인" sub="가입 신청 검토" onClick={() => goto('admins')}/>
            <QuickAction icon="megaphone" color="info" title="공지사항 작성" sub="앱에 바로 발행" onClick={() => goto('announcements')}/>
            <QuickAction icon="phone" color="danger" title="앱 버전 설정" sub="force_update 주의" onClick={() => goto('app-version')}/>
          </div>
        </div>
      </div>

      <div className="grid-2">
        <div className="panel">
          <div className="panel-head">
            <div><div className="panel-title">최근 활동</div><div className="panel-sub">팀 전체 감사 로그</div></div>
            <button className="btn btn-xs" onClick={() => goto('audit-log')}>전체 →</button>
          </div>
          <div className="panel-body flush feed">
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
        <div className="panel">
          <div className="panel-head"><div><div className="panel-title">과목별 활동</div><div className="panel-sub">30일 리뷰 수</div></div></div>
          <div className="panel-body" style={{display:'flex', flexDirection:'column', gap:10}}>
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
                    <div style={{height:'100%', width:((s.review_count || 0)/max*100)+'%', background:'linear-gradient(90deg, var(--accent), var(--cyan))', borderRadius:3}}/>
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
  const map = { warning: ['var(--warning-soft)','var(--warning)'], info: ['var(--accent-soft)','var(--accent)'], violet: ['var(--violet-soft)','var(--violet)'], danger: ['var(--danger-soft)','var(--danger)'] };
  const [bg, fg] = map[color];
  return (
    <div onClick={onClick} style={{padding:'10px 12px', background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:'var(--r-sm)', display:'flex', gap:10, alignItems:'center', cursor:'pointer'}}>
      <div style={{width:32, height:32, borderRadius:8, background:bg, color:fg, display:'flex', alignItems:'center', justifyContent:'center'}}><Icon name={icon} size={15}/></div>
      <div style={{flex:1, minWidth:0}}>
        <div style={{fontSize:12.5, fontWeight:500, marginBottom:2}}>{title}</div>
        <div style={{fontSize:10.5, color:'var(--fg-subtle)', fontFamily:'var(--font-mono)'}}>{sub}</div>
      </div>
      <span style={{color:'var(--fg-faint)'}}>→</span>
    </div>
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
          <div key={k} className={"filter-chip " + (filter === k ? 'active' : '')} onClick={() => setFilter(k)}>{label}</div>
        ))}
        <div style={{width:6}}/>
        <select className="field-input" style={{padding:'5px 8px', fontSize:12}} value={subjectCode || ''} onChange={e => setSubjectCode(e.target.value || null)}>
          <option value="">전체 시험</option>
          {(subjects.data || []).map(s => <option key={s.code} value={s.code}>{s.code}</option>)}
        </select>
        <div style={{width:6}}/>
        {(savedViews.data || []).map(v => (
          <div key={v.id} className="saved-view" onClick={() => applySavedView(v)} onContextMenu={(e) => { e.preventDefault(); deleteSavedView(v.id, v.name); }} title="우클릭으로 삭제">
            <span className="pin">📌</span>{v.name}
          </div>
        ))}
        <div className="saved-view" onClick={saveCurrentView} style={{borderStyle:'dashed', color:'var(--fg-subtle)'}}>+ 뷰 저장</div>
        <div style={{flex:1}}/>
        <input className="search-input" placeholder="검색..." value={search} onChange={e => setSearch(e.target.value)}/>
        <button className="icon-btn" onClick={reports.refetch} title="새로고침"><Icon name="refresh"/></button>
      </div>

      {selected.size > 0 && (
        <div className="bulk-bar">
          <span className="cnt">{selected.size}개 선택됨</span>
          <button className="btn btn-sm" onClick={selectAllVisible}>{selected.size === filtered.length ? '전체 해제' : '화면 전체 선택'}</button>
          <button className="btn btn-sm" onClick={bulkAssign}><Icon name="user" size={12}/> 내가 담당</button>
          <button className="btn btn-sm btn-success" onClick={bulkResolve}><Icon name="check" size={12}/> 일괄 해결</button>
          <div className="spacer"/>
          <button className="btn btn-sm" onClick={() => setSelected(new Set())}>취소</button>
        </div>
      )}

      {reports.loading ? <Loader/> : reports.error ? <ErrorBox error={reports.error} retry={reports.refetch}/> :
        filtered.length === 0 ? <EmptyState icon="flag" title="신고가 없습니다" sub="현재 필터에 맞는 신고가 없어요."/> :
        <div className="item-list">
          {filtered.map(r => (
            <ReportItem key={r.report_id} r={r} open={openId === r.report_id} onToggle={() => setOpenId(openId === r.report_id ? null : r.report_id)}
              selected={selected.has(r.report_id)} onSelect={() => toggleSelect(r.report_id)}
              onChanged={() => { reports.refetch(); }} pushToast={pushToast}/>
          ))}
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
    <div className={"item " + (open ? 'open' : '') + (selected ? ' selected' : '')}>
      <div className="item-head">
        <div className={"item-check " + (selected ? 'checked' : '')} onClick={(e) => { e.stopPropagation(); onSelect(); }}>
          {selected && <Icon name="check" size={10}/>}
        </div>
        <div className="dot" style={{background: r.status === 'pending' ? 'var(--warning)' : r.status === 'in_progress' ? 'var(--cyan)' : 'var(--success)'}}/>
        <div className="item-meta" onClick={onToggle}>
          <div className="item-title">{r.reason || '신고'}</div>
          <div className="item-sub">
            <span style={{color:'var(--accent)'}}>{shortSubject(r.subject_id)}</span> · {r.year_session || q.year_session || '—'} · #{r.question_number || q.question_number || '—'} · {r.user_id ? (r.user_id + '').slice(0,8) : '익명'}
          </div>
        </div>
        <div className="item-right">
          {r.assigned_name && <span className="badge badge-cyan">{r.assigned_name}</span>}
          {r.status === 'pending' && <span className="badge badge-warning">PENDING</span>}
          {r.status === 'in_progress' && <span className="badge badge-cyan">IN PROGRESS</span>}
          {r.status === 'resolved' && <span className="badge badge-success">RESOLVED</span>}
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
              <textarea
                className="field-input"
                style={{width:'100%', minHeight:72, marginTop:6, fontSize:13}}
                value={replyText}
                onChange={e => setReplyText(e.target.value)}
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
            {r.status !== 'resolved' && !resolving && <button className="btn btn-sm btn-success" onClick={() => setResolving(true)}><Icon name="check" size={12}/> 해결 처리</button>}
            {r.status !== 'resolved' && resolving && <>
              <button className="btn btn-sm btn-success" onClick={resolve}><Icon name="check" size={12}/> 처리 완료</button>
              <button className="btn btn-sm" onClick={() => { setResolving(false); setReplyText(''); }}>취소</button>
            </>}
            {r.status === 'resolved' && <button className="btn btn-sm" onClick={reopen}>재오픈</button>}
          </div>
        </div>
      )}
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

  const save = async () => {
    setBusy(true);
    try {
      await rpc('admin_update_question', {
        p_id: q.id,
        p_stem: stem,
        p_choices: choices.map(c => c.text ? c : { text: String(c) }),
        p_correct_answer: String.fromCharCode(65 + correct),
        p_explanation: explanation,
      });
      onSaved();
    } catch (e) { pushToast(e.message, 'info'); }
    finally { setBusy(false); }
  };

  if (editing) {
    return (
      <div className="q-box">
        <textarea value={stem} onChange={e=>setStem(e.target.value)} style={{marginBottom:10, minHeight:54}}/>
        <div style={{display:'flex', flexDirection:'column', gap:5, marginBottom:10}}>
          {choices.map((c, i) => (
            <div key={i} style={{display:'flex', gap:7, alignItems:'center'}}>
              <input type="radio" name="correct-q" checked={correct === i} onChange={() => setCorrect(i)}/>
              <input className="field-input" style={{flex:1, padding:'5px 8px', fontSize:12}} value={c.text || ''} onChange={e => setChoices(cs => cs.map((x, j) => j === i ? { ...x, text: e.target.value } : x))}/>
            </div>
          ))}
        </div>
        <div className="field-label">해설</div>
        <textarea value={explanation} onChange={e=>setExplanation(e.target.value)} style={{minHeight:160}}/>
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
      <div className="panel">
        <div className="panel-head"><div><div className="panel-title">새 공지사항 작성</div><div className="panel-sub">작성 후 초안 저장 또는 바로 발행</div></div></div>
        <div className="ann-form">
          <div className="ann-left">
            <div><div className="field-label">제목</div><input className="field-input" style={{width:'100%'}} value={title} onChange={e=>setTitle(e.target.value)}/></div>
            <div><div className="field-label">내용</div><textarea placeholder="마크다운 지원" value={body} onChange={e=>setBody(e.target.value)} style={{minHeight:140}}/></div>
          </div>
          <div className="ann-right">
            <div>
              <div className="field-label">유형</div>
              <div className="select-pills">
                <div className={"select-pill " + (tag === 'notice' ? 'active' : '')} onClick={() => setTag('notice')}>공지</div>
                <div className={"select-pill " + (tag === 'update' ? 'active' : '')} onClick={() => setTag('update')}>업데이트</div>
              </div>
            </div>
            <div style={{display:'flex', gap:6, marginTop:'auto'}}>
              <button className="btn" style={{flex:1}} onClick={() => publish(false)} disabled={busy}>초안 저장</button>
              <button className="btn btn-primary" style={{flex:1}} onClick={() => publish(true)} disabled={busy}><Icon name="send" size={12}/> 발행</button>
            </div>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head"><div><div className="panel-title">공지 목록</div><div className="panel-sub">{(list.data || []).length}건</div></div><button className="icon-btn" onClick={list.refetch}><Icon name="refresh"/></button></div>
        <div className="panel-body flush">
          {list.loading ? <Loader/> : list.error ? <ErrorBox error={list.error} retry={list.refetch}/> :
            (list.data || []).length === 0 ? <EmptyState icon="megaphone" title="공지가 없습니다"/> :
            (list.data || []).map(a => (
              <div key={a.id} style={{padding:'14px 18px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:14}}>
                <div style={{flex:1, minWidth:0}}>
                  <div style={{display:'flex', gap:8, alignItems:'center', marginBottom:4, flexWrap:'wrap'}}>
                    <span className={"badge " + (a.type === 'update' ? 'badge-info' : 'badge-violet')}>{(a.type || 'notice').toUpperCase()}</span>
                    {a.is_published ? <span className="badge badge-success">발행됨</span> : <span className="badge badge-neutral">초안</span>}
                    <span style={{fontSize:13, fontWeight:500}}>{a.title}</span>
                  </div>
                  <div style={{fontSize:11.5, color:'var(--fg-subtle)', fontFamily:'var(--font-mono)'}}>{relativeTime(a.created_at)}</div>
                </div>
                <div style={{display:'flex', gap:6}}>
                  <button className="btn btn-xs" onClick={() => togglePub(a)}>{a.is_published ? '내리기' : '발행'}</button>
                  <button className="btn btn-xs btn-danger" onClick={() => del(a)}><Icon name="trash" size={11}/></button>
                </div>
              </div>
            ))
          }
        </div>
      </div>
    </>
  );
}

/* ─── Subjects ─── */
function Subjects({ pushToast }) {
  const subjects = useAsync(() => rpc('admin_get_subjects'));
  const mappings = useAsync(() => rpc('admin_get_subject_mappings', { p_exam_code: null }).catch(() => []));
  const [code, setCode] = useState('');
  const [name, setName] = useState('');

  const add = async () => {
    if (!code || !name) { pushToast('코드와 이름을 입력하세요', 'info'); return; }
    try { await rpc('admin_add_subject', { subject_code: code.toUpperCase(), subject_name: name, subject_desc: null }); setCode(''); setName(''); pushToast('시험 추가됨'); subjects.refetch(); } catch (e) { pushToast(e.message, 'info'); }
  };
  const remove = async (c) => {
    if (!confirm(c + ' 시험을 삭제하시겠습니까?')) return;
    try { await rpc('admin_remove_subject', { subject_code: c }); pushToast('삭제됨'); subjects.refetch(); } catch (e) { pushToast(e.message, 'info'); }
  };

  return (
    <>
      <div className="panel">
        <div className="panel-head"><div><div className="panel-title">시험 추가</div><div className="panel-sub">코드는 대문자 영문</div></div></div>
        <div className="panel-body" style={{display:'flex', gap:8, alignItems:'flex-end', flexWrap:'wrap'}}>
          <div style={{width:140}}><div className="field-label">코드</div><input className="field-input" placeholder="HSK" style={{width:'100%', textTransform:'uppercase'}} value={code} onChange={e => setCode(e.target.value)}/></div>
          <div style={{flex:1, minWidth:180}}><div className="field-label">시험명</div><input className="field-input" placeholder="한국사능력검정시험" style={{width:'100%'}} value={name} onChange={e => setName(e.target.value)}/></div>
          <button className="btn btn-primary" onClick={add}><Icon name="plus" size={12}/> 추가</button>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head"><div><div className="panel-title">등록된 시험</div><div className="panel-sub">{(subjects.data || []).length}개</div></div></div>
        <div className="panel-body">
          {subjects.loading ? <Loader/> : subjects.error ? <ErrorBox error={subjects.error} retry={subjects.refetch}/> :
            <div className="subj-grid">
              {(subjects.data || []).map(s => (
                <div key={s.code} className="subj-card">
                  <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start'}}>
                    <div className="code">{s.code}</div>
                    <button className="btn btn-xs btn-danger" onClick={() => remove(s.code)}><Icon name="trash" size={10}/></button>
                  </div>
                  <div className="nm">{s.name}</div>
                </div>
              ))}
            </div>
          }
        </div>
      </div>
    </>
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
        <div className="panel" style={{borderColor:'var(--warning)'}}>
          <div className="panel-head" style={{background:'var(--warning-soft)'}}>
            <div><div className="panel-title" style={{color:'var(--warning)'}}>승인 대기 {pending.length}명</div><div className="panel-sub">가입 신청 검토</div></div>
          </div>
          <div className="panel-body">
            {pending.map(u => (
              <div key={u.id} className="user-row">
                <div className="user-av" style={{background:'var(--surface-3)', color:'var(--fg-subtle)'}}>{(u.name || u.email || '?')[0]}</div>
                <div className="user-info">
                  <div className="user-name-line"><span className="user-name">{u.name || '(이름 없음)'}</span><span className="user-email">{u.email}</span></div>
                  <div className="user-stat"><span>요청: {relativeTime(u.created_at)}</span></div>
                </div>
                <button className="btn btn-sm btn-danger" onClick={() => reject(u.id)}>거절</button>
                <button className="btn btn-sm btn-success" onClick={() => approve(u.id)}><Icon name="check" size={12}/> 승인</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="panel">
        <div className="panel-head"><div><div className="panel-title">관리자 목록</div><div className="panel-sub">{approved.length}명 활성</div></div></div>
        <div className="panel-body">
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
    <div className="user-row">
      <div className="user-av" style={{background:'linear-gradient(135deg, var(--accent), var(--violet))'}}>{(u.name || u.email || '?')[0]}</div>
      <div className="user-info">
        <div className="user-name-line">
          <span className="user-name">{u.name || '(이름 없음)'}</span>
          {u.role === 'super_admin' && <span className="badge badge-violet">SUPER ADMIN</span>}
          {u.role === 'admin' && <span className="badge badge-info">ADMIN</span>}
          <span className="user-email">{u.email}</span>
        </div>
        {stats && <div className="user-stat"><span>해결 {fmtNum(stats.resolved_count)}건</span><span>담당중 {fmtNum(stats.assigned_count)}건</span></div>}
        <div style={{display:'flex', gap:4, marginTop:6, flexWrap:'wrap', alignItems:'center'}}>
          {assignedCodes.map(c => (
            <span key={c} className="subj-tag">{c} <span style={{marginLeft:4, cursor:'pointer', color:'var(--fg-faint)'}} onClick={() => removeSubject(c)}>×</span></span>
          ))}
          {adding ? (
            <select autoFocus className="field-input" style={{padding:'2px 6px', fontSize:11, height:22}} onChange={e => e.target.value && addSubject(e.target.value)} onBlur={() => setAdding(false)}>
              <option value="">+ 시험 선택</option>
              {subjects.filter(s => !assignedCodes.includes(s.code)).map(s => <option key={s.code} value={s.code}>{s.code}</option>)}
            </select>
          ) : (
            <span className="subj-tag" style={{background:'var(--surface-2)', color:'var(--fg-subtle)', border:'1px dashed var(--border-strong)', cursor:'pointer'}} onClick={() => setAdding(true)}>+ 시험</span>
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
    ['신고 관리로 이동', ['G', 'R']], ['공지사항으로 이동', ['G', 'N']],
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

Object.assign(window, {
  Overview, Analytics, Reports, Announcements, Subjects,
  AppVersion, Admins, AuditLog, Settings,
  CommandPalette, ShortcutsModal, NotifPanel,
  actionLabel,
});
