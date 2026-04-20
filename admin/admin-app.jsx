/* ─── Admin Shell (App root) ─── */
const { useState: useStateApp, useEffect: useEffectApp, useCallback: useCallbackApp, useRef: useRefApp } = React;

const SECTIONS = [
  { group: 'Insights', items: [
    { key: 'overview',      label: '개요',          icon: 'home' },
    { key: 'analytics',     label: '분석',          icon: 'chart' },
  ]},
  { group: '운영', items: [
    { key: 'reports',       label: '신고 관리',      icon: 'flag' },
    { key: 'announcements', label: '공지 · 업데이트', icon: 'megaphone' },
    { key: 'subjects',      label: '시험 과목',      icon: 'book' },
    { key: 'app-version',   label: '앱 버전',        icon: 'phone' },
  ]},
  { group: 'Super Admin', items: [
    { key: 'admins',        label: '관리자 관리',    icon: 'users' },
    { key: 'audit-log',     label: '감사 로그',      icon: 'log' },
  ]},
  { group: '계정', items: [
    { key: 'settings',      label: '설정',          icon: 'settings' },
  ]},
];

const SECTION_TITLES = {
  'overview':     ['개요', '오늘 팀이 봐야 할 것'],
  'analytics':    ['분석', 'DAU · 리텐션 · 학습 세션'],
  'reports':      ['신고 관리', '유저가 제출한 문제 신고'],
  'announcements':['공지 · 업데이트', '앱에 발행되는 공지 관리'],
  'subjects':     ['시험 과목', '제공 중인 시험 관리'],
  'app-version':  ['앱 버전', '강제 업데이트 및 최소 버전 설정'],
  'admins':       ['관리자 관리', '팀 초대 · 권한 · 시험 배정'],
  'audit-log':    ['감사 로그', '관리자 작업 전체 기록'],
  'settings':     ['설정', '내 계정 · 알림'],
};

