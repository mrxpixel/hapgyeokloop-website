/* ─── Supabase client + RPC helpers + Icons + Hooks + Auth Gate ─── */
const { useState, useEffect, useMemo, useRef, useCallback } = React;

const SUPABASE_URL = 'https://fulgfanxrcjtsyzfrtjl.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_eOk3axdqIq7U4ccasRFXsw_HNQpvPpo';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});

async function rpc(name, params = {}) {
  const { data, error } = await sb.rpc(name, params);
  if (error) throw error;
  return data;
}

/* ─── Icons ─── */
const Icon = ({ name, size=16, ...p }) => {
  const paths = {
    home: <><path d="M3 11l9-8 9 8v10a2 2 0 0 1-2 2h-4v-7H10v7H6a2 2 0 0 1-2-2V11z"/></>,
    chart: <><path d="M3 20h18M7 16V9M12 16V5M17 16v-7"/></>,
    flag: <><path d="M4 21V4h10l-1 4h7v8h-9l1 4H4z"/></>,
    megaphone: <><path d="M3 11v2a2 2 0 0 0 2 2h1l3 5 2-1-2-4h2l8 4V5l-8 4H5a2 2 0 0 0-2 2z"/></>,
    book: <><path d="M4 4h7a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4V4zm16 0h-7a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h8V4z"/></>,
    phone: <><rect x="7" y="2" width="10" height="20" rx="2"/><line x1="11" y1="18" x2="13" y2="18"/></>,
    users: <><circle cx="9" cy="7" r="4"/><path d="M3 21v-1a6 6 0 0 1 12 0v1M16 3.13a4 4 0 0 1 0 7.75M21 21v-1a6 6 0 0 0-4-5.66"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.2 4.2l2.8 2.8M17 17l2.8 2.8M1 12h4M19 12h4M4.2 19.8L7 17M17 7l2.8-2.8"/></>,
    bell: <><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0"/></>,
    search: <><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></>,
    moon: <><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></>,
    sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></>,
    kbd: <><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 14h.01M18 14h.01M10 14h4"/></>,
    log: <><path d="M9 12l2 2 4-4M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"/></>,
    plus: <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>,
    check: <><polyline points="20 6 9 17 4 12"/></>,
    x: <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>,
    edit: <><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></>,
    refresh: <><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></>,
    filter: <><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></>,
    user: <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></>,
    logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></>,
    clock: <><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>,
    menu: <><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></>,
    info: <><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></>,
    database: <><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></>,
    trash: <><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></>,
    send: <><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></>,
    loader: <><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/></>,
  };
  return (
    <svg className={p.className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
      {paths[name]}
    </svg>
  );
};

/* ─── Hooks ─── */
function useAsync(fn, deps = []) {
  const [state, setState] = useState({ loading: true, data: null, error: null });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setState(s => ({ ...s, loading: true }));
    Promise.resolve(fn()).then(
      d => { if (!cancelled) setState({ loading: false, data: d, error: null }); },
      e => { if (!cancelled) setState({ loading: false, data: null, error: e }); }
    );
    return () => { cancelled = true; };
  }, [...deps, tick]);
  return { ...state, refetch: () => setTick(t => t + 1) };
}

function relativeTime(ts) {
  if (!ts) return '';
  const t = typeof ts === 'string' ? Date.parse(ts) : +ts;
  const d = Date.now() - t, m = Math.floor(d / 60000);
  if (m < 1) return '방금';
  if (m < 60) return m + '분 전';
  const h = Math.floor(m / 60);
  if (h < 24) return h + '시간 전';
  const days = Math.floor(h / 24);
  if (days < 30) return days + '일 전';
  return new Date(t).toLocaleDateString('ko-KR');
}

function fmtNum(n) {
  if (n == null) return '—';
  return Number(n).toLocaleString('ko-KR');
}

