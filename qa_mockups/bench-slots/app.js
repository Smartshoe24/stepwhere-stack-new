/*
 * QA › Bench with 30 slots, on dummy data. The markup and classes mirror
 * apps/admin/src/features/qa-bench/components/slots/*.tsx and the styles are
 * the admin's compiled stylesheet, so this looks and behaves like the real page.
 * A small simulator plays the QA firmware on every slot.
 */
(() => {
  const TESTS = [
    ['power', 'Battery'], ['imu', 'Accelerometer'], ['modem', 'Modem'], ['sim', 'SIM'], ['gsm', 'GSM'],
    ['wifi', 'Wi-Fi scan'], ['cell', 'Cell tower'], ['data', 'Data link'], ['steps', 'Step counter'], ['gps', 'GPS'],
  ];
  const IDS = TESTS.map((t) => t[0]);
  const LABEL = Object.fromEntries(TESTS);
  const PROBES = ['066DFF494849', '0671FF555051', '0668FF575052', '066AFF535452'];
  const FW = 'qa-0.2.0';

  // ---- markup helpers (same classes as the React components) ------------------
  const cn = (...c) => c.filter(Boolean).join(' ');
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const BTN = "focus-trail inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md text-sm font-medium whitespace-nowrap select-none transition-[background-color,color,box-shadow,transform] duration-150 ease-trail active:scale-[0.97] disabled:pointer-events-none disabled:opacity-100 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4";
  const VARIANT = {
    default: 'bg-act-fill font-semibold text-on-act-fill shadow-[inset_0_0_0_1px_var(--act-fill-line)] hover:bg-act-fill-hover active:bg-act-fill-press [&_svg]:text-act disabled:bg-act/5 disabled:text-ink-4 disabled:[&_svg]:text-ink-4',
    outline: 'bg-overlay text-ink shadow-[inset_0_0_0_1px_var(--line)] hover:bg-hover hover:shadow-[inset_0_0_0_1px_var(--line-strong)] active:bg-raised disabled:bg-raised disabled:text-ink-4 disabled:shadow-[inset_0_0_0_1px_var(--line-faint)]',
    ghost: 'text-ink-2 hover:bg-white/5 hover:text-ink active:bg-white/[0.03] disabled:text-ink-4',
  };
  const SIZE = { default: 'h-8 px-3 has-[>svg]:ps-2.5', sm: 'h-7 px-2.5 text-xs has-[>svg]:ps-2' };
  const button = (label, { variant = 'default', size = 'default', cls = '', attrs = '', icon = '' } = {}) =>
    `<button type="button" class="${cn(BTN, VARIANT[variant], SIZE[size], cls)}" ${attrs}>${icon}${esc(label)}</button>`;
  const svg = (inner, cls = '') => `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide ${cls}" aria-hidden="true">${inner}</svg>`;
  const ICON = {
    check: (c) => svg('<path d="M20 6 9 17l-5-5"/>', c),
    x: (c) => svg('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>', c),
    minus: (c) => svg('<path d="M5 12h14"/>', c),
    circle: (c) => svg('<circle cx="12" cy="12" r="10"/>', c),
    play: (c) => svg('<polygon points="6 3 20 12 6 21 6 3"/>', c),
    retry: (c) => svg('<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>', c),
    square: (c) => svg('<rect width="18" height="18" x="3" y="3" rx="2"/>', c),
    zap: (c) => svg('<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>', c),
    clip: (c) => svg('<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>', c),
    close: (c) => svg('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>', c),
  };

  const fmt = (ms) => {
    const s = Math.max(0, Math.floor(ms / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };
  const secs = (ms) => (ms < 60000 ? `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)} s` : fmt(ms));

  // ---- dummy boards --------------------------------------------------------------
  const luhn = (body) => {
    let sum = 0;
    for (let i = 0; i < body.length; i++) {
      let d = Number(body[body.length - 1 - i]);
      if (i % 2 === 0) { d *= 2; if (d > 9) d -= 9; }
      sum += d;
    }
    return String((10 - (sum % 10)) % 10);
  };
  const imeiFor = (n) => { const b = `86194605${String(310000 + n * 37).slice(-6)}`; return b + luhn(b); };
  const chipFor = (n) => `0055003134345102313${String(70000 + n * 13).slice(-5)}`;

  const now = () => Date.now();
  const empty = () => IDS.map((id) => ({ id, status: 'pending', ms: null, data: null, error: null, progress: null, prompt: null, awaiting: null, startedAt: null, finishedAt: null }));

  function summary(id, n, failed) {
    switch (id) {
      case 'power': return { text: `${(3.85 + (n % 9) / 100).toFixed(2)} V` };
      case 'imu': return { text: `WHO_AM_I 0x43 · ${990 + (n % 17)} mg at rest` };
      case 'modem': return { text: `IMEI ${imeiFor(n)}` };
      case 'sim': return { text: `ICCID …${String(400000 + n * 71).slice(-6)}` };
      case 'gsm': return { text: `Registered in ${(6 + (n % 7) * 0.9).toFixed(1)} s · limit 15 s · ${-79 + (n % 9) * 2} dBm` };
      case 'wifi': return failed ? { text: '0 access points', error: 'No access points seen (antenna or Wi-Fi scan)' } : { text: `${3 + (n % 6)} access points` };
      case 'cell': return { text: `404-45 · cell ${31000 + n} · RSRP ${-92 - (n % 11)} dBm` };
      case 'data': return failed ? { text: null, error: 'No data IP (APN "internet", SIM data plan, coverage)' } : { text: `IP 10.42.${n}.${20 + n}` };
      case 'steps': return { text: '10/10 steps' };
      case 'gps': return failed ? { text: '2 satellites', error: 'No valid fix within 7 min (antenna or sky view)' } : { text: `Fix in ${fmt(40000 + (n * 7919) % 60000)} · ${6 + (n % 4)} satellites · HDOP 1.1` };
    }
    return { text: null };
  }

  const PLAN = {
    // slot number -> scenario
    empty: [12, 18, 24, 27, 30],
    failWifi: [14],
    failData: [7],
    failGps: [22],
    waitForStart: [9, 21, 26],
    flashing: [6],
  };
  const durFor = (id, n) => ({ power: 0.6, imu: 0.9, modem: 3, sim: 1.2, gsm: 6 + (n % 6), wifi: 3.2, cell: 1, data: 4 + (n % 5), steps: 10, gps: 25 + (n * 7919) % 70 })[id] * 1000;

  const slots = Array.from({ length: 30 }, (_, i) => {
    const n = i + 1;
    return {
      n, label: `Slot ${n}`, probe: PROBES[Math.min(3, Math.floor(i / 8))], path: `/dev/tty.usbserial-A10K${String(n).padStart(2, '0')}`,
      imei: null, chip: null, run: null, history: [], job: null, log: [], plannedEnd: 0, goAt: null,
      fail: PLAN.failWifi.includes(n) ? 'wifi' : PLAN.failData.includes(n) ? 'data' : PLAN.failGps.includes(n) ? 'gps' : null,
      operator: PLAN.waitForStart.includes(n) ? null : 3000 + ((n * 1700) % 9000),
    };
  });

  function log(slot, text) { slot.log.push(`${new Date().toTimeString().slice(0, 8)}  ${text}`); if (slot.log.length > 200) slot.log.shift(); }

  function startRun(slot, only) {
    const results = only ? empty().filter((r) => r.id === only) : empty();
    slot.run = { number: (slot.run?.number ?? 0) + 1, status: 'running', results, startedAt: now(), finishedAt: null };
    slot.chip = chipFor(slot.n);
    log(slot, `@QA {"e":"run","run":${slot.run.number},"tests":[${results.map((r) => `"${r.id}"`).join(',')}]}`);
  }

  // Put the bench in a varied state, as if it had been running for a few minutes.
  function seed() {
    const t = now();
    for (const slot of slots) {
      if (PLAN.empty.includes(slot.n)) continue;
      if (PLAN.flashing.includes(slot.n)) { slot.job = { percent: 18, startedAt: t - 3000 }; continue; }
      slot.imei = imeiFor(slot.n);
      startRun(slot);
      const offset = (slot.n * 37) % 100; // how far along this board is
      const done = offset > 70 ? IDS.length : Math.floor((offset / 70) * 9);
      slot.run.startedAt = t - (40 + offset * 3) * 1000;
      let at = slot.run.startedAt;
      slot.run.results.forEach((r, k) => {
        if (k < done) {
          const failed = slot.fail === r.id;
          const s = summary(r.id, slot.n, failed);
          Object.assign(r, { status: failed ? 'failed' : 'passed', ms: durFor(r.id, slot.n), data: { text: s.text }, error: s.error ?? null, startedAt: at, finishedAt: at + durFor(r.id, slot.n) });
          at += durFor(r.id, slot.n);
        }
      });
      if (done === IDS.length) finish(slot);
    }
    // A retry that passed GPS, while an earlier run still failed Wi-Fi: the bar keeps the Wi-Fi failure.
    const retried = slots[16];
    retried.history = [{ results: empty().map((r) => ({ ...r, status: r.id === 'wifi' ? 'failed' : 'passed', error: r.id === 'wifi' ? 'No access points seen (antenna or Wi-Fi scan)' : null })) }];
    retried.run = { number: 2, status: 'passed', startedAt: t - 70000, finishedAt: t - 9000, results: [{ ...empty()[9], status: 'passed', ms: 61000, data: { text: summary('gps', 17).text }, startedAt: t - 70000, finishedAt: t - 9000 }] };
    retried.history.unshift({ results: retried.run.results });
    retried.imei = imeiFor(17); retried.chip = chipFor(17);
  }

  function finish(slot) {
    const run = slot.run;
    run.status = run.results.some((r) => r.status === 'failed') ? 'failed' : 'passed';
    run.finishedAt = now();
    slot.history.unshift({ results: run.results });
    log(slot, `@QA {"e":"done","passed":${run.results.filter((r) => r.status === 'passed').length},"failed":${run.results.filter((r) => r.status === 'failed').length}}`);
  }

  // Same rule as combineBoardTestRuns on the server: newest run first, back to the last full run.
  function verdict(slot) {
    if (!slot.history.length) return null;
    const latest = new Map();
    for (const run of slot.history) {
      for (const r of run.results) if (!latest.has(r.id) && r.status !== 'pending' && r.status !== 'running') latest.set(r.id, r.status);
      if (run.results.length === IDS.length) break;
    }
    const failing = IDS.filter((id) => latest.get(id) === 'failed');
    const untested = IDS.filter((id) => !latest.has(id) || latest.get(id) === 'skipped');
    return { status: failing.length ? 'failed' : untested.length ? 'pending' : 'passed', failing, untested };
  }

  // ---- simulator ---------------------------------------------------------------
  function tick() {
    const t = now();
    for (const slot of slots) {
      if (slot.job) {
        slot.job.percent = Math.min(100, slot.job.percent + 9);
        if (slot.job.percent >= 100) { slot.job = null; log(slot, 'Flashed and verified. Board rebooting.'); slot.imei = imeiFor(slot.n); startRun(slot); }
        continue;
      }
      const run = slot.run;
      if (!run || run.status !== 'running') continue;
      let cur = run.results.find((r) => r.status === 'running');
      if (!cur) {
        cur = run.results.find((r) => r.status === 'pending');
        if (!cur) { finish(slot); continue; }
        cur.status = 'running'; cur.startedAt = t;
        if (cur.id === 'steps') {
          cur.awaiting = 'start'; cur.prompt = 'Pick up the board, then press Start (or type QA GO)';
          slot.goAt = slot.operator == null ? null : t + slot.operator;
        } else {
          slot.plannedEnd = t + durFor(cur.id, slot.n) * (slot.fail === cur.id && cur.id === 'gps' ? 1.6 : 1);
          if (cur.id === 'gps') cur.prompt = 'Keep the board near a window or outdoors until the GPS has a fix';
        }
        log(slot, `@QA {"e":"test","id":"${cur.id}","status":"running"}`);
        continue;
      }
      if (cur.id === 'steps' && cur.awaiting === 'start') {
        if (slot.goAt && t >= slot.goAt) go(slot);
        continue;
      }
      if (cur.id === 'steps') {
        const left = Math.max(0, slot.plannedEnd - t);
        cur.progress = `${Math.min(10, Math.ceil((1 - left / 10000) * 10))}/10 steps · ${Math.ceil(left / 1000) + 50} s left`;
      }
      if (cur.id === 'gps') cur.progress = `${Math.min(7, 1 + Math.floor((t - cur.startedAt) / 9000))} satellites · no fix yet`;
      if (t >= slot.plannedEnd) {
        const failed = slot.fail === cur.id && run.results.length === IDS.length;
        const s = summary(cur.id, slot.n, failed);
        Object.assign(cur, { status: failed ? 'failed' : 'passed', ms: t - cur.startedAt, data: { text: s.text }, error: s.error ?? null, progress: null, prompt: null, finishedAt: t });
        if (cur.id === 'modem') slot.imei = imeiFor(slot.n);
        log(slot, `@QA {"e":"test","id":"${cur.id}","status":"${failed ? 'fail' : 'pass'}","ms":${t - cur.startedAt}}`);
      }
    }
    render();
  }

  function go(slot) {
    const cur = slot.run?.results.find((r) => r.status === 'running' && r.awaiting === 'start');
    if (!cur) return;
    cur.awaiting = null; cur.prompt = 'Walk with the board, or swing it like a step, 20 times';
    slot.plannedEnd = now() + 10000; slot.goAt = null;
    log(slot, '› QA GO');
  }

  function command(slot, cmd) {
    log(slot, `› ${cmd}`);
    if (cmd === 'QA GO') return go(slot);
    if (cmd === 'QA ABORT') { if (slot.run?.status === 'running') { slot.run.status = 'aborted'; slot.run.finishedAt = now(); } return; }
    if (cmd.startsWith('QA RUN')) {
      if (slot.run?.status === 'running') return;
      const only = cmd.slice(7).trim() || null;
      // A retry of a real fault fails again; Wi-Fi on slot 14 is a broken antenna.
      if (only && slot.fail === only && only !== 'wifi') slot.fail = null;
      startRun(slot, only);
    }
  }

  // ---- slot state (port of features/qa-bench/lib/qa-slot-state.ts) ----------------
  function segments(slot) {
    const results = slot.run?.results ?? [];
    const v = verdict(slot);
    return IDS.map((id) => {
      const r = results.find((x) => x.id === id);
      if (r) return { id, status: r.status === 'running' && r.awaiting === 'start' ? 'waiting' : r.status, result: r, fromThisRun: true };
      const status = !v ? 'pending' : v.failing.includes(id) ? 'failed' : v.untested.includes(id) ? 'pending' : 'passed';
      const earlier = slot.history.flatMap((h) => h.results).find((x) => x.id === id && x.status !== 'pending');
      return { id, status, result: earlier ?? null, fromThisRun: false };
    });
  }
  const retry = (ids) => (ids.length === 1 ? { label: `Retry ${LABEL[ids[0]]}`, command: `QA RUN ${ids[0]}` } : { label: 'Run all again', command: 'QA RUN' });

  function describe(slot) {
    const segs = segments(slot);
    const passed = segs.filter((s) => s.status === 'passed').length;
    const failed = segs.filter((s) => s.status === 'failed').length;
    const base = { segs, passed, failed, current: null, step: null };
    if (slot.job) return { ...base, phase: 'flashing', headline: 'Flashing', needsYou: null, action: null };
    const run = slot.run;
    if (!run) return { ...base, phase: 'empty', headline: 'No board tested yet', needsYou: null, action: { label: 'Run tests', command: 'QA RUN' } };
    if (run.status === 'running') {
      // Between two tests the next one is about to start; show it rather than a gap.
      let i = run.results.findIndex((r) => r.status === 'running');
      if (i === -1) i = run.results.findIndex((r) => r.status === 'pending');
      const current = i === -1 ? null : { ...run.results[i], startedAt: run.results[i].startedAt ?? now() };
      const step = current ? { index: i + 1, of: run.results.length } : null;
      if (current?.awaiting === 'start') {
        const start = { label: 'Start', command: 'QA GO' };
        return { ...base, current, step, phase: 'waiting', headline: `${LABEL[current.id]}: press Start`, needsYou: { text: `${LABEL[current.id]} is ready. Pick up the board and press Start.`, action: start }, action: start };
      }
      return { ...base, current, step, phase: 'testing', headline: current ? LABEL[current.id] : 'Starting tests', needsYou: null, action: { label: 'Abort', command: 'QA ABORT' } };
    }
    if (run.status === 'aborted') return { ...base, phase: 'stopped', headline: 'Stopped before the end', needsYou: null, action: { label: 'Run tests', command: 'QA RUN' } };
    const v = verdict(slot);
    if (v?.status === 'passed') return { ...base, phase: 'passed', headline: `Passed all ${IDS.length}`, needsYou: null, action: null };
    if (v?.failing.length) {
      const label = v.failing.map((id) => LABEL[id]).join(', ');
      const err = segs.find((s) => s.status === 'failed')?.result?.error;
      const action = retry(v.failing);
      return { ...base, phase: 'failed', headline: `Failed: ${label}`, needsYou: { text: err ? `Failed ${label}: ${err}` : `Failed ${label}`, action }, action };
    }
    const label = (v?.untested ?? []).map((id) => LABEL[id]).join(', ');
    const action = v?.untested.length ? retry(v.untested) : { label: 'Run tests', command: 'QA RUN' };
    return { ...base, phase: 'stopped', headline: label ? `Not tested: ${label}` : 'Finished', needsYou: label ? { text: `${label} not tested yet, so the board can't pass.`, action } : null, action };
  }

  // ---- rendering -------------------------------------------------------------------
  const tileTone = {
    empty: 'bg-transparent shadow-[inset_0_0_0_1px_var(--line-faint)]',
    waiting: 'bg-caution-wash shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--caution)_32%,transparent)]',
    failed: 'bg-breach-wash shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--breach)_30%,transparent)]',
  };
  const headlineTone = { empty: 'text-ink-4', flashing: 'text-ink-2', testing: 'text-ink', waiting: 'text-caution', passed: 'text-ok', failed: 'text-breach', stopped: 'text-ink-3' };
  const segTone = { pending: 'bg-white/[0.07]', running: 'bg-ink-2 animate-pulse', waiting: 'bg-caution', passed: 'bg-ok/70', failed: 'bg-breach', skipped: 'bg-[repeating-linear-gradient(135deg,var(--ink-4)_0_2px,transparent_2px_4px)]' };
  const boardId = (slot) => (slot.imei ? `IMEI …${slot.imei.slice(-4)}` : slot.chip ? `chip …${slot.chip.slice(-8)}` : null);

  let hover = { n: null, test: null };
  let openSlot = null;

  function card(slot, v, t) {
    const run = slot.run;
    const stepElapsed = v.current?.startedAt && v.phase !== 'waiting' ? fmt(t - v.current.startedAt) : '';
    const total = run ? fmt((run.finishedAt ?? t) - run.startedAt) : '';
    const action = v.phase === 'waiting' || v.phase === 'failed' ? v.action : null;
    const footer = v.phase === 'flashing' ? FW : v.step ? `Step ${v.step.index} of ${v.step.of}` : v.phase === 'passed' ? 'Unplug, next board' : v.phase === 'failed' ? `${v.passed} passed · ${v.failed} failed` : v.phase === 'empty' ? 'Put a board in' : '';
    const bar = v.phase === 'flashing'
      ? `<div class="mt-auto h-1.5 overflow-hidden rounded-[2px] bg-white/[0.07]"><div class="h-full bg-ink-3 transition-[width] duration-300" style="width:${slot.job.percent}%"></div></div>`
      : v.phase === 'empty' ? '<div class="mt-auto"></div>'
        : `<div class="mt-auto flex gap-[3px]">${v.segs.map((s) => `<span data-test="${s.id}" class="${cn('h-1.5 flex-1 rounded-[2px]', segTone[s.status], !s.fromThisRun && s.status !== 'pending' && 'opacity-50', hover.n === slot.n && hover.test === s.id && 'outline-[1.5px] outline-offset-1 outline-ink outline-solid')}"></span>`).join('')}</div>`;
    return `<div role="button" tabindex="0" data-slot="${slot.n}" aria-label="${esc(`${slot.label}: ${v.headline}`)}" class="${cn('focus-trail flex min-h-[128px] cursor-pointer flex-col gap-1.5 rounded-lg bg-raised p-3 text-start shadow-[inset_0_0_0_1px_var(--line-faint)] transition-shadow duration-150 hover:shadow-[inset_0_0_0_1px_var(--line-strong)]', tileTone[v.phase])}">
      <div class="flex items-baseline justify-between gap-2"><span class="truncate text-[13px] font-semibold text-ink">${slot.label}</span><span class="shrink-0 font-mono text-[10px] text-ink-4">ST …${slot.probe.slice(-4)}</span></div>
      <span class="truncate font-mono text-[11px] text-ink-3">${esc(boardId(slot) ?? ' ')}</span>
      <div class="flex items-baseline justify-between gap-2 text-xs"><span class="${cn('truncate font-medium', headlineTone[v.phase])}">${v.phase === 'passed' ? '✓ ' : ''}${esc(v.headline)}</span><span class="shrink-0 text-[11px] text-ink-3 tabular">${v.phase === 'flashing' ? `${slot.job.percent}%` : stepElapsed}</span></div>
      ${bar}
      ${action
        ? button(action.label, { variant: v.phase === 'waiting' ? 'default' : 'outline', size: 'sm', cls: 'mt-0.5 h-6 text-[11px]', attrs: `data-cmd="${action.command}" data-cmd-slot="${slot.n}"` })
        : `<div class="flex items-baseline justify-between gap-2 text-[11px] text-ink-3"><span class="truncate">${esc(footer)}</span><span class="shrink-0 tabular">${total}</span></div>`}
    </div>`;
  }

  function segIcon(status) {
    if (status === 'passed') return ICON.check('size-3 text-ok');
    if (status === 'failed') return ICON.x('size-3 text-breach');
    if (status === 'skipped') return ICON.minus('size-3 text-ink-4');
    if (status === 'running') return '<span class="size-2 animate-pulse rounded-full bg-ink"></span>';
    if (status === 'waiting') return '<span class="size-2 rounded-full bg-caution"></span>';
    return ICON.circle('size-2.5 text-ink-4');
  }

  function details(slot, v, t) {
    const run = slot.run;
    const left = v.segs.length - v.passed - v.failed;
    const nowBox = v.phase === 'flashing' ? ['text-ink', `Flashing ${FW} · ${slot.job.percent}%`, 'The board tests start when the board reboots.']
      : v.phase === 'waiting' ? ['text-caution', `Step ${v.step.index} of ${v.step.of} · ${LABEL[v.current.id]}`, 'Waiting for you: pick up the board and press Start.']
        : v.phase === 'testing' && v.current ? ['text-ink', `Step ${v.step.index} of ${v.step.of} · ${LABEL[v.current.id]}`, [v.current.progress ?? v.current.prompt, `running for ${fmt(t - v.current.startedAt)}`].filter(Boolean).join(' · ')]
          : v.phase === 'failed' ? ['text-breach', v.headline, v.segs.find((s) => s.status === 'failed')?.result?.error ?? 'Failed in an earlier run.']
            : v.phase === 'passed' ? ['text-ok', `Passed all ${v.segs.length} tests`, 'Board tests passed on the unit.']
              : ['text-ink-2', v.headline, null];
    const rows = v.phase === 'flashing' ? '' : `<ul class="grid">${v.segs.map((s) => {
      const text = s.status === 'running' ? 'running…' : s.status === 'waiting' ? 'press Start' : !s.fromThisRun && s.status !== 'pending' ? 'earlier run' : s.result ? (s.status === 'failed' ? s.result.error : s.result.data?.text) : '';
      return `<li class="${cn('grid grid-cols-[14px_minmax(0,1fr)_auto] items-center gap-2 rounded px-1.5 py-[3px] text-ink-2', hover.test === s.id && 'bg-white/[0.06] text-ink')}"><span class="grid place-items-center">${segIcon(s.status)}</span><span class="truncate">${LABEL[s.id]}</span><span class="max-w-[150px] truncate text-end text-[11px] text-ink-3">${esc(text ?? '')}</span></li>`;
    }).join('')}</ul>`;
    return `<div class="grid gap-2 text-xs">
      <div class="flex items-baseline justify-between gap-2"><span class="text-[13px] font-semibold">${slot.label}</span><span class="truncate font-mono text-[10px] text-ink-3">${slot.path}</span></div>
      <dl class="grid grid-cols-[72px_minmax(0,1fr)] gap-x-2 gap-y-0.5 text-[11px]">
        <dt class="text-ink-4">Device ID</dt><dd class="truncate font-mono text-ink-2">${slot.imei ?? 'not read yet'}</dd>
        <dt class="text-ink-4">Chip</dt><dd class="truncate font-mono text-ink-2">${slot.chip ? slot.chip.match(/.{1,4}/g).join(' ') : '—'}</dd>
        <dt class="text-ink-4">Firmware</dt><dd class="truncate font-mono text-ink-2">${run ? FW : '—'}</dd>
        <dt class="text-ink-4">ST-LINK</dt><dd class="truncate font-mono text-ink-2">${slot.probe} · shared</dd>
      </dl>
      <div class="rounded-md bg-white/[0.04] px-2.5 py-1.5"><p class="${cn('font-medium', nowBox[0])}">${esc(nowBox[1])}</p>${nowBox[2] ? `<p class="mt-0.5 text-[11px] text-ink-3">${esc(nowBox[2])}</p>` : ''}</div>
      ${rows}
      <div class="flex justify-between border-t border-line-faint pt-1.5 text-[11px] text-ink-3"><span>${v.passed} passed · ${v.failed} failed · ${left} left</span><span class="tabular">${run ? fmt((run.finishedAt ?? t) - run.startedAt) : ''}</span></div>
    </div>`;
  }

  const COUNTS = [['testing', 'testing', 'bg-ink-2'], ['flashing', 'flashing', 'bg-ink-3'], ['waiting', 'waiting for you', 'bg-caution'], ['passed', 'passed', 'bg-ok'], ['failed', 'failed', 'bg-breach'], ['stopped', 'stopped', 'bg-ink-4'], ['empty', 'empty', 'bg-ink-4']];

  const $ = (sel) => document.querySelector(sel);
  const tip = document.createElement('div');
  tip.className = 'fixed z-50 w-[300px] rounded-xl bg-overlay p-3 text-ink shadow-overlay';
  tip.style.display = 'none';
  tip.style.pointerEvents = 'none';
  document.body.appendChild(tip);

  function render() {
    const t = now();
    const views = new Map(slots.map((s) => [s.n, describe(s)]));
    const count = Object.fromEntries(COUNTS.map(([k]) => [k, 0]));
    views.forEach((v) => count[v.phase]++);
    $('#demo-counts').innerHTML = COUNTS.filter(([k]) => k !== 'stopped' || count[k]).map(([k, label, dot]) => `<span class="inline-flex items-center gap-1.5"><span class="size-1.5 rounded-full ${dot}"></span><b class="font-semibold text-ink tabular">${count[k]}</b>${label}</span>`).join('');

    const needs = slots.map((s) => ({ s, v: views.get(s.n) })).filter((e) => e.v.needsYou).sort((a, b) => Number(b.v.phase === 'waiting') - Number(a.v.phase === 'waiting'));
    $('#demo-needs').innerHTML = needs.length ? `<div class="rounded-md bg-canvas px-3 py-1 shadow-[inset_0_0_0_1px_var(--line-faint)]"><p class="py-1.5 text-xs font-semibold text-ink-2">Needs you · ${needs.length}</p><ul class="grid border-t border-line-faint xl:grid-cols-2 xl:gap-x-6 [&>li]:border-b [&>li]:border-line-faint [&>li:last-child]:border-b-0 xl:[&>li:nth-last-child(2):nth-child(odd)]:border-b-0">${needs.map(({ s, v }) => `<li class="grid grid-cols-[3px_64px_minmax(0,1fr)_auto] items-center gap-3 py-1.5 text-xs"><span class="${cn('h-4 rounded-full', v.phase === 'failed' ? 'bg-breach' : 'bg-caution')}"></span><button type="button" data-open="${s.n}" class="focus-trail truncate text-start font-medium text-ink-2 hover:text-ink">${s.label}</button><span class="truncate text-ink-3">${esc(v.needsYou.text)}</span>${v.needsYou.action ? button(v.needsYou.action.label, { variant: v.phase === 'waiting' ? 'default' : 'outline', size: 'sm', cls: 'h-6 text-[11px]', attrs: `data-cmd="${v.needsYou.action.command}" data-cmd-slot="${s.n}"` }) : '<span></span>'}</li>`).join('')}</ul></div>` : '';

    $('#demo-grid').innerHTML = slots.map((s) => card(s, views.get(s.n), t)).join('');
    const idle = slots.filter((s) => ['empty', 'stopped'].includes(views.get(s.n).phase));
    const runAll = $('#demo-run-idle');
    if (runAll) runAll.lastChild.textContent = `Run tests on ${idle.length} idle`;

    if (hover.n) showTip(hover.n, views.get(hover.n), t); else tip.style.display = 'none';
    if (openSlot) renderSheet(slots[openSlot - 1], views.get(openSlot), t);
  }

  function showTip(n, v, t) {
    const el = document.querySelector(`[data-slot="${n}"]`);
    if (!el || v.phase === 'empty') { tip.style.display = 'none'; return; }
    tip.innerHTML = details(slots[n - 1], v, t);
    tip.style.display = 'block';
    const r = el.getBoundingClientRect();
    const w = tip.offsetWidth; const h = tip.offsetHeight;
    let x = r.right + 8; if (x + w > window.innerWidth - 12) x = r.left - w - 8;
    let y = Math.min(r.top, window.innerHeight - h - 12); y = Math.max(12, y);
    tip.style.left = `${x}px`; tip.style.top = `${y}px`;
  }

  // ---- slot sheet ------------------------------------------------------------------
  const sheet = document.createElement('div');
  document.body.appendChild(sheet);
  const BADGE = { muted: 'bg-white/5 text-ink-3 shadow-[inset_0_0_0_1px_var(--line-faint)]', info: 'bg-info-wash text-info', caution: 'bg-caution-wash text-caution', ok: 'bg-ok-wash text-ok', breach: 'bg-breach-wash text-breach' };
  const PHASE_BADGE = { empty: ['muted', 'Empty'], flashing: ['info', 'Flashing'], testing: ['info', 'Testing'], waiting: ['caution', 'Waiting for you'], passed: ['ok', 'Passed'], failed: ['breach', 'Failed'], stopped: ['muted', 'Stopped'] };

  function checklistRow(r, running) {
    const live = r.status === 'running';
    const tone = r.status === 'failed' ? 'font-medium text-breach' : r.status === 'pending' || r.status === 'skipped' ? 'text-ink-3' : 'text-ink';
    return `<li class="${cn('grid grid-cols-[20px_minmax(0,1fr)_auto] items-start gap-3 py-2.5', live && 'bg-white/[0.04] -mx-4 px-4')}">
      <span class="mt-0.5 grid size-5 place-items-center">${r.status === 'passed' ? ICON.check('size-3.5 text-ok') : r.status === 'failed' ? ICON.x('size-3.5 text-breach') : r.status === 'running' ? '<span class="size-3 animate-spin rounded-full border-2 border-ink-3 border-e-transparent"></span>' : ICON.circle('size-2.5 text-ink-4')}</span>
      <div class="min-w-0"><div class="flex flex-wrap items-baseline gap-x-2"><span class="${cn('text-sm', tone)}">${LABEL[r.id]}</span>${r.data?.text ? `<span class="truncate text-xs text-ink-3 tabular">${esc(r.data.text)}</span>` : ''}</div>
      ${r.prompt && live ? `<div class="mt-1.5 flex items-center justify-between gap-3 rounded-md bg-caution-wash px-2.5 py-1.5 text-xs font-medium text-caution"><span>${esc(r.prompt)}</span>${r.awaiting === 'start' ? button('Start', { size: 'sm', cls: 'h-6 text-[11px]', icon: ICON.play(''), attrs: `data-cmd="QA GO" data-cmd-slot="${openSlot}"` }) : ''}</div>` : ''}
      ${r.progress && live ? `<p class="mt-1 text-xs text-ink-2 tabular">${esc(r.progress)}</p>` : ''}
      ${r.error ? `<p class="mt-0.5 text-xs text-breach/90">${esc(r.error)}</p>` : ''}</div>
      <div class="flex items-center gap-2">${r.ms != null ? `<span class="text-xs text-ink-4 tabular">${secs(r.ms)}</span>` : ''}${!running && r.status === 'failed' ? button('Retry', { variant: 'ghost', size: 'sm', icon: ICON.retry(''), attrs: `data-cmd="QA RUN ${r.id}" data-cmd-slot="${openSlot}"` }) : ''}</div>
    </li>`;
  }

  function renderSheet(slot, v, t) {
    const run = slot.run; const running = run?.status === 'running';
    const [tone, label] = PHASE_BADGE[v.phase];
    const keepScroll = sheet.querySelector('[data-scroll]')?.scrollTop ?? 0;
    const consoleScroll = sheet.querySelector('[data-console]');
    const atBottom = !consoleScroll || consoleScroll.scrollTop + consoleScroll.clientHeight >= consoleScroll.scrollHeight - 4;
    sheet.innerHTML = `<div data-close class="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px]"></div>
    <div data-scroll class="fixed z-50 flex flex-col bg-overlay text-ink shadow-overlay inset-y-0 inset-e-0 h-full border-s border-line-faint w-full gap-0 overflow-y-auto sm:max-w-xl">
      <div class="flex flex-col gap-1.5 p-4 border-b border-line-faint pe-12">
        <div class="flex items-center gap-2"><h2 class="text-lg leading-tight font-semibold tracking-[-0.01em] text-ink">${slot.label}</h2><span class="${cn('inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1.5 rounded-full px-2 text-xs leading-none font-medium whitespace-nowrap', BADGE[tone])}"><span class="size-1.5 shrink-0 rounded-full bg-current"></span>${label}</span></div>
        <div class="grid gap-0.5 text-xs text-ink-2"><span>${slot.imei ? `IMEI <span class="font-mono text-ink-2">${slot.imei}</span> · <a class="text-act hover:text-act-hover" href="#" onclick="return false">Open unit</a>` : slot.chip ? `Chip <span class="font-mono">${slot.chip.match(/.{1,4}/g).join(' ')}</span>` : 'No board read yet'}</span><span class="font-mono">${slot.path} · ST-LINK ${slot.probe} · shared</span></div>
      </div>
      <button type="button" data-close class="focus-trail absolute inset-e-3 top-3 grid size-7 place-items-center rounded-md text-ink-3 transition-colors hover:bg-white/5 hover:text-ink">${ICON.close('size-4')}</button>
      <div class="grid grid-cols-[minmax(0,1fr)] gap-4 p-4">
        <div class="flex flex-wrap items-center gap-2">
          ${slot.job ? button(`Cancel flash · ${slot.job.percent}%`, { variant: 'outline', icon: ICON.square('') }) : button(`Flash ${FW}`, { variant: 'outline', icon: ICON.zap(''), attrs: `data-flash="${slot.n}" ${running ? 'disabled' : ''}` })}
          ${running ? button('Abort tests', { variant: 'outline', icon: ICON.square(''), attrs: `data-cmd="QA ABORT" data-cmd-slot="${slot.n}"` }) : button('Run board tests', { icon: ICON.clip(''), attrs: `data-cmd="QA RUN" data-cmd-slot="${slot.n}"` })}
          ${run ? `<span class="ms-auto text-xs text-ink-3 tabular">Run ${run.number} · ${FW} · ${fmt((run.finishedAt ?? t) - run.startedAt)}</span>` : ''}
        </div>
        ${run ? `<ul class="divide-y divide-line-faint">${run.results.map((r) => checklistRow(r, running)).join('')}</ul>` : '<p class="text-sm text-ink-3">Flash the QA firmware, or press Run board tests if the board already has it.</p>'}
        ${run && !running && run.results.length < IDS.length && v.phase === 'failed' ? `<div class="rounded-md bg-canvas px-3 py-2 shadow-[inset_0_0_0_1px_var(--line-faint)]"><p class="text-xs font-medium text-ink-2">Still keeping this unit from passing</p><ul>${verdict(slot).failing.filter((id) => !run.results.some((r) => r.id === id)).map((id) => `<li class="flex items-center justify-between gap-3 py-1.5"><span class="text-sm"><span class="text-breach">${LABEL[id]}</span><span class="ms-2 text-xs text-ink-3">failed in an earlier run</span></span>${button('Retry', { variant: 'ghost', size: 'sm', icon: ICON.retry(''), attrs: `data-cmd="QA RUN ${id}" data-cmd-slot="${slot.n}"` })}</li>`).join('')}</ul></div>` : ''}
        <section class="min-w-0 overflow-hidden rounded-lg bg-raised shadow-[inset_0_0_0_1px_var(--line-faint)]">
          <header class="flex min-h-10 items-center justify-between gap-3 border-b border-line-faint px-4 py-2.5"><div class="min-w-0"><h2 class="text-sm font-semibold text-ink">Serial console</h2><p class="mt-0.5 text-xs text-pretty text-ink-3"><span class="font-mono text-xs">${slot.path}</span></p></div></header>
          <div class="p-4"><div data-console class="h-[260px] overflow-y-auto rounded-md bg-inset p-3 font-mono text-[11px] leading-relaxed text-ink-2 shadow-[inset_0_0_0_1px_var(--line-faint)]">${slot.log.map((l) => `<div class="${l.includes('›') ? 'text-act' : l.includes('"fail"') ? 'text-breach' : ''}">${esc(l)}</div>`).join('') || '<span class="text-ink-4">No output yet.</span>'}</div></div>
        </section>
      </div>
    </div>`;
    sheet.querySelector('[data-scroll]').scrollTop = keepScroll;
    const c = sheet.querySelector('[data-console]'); if (c && atBottom) c.scrollTop = c.scrollHeight;
  }

  // ---- events --------------------------------------------------------------------
  document.addEventListener('mouseover', (e) => {
    const el = e.target.closest?.('[data-slot]');
    if (!el) { if (hover.n) { hover = { n: null, test: null }; tip.style.display = 'none'; render(); } return; }
    const n = Number(el.dataset.slot);
    const test = e.target.closest('[data-test]')?.dataset.test ?? null;
    if (hover.n !== n || hover.test !== test) { hover = { n, test }; render(); }
  });
  document.addEventListener('click', (e) => {
    const cmd = e.target.closest('[data-cmd]');
    if (cmd) { e.stopPropagation(); command(slots[Number(cmd.dataset.cmdSlot) - 1], cmd.dataset.cmd); render(); return; }
    const flash = e.target.closest('[data-flash]');
    if (flash) { const s = slots[Number(flash.dataset.flash) - 1]; s.job = { percent: 4 }; s.run = null; s.history = []; s.fail = null; log(s, `Flashing ${FW} with ST-LINK ${s.probe}…`); render(); return; }
    if (e.target.closest('[data-close]')) { openSlot = null; sheet.innerHTML = ''; return; }
    const open = e.target.closest('[data-open],[data-slot]');
    if (open) { openSlot = Number(open.dataset.open ?? open.dataset.slot); hover = { n: null, test: null }; tip.style.display = 'none'; render(); return; }
    if (e.target.closest('#demo-run-idle')) { slots.filter((s) => ['empty', 'stopped'].includes(describe(s).phase)).forEach((s) => command(s, 'QA RUN')); render(); }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && openSlot) { openSlot = null; sheet.innerHTML = ''; } });
  window.addEventListener('scroll', () => { if (hover.n) render(); }, { passive: true });

  seed();
  render();
  setInterval(tick, 1000);
})();
