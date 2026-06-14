// ─────────────────────────────────────────────────────────
// Constants & state
// ─────────────────────────────────────────────────────────

const TODAY = (() => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
})();

const MONTH_NAMES = [
  'Januari','Februari','Maret','April','Mei','Juni',
  'Juli','Agustus','September','Oktober','November','Desember'
];
const DAY_NAMES = ['Min','Sen','Sel','Rab','Kam','Jum','Sab'];

let mode      = 'range';   // 'range' | 'single'
let comp      = false;     // comparison mode on/off
let step      = null;      // current picking step: 'aS'|'aE'|'bS'|'bE'|null
let calYear   = TODAY.getFullYear();
let calMonth  = TODAY.getMonth();
let hoverDate = null;      // tracked for range preview — NO DOM rebuild on hover

// Selection state
let sel = { aS: null, aE: null, bS: null, bE: null };

// Cached cell metadata (built once per month, reused by repaintCells)
let cells = [];


// ─────────────────────────────────────────────────────────
// Pure helpers
// ─────────────────────────────────────────────────────────

/** Strip time component from a date */
const stripTime = d => {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
};

/** True if two dates are the same calendar day */
const sameDay = (a, b) => a && b && a.getTime() === b.getTime();

/** True if d is strictly between a and b (order-independent) */
const between = (d, a, b) => {
  const lo = a < b ? a : b;
  const hi = a < b ? b : a;
  return d > lo && d < hi;
};

/** Format date for display */
const fmtDisplay = d =>
  d ? d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

/** Format date as ISO string YYYY-MM-DD */
const fmtISO = d => d ? d.toISOString().split('T')[0] : '';

/** Day difference between two dates */
const dayDiff = (a, b) => Math.round((b - a) / 864e5);

/** Get element by id */
const el = id => document.getElementById(id);


// ─────────────────────────────────────────────────────────
// Calendar – repaint (CSS only, no DOM rebuild)
// ─────────────────────────────────────────────────────────

/**
 * Update CSS classes on existing day buttons without touching the DOM.
 * Called on every hover event and after any selection change.
 * Key insight: never call buildCal() during hover — that destroys
 * event listeners and makes clicks unreliable.
 */
function repaintCells() {
  const btnEls = el('grid').querySelectorAll('button.dy');
  if (btnEls.length !== cells.length) return;

  // Effective end dates (real selection or hover preview)
  const effAEnd = sel.aE || (step === 'aE' && hoverDate ? hoverDate : null);
  const effBEnd = sel.bE || (step === 'bE' && hoverDate ? hoverDate : null);

  cells.forEach(({ ds, col, out, fut }, i) => {
    if (out || fut) return;

    const btn = btnEls[i];
    btn.classList.remove('sA','rA','r0A','r6A','sB','rB','r0B','r6B');

    // Period A
    paintPeriod(btn, ds, col, sel.aS, sel.aE, effAEnd, 'A');

    // Period B (only in comparison mode)
    if (comp) {
      paintPeriod(btn, ds, col, sel.bS, sel.bE, effBEnd, 'B');
    }
  });
}

/** Apply sel/range/edge classes for one period */
function paintPeriod(btn, ds, col, start, end, effEnd, suffix) {
  const isStart = sameDay(ds, start);
  const isEnd   = sameDay(ds, end);

  if (isStart || isEnd) {
    btn.classList.add('s' + suffix);
    return;
  }

  const lo = start && effEnd ? (start < effEnd ? start : effEnd) : null;
  const hi = start && effEnd ? (start < effEnd ? effEnd : start) : null;

  if (lo && hi && between(ds, lo, hi)) {
    btn.classList.add('r' + suffix);
    if (col === 0) btn.classList.add('r0' + suffix);
    if (col === 6) btn.classList.add('r6' + suffix);
  }
}


// ─────────────────────────────────────────────────────────
// Calendar – build (DOM creation, called only on month change)
// ─────────────────────────────────────────────────────────

/**
 * Rebuild the calendar grid for the current calYear/calMonth.
 * Only called when the displayed month actually changes — never during hover.
 */