/* ─── Small primitives ─── */
function Loader({ label = '불러오는 중...' }) {
  return (
    <div style={{padding:'40px 20px', textAlign:'center', color:'var(--fg-subtle)', fontSize:12.5}}>
      <svg width="22" height="22" viewBox="0 0 24 24" style={{animation:'spin 1s linear infinite', marginBottom:10}}>
        <circle cx="12" cy="12" r="9" stroke="var(--border-strong)" strokeWidth="2.5" fill="none"/>
        <path d="M12 3 a9 9 0 0 1 9 9" stroke="var(--accent)" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
      </svg>
      <div>{label}</div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function ErrorBox({ error, retry }) {
  return (
    <div style={{padding:'24px', background:'var(--danger-soft)', border:'1px solid rgba(239,68,68,.3)', borderRadius:'var(--r)', color:'var(--danger)', fontSize:12.5, display:'flex', alignItems:'center', gap:10}}>
      <Icon name="info" size={16}/>
      <div style={{flex:1}}>
        <div style={{fontWeight:600, marginBottom:2}}>불러올 수 없습니다</div>
        <div style={{color:'var(--fg-muted)', fontFamily:'var(--font-mono)', fontSize:11}}>{error?.message || String(error)}</div>
      </div>
      {retry && <button className="btn btn-sm" onClick={retry}>재시도</button>}
    </div>
  );
}

function EmptyState({ icon='info', title, sub, action }) {
  return (
    <div style={{padding:'48px 20px', textAlign:'center', color:'var(--fg-muted)'}}>
      <div style={{width:44, height:44, borderRadius:'50%', background:'var(--surface-2)', display:'inline-flex', alignItems:'center', justifyContent:'center', color:'var(--fg-faint)', marginBottom:12}}>
        <Icon name={icon} size={20}/>
      </div>
      <div style={{fontSize:13.5, fontWeight:500, color:'var(--fg)', marginBottom:4}}>{title}</div>
      {sub && <div style={{fontSize:12, color:'var(--fg-subtle)', marginBottom:14}}>{sub}</div>}
      {action}
    </div>
  );
}

/* ─── Auth Gate ─── */
function AuthGate({ children }) {
  const [session, setSession] = useState(undefined); // undefined = loading
  const [status, setStatus] = useState(null); // { role, status, name, email }
  const [statusLoading, setStatusLoading] = useState(false);

  useEffect(() => {
    sb.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = sb.auth.onAuthStateChange((event, s) => {
      if (event === 'TOKEN_REFRESHED') return;
      setSession(s);
      if (!s) setStatus(null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    setStatusLoading(true);
    rpc('admin_check_status').then(
      (d) => {
        const s = Array.isArray(d) ? d[0] : d;
        setStatus({ ...(s || {}), email: session?.user?.email, id: session?.user?.id });
        setStatusLoading(false);
      },
      () => { setStatus({ role: null, status: null, email: session?.user?.email, id: session?.user?.id }); setStatusLoading(false); }
    );
  }, [session?.user?.id]);

  if (session === undefined) return <FullScreenLoader/>;
  if (!session) return <LoginScreen/>;
  if (statusLoading || !status) return <FullScreenLoader label="권한 확인 중..."/>;
  if (!status.role || status.status !== 'approved') return <PendingScreen status={status} onSignOut={() => sb.auth.signOut()}/>;
  return children({ session, admin: status });
}

function FullScreenLoader({ label = '불러오는 중...' }) {
  return (
    <div style={{minHeight:'100dvh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg)'}}>
      <Loader label={label}/>
    </div>
  );
}

function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState('signin'); // signin | signup
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setErr(null); setBusy(true);
    try {
      if (mode === 'signin') {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await sb.auth.signUp({ email, password });
        if (error) throw error;
        // session should be set, then register as admin
        try { await rpc('admin_register', { admin_name: name || email.split('@')[0] }); } catch (e) {}
      }
    } catch (e) {
      setErr(e.message || String(e));
    } finally { setBusy(false); }
  };

  return (
    <div style={{minHeight:'100dvh', display:'grid', placeItems:'center', padding:20, background:'var(--bg)'}}>
      <div style={{width:'100%', maxWidth:380, background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--r-lg)', padding:28, boxShadow:'var(--shadow)'}}>
        <div style={{display:'flex', alignItems:'center', gap:10, marginBottom:6}}>
          <div className="brand-mark" style={{width:32, height:32, fontSize:14}}>합</div>
          <div>
            <div style={{fontWeight:700, fontSize:16, letterSpacing:'-.01em'}}>합격루프 Admin</div>
            <div style={{fontFamily:'var(--font-mono)', fontSize:10.5, color:'var(--fg-subtle)', letterSpacing:'.06em'}}>INTERNAL · ADMIN PORTAL</div>
          </div>
        </div>
        <div style={{fontSize:13, color:'var(--fg-muted)', marginBottom:18, lineHeight:1.55}}>
          {mode === 'signin' ? '관리자 계정으로 로그인하세요.' : '회원가입 후 Super Admin의 승인이 필요합니다.'}
        </div>
        <form onSubmit={submit} style={{display:'flex', flexDirection:'column', gap:10}}>
          {mode === 'signup' && (
            <div>
              <div className="field-label">이름</div>
              <input className="field-input" style={{width:'100%'}} placeholder="홍길동" value={name} onChange={e=>setName(e.target.value)}/>
            </div>
          )}
          <div>
            <div className="field-label">이메일</div>
            <input className="field-input" style={{width:'100%'}} type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)}/>
          </div>
          <div>
            <div className="field-label">비밀번호</div>
            <input className="field-input" style={{width:'100%'}} type="password" autoComplete={mode==='signin'?'current-password':'new-password'} required minLength={6} value={password} onChange={e=>setPassword(e.target.value)}/>
          </div>
          {err && <div style={{padding:'8px 10px', background:'var(--danger-soft)', borderRadius:6, fontSize:12, color:'var(--danger)'}}>{err}</div>}
          <button className="btn btn-primary" type="submit" disabled={busy} style={{marginTop:6, justifyContent:'center', padding:'9px 14px'}}>
            {busy ? '처리 중...' : (mode === 'signin' ? '로그인' : '가입 신청')}
          </button>
          <div style={{textAlign:'center', fontSize:11.5, color:'var(--fg-subtle)', marginTop:4}}>
            {mode === 'signin' ? (
              <>처음이신가요? <a onClick={()=>setMode('signup')}>가입 신청</a></>
            ) : (
              <>이미 계정이 있으신가요? <a onClick={()=>setMode('signin')}>로그인</a></>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

function PendingScreen({ status, onSignOut }) {
  return (
    <div style={{minHeight:'100dvh', display:'grid', placeItems:'center', padding:20, background:'var(--bg)'}}>
      <div style={{width:'100%', maxWidth:420, background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--r-lg)', padding:32, textAlign:'center', boxShadow:'var(--shadow)'}}>
        <div style={{width:56, height:56, borderRadius:'50%', background:'var(--warning-soft)', color:'var(--warning)', display:'inline-flex', alignItems:'center', justifyContent:'center', marginBottom:14}}>
          <Icon name="clock" size={24}/>
        </div>
        <div style={{fontSize:16, fontWeight:600, marginBottom:6}}>
          {status.status === 'pending' ? '승인 대기 중' : '권한이 없습니다'}
        </div>
        <div style={{fontSize:12.5, color:'var(--fg-muted)', marginBottom:18, lineHeight:1.6}}>
          {status.status === 'pending'
            ? 'Super Admin이 관리자 승인을 처리하면 접속할 수 있어요.'
            : status.status === 'rejected'
              ? '가입이 거절되었습니다. Super Admin에게 문의하세요.'
              : '관리자 계정이 아닙니다.'}
        </div>
        <div style={{fontSize:11, fontFamily:'var(--font-mono)', color:'var(--fg-subtle)', marginBottom:18}}>
          {status.email || ''}
        </div>
        <button className="btn" onClick={onSignOut}>로그아웃</button>
      </div>
    </div>
  );
}

Object.assign(window, {
  sb, rpc, Icon, useAsync, relativeTime, fmtNum,
  Loader, ErrorBox, EmptyState, AuthGate,
});
