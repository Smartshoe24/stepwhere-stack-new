/* Production QA mockup on Night Trail. Plain JS, no build step. */
const ic = (n, cls = '') => `<svg class="i ${cls}"><use href="#${n}"/></svg>`;
const pill = (t, tone = '') => `<span class="pill ${tone ? 'pill-' + tone : ''}">${t}</span>`;
const tag = (t) => (t ? `<span class="tag">${t}</span>` : '<span class="muted">—</span>');
const at = (o) =>
  `${o.go ? ` data-go="${o.go}"` : ''}${o.act ? ` data-act="${o.act}"` : ''}${o.arg !== undefined ? ` data-arg="${o.arg}"` : ''}`;
const btn = (l, o = {}) =>
  `<button type="button" class="btn btn-${o.v || 'secondary'}${o.sm ? ' btn-sm' : ''}${o.lg ? ' btn-lg' : ''}${l ? '' : ' btn-icon'} fr"${at(o)}${o.title ? ` title="${o.title}"` : ''}>${o.spin ? '<span class="spinner"></span>' : ''}${o.icon ? ic(o.icon, o.sm ? 'i-sm' : '') : ''}${l || ''}${o.kbd ? `<span class="kbd">${o.kbd}</span>` : ''}</button>`;
const fresh = (t, f) => `<span class="fresh ${f}"><span class="ticks"><i></i><i></i><i></i></span>${t}</span>`;
const stat = (l, v, o = {}) =>
  `<div class="stat${o.go || o.act ? ' click' : ''}"${at(o)}><span class="label">${o.dot ? `<span class="dot" style="background:var(--${o.dot})"></span>` : ''}${l}</span><div class="v${o.sm ? ' sm' : ''}">${v}${o.unit ? `<small>${o.unit}</small>` : ''}</div>${o.d ? `<div class="d">${o.d}</div>` : ''}${o.meter != null ? `<div class="meter"><i style="width:${o.meter}%;background:${o.mc || 'var(--trail)'}"></i></div>` : ''}</div>`;
const pn = (title, body, o = {}) =>
  `<section class="pn"${o.id ? ` id="${o.id}"` : ''}>${title ? `<div class="hd"><b>${title}${o.sub ? `<span class="sub2">${o.sub}</span>` : ''}</b>${o.actions ? `<div class="row" style="gap:6px">${o.actions}</div>` : ''}</div>` : ''}<div class="bd${o.flush ? ' flush' : ''}">${body}</div></section>`;
const side = (title, body, o = {}) =>
  `<section class="side-card"><div class="hd"><b>${title}</b>${o.right || ''}</div>${o.kv ? `<dl class="kv">${body}</dl>` : `<div class="bd">${body}</div>`}</section>`;
const head = (t, d, a = '') => `<div class="page-head"><div><h2>${t}</h2><p class="num">${d}</p></div><div class="acts">${a}</div></div>`;
const tabs = (items, cur, act) =>
  `<div class="tabs" role="tablist">${items.map(([k, l, n]) => `<button type="button" class="tab fr" role="tab" aria-selected="${k === cur}" data-act="${act}" data-arg="${k}">${l}${n !== undefined ? `<span class="count">${n}</span>` : ''}</button>`).join('')}</div>`;
const seg = (items, cur, act) =>
  `<div class="seg" role="group">${items.map(([k, l]) => `<button type="button" class="fr" aria-pressed="${k === cur}"${act ? ` data-act="${act}" data-arg="${k}"` : ''}>${l}</button>`).join('')}</div>`;
const chip = (l, val) =>
  val
    ? `<button type="button" class="chip on fr">${ic('i-filter', 'i-sm')}${l} <span class="val">${val}</span>${ic('i-x', 'i-sm x')}</button>`
    : `<button type="button" class="chip fr">${ic('i-plus', 'i-sm')}${l}</button>`;
const search = (ph, w = 240) => `<div class="field" style="width:${w}px;max-width:100%">${ic('i-search')}<input placeholder="${ph}" /></div>`;
const cbx = (on) => `<span class="box${on ? ' is-on' : ''}"><svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg></span>`;
const rk = (r, w) => {
  const m = { pass: ['i-check', 'Pass'], fail: ['i-x', 'Fail'], run: [null, 'Running'], skip: [null, 'Skipped'] }[r];
  if (!m) return '<span class="muted">—</span>';
  const lead = r === 'run' ? '<span class="live"></span>' : m[0] ? ic(m[0]) : '';
  return `<span class="rk ${r}">${lead}${w === '' ? '' : w || m[1]}</span>`;
};
const oq = (t) => `<div class="oq">${ic('i-help')}<span><b>Open question.</b> ${t}</span></div>`;
const insight = (t) => `<div class="insight">${ic('i-alert')}<span>${t}</span></div>`;
const tbl = (cols, rows, foot) =>
  `<div class="tbl-wrap"><div class="tbl-scroll"><table class="tbl"><thead><tr>${cols.map((c) => (typeof c === 'string' ? `<th><span class="th-in">${c}</span></th>` : `<th class="${c[1]}"><span class="th-in">${c[0]}</span></th>`)).join('')}</tr></thead><tbody>${rows}</tbody></table></div>${foot ? `<div class="tbl-foot">${foot}</div>` : ''}</div>`;
const pager = (txt, pages) =>
  `<span class="num">${txt}</span><div class="pager"><button class="pg fr" disabled>${ic('i-chev-l', 'i-sm')}</button>${pages.map((p, i) => (p === '…' ? '<span style="padding:0 4px">…</span>' : `<button class="pg fr"${i === 0 ? ' aria-current="page"' : ''}>${p}</button>`)).join('')}<button class="pg fr">${ic('i-chev-r', 'i-sm')}</button></div>`;

/* ---------------- data ---------------- */
const STG = ['Registered', 'QA firmware', 'Board tests', 'Prod firmware', 'Functional tests', 'Assembled', 'Final test', 'Ready to ship', 'Shipped', 'Delivered'];
const TITLES = { flow: 'User flow', overview: 'Overview', units: 'Units', unit: 'Unit', bench: 'Bench', runs: 'Test runs', suites: 'Test suites', firmware: 'Firmware', stations: 'Stations', shipping: 'Shipping' };
const U = [
  { sn: 'SW-2201-4XQ7', uid: '0039 2F3A 5143 91C4', imei: '867946053102187', batch: 'B-2610-A', stage: 3, status: 'progress', fw: 'qa-1.3', last: ['Board bring-up v3', 'pass', '14/14'], st: 'Bench 1', up: ['4m ago', 'f-recent'] },
  { sn: 'SW-2204-9KD2', uid: '0039 2F3A 5143 92A0', imei: '867946053102190', batch: 'B-2610-A', stage: 3, status: 'progress', fw: 'qa-1.3', last: ['Flashing 1.2', 'run', '62%'], st: 'Bench 2', up: ['now', 'f-live'] },
  { sn: 'SW-2197-T3MA', uid: '0039 2F3A 5143 8E12', imei: '867946053102181', batch: 'B-2610-A', stage: 4, status: 'progress', fw: '1.2', last: ['Functional v4', 'run', 'GPS 2:31'], st: 'Bench 1', up: ['31s ago', 'f-live'] },
  { sn: 'SW-2188-7B09', uid: '0039 2F3A 5143 7B09', imei: '867946053102142', batch: 'B-2609-C', stage: 4, status: 'failed', fw: '1.2', last: ['GPS valid fix', 'fail', 'no fix in 7:00'], st: 'Bench 2', up: ['18m ago', 'f-recent'], fail: 'gps' },
  { sn: 'SW-2209-QP4L', uid: '0039 2F3A 5143 93F1', imei: '—', batch: 'B-2610-A', stage: 2, status: 'failed', fw: 'qa-1.3', last: ['Modem responds to AT', 'fail', 'no response'], st: 'Bench 1', up: ['21m ago', 'f-recent'], fail: 'modem' },
  { sn: 'SW-2176-HH2C', uid: '0039 2F3A 5143 8A44', imei: '867946053102176', batch: 'B-2609-C', stage: 5, status: 'progress', fw: '1.2', last: ['Functional v4', 'pass', '6/6'], st: 'Assembly', up: ['52m ago', 'f-recent'] },
  { sn: 'SW-2171-ZN5E', uid: '0039 2F3A 5143 86D2', imei: '867946053102171', batch: 'B-2609-C', stage: 6, status: 'failed', fw: '1.2', last: ['Steps while worn', 'fail', '24 of 30 ±3'], st: 'Bench 3', up: ['1h ago', 'f-stale'], fail: 'steps' },
  { sn: 'SW-2212-M2QP', uid: '0039 2F3A 5143 9C77', imei: '—', batch: 'B-2610-A', stage: 0, status: 'progress', fw: null, last: ['—', 'none', ''], st: 'Line jig', up: ['2h ago', 'f-stale'] },
  { sn: 'SW-2168-L9YT', uid: '0039 2F3A 5143 8410', imei: '867946053102168', batch: 'B-2609-C', stage: 7, status: 'ready', fw: '1.2', last: ['Final v2', 'pass', '6/6'], st: 'Bench 3', up: ['3h ago', 'f-stale'] },
  { sn: 'SW-2155-W3RS', uid: '0039 2F3A 5143 7F38', imei: '867946053102155', batch: 'B-2609-B', stage: 8, status: 'shipped', fw: '1.2', last: ['Final v2', 'pass', '6/6'], st: '—', up: ['15 Oct', 'f-off'] },
  { sn: 'SW-2041-7K9Q', uid: '0039 2F3A 5143 74C1', imei: '356938035643809', batch: 'B-2609-B', stage: 9, status: 'delivered', field: 'active', fw: '1.2', last: ['Final v2', 'pass', '6/6'], st: '—', up: ['12s ago', 'f-live'] },
  { sn: 'SW-1654-C1VU', uid: '0039 2F3A 5143 7255', imei: '867946053102122', batch: 'B-2609-A', stage: 9, status: 'delivered', field: 'offline', fw: '1.1', last: ['Final v1', 'pass', '5/5'], st: '—', up: ['3d ago', 'f-off'] },
];
const getU = (sn) => U.find((u) => u.sn === sn) || U[3];
const S = { screen: 'flow', bench: 'idle', layout: 'single', unit: 'SW-2188-7B09', unitTab: 'timeline', shipTab: 'ready', suite: 'functional', fw: 'prod', unitsTab: 'all', runsTab: 'all', modal: null, sheet: null, usel: new Set(), ssel: new Set(['SW-2168-L9YT', 'SW-2169-L9YU']), sim: null };

function uStatus(u) {
  if (u.status === 'failed') return pill('Failed', 'breach');
  if (u.status === 'hold') return pill('On hold', 'caution');
  if (u.stage === 0) return pill('Registered', 'unset');
  if (u.stage <= 6) return pill('In QA', 'info');
  if (u.stage === 7) return pill('Ready', 'ok');
  if (u.stage === 8) return pill('In transit', 'info');
  return u.field === 'active' ? pill('Active', 'ok') : pill('Offline', 'muted');
}
const stageState = (u, i) => {
  if (u.stage === 9 || i < u.stage || (i === u.stage && u.stage >= 7)) return 'done';
  if (i === u.stage) return u.status === 'failed' ? 'fail' : 'here';
  return 'todo';
};
const mini = (u) => `<span class="mini" title="${STG[u.stage]}">${STG.map((_, i) => `<i class="${stageState(u, i)}"></i>`).join('')}</span>`;
function rail(u, times, compact) {
  return `<ol class="rail${compact ? ' compact' : ''}">${STG.map((l, i) => {
    const c = stageState(u, i);
    return `<li class="${c}"><span class="node">${c === 'done' ? ic('i-check') : c === 'fail' ? ic('i-x') : i + 1}</span><span class="nm">${l}</span>${compact ? '' : `<span class="tm">${(times && times[i]) || ''}</span>`}</li>`;
  }).join('')}</ol>`;
}