function buildCal() {
  populateSelects();

  const grid = el('grid');
  grid.innerHTML = DAY_NAMES.map(d => `<div class="dh">${d}</div>`).join('');

  const firstDow  = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const prevMonthLast = new Date(calYear, calMonth, 0).getDate();

  // Build flat array of all cells (prev-month padding + current + next-month padding)
  const allDates = [];
  for (let i = firstDow - 1; i >= 0; i--)
    allDates.push({ d: new Date(calYear, calMonth - 1, prevMonthLast - i), out: true });
  for (let i = 1; i <= daysInMonth; i++)
    allDates.push({ d: new Date(calYear, calMonth, i), out: false });
  while (allDates.length % 7) {
    const last = allDates[allDates.length - 1].d;
    allDates.push({ d: new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1), out: true });
  }

  // Reset cell metadata cache
  cells = [];

  allDates.forEach(({ d, out }, i) => {
    const ds  = stripTime(d);
    const col = i % 7;
    const fut = !out && ds > TODAY;

    cells.push({ ds, col, out, fut });

    const btn = document.createElement('button');
    btn.className = 'dy';
    btn.textContent = d.getDate();

    if (out) {
      btn.classList.add('out');
    } else if (fut) {
      btn.classList.add('fut');
      btn.title = 'Tidak bisa memilih tanggal mendatang';
    } else {
      if (sameDay(ds, TODAY)) btn.classList.add('tod');
      attachDayListeners(btn, d);
    }

    grid.appendChild(btn);
  });

  repaintCells();
}

/** Attach click + hover listeners to a valid (non-outside, non-future) day button */
function attachDayListeners(btn, rawDate) {
  btn.addEventListener('click', e => {
    e.stopPropagation();
    handleDayClick(new Date(rawDate));
  });

  btn.addEventListener('mouseenter', () => {
    if (step === 'aE' || step === 'bE') {
      hoverDate = stripTime(new Date(rawDate));
      repaintCells();
    }
  });

  btn.addEventListener('mouseleave', () => {
    if (step === 'aE' || step === 'bE') {
      hoverDate = null;
      repaintCells();
    }
  });
}

/** Populate month & year <select> elements */
function populateSelects() {
  const smEl = el('sel-month');
  smEl.innerHTML = MONTH_NAMES
    .map((m, i) => `<option value="${i}"${i === calMonth ? ' selected' : ''}>${m}</option>`)
    .join('');

  // Disable future months when viewing the current year
  Array.from(smEl.options).forEach(opt => {
    opt.disabled = calYear === TODAY.getFullYear() && parseInt(opt.value) > TODAY.getMonth();
  });

  const syEl = el('sel-year');
  if (!syEl.dataset.built) {
    const minY = TODAY.getFullYear() - 5;
    const maxY = TODAY.getFullYear();
    syEl.innerHTML = '';
    for (let y = minY; y <= maxY; y++)
      syEl.innerHTML += `<option value="${y}">${y}</option>`;
    syEl.dataset.built = '1';
  }
  syEl.value = calYear;

  // Disable next-nav if already at the latest allowed month
  const atMax = calYear > TODAY.getFullYear() ||
    (calYear === TODAY.getFullYear() && calMonth >= TODAY.getMonth());
  el('nav-n').disabled = atMax;
}


// ─────────────────────────────────────────────────────────
// Calendar – navigation
// ─────────────────────────────────────────────────────────

function onSelMonth() {
  calMonth = parseInt(el('sel-month').value);
  buildCal();
}

function onSelYear() {
  calYear = parseInt(el('sel-year').value);
  // Clamp to current month if jumping to current year and chosen month is future
  if (calYear === TODAY.getFullYear() && calMonth > TODAY.getMonth())
    calMonth = TODAY.getMonth();
  buildCal();
}

function navM(dir) {
  calMonth += dir;
  if (calMonth > 11) { calMonth = 0; calYear++; }
  if (calMonth < 0)  { calMonth = 11; calYear--; }
  buildCal();
}


// ─────────────────────────────────────────────────────────
// Calendar – open / close
// ─────────────────────────────────────────────────────────

function openCal(target) {
  // Guards: enforce picking order
  if (target === 'aE' && !sel.aS)     { showWarn('Pilih tanggal mulai Period A dulu.', 'w'); return; }
  if (target === 'bS' && !isADone())  { showWarn('Lengkapi Period A dulu sebelum isi Period B.', 'w'); return; }
  if (target === 'bE' && !sel.bS)     { showWarn('Pilih tanggal mulai Period B dulu.', 'w'); return; }

  step = target;
  hoverDate = null;

  // Open calendar to the month most relevant for this picker
  const refDate = { aS: sel.aS, aE: sel.aE || sel.aS, bS: sel.bS, bE: sel.bE || sel.bS }[target] || TODAY;
  calYear  = refDate.getFullYear();
  calMonth = refDate.getMonth();

  el('done-btn').className = 'done' + (target.startsWith('b') ? ' b' : '');
  el('cal').classList.add('open');
  buildCal();
  renderUI();
}

function closeCal() {
  el('cal').classList.remove('open');
  step = null;
  hoverDate = null;
  renderUI();
}