function Shell({ session, admin }) {
  const [section, setSection] = useStateApp(() => localStorage.getItem('admin.section') || 'overview');
  const [theme, setTheme] = useStateApp(() => localStorage.getItem('admin.theme') || 'dark');
  const [sbOpen, setSbOpen] = useStateApp(false);
  const [palette, setPalette] = useStateApp(false);
  const [showShortcuts, setShowShortcuts] = useStateApp(false);
  const [showNotif, setShowNotif] = useStateApp(false);
  const [notifCount, setNotifCount] = useStateApp(0);
  const [toasts, setToasts] = useStateApp([]);
  const [realtimeOk, setRealtimeOk] = useStateApp(true);
  const [pendingCounts, setPendingCounts] = useStateApp({ reports: 0, admins: 0 });

  // stash admin id globally for child components
  useEffectApp(() => { window.__adminId = admin?.id || session?.user?.id; }, [admin?.id, session?.user?.id]);

  // persist section + theme
  useEffectApp(() => { localStorage.setItem('admin.section', section); }, [section]);
  useEffectApp(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('admin.theme', theme);
  }, [theme]);

  // load sidebar badge counts (pending reports + pending admin signups)
  const loadCounts = useCallbackApp(async () => {
    try {
      const [reps, users] = await Promise.all([
        rpc('admin_get_reports').catch(() => []),
        admin?.role === 'super_admin' ? rpc('admin_list_users').catch(() => []) : Promise.resolve([]),
      ]);
      const pendingReports = (reps || []).filter(r => r.status === 'pending').length;
      const pendingAdmins = (users || []).filter(u => u.status === 'pending').length;
      setPendingCounts({ reports: pendingReports, admins: pendingAdmins });
    } catch (e) { /* ignore */ }
  }, [admin?.role]);
  useEffectApp(() => { loadCounts(); const h = setInterval(loadCounts, 60_000); return () => clearInterval(h); }, [loadCounts]);

  // notification count poll
  const refreshNotifCount = useCallbackApp(async () => {
    try { const n = await rpc('admin_get_notification_unread_count'); setNotifCount(Number(n) || 0); } catch (e) {}
  }, []);
  useEffectApp(() => { refreshNotifCount(); const h = setInterval(refreshNotifCount, 45_000); return () => clearInterval(h); }, [refreshNotifCount]);

  // realtime subscription for reports + notifications
  useEffectApp(() => {
    const ch = sb.channel('admin-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'question_reports' }, () => { loadCounts(); })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'question_reports' }, () => { loadCounts(); })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'admin_notifications' }, () => { refreshNotifCount(); })
      .subscribe((status) => { setRealtimeOk(status === 'SUBSCRIBED'); });
    return () => { sb.removeChannel(ch); };
  }, [loadCounts, refreshNotifCount]);

  // push-style toast
  const pushToast = useCallbackApp((msg, kind = 'success') => {
    const id = Date.now() + Math.random();
    setToasts(ts => [...ts, { id, msg, kind }]);
    setTimeout(() => setToasts(ts => ts.filter(t => t.id !== id)), 3500);
  }, []);

  // keyboard shortcuts
  useEffectApp(() => {
    let gMode = false, gTimer = null;
    const onKey = (e) => {
      // ignore if typing in a field (except for ⌘K/Esc)
      const inField = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette(p => !p); return; }
      if (e.key === 'Escape') { setPalette(false); setShowShortcuts(false); setShowNotif(false); setSbOpen(false); return; }
      if (inField) return;
      if (e.key === '?') { e.preventDefault(); setShowShortcuts(true); return; }
      if (e.key === 'g' || e.key === 'G') {
        gMode = true; clearTimeout(gTimer); gTimer = setTimeout(() => { gMode = false; }, 1200); return;
      }
      if (gMode) {
        const map = { o: 'overview', a: 'analytics', r: 'reports', n: 'announcements', u: 'audit-log', s: 'settings' };
        const k = e.key.toLowerCase();
        if (map[k]) { e.preventDefault(); setSection(map[k]); gMode = false; }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); clearTimeout(gTimer); };
  }, []);

  const signOut = async () => { await sb.auth.signOut(); };

  const Body = () => {
    switch (section) {
      case 'overview':      return <Overview goto={setSection}/>;
      case 'analytics':     return <Analytics/>;
      case 'reports':       return <Reports pushToast={pushToast}/>;
      case 'announcements': return <Announcements pushToast={pushToast}/>;
      case 'subjects':      return <Subjects pushToast={pushToast}/>;
      case 'app-version':   return <AppVersion pushToast={pushToast}/>;
      case 'admins':        return admin.role === 'super_admin' ? <Admins pushToast={pushToast}/> : <NotAllowed/>;
      case 'audit-log':     return <AuditLog/>;
      case 'settings':      return <Settings admin={admin} pushToast={pushToast}/>;
      default:              return <Overview goto={setSection}/>;
    }
  };

  const [title, subtitle] = SECTION_TITLES[section] || [section, ''];
  const displayName = admin.name || (admin.email || '').split('@')[0] || 'admin';

  // filter sections by role
  const visibleSections = SECTIONS.map(g => ({
    ...g,
    items: g.items.filter(it => {
      if (g.group === 'Super Admin' && admin.role !== 'super_admin') return it.key === 'audit-log'; // allow audit for all admins
      return true;
    }),
  })).filter(g => g.items.length > 0);

  return (
    <div className="app">
      {/* sidebar */}
      <aside className={"sidebar " + (sbOpen ? 'open' : '')}>
        <div className="sb-brand">
          <div className="brand-row">
            <div className="brand-mark">합</div>
            <div>
              <div className="brand-text">합격루프 Admin</div>
              <div className="brand-env">INTERNAL · V2</div>
            </div>
          </div>
          <div className="sb-subject" title="과목 컨텍스트 스위처 (준비 중)">
            <span>시험:</span>
            <span className="sb-subject-name">ALL</span>
            <span className="chev">▾</span>
          </div>
        </div>

        <div className="sb-search" onClick={() => setPalette(true)}>
          <Icon name="search" size={14}/>
          <span>이동 · 검색</span>
          <span className="kbd">⌘K</span>
        </div>

        <nav className="sb-nav">
          {visibleSections.map(g => (
            <div key={g.group} className="sb-group">
              <div className="sb-group-title">{g.group}</div>
              {g.items.map(it => {
                const badge = it.key === 'reports' ? pendingCounts.reports
                            : it.key === 'admins' ? pendingCounts.admins : 0;
                return (
                  <div key={it.key}
                       className={"sb-item " + (section === it.key ? 'active' : '')}
                       onClick={() => { setSection(it.key); setSbOpen(false); }}>
                    <Icon name={it.icon} className="sb-ic"/>
                    <span>{it.label}</span>
                    {badge > 0 && <span className={"tag " + (it.key === 'admins' ? 'info' : '')}>{badge}</span>}
                  </div>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="sb-foot">
          <div className="realtime">
            <span className="pulse" style={!realtimeOk ? { background: 'var(--fg-faint)', animation: 'none' } : undefined}/>
            {realtimeOk ? 'REALTIME · CONNECTED' : 'REALTIME · OFFLINE'}
          </div>
          <div className="sb-user">
            <div className="avatar">{(admin.name || admin.email || '?')[0]?.toUpperCase()}</div>
            <div className="meta">
              <div className="name">{displayName}</div>
              <div className="email">{admin.email}</div>
            </div>
            <button onClick={signOut} title="로그아웃"><Icon name="logout" size={14}/></button>
          </div>
        </div>
      </aside>

      {/* mobile backdrop */}
      <div className={"sb-backdrop " + (sbOpen ? 'visible' : '')} onClick={() => setSbOpen(false)}/>

      <main>
        <div className="mobile-topbar">
          <button className="mobile-menu" onClick={() => setSbOpen(true)}><Icon name="menu" size={20}/></button>
          <div style={{display:'flex', alignItems:'center', gap:8}}>
            <div className="brand-mark" style={{width:24, height:24, fontSize:11}}>합</div>
            <div style={{fontSize:13, fontWeight:600}}>{title}</div>
          </div>
          <button className="icon-btn" onClick={() => setPalette(true)}><Icon name="search" size={16}/></button>
        </div>

        <div className="topbar">
          <div>
            <h1>{title}</h1>
            <div className="sub">{subtitle}</div>
          </div>
          <div className="top-actions">
            <button className="icon-btn" onClick={() => setShowShortcuts(true)} title="키보드 단축키 (?)"><Icon name="kbd" size={16}/></button>
            <div style={{position:'relative'}}>
              <button className="icon-btn" onClick={(e) => { e.stopPropagation(); setShowNotif(v => !v); }} title="알림">
                <Icon name="bell" size={16}/>
                {notifCount > 0 && <span className="dot"/>}
              </button>
              {showNotif && <NotifPanel onClose={() => setShowNotif(false)} onBadgeChange={setNotifCount}/>}
            </div>
            <button className="icon-btn" onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')} title="테마 전환">
              <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16}/>
            </button>
          </div>
        </div>

        <div className="content">
          <ErrorBoundary>
            {Body()}
          </ErrorBoundary>
        </div>
      </main>

      {palette && <CommandPalette onClose={() => setPalette(false)} setSection={setSection}/>}
      {showShortcuts && <ShortcutsModal onClose={() => setShowShortcuts(false)}/>}

      <div className="toast-stack">
        {toasts.map(t => (
          <div key={t.id} className={"toast " + (t.kind || 'success')}>
            <Icon name={t.kind === 'info' ? 'info' : 'check'} size={14}/>
            {t.msg}
          </div>
        ))}
      </div>
    </div>
  );
}

function NotAllowed() {
  return (
    <div className="panel">
      <div className="panel-body">
        <EmptyState icon="info" title="접근 권한 없음" sub="이 섹션은 Super Admin만 볼 수 있습니다."/>
      </div>
    </div>
  );
}

/* ─── Mount ─── */
const rootEl = document.getElementById('root') || (() => {
  const d = document.createElement('div'); d.id = 'root'; document.body.appendChild(d); return d;
})();

ReactDOM.createRoot(rootEl).render(
  <AuthGate>
    {({ session, admin }) => <Shell session={session} admin={admin}/>}
  </AuthGate>
);
