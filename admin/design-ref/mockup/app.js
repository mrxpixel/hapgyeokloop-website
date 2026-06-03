/* ============================================================
   app.js — shared shell + global behaviors for all mockup pages
   Vanilla JS (maps cleanly to React later). Mounts sidebar+topbar,
   wires theme toggle, ⌘K palette, G+key nav, J/K rows, modals, toasts.
   ============================================================ */
(function () {
  /* ---------- icons ---------- */
  const ICONS = {
    home: '<path d="M3 11l9-8 9 8v10a2 2 0 0 1-2 2h-4v-7H10v7H6a2 2 0 0 1-2-2V11z"/>',
    chart: '<path d="M3 20h18M7 16V9M12 16V5M17 16v-7"/>',
    flag: '<path d="M4 21V4h10l-1 4h7v8h-9l1 4H4z"/>',
    megaphone: '<path d="M3 11v2a2 2 0 0 0 2 2h1l3 5 2-1-2-4h2l8 4V5l-8 4H5a2 2 0 0 0-2 2z"/>',
    book: '<path d="M4 4h7a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4V4zm16 0h-7a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h8V4z"/>',
    phone: '<rect x="7" y="2" width="10" height="20" rx="2"/><line x1="11" y1="18" x2="13" y2="18"/>',
    users: '<circle cx="9" cy="7" r="4"/><path d="M3 21v-1a6 6 0 0 1 12 0v1M16 3.13a4 4 0 0 1 0 7.75M21 21v-1a6 6 0 0 0-4-5.66"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.2 4.2l2.8 2.8M17 17l2.8 2.8M1 12h4M19 12h4M4.2 19.8L7 17M17 7l2.8-2.8"/>',
    bell: '<path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0"/>',
    search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
    moon: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>',
    kbd: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 14h.01M18 14h.01M10 14h4"/>',
    log: '<path d="M9 12l2 2 4-4M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"/>',
    plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    check: '<polyline points="20 6 9 17 4 12"/>',
    x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
    edit: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>',
    refresh: '<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
    user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
    clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
    menu: '<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>',
    info: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
    database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>',
    trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    send: '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>',
    bold: '<path d="M6 4h8a4 4 0 0 1 0 8H6zM6 12h9a4 4 0 0 1 0 8H6z"/>',
    italic: '<line x1="19" y1="4" x2="10" y2="4"/><line x1="14" y1="20" x2="5" y2="20"/><line x1="15" y1="4" x2="9" y2="20"/>',
    table: '<rect x="3" y="3" width="18" height="18" rx="1"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/>',
    link: '<path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>',
    grip: '<circle cx="9" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="18" r="1"/>',
    eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
    sparkles: '<path d="M12 3l1.6 4.5L18 9l-4.4 1.5L12 15l-1.6-4.5L6 9l4.4-1.5zM19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8z"/>',
  };
  function icon(name, size) {
    size = size || 16;
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' + (ICONS[name] || '') + '</svg>';
  }
  window.adminIcon = icon;

  /* ---------- nav config ---------- */
  const SECTIONS = [
    { group: 'Insights', items: [
      { key: 'overview', label: '개요', icon: 'home', href: 'overview.html', g: 'o' },
      { key: 'analytics', label: '분석', icon: 'chart', href: '#', g: 'a' },
    ]},
    { group: '운영', items: [
      { key: 'reports', label: '신고 관리', icon: 'flag', href: 'reports.html', badge: 7, g: 'r' },
      { key: 'question-inspector', label: '문제 전수조사', icon: 'edit', href: 'question-inspector.html', g: 'i' },
      { key: 'announcements', label: '공지 · 업데이트', icon: 'megaphone', href: 'announcements.html', g: 'n' },
      { key: 'subjects', label: '시험 과목', icon: 'book', href: '#' },
      { key: 'exams', label: '시험 관리', icon: 'database', href: '#' },
      { key: 'app-version', label: '앱 버전', icon: 'phone', href: '#' },
    ]},
    { group: 'Super Admin', items: [
      { key: 'admins', label: '관리자 관리', icon: 'users', href: 'admins.html', badge: 2, badgeInfo: true, g: 'm' },
      { key: 'audit-log', label: '감사 로그', icon: 'log', href: '#', g: 'u' },
    ]},
    { group: '계정', items: [
      { key: 'components', label: '컴포넌트', icon: 'sparkles', href: 'components.html' },
      { key: 'settings', label: '설정', icon: 'settings', href: '#', g: 's' },
    ]},
  ];

  /* ---------- theme ---------- */
  const THEME_KEY = 'admin3.theme';
  function applyTheme(t) { document.documentElement.setAttribute('data-theme', t); localStorage.setItem(THEME_KEY, t); }
  let theme = localStorage.getItem(THEME_KEY) || 'dark';
  applyTheme(theme);

  /* ---------- build shell ---------- */
  function mountSidebar(host, page) {
    let nav = '';
    SECTIONS.forEach(function (g) {
      nav += '<div class="sb-group"><div class="sb-group-title">' + g.group + '</div>';
      g.items.forEach(function (it) {
        const active = it.key === page ? ' active' : '';
        let badge = '';
        if (it.badge) badge = '<span class="tag' + (it.badgeInfo ? ' info' : '') + '">' + it.badge + '</span>';
        nav += '<a class="sb-item' + active + '" href="' + it.href + '" data-key="' + it.key + '">' +
          '<span class="sb-ic">' + icon(it.icon, 16) + '</span><span>' + it.label + '</span>' + badge + '</a>';
      });
      nav += '</div>';
    });
    host.innerHTML =
      '<div class="sb-brand"><div class="brand-row"><div class="brand-mark">합</div>' +
      '<div><div class="brand-text">합격루프</div><div class="brand-env">INTERNAL · V3</div></div></div></div>' +
      '<div class="sb-search" data-act="palette"><span class="sb-ic">' + icon('search', 15) + '</span><span>이동 · 검색</span><span class="kbd">⌘K</span></div>' +
      '<nav class="sb-nav">' + nav + '</nav>' +
      '<div class="sb-foot"><div class="realtime"><span class="pulse"></span>REALTIME · CONNECTED</div>' +
      '<div class="sb-user"><div class="avatar">로</div><div class="meta"><div class="name">Logan</div>' +
      '<div class="email">logan@hapgyeokloop.kr</div></div><button class="out" title="로그아웃">' + icon('logout', 15) + '</button></div></div>';
  }

  function mountTopbar(host) {
    const title = host.getAttribute('data-title') || '';
    const sub = host.getAttribute('data-sub') || '';
    const extra = host.getAttribute('data-actions') || '';
    host.innerHTML =
      '<div><div class="tb-title">' + title + '</div><div class="tb-sub">' + sub + '</div></div>' +
      '<div class="top-actions">' + extra +
      '<button class="icon-btn" data-act="shortcuts" title="단축키 (?)">' + icon('kbd', 17) + '</button>' +
      '<button class="icon-btn" data-act="notif" title="알림">' + icon('bell', 17) + '<span class="dot"></span></button>' +
      '<button class="icon-btn" data-act="theme" title="테마 전환">' + icon(theme === 'dark' ? 'sun' : 'moon', 17) + '</button>' +
      '</div>';
  }

  function refreshThemeIcon() {
    const b = document.querySelector('[data-act="theme"]');
    if (b) b.innerHTML = icon(theme === 'dark' ? 'sun' : 'moon', 17);
  }

  /* ---------- palette ---------- */
  function openPalette() {
    let items = '';
    SECTIONS.forEach(function (g) {
      g.items.forEach(function (it) {
        items += '<div class="palette-item" data-href="' + it.href + '"><span class="pic">' + icon(it.icon, 16) + '</span><span>' + it.label + '</span>' +
          (it.g ? '<span class="pk">G ' + it.g.toUpperCase() + '</span>' : '') + '</div>';
      });
    });
    const html = '<div class="palette" data-stop><input class="palette-input" placeholder="페이지 이동 · 명령 · 빠른 작업…" autofocus>' +
      '<div class="palette-list"><div class="palette-section">페이지로 이동</div>' + items + '</div>' +
      '<div class="palette-foot"><span><span class="kbd">↑↓</span> 이동</span><span><span class="kbd">↵</span> 선택</span><span><span class="kbd">ESC</span> 닫기</span></div></div>';
    const bd = overlay(html);
    const input = bd.querySelector('.palette-input');
    const list = bd.querySelector('.palette-list');
    let sel = 0;
    const all = function () { return Array.prototype.slice.call(list.querySelectorAll('.palette-item:not([hidden])')); };
    function mark() { all().forEach(function (el, i) { el.classList.toggle('sel', i === sel); }); }
    mark();
    input.addEventListener('input', function () {
      const q = input.value.toLowerCase();
      list.querySelectorAll('.palette-item').forEach(function (el) { el.hidden = q && el.textContent.toLowerCase().indexOf(q) < 0; });
      sel = 0; mark();
    });
    input.addEventListener('keydown', function (e) {
      const a = all();
      if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(sel + 1, a.length - 1); mark(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(sel - 1, 0); mark(); }
      else if (e.key === 'Enter') { e.preventDefault(); if (a[sel]) go(a[sel].getAttribute('data-href')); }
    });
    list.addEventListener('click', function (e) {
      const it = e.target.closest('.palette-item'); if (it) go(it.getAttribute('data-href'));
    });
    setTimeout(function () { input.focus(); }, 30);
  }
  function go(href) { if (href && href !== '#') location.href = href; else { closeOverlay(); toast('해당 페이지는 이 mockup 범위 밖입니다', 'info'); } }

  /* ---------- shortcuts modal ---------- */
  function openShortcuts() {
    const rows = [
      ['명령 팔레트', ['⌘', 'K']], ['단축키 도움말', ['?']],
      ['개요', ['G', 'O']], ['신고 관리', ['G', 'R']], ['문제 전수조사', ['G', 'I']],
      ['공지', ['G', 'N']], ['관리자', ['G', 'M']],
      ['다음 / 이전 행', ['J', 'K']], ['테마 전환', ['T']], ['닫기', ['ESC']],
    ];
    let body = '<div style="display:grid;gap:11px">';
    rows.forEach(function (r) {
      body += '<div style="display:flex;justify-content:space-between;align-items:center;font-size:var(--fs-sm)"><span>' + r[0] + '</span><span style="display:flex;gap:4px">' +
        r[1].map(function (k) { return '<span class="kbd">' + k + '</span>'; }).join('') + '</span></div>';
    });
    body += '</div>';
    openModal({ size: 'compact', title: '키보드 단축키', sub: '팀이 더 빠르게', body: body, foot: '' });
  }

  /* ---------- overlay / modal infra ---------- */
  function overlay(innerHTML) {
    const bd = document.createElement('div');
    bd.className = 'modal-backdrop';
    bd.innerHTML = innerHTML;
    bd.addEventListener('mousedown', function (e) { if (!e.target.closest('[data-stop]')) closeOverlay(); });
    document.body.appendChild(bd);
    window.__overlay = bd;
    return bd;
  }
  function closeOverlay() { if (window.__overlay) { window.__overlay.remove(); window.__overlay = null; } }
  window.closeModal = closeOverlay;

  window.openModal = function (opt) {
    const size = 'modal-' + (opt.size || 'medium');
    const foot = opt.foot != null ? opt.foot : '<button class="btn btn-sm" data-close>취소</button><button class="btn btn-sm btn-primary" data-close>확인</button>';
    const html = '<div class="modal ' + size + '" data-stop>' +
      '<div class="modal-head"><div><div class="modal-title">' + (opt.title || '') + '</div>' +
      (opt.sub ? '<div class="modal-sub">' + opt.sub + '</div>' : '') + '</div>' +
      '<button class="modal-x" data-close>' + icon('x', 16) + '</button></div>' +
      '<div class="modal-body">' + (opt.body || '') + '</div>' +
      (foot ? '<div class="modal-foot">' + foot + '</div>' : '') + '</div>';
    const bd = overlay(html);
    bd.querySelectorAll('[data-close]').forEach(function (b) { b.addEventListener('click', closeOverlay); });
    if (opt.onMount) opt.onMount(bd);
    return bd;
  };

  /* ---------- toast ---------- */
  function toast(msg, kind) {
    kind = kind || 'success';
    let stack = document.querySelector('.toast-stack');
    if (!stack) { stack = document.createElement('div'); stack.className = 'toast-stack'; document.body.appendChild(stack); }
    const t = document.createElement('div');
    t.className = 'toast ' + kind;
    const ic = kind === 'info' ? 'info' : kind === 'danger' ? 'info' : 'check';
    t.innerHTML = icon(ic, 16) + '<span>' + msg + '</span>';
    stack.appendChild(t);
    setTimeout(function () { t.style.transition = 'opacity .25s, transform .25s'; t.style.opacity = '0'; t.style.transform = 'translateY(6px)'; setTimeout(function () { t.remove(); }, 250); }, 3200);
  }
  window.toast = toast;

  /* ---------- global delegated behaviors ---------- */
  document.addEventListener('click', function (e) {
    const act = e.target.closest('[data-act]');
    if (act) {
      const a = act.getAttribute('data-act');
      if (a === 'palette') { openPalette(); return; }
      if (a === 'shortcuts') { openShortcuts(); return; }
      if (a === 'theme') { theme = theme === 'dark' ? 'light' : 'dark'; applyTheme(theme); refreshThemeIcon(); return; }
      if (a === 'notif') { toast('알림 3건 · 새 신고 2건', 'info'); return; }
      if (a === 'menu') { document.querySelector('.sidebar').classList.add('open'); document.querySelector('.sb-backdrop').classList.add('visible'); return; }
    }
    if (e.target.closest('.sb-backdrop')) { document.querySelector('.sidebar').classList.remove('open'); e.target.closest('.sb-backdrop').classList.remove('visible'); }

    // generic switch
    const sw = e.target.closest('.switch[data-toggle]');
    if (sw) { sw.classList.toggle('on'); sw.dispatchEvent(new CustomEvent('switchchange', { bubbles: true, detail: { on: sw.classList.contains('on') } })); }

    // generic check
    const ck = e.target.closest('.check[data-toggle]');
    if (ck) { ck.classList.toggle('checked'); ck.innerHTML = ck.classList.contains('checked') ? icon('check', 11) : ''; }

    // tabs
    const tab = e.target.closest('.tab[data-tab]');
    if (tab) {
      const grp = tab.closest('.tabs');
      grp.querySelectorAll('.tab').forEach(function (t) { t.classList.remove('active'); });
      tab.classList.add('active');
      const name = tab.getAttribute('data-tab');
      const scope = grp.closest('[data-tabscope]') || document;
      scope.querySelectorAll('[data-tabpanel]').forEach(function (p) { p.hidden = p.getAttribute('data-tabpanel') !== name; });
    }

    // sortable table headers
    const th = e.target.closest('.dtable th.sortable');
    if (th) sortTable(th);
  });

  function sortTable(th) {
    const table = th.closest('table');
    const idx = Array.prototype.indexOf.call(th.parentNode.children, th);
    const asc = !th.classList.contains('sorted-asc');
    table.querySelectorAll('th').forEach(function (h) { h.classList.remove('sorted', 'sorted-asc', 'sorted-desc'); const ar = h.querySelector('.sort-ar'); if (ar) ar.textContent = '↕'; });
    th.classList.add('sorted', asc ? 'sorted-asc' : 'sorted-desc');
    const ar = th.querySelector('.sort-ar'); if (ar) ar.textContent = asc ? '↑' : '↓';
    const tb = table.querySelector('tbody');
    const rows = Array.prototype.slice.call(tb.querySelectorAll('tr'));
    rows.sort(function (a, b) {
      const av = a.children[idx].getAttribute('data-sort') || a.children[idx].textContent.trim();
      const bv = b.children[idx].getAttribute('data-sort') || b.children[idx].textContent.trim();
      const an = parseFloat(av.replace(/[^0-9.\-]/g, '')), bn = parseFloat(bv.replace(/[^0-9.\-]/g, ''));
      let r = (!isNaN(an) && !isNaN(bn)) ? an - bn : av.localeCompare(bv, 'ko');
      return asc ? r : -r;
    });
    rows.forEach(function (r) { tb.appendChild(r); });
  }
  window.sortTable = sortTable;

  /* ---------- keyboard ---------- */
  let gMode = false, gTimer = null;
  window.addEventListener('keydown', function (e) {
    const inField = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); if (window.__overlay) closeOverlay(); else openPalette(); return; }
    if (e.key === 'Escape') { closeOverlay(); const sb = document.querySelector('.sidebar.open'); if (sb) { sb.classList.remove('open'); document.querySelector('.sb-backdrop').classList.remove('visible'); } return; }
    if (inField) return;
    if (e.key === '?') { e.preventDefault(); openShortcuts(); return; }
    if (e.key === 't' || e.key === 'T') { theme = theme === 'dark' ? 'light' : 'dark'; applyTheme(theme); refreshThemeIcon(); return; }
    if (e.key === 'g' || e.key === 'G') { gMode = true; clearTimeout(gTimer); gTimer = setTimeout(function () { gMode = false; }, 1200); return; }
    if (gMode) {
      gMode = false;
      const k = e.key.toLowerCase();
      for (var i = 0; i < SECTIONS.length; i++) for (var j = 0; j < SECTIONS[i].items.length; j++) {
        var it = SECTIONS[i].items[j];
        if (it.g === k) { go(it.href); return; }
      }
      return;
    }
    // J/K row navigation (pages opt-in via [data-rownav])
    const nav = document.querySelector('[data-rownav]');
    if (nav && (e.key === 'j' || e.key === 'k')) {
      const rows = Array.prototype.slice.call(nav.querySelectorAll('[data-row]'));
      if (!rows.length) return;
      let cur = rows.findIndex(function (r) { return r.classList.contains('cur'); });
      if (cur < 0) cur = e.key === 'j' ? -1 : 0;
      let next = e.key === 'j' ? Math.min(cur + 1, rows.length - 1) : Math.max(cur - 1, 0);
      rows.forEach(function (r) { r.classList.remove('cur'); });
      rows[next].classList.add('cur');
    }
  });

  /* ---------- boot ---------- */
  function boot() {
    const page = document.body.getAttribute('data-page');
    const sb = document.querySelector('[data-shell-sidebar]'); if (sb) mountSidebar(sb, page);
    const tb = document.querySelector('[data-shell-topbar]'); if (tb) mountTopbar(tb);
    const mtb = document.querySelector('[data-shell-mobiletop]');
    if (mtb) mtb.innerHTML = '<button class="icon-btn" data-act="menu">' + icon('menu', 20) + '</button>' +
      '<div style="display:flex;align-items:center;gap:8px"><div class="brand-mark" style="width:24px;height:24px;font-size:13px">합</div><b style="font-size:14px">' + (document.querySelector('[data-shell-topbar]').getAttribute('data-title') || '') + '</b></div>' +
      '<button class="icon-btn" data-act="palette">' + icon('search', 17) + '</button>';
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