/* ---------------- chrome ---------------- */
function sidebar() {
  const cur = S.screen === 'unit' ? 'units' : S.screen;
  const it = (icon, l, extra = '') => `<a class="nav-item fr" title="${l}">${ic(icon)}<span class="t">${l}</span>${extra}</a>`;
  const sub = [
    ['overview', 'Overview', 'i-gauge'],
    ['units', 'Units', 'i-cpu', '<span class="nav-alert" title="7 failed">7</span>'],
    ['bench', 'Bench', 'i-wrench'],
    ['runs', 'Test runs', 'i-activity'],
    ['suites', 'Test suites', 'i-list'],
    ['firmware', 'Firmware', 'i-zap'],
    ['stations', 'Stations', 'i-server', '<span class="nav-count">2/3</span>'],
    ['shipping', 'Shipping', 'i-truck', '<span class="nav-count">64</span>'],
  ];
  return `<nav class="sidebar${S.collapsed ? ' is-collapsed' : ''}">
    <div class="sb-brand"><svg class="wm" viewBox="0 0 670.24 84"><use href="#wordmark"/></svg><svg class="em" viewBox="0 0 176.3 235.82"><use href="#emblem"/></svg><button class="btn btn-ghost btn-sm btn-icon fr">${ic('i-panel', 'i-sm')}</button></div>
    <div class="sb-group label"><span>General</span></div>${it('i-home', 'Overview')}
    <div class="sb-group label"><span>Operations</span></div>
    ${it('i-radio', 'Devices', '<span class="nav-count">1,284</span>')}${it('i-child', 'Children', '<span class="nav-count">962</span>')}${it('i-family', 'Families', '<span class="nav-count">511</span>')}${it('i-fence', 'Geofences', '<span class="nav-alert">3</span>')}
    <div class="sb-group label"><span>Production</span></div>
    <a class="nav-item is-open qa-root fr" title="QA">${ic('i-factory')}<span class="t">QA</span>${ic('i-chev-r', 'i-sm chev')}</a>
    <div class="nav-sub">${sub.map(([k, l, icon, x]) => `<a class="nav-item fr" data-go="${k}" title="${l}"${cur === k ? ' aria-current="page"' : ''}>${ic(icon)}<span class="t">${l}</span>${x || ''}</a>`).join('')}</div>
    <div class="sb-group label"><span>Access</span></div>${it('i-users', 'Users')}${it('i-key', 'Preview access')}
    <a class="nav-item fr" title="Settings" style="margin-top:auto">${ic('i-settings')}<span class="t">Settings</span></a>
    <div class="sb-foot"><span class="avatar">AR</span><div class="who"><b>Aryan</b><span>Super admin</span></div></div>
  </nav>`;
}
function topbar() {
  const crumbs = S.screen === 'unit' ? `<span>QA</span>${ic('i-chev-r', 'i-sm')}<span data-go="units" style="cursor:pointer">Units</span>${ic('i-chev-r', 'i-sm')}<b class="mono" style="font-size:13px">${S.unit}</b>` : `<span>QA</span>${ic('i-chev-r', 'i-sm')}<b>${TITLES[S.screen]}</b>`;
  return `<div class="topbar"><div class="crumbs">${crumbs}</div><div class="field search">${ic('i-search')}<input placeholder="Search units, IMEI, chip UID" /><span class="kbd">⌘K</span></div>${btn('Scan', { icon: 'i-scan', sm: 1, go: 'bench', arg: 'idle' })}</div>`;
}

/* ---------------- FLOW ---------------- */
function vFlow() {
  const PH = [
    ['01', 'Board bring-up', [['Bench', 'bench', 'idle']], 'Operator + bench agent', [['Registered', 'Scanned, or detected on the ST-LINK. Chip UID read over SWD.'], ['QA firmware', 'qa-1.3 flashed through STM32CubeProgrammer CLI.'], ['Board tests', 'UART commands: accelerometer, modem, SIM, IMEI/ICCID, GPS NMEA, Wi-Fi scan, battery.']]],
    ['02', 'Production firmware', [['Bench', 'bench', 'loaded']], 'Bench agent + server', [['Prod firmware', '1.2 flashed and verified. The device then reports firmwareVersion itself.'], ['Functional tests', 'Server reads live telemetry: GSM ≤ 15 s and GPS ≤ 7 min (timed by uptimeMs), steps 20 ± 2.']]],
    ['03', 'Assembly', [['Bench · assembly', 'bench', 'assembly']], 'Operator', [['Assembled', 'Shoe label scanned. Unit paired to shoe, size and side.'], ['Final test', 'In-shoe GSM, GPS, Wi-Fi fallback, steps while worn, charging.']]],
    ['04', 'Dispatch', [['Shipping', 'shipping', 'ready']], 'Ops', [['Ready to ship', 'Passed every stage. Label printed.'], ['Shipped', 'Order, courier, tracking number.'], ['Delivered', 'Courier status, or the customer binds the device.']]],
    ['05', 'Field', [['Shipping', 'shipping', 'active'], ['Devices', 'units', 'delivered']], 'Automatic', [['Active', 'Bound to a child and sending telemetry.'], ['Offline', 'Delivered but silent. Uses the existing freshness scale.']]],
  ];
  const HP = [['Scan unit', 'idle', 'i-scan', 'QR on the board or shoe. A USB scanner types like a keyboard.'], ['Run next step', 'loaded', 'i-play', 'One button. The unit’s stage decides what runs.'], ['Flash', 'flashing', 'i-zap', 'Agent drives STM32CubeProgrammer. Live progress and log.'], ['Live tests', 'testing', 'i-activity', 'GSM, GPS, Wi-Fi and steps from real telemetry.'], ['Result', 'pass', 'i-check', 'PASS continues. FAIL offers retest or rework.'], ['Pair with shoe', 'assembly', 'i-shoe', 'Scan the shoe label. Size and side are recorded.']];
  const MAP = [['overview', 'Overview', 'Leads', 'Pipeline health, yield, what is failing'], ['units', 'Units', 'Admins, QA lead', 'Find any unit and its full history'], ['bench', 'Bench', 'Operators', 'The only screen an operator needs'], ['runs', 'Test runs', 'QA lead', 'Every run with measured values and logs'], ['suites', 'Test suites', 'QA / firmware', 'What runs at each stage, and thresholds'], ['firmware', 'Firmware', 'Firmware engineer', 'Builds from apps/firmware, channels, adoption'], ['stations', 'Stations', 'Admin', 'Bench PCs, agents, ST-LINKs, serial ports'], ['shipping', 'Shipping', 'Ops', 'Ready → shipped → delivered → active/offline']];
  return `${head('User flow', 'How a bare board becomes a shipped shoe, and which screen each step happens on', btn('Open bench', { v: 'primary', icon: 'i-wrench', go: 'bench', arg: 'idle' }))}
  <div class="phases">${PH.map(([no, t, where, who, items]) => `<div class="phase"><div><span class="no">${no}</span><h3>${t}</h3></div><div class="where">${where.map(([l, g, a]) => `<button type="button" class="link-tag fr" data-go="${g}" data-arg="${a}">${ic('i-arrow-ur')}${l}</button>`).join('')}<span class="tag" style="font-family:var(--font-sans)">${who}</span></div><ul>${items.map(([a, b]) => `<li><div><b>${a}</b><span>${b}</span></div></li>`).join('')}</ul></div>`).join('')}</div>
  ${pn('When something fails', `<div class="loop">
     <div class="lbox"><b>Any test fails</b><span>at any stage</span></div>${ic('i-arrow-r', 'arrow')}
     <div class="lbox">${pill('Failed', 'breach')}<span>reason, measured value and log kept</span></div>${ic('i-arrow-r', 'arrow')}
     <div class="lbox">${pill('Rework', 'caution')}<span>note, part swapped, who did it</span></div>${ic('i-arrow-r', 'arrow')}
     <div class="lbox">${pill('In QA', 'info')}<span>back to the same stage, fully retested</span></div>
     <span class="muted" style="margin:0 4px">or</span><div class="lbox">${pill('Scrapped', 'muted')}<span>terminal</span></div><div class="lbox">${pill('On hold', 'caution')}<span>waiting on parts</span></div>
   </div>`, { sub: 'A unit never skips ahead silently. Skipping a step needs a reason and shows on the timeline.' })}
  ${pn('Operator journey at the bench', `<div class="steps">${HP.map(([t, st, icon, s], i) => `<button type="button" class="stepc fr" data-go="bench" data-arg="${st}"><span class="n">STEP 0${i + 1}</span><b>${ic(icon)}${t}</b><span>${s}</span></button>`).join('')}</div>`, { sub: 'Click a step to open that Bench state. Flash and live tests play a short simulation.' })}
  ${pn('Screens in this menu', tbl(['Screen', 'Used by', 'Job'], MAP.map(([k, l, w, j]) => `<tr class="click" data-go="${k}"><td><span class="primary-cell">${l}</span></td><td>${w}</td><td class="wrap">${j}</td></tr>`).join('')), { flush: true })}`;
}

/* ---------------- OVERVIEW ---------------- */
function vOverview() {
  const pipe = [['Registered', 18], ['QA firmware', 6], ['Board tests', 22], ['Prod firmware', 9], ['Functional tests', 41], ['Assembled', 17], ['Final test', 13]];
  const hb = (l, n, o = {}) => `<div class="hb ${o.cls || ''}" data-go="${o.go || 'units'}" data-arg="${o.arg || 'qa'}"><span class="l">${o.pill || l}</span><span class="tr"><i style="width:${Math.min(100, (n / 64) * 100)}%"></i></span><span class="c">${n}</span></div>`;
  const tp = [18, 22, 15, 0, 24, 27, 31, 29, 26, 0, 33, 30, 35, 28];
  const bars = tp.map((v, i) => `<div class="b" style="--h:${(v / 40) * 100}%"><i></i><span class="tip tooltip">${5 + i} Oct · <b>${v}</b> units</span></div>`).join('');
  return `${head('QA overview', '480 units · 126 in QA · 7 failed · 64 ready to ship', `<span class="live-badge"><span class="live"></span>2 benches live</span>${btn('Register units', { icon: 'i-plus', act: 'modal', arg: 'register' })}${btn('Open bench', { v: 'primary', icon: 'i-wrench', go: 'bench', arg: 'idle' })}`)}
  <div class="toolbar">${chip('Batch', 'All')}${chip('Station')}${seg([['1d', '24h'], ['7d', '7d'], ['14d', '14d'], ['30d', '30d']], '14d')}</div>
  <div class="stats n8">
    ${stat('Total units', '480', { d: '3 batches', go: 'units', arg: 'all' })}
    ${stat('In QA', '126', { dot: 'info', d: '7 stages', go: 'units', arg: 'qa' })}
    ${stat('Failed', '7', { dot: 'breach', d: '<span class="down">↑ 2</span> since 09:00', go: 'units', arg: 'failed' })}
    ${stat('Ready to ship', '64', { dot: 'ok', go: 'shipping', arg: 'ready' })}
    ${stat('Shipped', '38', { d: 'in transit', go: 'shipping', arg: 'shipped' })}
    ${stat('Delivered', '245', { go: 'shipping', arg: 'active' })}
    ${stat('Active', '212', { dot: 'ok', d: '87% of delivered', meter: 87, mc: 'var(--ok)', go: 'shipping', arg: 'active' })}
    ${stat('Offline', '33', { dot: 'ink-4', d: 'silent > 24 h', go: 'shipping', arg: 'offline' })}
  </div>
  <div class="grid2">
    ${pn('Pipeline', `<div class="hbars"><div class="hsep label">In QA · 126</div>${pipe.map(([l, n]) => hb(l, n)).join('')}<div class="hsep label">After QA</div>${hb('', 7, { cls: 'fail', pill: pill('Failed', 'breach'), arg: 'failed' })}${hb('', 64, { pill: pill('Ready to ship', 'ok'), arg: 'ready' })}${hb('', 38, { pill: pill('In transit', 'info'), arg: 'shipped' })}${hb('', 245, { pill: 'Delivered', arg: 'delivered', cls: 'muted' })}</div><p class="note" style="margin-top:8px">Bars cap at 64. Delivered splits into 212 active and 33 offline.</p>`, { sub: 'Units at each stage right now. Click a row to filter Units.' })}
    <div class="col">
      <div class="stats n3">${stat('First-pass yield', '94.2', { unit: '%', d: '<span class="up">↑ 1.3%</span> vs last 14d', meter: 94, mc: 'var(--ok)' })}${stat('Median bench time', '6:48', { unit: 'min', d: 'scan → assembled' })}${stat('Rework', '3', { d: 'oldest 2 d' })}</div>
      ${pn('Top failing tests', `<div class="lst">
        <div class="li">${rk('fail', '')}<b>GPS fix &gt; 7 min</b><span class="r"><span class="tag" style="font-family:var(--font-sans)">Functional</span><b class="num">4</b></span></div>
        <div class="li">${rk('fail', '')}<b>GSM first packet &gt; 15 s</b><span class="r"><span class="tag" style="font-family:var(--font-sans)">Functional</span><b class="num">2</b></span></div>
        <div class="li">${rk('fail', '')}<b>Wi-Fi scan &lt; 3 APs</b><span class="r"><span class="tag" style="font-family:var(--font-sans)">Board</span><b class="num">1</b></span></div>
        <div class="li">${rk('fail', '')}<b>Modem no AT response</b><span class="r"><span class="tag" style="font-family:var(--font-sans)">Board</span><b class="num">1</b></span></div></div>
        <div style="margin-top:10px">${insight('<b>Bench 2</b> produced 3 of the 4 GPS failures. Check its antenna fixture before reworking those units.')}</div>`, { sub: 'Last 14 days' })}
    </div>
  </div>
  <div class="grid2 even">
    ${pn('Cleared to Ready, per day', `<div style="padding:8px 0 0 26px"><div class="bars-v"><span class="gl" style="bottom:50%"><span>20</span></span><span class="gl" style="bottom:100%"><span>40</span></span>${bars}</div><div class="bars-x">${tp.map((_, i) => `<span>${i % 2 ? '' : 5 + i}</span>`).join('')}</div></div>`, { sub: 'October · 0 on Sundays · hover a bar' })}
    <div class="col">
      ${side('Stations', `<div class="lst">
        <div class="li"><span class="live"></span><b>Bench 1</b><span class="r muted">idle · 34 today</span></div>
        <div class="li"><span class="live"></span><b>Bench 2</b><span class="r muted">flashing <span class="mono">SW-2204-9KD2</span></span></div>
        <div class="li">${fresh('2h ago', 'f-stale')}<b>Line jig</b><span class="r">${pill('Offline', 'muted')}</span></div></div>`, { right: btn('', { v: 'ghost', sm: 1, icon: 'i-arrow-ur', go: 'stations' }) })}
      ${side('Firmware on delivered units', `<div class="hbars">${hb('', 198, { pill: tag('1.2'), go: 'firmware', arg: '' })}${hb('', 47, { pill: tag('1.1'), go: 'firmware', arg: '', cls: 'muted' })}</div><p class="note" style="margin-top:6px">47 delivered units run a deprecated build.</p>`)}
    </div>
  </div>`;
}