// ─────────────────────────────────────────────────────────
// Day click handler
// ─────────────────────────────────────────────────────────

function handleDayClick(rawDate) {
  const d = stripTime(rawDate);
  if (d > TODAY) return;

  if (mode === 'single') {
    handleSingleClick(d);
  } else {
    handleRangeClick(d);
  }
}

function handleSingleClick(d) {
  if (step === 'aS') {
    sel.aS = d;
  } else if (step === 'bS') {
    if (sameDay(d, sel.aS)) { showWarn('Period A dan B tidak boleh sama.', 'e'); return; }
    sel.bS = d;
  }
  clearWarn();
  closeCal();
}

function handleRangeClick(d) {
  if (step === 'aS') {
    sel.aS = d;
    sel.aE = null;
    hoverDate = null;
    step = 'aE';           // auto-advance to end picker in same calendar
    repaintCells();
    renderUI();
    return;
  }

  if (step === 'aE') {
    if (d < sel.aS) { const t = sel.aS; sel.aS = d; sel.aE = t; }
    else sel.aE = d;
    hoverDate = null;
    if (dayDiff(sel.aS, sel.aE) > 365)
      showWarn('Rentang >1 tahun. Pastikan ini disengaja.', 'w');
    else clearWarn();
    closeCal();
    return;
  }

  if (step === 'bS') {
    sel.bS = d;
    sel.bE = null;
    hoverDate = null;
    step = 'bE';
    repaintCells();
    renderUI();
    return;
  }

  if (step === 'bE') {
    if (d < sel.bS) { const t = sel.bS; sel.bS = d; sel.bE = t; }
    else sel.bE = d;
    hoverDate = null;
    validatePeriodB();
    closeCal();
  }
}

/** Check Period B for overlap with A and length mismatch */
function validatePeriodB() {
  if (!sel.aS || !sel.aE || !sel.bS || !sel.bE) return;

  const lo = sel.bS < sel.bE ? sel.bS : sel.bE;
  const hi = sel.bS < sel.bE ? sel.bE : sel.bS;

  if (lo <= sel.aE && hi >= sel.aS) {
    showWarn('Period B tidak boleh overlap dengan Period A — data akan tercampur.', 'e');
    sel.bS = null;
    sel.bE = null;
    return;
  }

  const lenA = dayDiff(sel.aS, sel.aE);
  const lenB = dayDiff(sel.bS, sel.bE);
  if (lenA !== lenB)
    showWarn(`Panjang Period A (${lenA + 1}h) ≠ Period B (${lenB + 1}h). Comparison mungkin tidak apple-to-apple.`, 'w');
  else
    clearWarn();
}


// ─────────────────────────────────────────────────────────
// Presets
// ─────────────────────────────────────────────────────────

function applyPreset(preset) {
  const t = new Date(TODAY);

  const map = {
    today:     () => { sel.aS = new Date(t); sel.aE = new Date(t); },
    yesterday: () => { const y = new Date(t); y.setDate(t.getDate() - 1); sel.aS = stripTime(y); sel.aE = stripTime(y); },
    last7:     () => { const s = new Date(t); s.setDate(t.getDate() - 6); sel.aS = stripTime(s); sel.aE = new Date(t); },
    thisMonth: () => { sel.aS = stripTime(new Date(t.getFullYear(), t.getMonth(), 1)); sel.aE = new Date(t); },
    lastMonth: () => {
      sel.aS = stripTime(new Date(t.getFullYear(), t.getMonth() - 1, 1));
      sel.aE = stripTime(new Date(t.getFullYear(), t.getMonth(), 0));
    },
  };

  if (map[preset]) map[preset]();
  clearWarn();
  step = null;
  closeCal();
}


// ─────────────────────────────────────────────────────────
// Mode & comparison toggle
// ─────────────────────────────────────────────────────────

function setMode(m) {
  mode = m;
  step = null;
  hoverDate = null;

  el('bm-r').classList.toggle('on', m === 'range');
  el('bm-s').classList.toggle('on', m === 'single');

  ['sep-a','da-e','sep-b','db-e'].forEach(id => {
    el(id).style.display = m === 'range' ? '' : 'none';
  });
  el('presets').style.display = m === 'range' ? '' : 'none';

  sel.aE = null;
  sel.bE = null;
  clearWarn();
  closeCal();
}

function toggleComp() {
  comp = !comp;
  el('tgl').classList.toggle('on', comp);
  el('row-b').style.display = comp ? 'flex' : 'none';
  el('badge-a').textContent = comp ? 'Period A' : 'Tanggal';

  if (!comp) { sel.bS = null; sel.bE = null; }
  step = null;
  clearWarn();
  closeCal();
}