/* ---------------- UNITS ---------------- */
function vUnits() {
  const T = [['all', 'All', 480], ['qa', 'In QA', 126], ['failed', 'Failed', 7], ['ready', 'Ready to ship', 64], ['shipped', 'Shipped', 38], ['delivered', 'Delivered', 245]];
  const f = U.filter((u) => ({ qa: u.stage <= 6 && u.status !== 'failed', failed: u.status === 'failed', ready: u.stage === 7, shipped: u.stage === 8, delivered: u.stage === 9 })[S.unitsTab] ?? true);
  const total = T.find((t) => t[0] === S.unitsTab)[2];
  const rows = f.map((u) => `<tr class="click${S.usel.has(u.sn) ? ' is-selected' : ''}" data-go="unit" data-arg="${u.sn}">
    <td class="c-check" data-act="usel" data-arg="${u.sn}">${cbx(S.usel.has(u.sn))}</td>
    <td><span class="primary-cell mono">${u.sn}</span></td>
    <td><span class="stage-cell">${mini(u)}<span class="nm">${STG[u.stage]}</span></span></td>
    <td>${uStatus(u)}</td>
    <td>${tag(u.fw)}</td>
    <td>${u.last[1] === 'none' ? '<span class="muted">—</span>' : `${rk(u.last[1], u.last[0])}${u.last[2] ? `<span class="sub-cell">${u.last[2]}</span>` : ''}`}</td>
    <td class="hide-md"><span class="mono">${u.imei}</span></td>
    <td class="hide-md">${u.batch}</td>
    <td>${u.st}</td>
    <td>${fresh(u.up[0], u.up[1])}</td>
    <td class="c-act">${btn('', { v: 'ghost', sm: 1, icon: 'i-more' }).replace('fr"', 'fr row-act"')}</td></tr>`).join('');
  const n = S.usel.size;
  return `${head('Units', '480 boards across 3 batches · 126 in QA right now', `${btn('Import', { icon: 'i-download' })}${btn('Print labels', { icon: 'i-printer' })}${btn('Register units', { v: 'primary', icon: 'i-plus', act: 'modal', arg: 'register' })}`)}
  ${tabs(T, S.unitsTab, 'tab-units')}
  <div class="toolbar">${search('Serial, IMEI, chip UID')}${chip('Stage')}${chip('Batch', 'B-2610-A, B-2609-C')}${chip('Firmware')}${chip('Station')}${btn('Reset', { v: 'ghost', sm: 1 })}<span class="sp"></span>${seg([['c', 'Compact'], ['f', 'Comfortable']], 'c')}</div>
  ${tbl([[cbx(false), 'c-check'], 'Unit', 'Stage', 'Status', 'Firmware', 'Last test', ['IMEI', 'hide-md'], ['Batch', 'hide-md'], 'Station', 'Updated', ['', 'c-act']], rows || `<tr><td colspan="11"><div class="empty-state"><h4>No units here</h4></div></td></tr>`, pager(`Showing 1–${f.length} of ${total}`, ['1', '2', '3', '…', '24']))}
  ${n ? `<div class="bulk bulk-float" style="bottom:28px;z-index:5"><span class="n">${cbx(true)}<b>${n}</b> selected</span><span class="sep"></span>${btn('Move to stage', { v: 'ghost', sm: 1, icon: 'i-arrow-r' })}${btn('Print labels', { v: 'ghost', sm: 1, icon: 'i-printer' })}${btn('Put on hold', { v: 'ghost', sm: 1, icon: 'i-clock' })}${btn('Scrap', { v: 'danger', sm: 1, icon: 'i-ban' })}<span class="sep"></span>${btn('', { v: 'ghost', sm: 1, icon: 'i-x', act: 'uclear' })}</div>` : ''}`;
}

/* ---------------- UNIT DETAIL ---------------- */
const BOARD = [['MCU unique ID', 'SWD', 'readable', '0039…91C4'], ['Flash verify', 'SWD', 'CRC match', 'match'], ['Battery voltage', 'UART', '3.50–4.30 V', '3.96 V'], ['LDO rail (GSM/GPS)', 'UART', 'toggles', 'ok'], ['LIS2DS12 WHO_AM_I', 'UART', '= 0x43', '0x43'], ['Accelerometer self-test', 'UART', 'in range', 'ok'], ['Modem responds to AT', 'UART', '≤ 5 s', '1.2 s'], ['SIM ready (CPIN)', 'UART', 'READY', 'READY'], ['IMEI', 'UART', '15 digits', '8679…2142'], ['ICCID', 'UART', '19–20 digits', '8991…8901'], ['Signal (CSQ)', 'UART', '≥ 10', '18'], ['GPS NMEA output', 'UART', '≤ 5 s', '0.9 s'], ['Wi-Fi AP scan (AT+WIFIAPSCAN)', 'UART', '≥ 3 APs in 30 s', '7 APs'], ['LTE serving cell (AT+NETDMSG)', 'UART', 'parsed', 'Jio · 40486']];
const FUNC = [['GSM first packet accepted', 'Cloud', 'uptime ≤ 15 s', '9.4 s'], ['Firmware reports version', 'Cloud', '= 1.2', '1.2'], ['GPS valid fix', 'Cloud', 'uptime ≤ 7:00 · ≥ 4 sats', '3:12 · 6 sats'], ['Step count', 'Cloud + operator', '20 ± 2', '20'], ['Wi-Fi location fallback', 'Cloud', 'resolves ≤ 150 m', '62 m'], ['Telemetry cadence', 'Cloud', '≥ 90% of 8 s packets', '96%']];
const FINAL = [['Shoe label matches unit', 'Scan', 'match', 'match'], ['GSM in shoe', 'Cloud', '≤ 20 s', '11.2 s'], ['GPS in shoe', 'Cloud', '≤ 7:00', '4:05'], ['Wi-Fi scan in shoe', 'Cloud', '≥ 2 APs', '5 APs'], ['Steps while worn', 'Cloud + operator', '30 ± 3', '30'], ['Charging detected', 'Manual', 'LED + voltage rise', 'ok']];
function suiteRows(name, ver, rows, si, u) {
  if (u.stage < si) return '';
  const cur = u.stage === si;
  let stop = false;
  const body = rows.map((r, i) => {
    let res = 'pass', meas = r[3];
    if (cur && u.status === 'failed') {
      if (stop) { res = 'skip'; meas = '—'; }
      else if ((u.fail === 'modem' && r[0].startsWith('Modem')) || (u.fail === 'gps' && r[0] === 'GPS valid fix') || (u.fail === 'steps' && r[0] === 'Steps while worn')) {
        res = 'fail'; meas = u.fail === 'modem' ? 'no response' : u.fail === 'gps' ? 'no fix · best 2 sats' : '24'; if (u.fail === 'modem') stop = true;
      }
    } else if (cur && u.status === 'progress' && i > 1) { res = 'run'; meas = '…'; }
    return `<tr><td><span class="ink">${r[0]}</span></td><td><span class="tag" style="font-family:var(--font-sans)">${r[1]}</span></td><td>${r[2]}</td><td><span class="mono">${meas}</span></td><td>${rk(res)}</td></tr>`;
  }).join('');
  const sum = cur && u.status === 'failed' ? pill('Failed', 'breach') : cur && u.status === 'progress' ? `<span class="live-badge"><span class="live"></span>Running</span>` : pill('Passed', 'ok');
  return `<tr><td colspan="5" style="background:var(--night-raised)"><span class="row" style="gap:10px"><b class="ink">${name}</b><span class="tag">${ver}</span>${sum}</span></td></tr>${body}`;
}
function timeline(u) {
  const T = ['09:12', '09:13', '09:16', '09:40', '09:44', '10:05', '10:30', '10:58', '15 Oct', '16 Oct'];
  const ev = [
    ['Registered', 'Chip UID read over SWD · ST-LINK #1 · Bench 1 · Ravi', 'var(--unset)'],
    ['QA firmware flashed', 'qa-1.3 · 11.8 s · verified · job FJ-8790', 'var(--ok)'],
    ['Board tests passed', 'Board bring-up v3 · 14/14 · 7 Wi-Fi APs seen', 'var(--ok)'],
    ['Production firmware flashed', '1.2 · 3.4 s · verified · device reported firmwareVersion 1.2', 'var(--ok)'],
    ['Functional tests passed', 'Functional v4 · 6/6 · GSM 9.4 s · GPS 3:12 · steps 20/20', 'var(--ok)'],
    ['Paired to shoe', 'SHOE-UK7-L-0412 · UK 7 · left · pair PR-0412', 'var(--ok)'],
    ['Final test passed', 'Final v2 · 6/6', 'var(--ok)'],
    ['Ready to ship', 'Label printed by Meena', 'var(--ok)'],
    ['Shipped', 'ORD-1043 · Delhivery · AWB 1593 2210 4471', 'var(--info)'],
    ['Delivered', 'Bound to Aarav Mehta on first boot', 'var(--trail)'],
  ];
  const out = [];
  for (let i = 0; i < u.stage; i++) out.push(`<li class="tl-item"><span class="tl-dot"><i style="background:${ev[i][2]}"></i></span><div><b>${ev[i][0]}</b><span>${ev[i][1]}</span></div><time>${T[i]}</time></li>`);
  if (u.stage === 9) out.push(`<li class="tl-item"><span class="tl-dot"><i style="background:${ev[9][2]}"></i></span><div><b>${ev[9][0]}</b><span>${ev[9][1]}</span></div><time>${T[9]}</time></li>`);
  else if (u.status === 'failed') {
    out.push(`<li class="tl-item"><span class="tl-dot"><i style="background:var(--breach)"></i></span><div><b>${STG[u.stage]} failed: ${u.last[0]}</b><span>${u.last[2]} · run R-2303 · ${u.st} · Meena</span>${u.fail === 'gps' ? '<div class="tl-note"><b>Meena:</b> GPS antenna connector looked loose. Reseated it, sending to rework.</div>' : ''}</div><time>${u.up[0]}</time></li>`);
    out.push(`<li class="tl-item"><span class="tl-dot"><i style="background:var(--caution)"></i></span><div><b>Waiting for rework</b><span>Goes back to ${STG[u.stage]} after rework</span></div><time></time></li>`);
  } else if (u.stage < 7) out.push(`<li class="tl-item"><span class="tl-dot"><i style="background:var(--trail)"></i></span><div><b>${STG[u.stage]} in progress</b><span>${u.last[0]} · ${u.last[2] || 'waiting'} · ${u.st}</span></div><time>${u.up[0]}</time></li>`);
  return `<ol class="timeline" style="padding:0">${out.reverse().join('')}</ol>`;
}
function vUnit() {
  const u = getU(S.unit);
  const T = ['09:12', '09:13', '09:16', '09:40', '09:44', '10:05', '10:30', '10:58', '15 Oct', '16 Oct'];
  const times = T.map((t, i) => (i < u.stage || u.stage === 9 ? t : i === u.stage ? 'now' : ''));
  const failed = u.status === 'failed';
  let tab = '';
  if (S.unitTab === 'timeline') tab = pn('', timeline(u));
  if (S.unitTab === 'tests') tab = u.stage < 2 ? pn('', `<div class="empty-state"><span class="ei">${ic('i-list')}</span><h4>No test runs yet</h4><p>Board tests run once the QA firmware is flashed.</p></div>`) : tbl(['Test', 'Source', 'Pass when', 'Measured', 'Result'], suiteRows('Final (in shoe)', 'v2', FINAL, 6, u) + suiteRows('Functional', 'v4', FUNC, 4, u) + suiteRows('Board bring-up', 'v3', BOARD, 2, u));
  if (S.unitTab === 'firmware') tab = tbl(['Job', 'Build', 'Station · probe', 'Duration', 'Result', 'When'], `${u.stage >= 4 ? `<tr><td><span class="mono">FJ-8812</span></td><td>${tag('1.2')}</td><td>Bench 2 · ST-LINK #1</td><td class="num">3.4 s</td><td>${rk('pass', 'Verified')}</td><td>09:40</td></tr>` : ''}${u.stage === 3 && u.status === 'progress' ? `<tr><td><span class="mono">FJ-8813</span></td><td>${tag('1.2')}</td><td>${u.st} · ST-LINK #1</td><td class="num">—</td><td>${rk('run', 'Queued')}</td><td>now</td></tr>` : ''}${u.stage >= 1 ? `<tr><td><span class="mono">FJ-8790</span></td><td>${tag('qa-1.3')}</td><td>Bench 1 · ST-LINK #1</td><td class="num">11.8 s</td><td>${rk('pass', 'Verified')}</td><td>09:13</td></tr>` : '<tr><td colspan="6"><div class="empty-state"><h4>Never flashed</h4></div></td></tr>'}`);
  if (S.unitTab === 'telemetry') tab = u.stage < 4 ? pn('', `<div class="empty-state"><span class="ei">${ic('i-signal')}</span><h4>No telemetry yet</h4><p>The unit starts reporting once it runs production firmware.</p></div>`) : `<div class="stats">${stat('Last fix', u.fail === 'gps' ? '—' : '12', { unit: u.fail === 'gps' ? '' : 's ago', d: u.fail === 'gps' ? fresh('Wi-Fi · ±62 m', 'f-stale') : fresh('GPS · ±6 m', 'f-live') })}${stat('Battery', '96', { unit: '%', d: '3.96 V', meter: 96, mc: 'var(--ok)' })}${stat('Signal', '−71', { unit: 'dBm', d: `Jio · LTE · ${u.fail === 'gps' ? 2 : 6} satellites` })}${stat('Steps', '20', { d: 'since boot · uptime 4:12' })}</div><p class="note" style="margin-top:10px">Same tiles as Devices › Overview. Telemetry from units still in QA is tagged and never reaches a child’s history.</p>`;
  if (S.unitTab === 'shoe') tab = u.stage < 5 ? pn('', `<div class="empty-state"><span class="ei">${ic('i-shoe')}</span><h4>Not in a shoe yet</h4><p>Units are paired to a shoe at the Assembly step on the Bench.</p></div>`) : `<div class="grid2 even">${side('Shoe', `<dt>Label</dt><dd><span class="mono">SHOE-UK7-L-0412</span></dd><dt>SKU</dt><dd>StepKids Runner · Navy</dd><dt>Size · side</dt><dd>UK 7 · Left</dd><dt>Pair</dt><dd>PR-0412 · <a class="act mono" href="#">SW-2177-HH2D</a></dd>`, { kv: 1 })}${side('Shipping', u.stage >= 8 ? `<dt>Order</dt><dd>ORD-1043</dd><dt>Courier</dt><dd>Delhivery · <span class="mono">1593 2210 4471</span></dd><dt>Shipped</dt><dd>15 Oct</dd><dt>Delivered</dt><dd>${u.stage === 9 ? '16 Oct' : '—'}</dd><dt>Field</dt><dd>${u.stage === 9 ? uStatus(u) : '—'}</dd>` : '<dt>Status</dt><dd class="muted">Not shipped yet</dd>', { kv: 1, right: u.stage >= 8 ? pill('Shipped', 'info') : '' })}</div>`;
  return `<div class="detail-head"><span class="device-glyph">${ic('i-cpu')}</span>
    <div style="min-width:0"><h2><span class="mono" style="font-size:19px">${u.sn}</span>${uStatus(u)}${u.status === 'progress' && u.stage > 0 && u.stage < 7 ? '<span class="live-badge"><span class="live"></span>On bench</span>' : ''}</h2>
    <div class="detail-meta"><span>${u.batch}</span><span class="dotsep"></span><span>PCB rev C</span><span class="dotsep"></span><span class="mono">chip ${u.uid}</span><span class="dotsep"></span><span>fw ${u.fw || '—'}</span></div></div>
    <div class="detail-actions">${btn('', { v: 'ghost', icon: 'i-copy', title: 'Copy serial' })}${failed ? btn('Send to rework', { icon: 'i-wrench', act: 'modal', arg: 'rework' }) : btn('Put on hold', { icon: 'i-clock' })}${btn('Open in bench', { v: 'primary', icon: 'i-scan', go: 'bench', arg: 'loaded' })}</div></div>
  ${pn('', rail(u, times))}
  <div class="stats">${stat('Stage', STG[u.stage], { sm: 1, d: `${u.stage + 1} of 10 · ${u.st}` })}${stat('Firmware', u.fw ? tag(u.fw) : '—', { sm: 1, d: u.fw ? 'reported by device · 09:40' : 'never flashed' })}${stat('Last test', u.last[1] === 'none' ? '—' : rk(u.last[1], u.last[1] === 'pass' ? 'Pass' : u.last[1] === 'fail' ? 'Fail' : 'Running'), { sm: 1, d: u.last[0] })}${stat('Device record', u.imei !== '—' ? `<a class="act" href="#" style="font-size:14px">Devices ›</a>` : '—', { sm: 1, d: u.imei !== '—' ? `<span class="mono">${u.imei}</span>` : 'created when the IMEI is read' })}</div>
  ${tabs([['timeline', 'Timeline'], ['tests', 'Tests', u.stage >= 2 ? (u.stage >= 6 ? 26 : u.stage >= 4 ? 20 : 14) : 0], ['firmware', 'Firmware', u.stage >= 4 ? 2 : u.stage >= 1 ? 1 : 0], ['telemetry', 'Telemetry'], ['shoe', 'Shoe & shipping']], S.unitTab, 'tab-unit')}
  <div class="grid2 detail"><div class="col">${tab}</div>
    <div class="col">${side('Identity', `<dt>Chip UID</dt><dd><span class="mono">${u.uid}</span></dd><dt>IMEI</dt><dd><span class="mono">${u.imei}</span></dd><dt>ICCID</dt><dd><span class="mono">${u.stage >= 3 ? '8991…8901' : '—'}</span></dd><dt>SIM</dt><dd>${u.stage >= 3 ? 'Jio · <span class="mono">…8901</span>' : '—'}</dd><dt>Batch</dt><dd>${u.batch} · rev C</dd>`, { kv: 1 })}
    ${side('Where it is', `<dt>Station</dt><dd>${u.st}</dd><dt>Probe</dt><dd>${u.stage < 7 && u.stage > 0 ? 'ST-LINK #1' : '—'}</dd><dt>Operator</dt><dd>${u.stage < 7 ? 'Meena' : '—'}</dd><dt>Updated</dt><dd>${fresh(u.up[0], u.up[1])}</dd>`, { kv: 1 })}</div></div>
  <p class="note">Mockup: from Units, open SW-2209-QP4L (failed board tests), SW-2197-T3MA (functional tests running) or SW-2041-7K9Q (delivered, active).</p>`;
}

/* ---------------- BENCH ---------------- */
const FL = [[0, '<span class="ag">[agent]</span> job FJ-8813 · STM32_Programmer_CLI v2.17.0'], [2, 'ST-LINK SN   : 0039002F3A51 (V3J7M2)'], [3, 'Voltage      : 3.29 V'], [4, 'Device ID    : 0x460 · STM32G07x/G08x · Flash 128 KB'], [8, 'Erasing sectors 0–45 … <span class="ok">done</span>'], [20, 'Opening stepwhere.ino.bin (1.2 · 92.4 KB) @ 0x08000000'], [22, 'Download in progress …'], [88, '<span class="ok">File download complete</span> · elapsed 00:00:03.412'], [90, 'Verifying …'], [97, '<span class="ok">Download verified successfully</span>'], [98, 'Option bytes: RDP level 0 (kept during QA)'], [100, '<span class="ag">[agent]</span> target reset · waiting for firmwareVersion 1.2 at ingest']];
let tmr = null, tmr2 = null;
const stopSim = () => { clearInterval(tmr); clearTimeout(tmr2); tmr = tmr2 = null; };
const setBench = (st) => { stopSim(); S.bench = st; S.sim = { p: 0, li: 0, log: [], t: 0, gps: 0, steps: 0, pk: 0, tick: 0, wifi: 0 }; };
function startSim() {
  if (S.screen !== 'bench' || S.layout !== 'single') return;
  const s = S.sim;
  if (S.bench === 'flashing') {
    tmr = setInterval(() => {
      s.p = Math.min(100, s.p + 2);
      while (s.li < FL.length && FL[s.li][0] <= s.p) s.log.push(FL[s.li++][1]);
      upd();
      if (s.p >= 100) { clearInterval(tmr); tmr2 = setTimeout(() => { setBench('testing'); render(); }, 1100); }
    }, 80);
  }
  if (S.bench === 'testing') {
    s.log = ['<span class="ag">[server]</span> watching IMEI 867946053102187 · suite Functional v4', '<span class="dim">[uart] [DEV][BOOT] Integrated Wi-Fi/cellular telemetry: 1.2</span>', '<span class="dim">[uart] [Modem] SIM READY · [IMEI] 867946053102187</span>'];
    tmr = setInterval(() => {
      s.tick++;
      if (s.t < 9.4) { s.t = Math.min(9.4, +(s.t + 0.2).toFixed(1)); if (s.t >= 9.4) s.log.push('<span class="ok">[server] first packet accepted · 201 · uptimeMs 9412 · firmwareVersion 1.2</span>'); }
      if (s.t >= 9.4 && s.wifi < 7 && s.tick % 6 === 0) { s.wifi++; if (s.wifi === 7) s.log.push('<span class="ok">[server] wifi.accessPoints 7 · location resolved ±62 m</span>'); }
      if (s.gps < 192) {
        s.gps = Math.min(192, s.gps + 4);
        const pk = Math.floor(s.gps / 8);
        if (s.t >= 9.4 && pk > s.pk) { s.pk = pk; s.log.push(`[TEL] seq=${pk} http=201 result=accepted sats=${Math.min(6, Math.floor(s.gps / 36))} steps=${s.steps}`); }
        if (s.gps >= 192) s.log.push('<span class="ok">[server] valid GPS fix · 6 satellites · uptime 3:12</span>');
      }
      if (s.t >= 4 && s.steps < 20 && s.tick % 3 === 0) s.steps++;
      upd();
      if (s.t >= 9.4 && s.gps >= 192 && s.steps >= 20 && s.wifi >= 7) { clearInterval(tmr); s.log.push('<span class="ok">[server] Functional v4 · 6/6 passed</span>'); upd(); tmr2 = setTimeout(() => { setBench('pass'); render(); }, 1400); }
    }, 100);
  }
}
function upd() { const el = document.getElementById('bw'); if (!el) return; el.innerHTML = benchWork(); const c = el.querySelector('.console'); if (c) c.scrollTop = c.scrollHeight; }
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
function unitStrip() {
  const st = S.bench;
  const fw = ['testing', 'pass', 'fail', 'assembly'].includes(st) ? '1.2' : 'qa-1.3';
  return `<div class="unit-strip"><div><h3><span class="mono" style="font-size:16px">SW-2201-4XQ7</span>${st === 'fail' ? pill('Failed', 'breach') : pill('In QA', 'info')}${tag(fw)}</h3><div class="meta"><span>B-2610-A</span><span class="dotsep"></span><span>PCB rev C</span><span class="dotsep"></span><span class="mono">IMEI 867946053102187</span><span class="dotsep"></span><span>ST-LINK #1</span></div></div>${btn('Unit page', { sm: 1, icon: 'i-arrow-ur', go: 'unit', arg: 'SW-2201-4XQ7' })}</div>`;
}
function benchWork() {
  const s = S.sim, st = S.bench;
  if (st === 'idle') return `<div class="col" style="gap:14px">
    <div><h3 style="font-size:var(--t-16);font-weight:600;display:flex;gap:8px;align-items:center">${ic('i-scan')}Scan a unit</h3><p class="note" style="margin-top:4px">Scan the QR on the board or the shoe, or type a serial. Scanning works from any screen.</p></div>
    <div class="field is-focus scan-field">${ic('i-scan')}<input placeholder="SW-2201-4XQ7" />${btn('Load', { v: 'primary', act: 'bench', arg: 'loaded', kbd: '↵' })}</div>
    <div class="or">or</div>
    <div class="detect"><div><b>${ic('i-cpu')}New board on ST-LINK #1</b><p><span class="mono">0039 2F3A 5143 91C4</span> · STM32G071CB · 3.29 V · not registered yet</p></div>${btn('Register as SW-2213', { icon: 'i-plus', act: 'bench', arg: 'loaded' })}</div>
    ${oq('Is there a printed serial or QR on the PCB? If not, the bench prints one when the board is registered.')}</div>`;
  if (st === 'loaded') return `<div class="col" style="gap:14px">${unitStrip()}${rail(U[0], null, true)}
    <div class="next"><span class="label">Next step · 4 of 10</span><h3>Flash production firmware</h3>
      <dl class="kv"><dt>Build</dt><dd>${tag('1.2')}<span class="muted">released · stepwhere.ino · 92.4 KB · sha256 9f3c…a7e1</span></dd><dt>Target</dt><dd>STM32G071CB · ST-LINK #1 (SWD) · 0x08000000</dd><dt>Then</dt><dd>Functional tests v4 start when the device reports 1.2</dd></dl>
      <div class="row" style="gap:8px">${btn('Run next step', { v: 'primary', lg: 1, icon: 'i-play', act: 'bench', arg: 'flashing', kbd: '↵' })}${btn('Run all bench steps', { lg: 1 })}<button class="select-trigger fr" style="height:40px">Build: 1.2${ic('i-chev-d', 'i-sm')}</button></div></div>
    <div class="row" style="gap:8px;font-size:var(--t-12);color:var(--ink-3)">${rk('pass', 'Board bring-up v3')} passed 14/14, 4 minutes ago · <a class="act" href="#">view run</a></div></div>`;
  if (st === 'flashing') {
    const p = s.p, ph = [['Connect', 5], ['Erase', 20], ['Program', 88], ['Verify', 97], ['Reset', 100]];
    let prev = 0;
    return `<div class="col" style="gap:14px">${unitStrip()}
      <div class="row" style="justify-content:space-between"><b class="ink" style="display:flex;gap:8px;align-items:center">${ic('i-zap')}Flashing 1.2</b><span class="num ink" style="font-weight:600">${p}%</span></div>
      <div class="prog${p >= 100 ? ' ok' : ''}"><i style="width:${p}%"></i></div>
      <div class="phase-row">${ph.map(([l, e]) => { const c = p >= e ? pill(l, 'ok') : p >= prev ? `<span class="live-badge"><span class="live"></span>${l}</span>` : `<span class="pill no-dot pill-muted">${l}</span>`; prev = e; return c; }).join('')}</div>
      <div class="console">${s.log.join('\n')}</div>
      <div class="row" style="gap:10px">${btn('Cancel', { icon: 'i-x', v: 'ghost' })}<span class="note">Esc cancels. A board cancelled mid-program is left erased.</span></div></div>`;
  }
  if (st === 'testing') {
    const gd = s.t >= 9.4, pd = s.gps >= 192, sd = s.steps >= 20, wd = s.wifi >= 7;
    const sats = Math.min(6, Math.floor(s.gps / 36)), exp = Math.max(1, Math.floor(s.gps / 8));
    const run = (l) => `<span class="live-badge"><span class="live"></span>${l}</span>`;
    return `<div class="col" style="gap:14px">${unitStrip()}
      <div class="row" style="justify-content:space-between"><b class="ink" style="display:flex;gap:8px;align-items:center">${ic('i-activity')}Functional tests v4</b><span class="note">Measured by the server from live telemetry over GSM</span></div>
      <div class="tcards">
        <div class="tc${gd ? ' pass' : ''}"><div class="top"><span class="nm">${ic('i-signal')}GSM first packet</span>${gd ? pill('Pass', 'ok') : run('Waiting')}</div><div class="big">0:${s.t.toFixed(1).padStart(4, '0')}</div><div class="prog${gd ? ' ok' : ''}"><i style="width:${(s.t / 15) * 100}%"></i></div><span class="lim">uptime limit 0:15 · CSQ 18 · fw 1.2</span></div>
        <div class="tc${pd ? ' pass' : ''}"><div class="top"><span class="nm">${ic('i-sat')}GPS valid fix</span>${pd ? pill('Pass', 'ok') : run('Acquiring')}</div><div class="big">${fmt(s.gps)}</div><div class="prog${pd ? ' ok' : ''}"><i style="width:${(s.gps / 420) * 100}%"></i></div><span class="lim">limit 7:00 · ${sats} satellites, need 4</span></div>
        <div class="tc${sd ? ' pass' : s.t >= 4 ? ' act' : ''}"><div class="top"><span class="nm">${ic('i-shoe')}Step count</span>${sd ? pill('Pass', 'ok') : s.t >= 4 ? pill('Your turn', 'caution') : '<span class="pill no-dot pill-muted">Next</span>'}</div><div class="big">${s.steps}<small> / 20</small></div>${!sd && s.t >= 4 ? `<span class="instr">${ic('i-hand')}Shake the board 20 times now</span>` : '<span class="lim">tolerance ±2 · LIS2DS12 counter</span>'}</div>
        <div class="tc${wd ? ' pass' : ''}"><div class="top"><span class="nm">${ic('i-wifi')}Wi-Fi fallback</span>${wd ? pill('Pass', 'ok') : run(gd ? 'Scanning' : 'Waiting')}</div><div class="big">${s.wifi}<small> APs</small></div><span class="lim">${wd ? 'resolved ±62 m · need ≤ 150 m' : 'AT+WIFIAPSCAN in telemetry · need ≥ 3'}</span></div>
        <div class="tc${pd ? ' pass' : ''}"><div class="top"><span class="nm">${ic('i-clock')}Cadence</span>${pd ? pill('Pass', 'ok') : run('Measuring')}</div><div class="big">${gd ? Math.max(0, exp - (exp > 12 ? 1 : 0)) : 0}<small> / ${gd ? exp : 0}</small></div><span class="lim">packets every 8 s · need ≥ 90%</span></div>
      </div>
      <div class="console" style="height:150px">${s.log.join('\n')}</div></div>`;
  }
  if (st === 'pass') return `<div class="col" style="gap:14px">${unitStrip()}
    <div class="result pass"><span class="circ">${ic('i-check')}</span><span class="word">PASS</span><span class="meta">Functional tests v4 · 6/6 · 3 min 41 s</span>
      <div class="rlist"><div><span>${rk('pass', 'GSM first packet')}</span><b>9.4 s</b></div><div><span>${rk('pass', 'Firmware reports 1.2')}</span><b>1.2</b></div><div><span>${rk('pass', 'GPS valid fix')}</span><b>3:12 · 6 sats</b></div><div><span>${rk('pass', 'Step count')}</span><b>20 / 20</b></div><div><span>${rk('pass', 'Wi-Fi fallback')}</span><b>7 APs · ±62 m</b></div><div><span>${rk('pass', 'Cadence')}</span><b>96%</b></div></div></div>
    <div class="next"><span class="label">Next step · 6 of 10</span><h3>Assembly: pair with a shoe</h3><div class="row" style="gap:8px">${btn('Continue to assembly', { v: 'primary', lg: 1, icon: 'i-arrow-r', act: 'bench', arg: 'assembly', kbd: '↵' })}${btn('Print unit label', { lg: 1, icon: 'i-printer' })}${btn('Scan next unit', { lg: 1, v: 'ghost', icon: 'i-scan', act: 'bench', arg: 'idle' })}</div></div></div>`;
  if (st === 'fail') return `<div class="col" style="gap:14px">${unitStrip()}
    <div class="result fail"><span class="circ">${ic('i-x')}</span><span class="word">FAIL</span><span class="why">GPS valid fix not reached within 7:00</span><span class="meta">best 2 satellites · the other 5 tests passed</span>
      <div class="rlist"><div><span>${rk('pass', 'GSM first packet')}</span><b>9.4 s</b></div><div><span>${rk('fail', 'GPS valid fix')}</span><b>— · 2 sats</b></div><div><span>${rk('pass', 'Step count')}</span><b>20 / 20</b></div><div><span>${rk('pass', 'Wi-Fi fallback')}</span><b>7 APs · ±62 m</b></div></div></div>
    ${insight('3 of the last 20 units on <b>Bench 2</b> failed GPS. Check the antenna fixture or the bench’s sky view before reworking this unit.')}
    <div><label class="field-label">Note for the timeline</label><div class="field area"><span>e.g. GPS antenna connector looks loose</span></div></div>
    <div class="row" style="gap:8px">${btn('Retest GPS only', { v: 'primary', icon: 'i-refresh', act: 'bench', arg: 'testing', kbd: 'R' })}${btn('Send to rework', { icon: 'i-wrench', act: 'modal', arg: 'rework' })}${btn('Scan next unit', { v: 'ghost', icon: 'i-scan', act: 'bench', arg: 'idle' })}</div></div>`;
  if (st === 'assembly') return `<div class="col" style="gap:14px">${unitStrip()}
    <div class="row" style="justify-content:space-between"><b class="ink" style="display:flex;gap:8px;align-items:center">${ic('i-shoe')}Pair SW-2201-4XQ7 with a shoe</b><span class="tag" style="font-family:var(--font-sans)">Step 6 of 10</span></div>
    <div class="grid2 even"><div class="hw"><span class="ico">${ic('i-cpu')}</span><div><div class="t">Device</div><div class="s mono">SW-2201-4XQ7 · 1.2</div></div><span class="r">${rk('pass', 'Scanned')}</span></div><div class="hw"><span class="ico">${ic('i-tag')}</span><div><div class="t">Shoe label</div><div class="s mono">SHOE-UK7-L-0412</div></div><span class="r">${rk('pass', 'Scanned')}</span></div></div>
    <div class="fgrid">
      <div><label class="field-label">SKU</label><button class="select-trigger fr" style="width:100%">StepKids Runner · Navy${ic('i-chev-d', 'i-sm')}</button></div>
      <div><label class="field-label">Size</label><button class="select-trigger fr" style="width:100%">UK 7${ic('i-chev-d', 'i-sm')}</button></div>
      <div><label class="field-label">Side</label>${seg([['l', 'Left'], ['r', 'Right']], 'l')}</div>
      <div><label class="field-label">Pair code</label><div class="field val"><span class="v mono">PR-0412</span></div><p class="field-help">Both shoes of a pair share it</p></div>
    </div>
    ${oq('One device per shoe, or one per pair? This decides whether Side and Pair code exist at all.')}
    <div class="row" style="gap:8px">${btn('Confirm and start final test', { v: 'primary', lg: 1, icon: 'i-check', kbd: '↵' })}${btn('Scan a different shoe', { lg: 1, icon: 'i-scan' })}</div></div>`;
  return '';
}
function vBench() {
  const states = [['idle', '1 Scan'], ['loaded', '2 Unit loaded'], ['flashing', '3 Flashing'], ['testing', '4 Live tests'], ['pass', '5a Pass'], ['fail', '5b Fail'], ['assembly', '6 Assembly']];
  const single = `<div class="mock-bar"><b>Prototype</b> bench states ${states.map(([k, l]) => `<button type="button" aria-pressed="${S.bench === k}" data-act="bench" data-arg="${k}">${l}</button>`).join('')}<span>Flash and live tests play on their own</span></div>
  <div class="grid-bench"><section class="pn"><div class="bd" id="bw" style="padding:20px">${benchWork()}</div></section>
    <div class="col">
      ${side('Bench 1', `<div class="col" style="gap:8px"><div class="row" style="gap:8px;font-size:var(--t-12);color:var(--ink-2)"><span class="live"></span>Agent online · v0.4.2 · Windows 11</div>
        <div class="hw"><span class="ico">${ic('i-usb')}</span><div><div class="t">ST-LINK V3 #1</div><div class="s">SWD · G071 · 3.29 V</div></div><span class="r">${pill('Ready', 'ok')}</span></div>
        <div class="hw"><span class="ico">${ic('i-terminal')}</span><div><div class="t">USB-TTL · COM5</div><div class="s">PB6/PB7 · 115200</div></div><span class="r">${pill('Streaming', 'info')}</span></div>
        <p class="note">STM32CubeProgrammer 2.17.0</p></div>`, { right: btn('', { v: 'ghost', sm: 1, icon: 'i-arrow-ur', go: 'stations' }) })}
      ${side('Recent at this bench', `<div class="lst"><div class="li"><span class="mono">SW-2200-4XQ6</span><span class="r">${rk('pass', 'Functional')}<span class="muted num">6m</span></span></div><div class="li"><span class="mono">SW-2209-QP4L</span><span class="r">${rk('fail', 'Board')}<span class="muted num">21m</span></span></div><div class="li"><span class="mono">SW-2198-T3MB</span><span class="r">${rk('pass', 'Final')}<span class="muted num">33m</span></span></div></div><p class="note" style="margin-top:8px">Today: 34 units · 2 failed</p>`)}
      ${side('Keyboard', `<div class="lst kbd-list"><div class="li"><span class="kbd">↵</span>Run next step</div><div class="li"><span class="kbd">R</span>Retest failed test</div><div class="li"><span class="kbd">N</span>Add note</div><div class="li"><span class="kbd">Esc</span>Cancel, scan next</div></div>`)}
    </div></div>`;
  const slots = `<div class="slots">
    <div class="slot"><div class="top"><b>Slot 1</b><span class="note">ST-LINK #1</span></div><div class="row" style="gap:8px"><span class="mono ink">SW-2201-4XQ7</span><span class="live-badge"><span class="live"></span>Flashing</span></div><div class="prog"><i style="width:62%"></i></div><span class="note">1.2 · 62%</span></div>
    <div class="slot"><div class="top"><b>Slot 2</b><span class="note">ST-LINK #2</span></div><div class="row" style="gap:8px"><span class="mono ink">SW-2202-4XQ8</span><span class="live-badge"><span class="live"></span>GPS 2:10</span></div><div class="prog"><i style="width:31%"></i></div><span class="note">Functional v4 · 3/6 done</span></div>
    <div class="slot pass"><div class="top"><b>Slot 3</b><span class="note">ST-LINK #3</span></div><div class="row" style="gap:8px"><span class="mono ink">SW-2203-4XQ9</span>${pill('Pass', 'ok')}</div><span class="note">Functional v4 · 6/6 · ready to unplug</span>${btn('Next unit', { sm: 1, icon: 'i-scan' })}</div>
    <div class="slot empty">${ic('i-plus')}<b class="ink" style="margin-top:6px">Slot 4</b><span class="note">Put a board on the probe, or scan one</span></div></div>
    ${oq('How many units a day? Multi-slot needs one ST-LINK and one USB-TTL per slot, or a pogo-pin jig.')}`;
  return `${head('Bench', 'Bench 1 · Ravi · scan, flash and test one unit at a time, or one per slot', `<button class="select-trigger fr"><span class="live"></span>Bench 1${ic('i-chev-d', 'i-sm')}</button>${seg([['single', 'Single'], ['slots', 'Multi-slot']], S.layout, 'layout')}`)}${S.layout === 'single' ? single : slots}`;
}

/* ---------------- RUNS ---------------- */
const RUNS = [['R-2304', 'SW-2201-4XQ7', 'Board bring-up v3', '14/14', 'pass', '2m 21s', 'Bench 1', 'Ravi', 'UART', '14:02'], ['R-2303', 'SW-2188-7B09', 'Functional v4', '5/6', 'fail', '7m 18s', 'Bench 2', 'Meena', 'Cloud', '13:44'], ['R-2302', 'SW-2197-T3MA', 'Functional v4', '3/6', 'run', '—', 'Bench 1', 'Ravi', 'Cloud', '13:58'], ['R-2301', 'SW-2171-ZN5E', 'Final v2', '5/6', 'fail', '6m 02s', 'Bench 3', 'Meena', 'Cloud + manual', '13:01'], ['R-2300', 'SW-2176-HH2C', 'Functional v4', '6/6', 'pass', '3m 41s', 'Bench 2', 'Meena', 'Cloud', '12:47'], ['R-2299', 'SW-2209-QP4L', 'Board bring-up v3', '6/14', 'fail', '0m 48s', 'Bench 1', 'Ravi', 'UART', '13:37'], ['R-2298', 'SW-2168-L9YT', 'Final v2', '6/6', 'pass', '5m 10s', 'Bench 3', 'Meena', 'Cloud + manual', '11:20']];
function vRuns() {
  const f = RUNS.filter((r) => S.runsTab === 'all' || r[4] === S.runsTab);
  return `${head('Test runs', '2,304 runs · 3 running now', btn('Export', { icon: 'i-download' }))}
  ${tabs([['all', 'All', '2,304'], ['run', 'Running', 3], ['fail', 'Failed', 7]], S.runsTab, 'tab-runs')}
  <div class="toolbar">${search('Run, unit, IMEI')}${chip('Suite')}${chip('Station', 'Bench 1, Bench 2')}${chip('Operator')}${btn('Reset', { v: 'ghost', sm: 1 })}</div>
  ${tbl(['Run', 'Unit', 'Suite', 'Result', ['Duration', 'c-num'], 'Station', 'Operator', 'Source', 'Started'], f.map((r) => `<tr class="click${S.sheet === r[0] ? ' is-selected' : ''}" data-act="sheet" data-arg="${r[0]}"><td><span class="mono">${r[0]}</span></td><td><span class="primary-cell mono">${r[1]}</span></td><td>${r[2]}</td><td>${rk(r[4], r[4] === 'pass' ? 'Passed' : r[4] === 'fail' ? 'Failed' : 'Running')}<span class="sub-cell">${r[3]}</span></td><td class="c-num">${r[5]}</td><td>${r[6]}</td><td><span class="cell-with-av"><span class="avatar plain">${r[7][0]}</span>${r[7]}</span></td><td><span class="tag" style="font-family:var(--font-sans)">${r[8]}</span></td><td class="num">${r[9]}</td></tr>`).join(''), pager(`Showing 1–${f.length} of 2,304`, ['1', '2', '3', '…', '116']))}
  <p class="note">Click a run to open its detail panel.</p>`;
}
function sheetRun() {
  return `<div class="scrim" data-close="1"><div class="sheet">
    <div class="sh-h"><div><h4><span class="mono" style="font-size:15px">R-2303</span>${pill('Failed', 'breach')}</h4><p><span class="mono">SW-2188-7B09</span> · Functional v4 · Bench 2 · Meena · 13:44 → 13:51</p></div>${btn('', { v: 'ghost', sm: 1, icon: 'i-x', act: 'close' })}</div>
    <div class="sh-b">
      <div class="stats n3">${stat('Tests', '5', { unit: '/ 6' })}${stat('Duration', '7:18', { unit: 'min' })}${stat('Firmware', tag('1.2'), { sm: 1 })}</div>
      ${tbl(['Test', 'Pass when', 'Measured', ''], [['GSM first packet', '≤ 15 s', '9.4 s', 'pass'], ['Firmware reports version', '= 1.2', '1.2', 'pass'], ['GPS valid fix', '≤ 7:00 · ≥ 4 sats', '— · 2 sats', 'fail'], ['Step count', '20 ± 2', '20', 'pass'], ['Wi-Fi fallback', '≤ 150 m', '62 m', 'pass'], ['Cadence', '≥ 90%', '97%', 'pass']].map((r) => `<tr><td><span class="ink">${r[0]}</span></td><td>${r[1]}</td><td><span class="mono">${r[2]}</span></td><td>${rk(r[3], '')}</td></tr>`).join(''))}
      <p class="note">Thresholds are copied onto the run, so editing a suite later never changes past results.</p>
      <div><span class="label">Log excerpt</span><div class="console" style="height:170px;margin-top:8px"><span class="ag">[server]</span> watching IMEI 867946053102142 · Functional v4
<span class="ok">[server] first packet accepted · 201 · uptimeMs 9412 · firmwareVersion 1.2</span>
[TEL] seq=12 http=201 result=accepted sats=1 steps=0
<span class="ok">[server] wifi.accessPoints 6 · location resolved ±62 m</span>
[TEL] seq=30 http=201 result=accepted sats=2 steps=20
[TEL] seq=52 http=201 result=accepted sats=2 steps=20
<span class="er">[server] GPS fix timeout · uptime 7:00 · best 2 satellites</span></div></div>
    </div>
    <div class="sh-f">${btn('Download log', { v: 'ghost', icon: 'i-download' })}${btn('Open unit', { go: 'unit', arg: 'SW-2188-7B09' })}${btn('Retest', { v: 'primary', icon: 'i-refresh', go: 'bench', arg: 'testing' })}</div>
  </div></div>`;
}

/* ---------------- SUITES ---------------- */
const SUITES = { board: ['Board bring-up', 'v3', 'Board tests', 'QA firmware', BOARD], functional: ['Functional', 'v4', 'Functional tests', 'Production firmware', FUNC], final: ['Final (in shoe)', 'v2', 'Final test', 'Production firmware', FINAL] };
function vSuites() {
  const s = SUITES[S.suite];
  const next = s[1].replace(/\d+/, (m) => +m + 1);
  const notes = { functional: 'GSM ≤ 15 s is now timed with the device’s own <span class="mono">uptimeMs</span>. Should the clock start at boot, or at the first AT response? 15 s to the first accepted packet is tight for the N706.', board: 'Board tests need more serial commands in the QA firmware. The debug UART already accepts commands (<span class="mono">CELLPROBE</span>), so a <span class="mono">QA …</span> command set can follow the same pattern.', final: 'Steps while worn: does the operator walk in the shoe, or use a shake rig?' };
  return `${head('Test suites', 'What runs at each stage, through which channel, and what counts as a pass', btn('New suite', { icon: 'i-plus' }))}
  <div class="grid2 side">
    ${side('Suites', `<div class="col" style="gap:2px">${Object.entries(SUITES).map(([k, x]) => `<button type="button" class="suite-i fr" aria-current="${S.suite === k}" data-act="suite" data-arg="${k}"><b>${x[0]}<span class="tag">${x[1]}</span></b><span>${x[2]} · ${x[4].length} tests · ${x[3]}</span></button>`).join('')}</div>`)}
    <div class="col">
      <div class="page-head"><div><h2 style="font-size:var(--t-16);display:flex;gap:8px;align-items:center">${s[0]} <span class="tag">${s[1]} · published</span>${pill('Draft changes', 'caution')}</h2><p>Runs at <span class="ink">${s[2]}</span> on <span class="ink">${s[3]}</span>. A blocking failure stops the unit at this stage.</p></div><div class="acts">${btn('Discard', { v: 'ghost' })}${btn(`Publish ${next}`, { v: 'primary' })}</div></div>
      ${tbl(['On', 'Test', 'Channel', 'Pass when', ['Retries', 'c-num'], 'Blocking'], s[4].map((r, i) => `<tr><td><button class="switch fr" aria-checked="true"><span class="knob"></span></button></td><td><span class="ink">${r[0]}</span></td><td><span class="tag" style="font-family:var(--font-sans)">${r[1]}</span></td><td><div class="field thr"><span>${r[2]}</span></div></td><td class="c-num">${r[1].startsWith('Cloud') ? 1 : 0}</td><td><button class="switch fr" aria-checked="${!(S.suite !== 'board' && i === s[4].length - 1)}"><span class="knob"></span></button></td></tr>`).join(''))}
      <p class="note">Each test is implemented in code, in the bench agent or the server. Only on/off, thresholds and retries are editable here. Publishing creates a new version; past runs keep theirs.</p>
      ${oq(notes[S.suite])}
    </div></div>`;
}

/* ---------------- FIRMWARE ---------------- */
function vFirmware() {
  const R = {
    prod: [['1.3-rc1', 'Draft', 'stepwhere.ino', 'rev C', '94.0 KB', 'b71e…0c3d', 'e4f1a2c', '0', 'CI · 17 Oct'], ['1.2', 'Released', 'stepwhere.ino', 'rev C', '92.4 KB', '9f3c…a7e1', '70c622b', '402', 'Aryan · 12 Oct'], ['1.1', 'Deprecated', 'stepwhere.ino', 'rev B, C', '90.8 KB', '47d0…11b9', '98c0e7f', '47', 'Aryan · 28 Sep']],
    qa: [['qa-1.3', 'Released', 'stepwhere.qa.ino', 'rev C', '88.1 KB', 'c02a…77f0', '5d6e7f8', '126', 'Aryan · 10 Oct'], ['qa-1.2', 'Deprecated', 'stepwhere.qa.ino', 'rev B, C', '86.9 KB', 'e9a1…4b2c', '3c4d5e6', '0', 'Aryan · 30 Sep']],
    dev: [['1.3-dev-wifi-quiet', 'Bench only', 'stepwhere.dev.ino', 'rev C', '97.6 KB', '5a1c…e019', '5c86e7f', '3', 'Aryan · 14 Oct'], ['wifi-exp-1', 'Bench only', 'stepwhere.experiment-wifi.ino', 'rev C', '71.3 KB', 'aa02…31d7', 'b8c25d4', '1', 'Aryan · 9 Oct']],
  }[S.fw];
  const tone = { Draft: 'unset', Released: 'ok', Deprecated: 'caution', 'Bench only': 'info' };
  return `${head('Firmware', 'Every binary a bench can flash. Built from apps/firmware, stored in S3, SHA-256 checked before each flash', `${btn('Build from main', { icon: 'i-git' })}${btn('Upload build', { v: 'primary', icon: 'i-upload', act: 'modal', arg: 'upload' })}`)}
  <div class="stats">${stat('Production', tag('1.2'), { sm: 1, d: '402 units · released 12 Oct' })}${stat('QA firmware', tag('qa-1.3'), { sm: 1, d: '126 units in QA' })}${stat('Outdated in field', '47', { d: '<span class="down">on 1.1</span> · deprecated' })}${stat('Version reporting', '100', { unit: '%', d: 'devices send firmwareVersion', meter: 100, mc: 'var(--ok)' })}</div>
  ${tabs([['prod', 'Production', 3], ['qa', 'QA', 2], ['dev', 'Dev & experiments', 2]], S.fw, 'fw')}
  ${tbl(['Version', 'Status', 'Sketch', 'HW', ['Size', 'c-num'], 'SHA-256', 'Commit', ['Units', 'c-num'], 'Uploaded', ['', 'c-act']], R.map((r) => `<tr><td>${tag(r[0])}</td><td>${pill(r[1], tone[r[1]])}</td><td><span class="mono">${r[2]}</span></td><td>${r[3]}</td><td class="c-num">${r[4]}</td><td><span class="mono">${r[5]}</span></td><td><span class="mono" style="color:var(--act)">${r[6]}</span></td><td class="c-num">${r[7]}</td><td>${r[8]}</td><td class="c-act">${btn('', { v: 'ghost', sm: 1, icon: 'i-more' })}</td></tr>`).join(''))}
  ${S.fw === 'dev' ? oq('Should the dev build (Wi-Fi and boot diagnostics) be the QA firmware, or does QA get its own sketch with a test command set?') : oq('OTA over GSM is out of scope for now. The G071 has a single flash bank, so OTA needs its own bootloader design.')}`;
}

/* ---------------- STATIONS ---------------- */
function vStations() {
  const hw = (icon, t, s, b) => `<div class="hw"><span class="ico">${ic(icon)}</span><div><div class="t">${t}</div><div class="s">${s}</div></div><span class="r">${b}</span></div>`;
  const st = (name, live, meta, h, job, today) => side(`<span class="row" style="gap:8px">${live === 'off' ? fresh('2h ago', 'f-stale') : '<span class="live"></span>'}${name}</span>`, `<div class="col" style="gap:8px"><p class="note">${meta}</p>${h}<div class="row" style="justify-content:space-between;font-size:var(--t-12)"><span class="ink">${job}</span><span class="muted">${today}</span></div></div>`, { right: btn('', { v: 'ghost', sm: 1, icon: 'i-more' }) });
  return `${head('Stations', '2 of 3 online · the agent connects out to the server, so benches can sit on any network', btn('Pair station', { v: 'primary', icon: 'i-plus', act: 'modal', arg: 'pair' }))}
  <div class="grid2 even">
    ${st('Bench 1', 'on', 'Agent 0.4.2 · Windows 11 · CubeProgrammer 2.17.0 · heartbeat 2 s ago', hw('i-usb', 'ST-LINK V3 · <span class="mono">0039002F3A51</span>', 'SWD · STM32G071 · 3.29 V', pill('Ready', 'ok')) + hw('i-terminal', 'CP2102 · COM5', 'debug UART PB6/PB7 · 115200', pill('Streaming', 'info')), 'Idle · waiting for scan', '34 units today')}
    ${st('Bench 2', 'on', 'Agent 0.4.2 · macOS 15 · CubeProgrammer 2.17.0 · heartbeat 1 s ago', hw('i-usb', 'ST-LINK V2 · <span class="mono">066DFF48</span>', 'SWD · STM32G071 · 3.31 V', '<span class="live-badge"><span class="live"></span>Flashing</span>') + hw('i-terminal', 'FTDI · tty.usbserial-A10', 'debug UART PB6/PB7 · 115200', pill('Streaming', 'info')), 'Flashing <span class="mono">SW-2204-9KD2</span> · 62%', '28 units today')}
    ${st('Line jig · Raspberry Pi', 'off', 'Agent 0.4.1 · Raspberry Pi OS · last heartbeat 2 h ago', hw('i-usb', '4 × ST-LINK V3 (pogo jig)', 'last seen 2 h ago', pill('Unknown', 'muted')), `${pill('Offline', 'muted')} <span class="muted" style="margin-left:6px">update agent to 0.4.2</span>`, '0 today')}
    ${side('How a station works', `<div class="phase" style="background:none;box-shadow:none;padding:0"><ul>
      <li><div><b>Install the agent and pair it</b><span>One command with a pairing code from here. The agent keeps a station token.</span></div></li>
      <li><div><b>It reports its hardware</b><span>ST-LINK probes with target voltage and chip ID, plus serial ports, every few seconds.</span></div></li>
      <li><div><b>The admin sends jobs</b><span>Flash a build (from S3, SHA checked) or run a UART suite. Progress and logs stream back live.</span></div></li></ul></div>`)}
  </div>`;
}

/* ---------------- SHIPPING ---------------- */
function vShipping() {
  const T = [['ready', 'Ready to ship', 64], ['shipped', 'Shipped', 38], ['active', 'Delivered · active', 212], ['offline', 'Delivered · offline', 33]];
  let body = '';
  if (S.shipTab === 'ready') {
    const R = [['SW-2168-L9YT', 'SHOE-UK7-L-0412', 'PR-0412 · L', 'UK 7', 'Today 10:58'], ['SW-2169-L9YU', 'SHOE-UK7-R-0412', 'PR-0412 · R', 'UK 7', 'Today 10:52'], ['SW-2163-P0XA', 'SHOE-UK5-L-0398', 'PR-0398 · L', 'UK 5', 'Yesterday'], ['SW-2164-P0XB', 'SHOE-UK5-R-0398', 'PR-0398 · R', 'UK 5', 'Yesterday']];
    body = tbl([[cbx(false), 'c-check'], 'Unit', 'Shoe', 'Pair · side', 'Size', 'Final test', 'Ready since'], R.map((r) => `<tr class="click${S.ssel.has(r[0]) ? ' is-selected' : ''}" data-act="ssel" data-arg="${r[0]}"><td class="c-check">${cbx(S.ssel.has(r[0]))}</td><td><span class="primary-cell mono">${r[0]}</span></td><td><span class="mono">${r[1]}</span></td><td>${r[2]}</td><td>${r[3]}</td><td>${rk('pass', '6/6')}</td><td>${r[4]}</td></tr>`).join(''), pager('Showing 1–4 of 64', ['1', '2', '…', '16']));
    if (S.ssel.size) body += `<div class="bulk bulk-float" style="bottom:28px;z-index:5"><span class="n">${cbx(true)}<b>${S.ssel.size}</b> selected</span><span class="sep"></span>${btn('Print labels', { v: 'ghost', sm: 1, icon: 'i-printer' })}${btn('Create shipment', { v: 'ghost', sm: 1, icon: 'i-truck', act: 'modal', arg: 'ship' })}<span class="sep"></span>${btn('', { v: 'ghost', sm: 1, icon: 'i-x', act: 'sclear' })}</div>`;
  }
  if (S.shipTab === 'shipped') body = tbl(['Shipment', 'Units', 'Customer', 'Courier · tracking', 'Shipped', 'Status', ['', 'c-act']], `<tr><td><span class="mono primary-cell">ORD-1043</span></td><td>2 · PR-0371</td><td>Mehta · Pune</td><td>Delhivery · <span class="mono">1593 2210 4471</span></td><td>15 Oct</td><td>${pill('Out for delivery', 'info')}</td><td>${btn('Mark delivered', { sm: 1 })}</td></tr><tr><td><span class="mono primary-cell">ORD-1041</span></td><td>2 · PR-0365</td><td>Iyer · Chennai</td><td>Blue Dart · <span class="mono">7782 1190 33</span></td><td>14 Oct</td><td>${pill('In transit', 'info')}</td><td>${btn('Mark delivered', { sm: 1 })}</td></tr><tr><td><span class="mono primary-cell">B2B-0007</span></td><td>20</td><td>Little Steps School</td><td>Hand delivery</td><td>13 Oct</td><td>${pill('Awaiting confirmation', 'caution')}</td><td>${btn('Mark delivered', { sm: 1 })}</td></tr>`) + oq('How do we learn a unit was delivered: marked by hand, from a courier API, or when the customer binds the device in the app?');
  if (S.shipTab === 'active') body = tbl(['Unit', 'Bound to', 'Family', 'Firmware', 'Status', 'Last fix', 'Delivered'], `<tr><td><span class="primary-cell mono">SW-2041-7K9Q</span></td><td><span class="cell-with-av"><span class="avatar plain">A</span>Aarav M.</span></td><td>Mehta</td><td>${tag('1.2')}</td><td>${pill('Online', 'ok')}</td><td>${fresh('12s ago', 'f-live')}</td><td>16 Oct</td></tr><tr><td><span class="primary-cell mono">SW-2047-2M4D</span></td><td><span class="cell-with-av"><span class="avatar plain">I</span>Ira S.</span></td><td>Sharma</td><td>${tag('1.2')}</td><td>${pill('Online', 'ok')}</td><td>${fresh('4m ago', 'f-recent')}</td><td>15 Oct</td></tr><tr><td><span class="primary-cell mono">SW-1876-HH2C</span></td><td><span class="cell-with-av"><span class="avatar plain">V</span>Vihaan D.</span></td><td>Desai</td><td>${tag('1.1')}</td><td>${pill('Stale', 'caution')}</td><td>${fresh('2h ago', 'f-stale')}</td><td>2 Oct</td></tr>`) + '<p class="note">Active and offline come from the existing device status and freshness. Nothing new is stored for them.</p>';
  if (S.shipTab === 'offline') body = tbl(['Unit', 'Bound to', 'Last fix', 'Last battery', 'Activation', ['', 'c-act']], `<tr><td><span class="primary-cell mono">SW-1654-C1VU</span></td><td><span class="cell-with-av"><span class="avatar plain">D</span>Diya N.</span></td><td>${fresh('3d ago', 'f-off')}</td><td><span style="color:var(--caution)">4%</span> · 3.52 V</td><td>${pill('Activated', 'ok')}</td><td>${btn('Contact family', { sm: 1 })}</td></tr><tr><td><span class="primary-cell mono">SW-2109-K6GF</span></td><td><span class="muted">Unbound</span></td><td>${fresh('never', 'f-off')}</td><td>—</td><td>${pill('Never activated', 'caution')}</td><td>${btn('Contact customer', { sm: 1 })}</td></tr><tr><td><span class="primary-cell mono">SW-1702-K6GE</span></td><td><span class="cell-with-av"><span class="avatar plain">A</span>Arjun B.</span></td><td>${fresh('9d ago', 'f-off')}</td><td>61% · 3.91 V</td><td>${pill('Activated', 'ok')}</td><td>${btn('Contact family', { sm: 1 })}</td></tr>`) + oq('When does a delivered unit count as offline: no telemetry for 24 h, or 72 h? The freshness scale calls anything over 24 h offline.');
  return `${head('Shipping', '64 ready · 38 in transit · 245 delivered', btn('Create shipment', { v: 'primary', icon: 'i-truck', act: 'modal', arg: 'ship' }))}${tabs(T, S.shipTab, 'tab-ship')}${body}`;
}

/* ---------------- dialogs ---------------- */
function modal() {
  const fd = (l, v, o = {}) => `<div><label class="field-label">${l}</label>${o.sel ? `<button class="select-trigger fr" style="width:100%">${v}${ic('i-chev-d', 'i-sm')}</button>` : `<div class="field val"><span class="v${o.mono ? ' mono' : ''}">${v}</span>${o.suffix ? `<span class="suffix">${o.suffix}</span>` : ''}</div>`}${o.help ? `<p class="field-help">${o.help}</p>` : ''}</div>`;
  const wrap = (t, d, b, f) => `<div class="scrim" data-close="1"><div class="dialog"><div class="dialog-body"><h4>${t}</h4><p>${d}</p>${b}</div><div class="dialog-foot">${btn('Cancel', { v: 'ghost', act: 'close' })}${f}</div></div></div>`;
  switch (S.modal) {
    case 'upload': return wrap('Upload firmware build', 'The binary goes to S3. Benches download it and check the SHA-256 before every flash.', `<div class="drop">${ic('i-upload')}<b>Drop .bin or .hex</b><span>from apps/firmware/.builds/artifacts · stepwhere.ino.bin</span></div><div class="fgrid">${fd('Version', '1.3', { help: 'Must match APP_VERSION in the sketch' })}${fd('Channel', 'Production', { sel: 1 })}${fd('Hardware', 'rev C', { sel: 1 })}${fd('Commit', 'e4f1a2c', { mono: 1 })}</div><div><label class="field-label">Release notes</label><div class="field area"><span>Wi-Fi fallback quiet scans, adaptive HTTP body size…</span></div></div><div class="codeline"><span>sha256 b71e 9a02 … 0c3d · 94.0 KB</span>${pill('Computed', 'ok')}</div>`, btn('Upload as draft', { v: 'primary', icon: 'i-upload' }));
    case 'pair': return wrap('Pair a station', 'Run this on the bench PC. The code expires in 10 minutes.', `${fd('Station name', 'Bench 3')}<div><label class="field-label">1 · Install the agent</label><div class="codeline"><span>Windows · macOS · Linux · Raspberry Pi</span>${btn('Download', { sm: 1, icon: 'i-download' })}</div></div><div><label class="field-label">2 · Pair</label><div class="codeline"><span>qa-agent pair --code 7KQ-29X</span>${btn('', { v: 'ghost', sm: 1, icon: 'i-copy' })}</div><p class="field-help">Needs STM32CubeProgrammer installed. The agent finds it on its own.</p></div><div class="row" style="gap:8px;font-size:var(--t-12);color:var(--ink-2)"><span class="spinner"></span>Waiting for the agent to connect…</div>`, btn('Done', { v: 'primary' }));
    case 'register': return wrap('Register units', 'Create records for a new batch of boards before they reach the bench.', `<div class="fgrid">${fd('Batch', 'B-2610-B')}${fd('PCB revision', 'rev C', { sel: 1 })}${fd('Quantity', '50', { suffix: 'boards' })}${fd('Supplier', 'JLC · PO 2231')}</div>${fd('Serials', 'SW-2213 → SW-2262', { mono: 1, help: 'Assigned in order. Print QR labels right after.' })}${oq('Or skip this: let each board register itself the first time a bench sees its chip UID.')}`, btn('Create 50 units', { v: 'primary', icon: 'i-plus' }));
    case 'rework': return wrap('Send SW-2188-7B09 to rework', 'The unit leaves the line until rework is done, then goes back to Functional tests.', `${fd('Reason', 'GPS · no fix', { sel: 1 })}<div><label class="field-label">Note</label><div class="field area"><span style="color:var(--ink)">GPS antenna connector looked loose. Reseat it and check the U.FL.</span></div></div>${fd('Return to', 'Functional tests · retest the whole suite', { sel: 1 })}<label class="check"><span class="box"><svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg></span>Scrap instead of rework</label>`, btn('Send to rework', { v: 'primary', icon: 'i-wrench' }));
    case 'ship': return wrap('Create shipment', '2 units · pair PR-0412 · UK 7', `<div class="fgrid">${fd('Order', 'ORD-1047', { mono: 1 })}${fd('Customer', 'Mehta · Pune')}${fd('Courier', 'Delhivery', { sel: 1 })}${fd('Tracking', '1593 2210 5582', { mono: 1 })}</div><div class="lst"><div class="li"><span class="mono ink">SW-2168-L9YT</span><span class="r mono">SHOE-UK7-L-0412</span></div><div class="li"><span class="mono ink">SW-2169-L9YU</span><span class="r mono">SHOE-UK7-R-0412</span></div></div>`, btn('Mark as shipped', { v: 'primary', icon: 'i-truck' }));
  }
  return '';
}

/* ---------------- render ---------------- */
const V = { flow: vFlow, overview: vOverview, units: vUnits, unit: vUnit, bench: vBench, runs: vRuns, suites: vSuites, firmware: vFirmware, stations: vStations, shipping: vShipping };
const root = document.getElementById('root');
function render(keep) {
  const old = root.querySelector('.page');
  const top = keep && old ? old.scrollTop : 0;
  const nav = ['flow', 'overview', 'units', 'unit', 'bench', 'runs', 'suites', 'firmware', 'stations', 'shipping'];
  root.innerHTML = `<div class="mock-nav"><svg class="wm" viewBox="0 0 670.24 84"><use href="#wordmark"/></svg><span class="t">QA mockup · screens</span>${nav.map((k) => `<button type="button" aria-pressed="${S.screen === k}" data-go="${k}">${k === 'unit' ? 'Unit detail' : TITLES[k]}</button>`).join('')}</div>
  <div class="screen app">${sidebar()}<div class="screen-main">${topbar()}<div class="page">${V[S.screen]()}</div>${S.sheet ? sheetRun() : ''}${S.modal ? modal() : ''}</div></div>`;
  const p = root.querySelector('.page');
  if (p) p.scrollTop = top;
  const c = root.querySelector('.console');
  if (c) c.scrollTop = c.scrollHeight;
  startSim();
}
function go(k, arg) {
  stopSim(); S.screen = k; S.modal = S.sheet = null;
  if (k === 'bench') { S.layout = 'single'; setBench(arg || 'idle'); }
  if (k === 'unit' && arg) { S.unit = arg; S.unitTab = 'timeline'; }
  if (k === 'units' && arg) S.unitsTab = arg;
  if (k === 'shipping' && arg) S.shipTab = arg;
  render();
}
function handle(t, e) {
  const { go: g, act, arg } = t.dataset;
  if (g) return go(g, arg);
  const r = () => render(true);
  switch (act) {
    case 'bench': setBench(arg); r(); break;
    case 'layout': stopSim(); S.layout = arg; r(); break;
    case 'tab-unit': S.unitTab = arg; r(); break;
    case 'tab-units': S.unitsTab = arg; r(); break;
    case 'tab-ship': S.shipTab = arg; r(); break;
    case 'tab-runs': S.runsTab = arg; r(); break;
    case 'suite': S.suite = arg; r(); break;
    case 'fw': S.fw = arg; r(); break;
    case 'modal': S.modal = arg; S.sheet = null; r(); break;
    case 'sheet': S.sheet = arg; r(); break;
    case 'close': S.modal = S.sheet = null; r(); break;
    case 'usel': S.usel.has(arg) ? S.usel.delete(arg) : S.usel.add(arg); r(); break;
    case 'ssel': S.ssel.has(arg) ? S.ssel.delete(arg) : S.ssel.add(arg); r(); break;
    case 'uclear': S.usel.clear(); r(); break;
    case 'sclear': S.ssel.clear(); r(); break;
  }
}
root.addEventListener('click', (e) => {
  if (e.target.matches('[data-close]')) { S.modal = S.sheet = null; return render(true); }
  if (e.target.closest('.switch')) { const sw = e.target.closest('.switch'); sw.setAttribute('aria-checked', String(sw.getAttribute('aria-checked') !== 'true')); return; }
  if (e.target.closest('.seg button:not([data-act])')) { const b = e.target.closest('button'); b.parentElement.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); return; }
  const t = e.target.closest('[data-go],[data-act]');
  if (t) handle(t, e);
});
new ResizeObserver(() => {
  const app = root.querySelector('.app');
  if (!app) return;
  const want = app.clientWidth < 1000;
  if (want !== !!S.collapsed) { S.collapsed = want; render(true); }
}).observe(root);
(function initFromUrl() {
  const p = new URLSearchParams(location.search);
  const s = p.get('s');
  if (!s) return;
  S.screen = s;
  if (p.get('u')) S.unit = p.get('u');
  if (p.get('t')) S.unitTab = p.get('t');
  if (p.get('ship')) S.shipTab = p.get('ship');
  if (p.get('fw')) S.fw = p.get('fw');
  if (p.get('suite')) S.suite = p.get('suite');
  if (p.get('m')) S.modal = p.get('m');
  if (p.get('sheet')) S.sheet = p.get('sheet');
  if (p.get('lay')) S.layout = p.get('lay');
  if (p.get('sel')) S.usel.add(p.get('sel'));
  if (s === 'bench') setBench(p.get('b') || 'idle');
})();
render();
(function freezeForScreenshots() {
  const p = new URLSearchParams(location.search);
  if (!p.get('freeze')) return;
  stopSim();
  if (S.bench === 'testing') Object.assign(S.sim, { t: 9.4, gps: 151, steps: 14, pk: 18, wifi: 4, log: ['<span class="ag">[server]</span> watching IMEI 867946053102187 · suite Functional v4', '<span class="ok">[server] first packet accepted · 201 · uptimeMs 9412 · firmwareVersion 1.2</span>', '[TEL] seq=17 http=201 result=accepted sats=4 steps=12', '[TEL] seq=18 http=201 result=accepted sats=4 steps=14'] });
  if (S.bench === 'flashing') { S.sim.p = 64; S.sim.log = FL.filter((x) => x[0] <= 64).map((x) => x[1]); }
  upd();
})();