// ─────────────────────────────────────────────────────────
// Warnings
// ─────────────────────────────────────────────────────────

function showWarn(msg, type) {
  const w = el('warn');
  w.textContent = msg;
  w.className = `warn show ${type}`;
}

function clearWarn() {
  el('warn').className = 'warn';
}


// ─────────────────────────────────────────────────────────
// UI render (labels, status, apply button)
// ─────────────────────────────────────────────────────────

const isADone = () => mode === 'single' ? !!sel.aS : (!!sel.aS && !!sel.aE);
const isBDone = () => mode === 'single' ? !!sel.bS : (!!sel.bS && !!sel.bE);

/**
 * Refresh all UI labels, hints, status bar, and apply button state.
 * Never touches the calendar grid DOM.
 */
function renderUI() {
  updateDateButtons();
  updateHint();
  updateStatus();
  updateApplyBtn();
}

function updateDateButtons() {
  const setBtn = (id, val, colorClass, isActive) => {
    const btn = el(id);
    btn.textContent = val || 'Pilih tanggal';
    btn.className = 'dbox' + (val ? ' ' + colorClass : '') + (isActive ? ' active' : '');
  };

  setBtn('da-s', fmtDisplay(sel.aS), 'ca', step === 'aS');
  setBtn('da-e', fmtDisplay(sel.aE), 'ca', step === 'aE');
  setBtn('db-s', fmtDisplay(sel.bS), 'cb', step === 'bS');
  setBtn('db-e', fmtDisplay(sel.bE), 'cb', step === 'bE');
}

function updateHint() {
  const hints = {
    aS: 'Klik tanggal mulai Period A',
    aE: 'Klik tanggal akhir Period A',
    bS: 'Klik tanggal mulai Period B',
    bE: 'Klik tanggal akhir Period B',
  };
  el('hint').textContent = step ? hints[step] : '';
}

function updateStatus() {
  let html = '';

  if (sel.aS) {
    const days = sel.aE ? ` (${dayDiff(sel.aS, sel.aE) + 1} hari)` : '';
    html += mode === 'range'
      ? `<span class="sa">Period A:</span> ${fmtDisplay(sel.aS)} — ${fmtDisplay(sel.aE) || '...'}${days}`
      : `<span class="sa">Tanggal:</span> ${fmtDisplay(sel.aS)}`;
  }

  if (comp && sel.bS) {
    if (mode === 'single') {
      html += `<br><span class="sb">Period B:</span> ${fmtDisplay(sel.bS)}`;
    } else {
      const days = sel.bE ? ` (${dayDiff(sel.bS, sel.bE) + 1} hari)` : '';
      html += `<br><span class="sb">Period B:</span> ${fmtDisplay(sel.bS)} — ${fmtDisplay(sel.bE) || '...'}${days}`;
    }
  }

  el('status').innerHTML = html || 'Belum ada tanggal dipilih.';
}

function updateApplyBtn() {
  let ok = isADone();
  if (comp) ok = ok && isBDone();
  el('apply-btn').disabled = !ok;
}


// ─────────────────────────────────────────────────────────
// Apply – send payload to Tableau via postMessage
// ─────────────────────────────────────────────────────────

/**
 * Sends selected dates to the Tableau dashboard embedded as parent.
 * Tableau listens for window message with type 'DATEPICKER_UPDATE'.
 *
 * Payload shape:
 * {
 *   type:       'DATEPICKER_UPDATE',
 *   mode:       'range' | 'single',
 *   comparison: boolean,
 *   aStart:     'YYYY-MM-DD',
 *   aEnd:       'YYYY-MM-DD',
 *   bStart:     'YYYY-MM-DD' | '',
 *   bEnd:       'YYYY-MM-DD' | '',
 * }
 */
function applyAll() {
  const payload = {
    type:       'DATEPICKER_UPDATE',
    mode,
    comparison: comp,
    aStart:     fmtISO(sel.aS),
    aEnd:       mode === 'range' ? fmtISO(sel.aE) : fmtISO(sel.aS),
    bStart:     comp ? fmtISO(sel.bS) : '',
    bEnd:       comp && mode === 'range' ? fmtISO(sel.bE) : comp ? fmtISO(sel.bS) : '',
  };

  window.parent.postMessage(payload, '*');

  // Visual feedback
  const btn = el('apply-btn');
  const origText = btn.textContent;
  btn.textContent = '✓ Diterapkan!';
  btn.style.background = '#1D9E75';
  setTimeout(() => { btn.textContent = origText; btn.style.background = ''; }, 2000);
}


// ─────────────────────────────────────────────────────────
// Init
// ─────────────────────────────────────────────────────────

renderUI();