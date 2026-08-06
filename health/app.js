// Controller principal: rutare între ecrane, dashboard, profil și legarea
// modulelor de pași, somn și sport la interfață.
import { Store } from './storage.js';
import {
  dayKey, lastDays, shortDayLabel, dayOfMonthLabel, average, computeStreak,
  fmtNum, fmtDuration, fmtHm, strideLength, stepCalories, paceMinKm,
  speedKmh, SPORT_META,
} from './utils.js';
import { StepCounter } from './steps.js';
import { SleepTracker, qualityLabel } from './sleep.js';
import { ActivityTracker, drawRoute } from './activities.js';
import { barChart } from './charts.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const RING_LEN = 603; // 2*pi*96

let wakeLock = null;

// ---------- Wake Lock (ține ecranul aprins) ----------
async function requestWakeLock() {
  const p = Store.getProfile();
  if (!p.keepAwake || !('wakeLock' in navigator)) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
  } catch (e) { /* ignorat */ }
}
async function releaseWakeLock() {
  try { await wakeLock?.release(); } catch (e) {}
  wakeLock = null;
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && (stepUI.running || sleepUI.active || sportUI.running)) {
    requestWakeLock();
  }
});

// ---------- Toast ----------
let toastTimer = null;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
}

// ---------- Rutare ----------
function goto(view) {
  $$('.view').forEach((v) => (v.hidden = v.dataset.view !== view));
  $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.goto === view));
  window.scrollTo(0, 0);
  if (view === 'dashboard') renderDashboard();
  if (view === 'steps') renderStepsView();
  if (view === 'sleep') renderSleepList();
  if (view === 'sport') { renderSportHistory(); sportUI.redraw(); }
  if (view === 'profile') fillProfileForm();
}
$$('.tab').forEach((t) => t.addEventListener('click', () => goto(t.dataset.goto)));
$('#header-settings').addEventListener('click', () => goto('profile'));

// ---------- Ring helper ----------
function setRing(el, ratio) {
  el.style.strokeDashoffset = String(RING_LEN * (1 - Math.min(1, ratio)));
}

// =====================================================
//  DASHBOARD
// =====================================================
function renderDashboard() {
  const p = Store.getProfile();
  const steps = Store.getSteps();
  const goal = p.goal || 8000;

  $('#greeting').textContent = greet(p.name);
  $('#dash-steps').textContent = fmtNum(steps);
  $('#dash-goal').textContent = `obiectiv ${fmtNum(goal)}`;
  setRing($('#dash-ring'), steps / goal);

  const distKm = (steps * strideLength(p)) / 1000;
  $('#dash-distance').textContent = `${fmtNum(distKm, 2)} km`;

  const actToday = Store.activitiesOn();
  const actCal = actToday.reduce((s, a) => s + (a.calories || 0), 0);
  $('#dash-calories').textContent = `${fmtNum(Math.round(stepCalories(steps, p) + actCal))} kcal`;
  $('#dash-activities').textContent = String(actToday.length);

  // somnul din noaptea trecută = ultima sesiune încheiată azi sau ieri
  const lastSleep = Store.getSleep()[0];
  $('#dash-sleep').textContent = lastSleep ? fmtHm(lastSleep.durationSec) : '—';

  // grafice
  const keys = lastDays(7);
  const labels = keys.map(shortDayLabel);
  const weekSteps = Store.stepsSeries(keys);
  barChart($('#chart-steps'), weekSteps, labels, {
    color: '#5b8cff', goal, format: (v) => fmtNum(v),
  });
  const weekSleep = Store.sleepSeries(keys).map((s) => s / 3600);
  barChart($('#chart-sleep'), weekSleep, labels, {
    color: '#8b6cff', format: (v) => `${v.toFixed(1)}h`,
  });

  // Grafic lunar (30 de zile) — etichete rărite
  const mKeys = lastDays(30);
  barChart($('#chart-month'), Store.stepsSeries(mKeys), mKeys.map(dayOfMonthLabel), {
    color: '#5b8cff', goal, format: (v) => fmtNum(v), labelEvery: 5,
  });

  // Medii săptămânale
  const avgSteps = average(weekSteps);
  $('#avg-steps').textContent = fmtNum(Math.round(avgSteps));
  $('#avg-distance').textContent = `${fmtNum((avgSteps * strideLength(p)) / 1000, 1)} km`;
  const sleptNights = weekSleep.filter((h) => h > 0);
  $('#avg-sleep').textContent = sleptNights.length
    ? fmtHm(average(sleptNights) * 3600)
    : '—';

  // Serie (streak) de zile cu obiectivul atins
  renderStreak(weekSteps.length ? Store.stepsSeries(lastDays(60)) : [], goal);

  // Memento culcare
  renderBedtime(p.bedtime);

  renderRecent();
}

function renderStreak(series60, goal) {
  const streak = computeStreak(series60, goal);
  const el = $('#streak-text');
  if (streak <= 0) {
    el.innerHTML = 'Atinge obiectivul azi ca să pornești o serie 🔥';
  } else if (streak === 1) {
    el.innerHTML = 'Serie: <b>1 zi</b> cu obiectivul atins. Continuă!';
  } else {
    el.innerHTML = `Serie: <b>${streak} zile</b> la rând cu obiectivul atins!`;
  }
}

function renderBedtime(bedtime) {
  const chip = $('#bedtime-chip');
  if (!bedtime) { chip.hidden = true; return; }
  const [h, m] = bedtime.split(':').map(Number);
  const now = new Date();
  const bt = new Date(now);
  bt.setHours(h, m, 0, 0);
  let diffMin = Math.round((bt - now) / 60000);
  if (diffMin < -60) diffMin += 24 * 60; // trecut de mult → mâine
  chip.hidden = false;
  if (diffMin >= 0 && diffMin <= 60) {
    chip.textContent = `😴 Culcare în ${diffMin} min`;
  } else if (diffMin < 0) {
    chip.textContent = `😴 Ora de culcare a trecut`;
  } else {
    chip.textContent = `😴 Culcare: ${bedtime}`;
  }
}

function greet(name) {
  const h = new Date().getHours();
  const base = h < 6 ? 'Noapte bună' : h < 12 ? 'Bună dimineața' : h < 18 ? 'Bună ziua' : 'Bună seara';
  return name ? `${base}, ${name}!` : `${base}!`;
}

function renderRecent() {
  const list = $('#recent-list');
  const acts = Store.getActivities().slice(0, 4);
  if (!acts.length) {
    list.innerHTML = '<li class="empty">Niciun antrenament încă. Pornește unul din secțiunea Sport 🏃</li>';
    return;
  }
  list.innerHTML = acts.map(activityRow).join('');
}

function activityRow(a) {
  const meta = SPORT_META[a.sport] || { emoji: '🏃', name: a.sport };
  const km = (a.distanceM / 1000).toFixed(2);
  const when = new Date(a.start).toLocaleDateString('ro-RO', { day: 'numeric', month: 'short' });
  const sub = meta.pace
    ? `${paceMinKm(a.distanceM, a.durationSec)} /km · ${fmtDuration(a.durationSec, true)}`
    : `${speedKmh(a.distanceM, a.durationSec).toFixed(1)} km/h · ${fmtDuration(a.durationSec, true)}`;
  return `<li class="recent-item">
    <span class="emoji">${meta.emoji}</span>
    <div class="ri-main">
      <div class="ri-title">${meta.name} · ${when}</div>
      <div class="ri-sub">${sub}</div>
    </div>
    <div class="ri-val">${km}<small>km · ${a.calories} kcal</small></div>
  </li>`;
}

// =====================================================
//  PAȘI
// =====================================================
const stepUI = {
  counter: null,
  running: false,
  cadence: 0,
};

function renderStepsView() {
  const p = Store.getProfile();
  const steps = Store.getSteps();
  const goal = p.goal || 8000;
  $('#steps-count').textContent = fmtNum(steps);
  $('#steps-goal').textContent = `obiectiv ${fmtNum(goal)}`;
  setRing($('#steps-ring'), steps / goal);
  $('#steps-distance').textContent = fmtNum((steps * strideLength(p)) / 1000, 2);
  $('#steps-calories').textContent = fmtNum(Math.round(stepCalories(steps, p)));
  $('#steps-cadence').textContent = String(stepUI.running ? stepUI.cadence : 0);

  const keys = lastDays(7);
  barChart($('#chart-steps-full'), Store.stepsSeries(keys), keys.map(shortDayLabel), {
    color: '#5b8cff', goal, format: (v) => fmtNum(v),
  });
}

async function toggleSteps() {
  if (stepUI.running) {
    stepUI.counter.stop();
    stepUI.running = false;
    releaseWakeLock();
    $('#steps-toggle').textContent = '▶ Pornește contorul';
    $('#steps-live').hidden = true;
    renderStepsView();
    return;
  }
  $('#steps-error').hidden = true;
  if (!stepUI.counter) {
    stepUI.counter = new StepCounter({
      onStep: () => {
        Store.addSteps(1);
        $('#steps-count').textContent = fmtNum(Store.getSteps());
        const p = Store.getProfile();
        const steps = Store.getSteps();
        setRing($('#steps-ring'), steps / (p.goal || 8000));
        $('#steps-distance').textContent = fmtNum((steps * strideLength(p)) / 1000, 2);
        $('#steps-calories').textContent = fmtNum(Math.round(stepCalories(steps, p)));
      },
      onCadence: (c) => { stepUI.cadence = c; $('#steps-cadence').textContent = String(c); },
    });
  }
  try {
    await stepUI.counter.start();
    stepUI.running = true;
    requestWakeLock();
    $('#steps-toggle').textContent = '⏸ Oprește contorul';
    $('#steps-live').hidden = false;
    toast('Contor pornit — mișcă-te! 👟');
  } catch (e) {
    $('#steps-error').textContent = e.message;
    $('#steps-error').hidden = false;
  }
}
$('#steps-toggle').addEventListener('click', toggleSteps);

function adjustSteps(delta) {
  const current = Store.getSteps();
  Store.setSteps(Math.max(0, current + delta));
  renderStepsView();
}
$('#steps-plus').addEventListener('click', () => adjustSteps(100));
$('#steps-plus10').addEventListener('click', () => adjustSteps(10));
$('#steps-minus10').addEventListener('click', () => adjustSteps(-10));
$('#steps-minus').addEventListener('click', () => adjustSteps(-100));

// =====================================================
//  SOMN
// =====================================================
const sleepUI = {
  tracker: null,
  active: false,
};

function renderSleepList() {
  const list = $('#sleep-list');
  const entries = Store.getSleep();
  if (!entries.length) {
    list.innerHTML = '<li class="empty">Nicio noapte înregistrată încă 🌙</li>';
    $('#sleep-average').textContent = 'Medie: —';
    return;
  }
  const recent = entries.slice(0, 14);
  const avg = recent.reduce((s, e) => s + e.durationSec, 0) / recent.length;
  $('#sleep-average').textContent = `Medie: ${fmtHm(avg)}`;
  list.innerHTML = entries.slice(0, 30).map(sleepRow).join('');
  $$('.sleep-item [data-del]').forEach((btn) =>
    btn.addEventListener('click', () => { Store.deleteSleep(btn.dataset.del); renderSleepList(); })
  );
}

function sleepRow(s) {
  const q = qualityLabel(s.quality);
  const start = new Date(s.start);
  const end = new Date(s.end);
  const date = end.toLocaleDateString('ro-RO', { weekday: 'short', day: 'numeric', month: 'short' });
  const t = (d) => d.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' });
  return `<li class="sleep-item">
    <span class="si-bar" style="background:${q.color}"></span>
    <div class="si-main">
      <div class="si-date">${date}</div>
      <div class="si-time">${t(start)} → ${t(end)}${s.source === 'manual' ? ' · manual' : ''}</div>
    </div>
    <div style="text-align:right">
      <div class="si-dur">${fmtHm(s.durationSec)}</div>
      <span class="quality-pill" style="background:${q.color}22;color:${q.color}">${q.text}</span>
    </div>
    <button class="icon-btn" data-del="${s.id}" aria-label="Șterge" style="width:34px;height:34px;font-size:14px;margin-left:8px">✕</button>
  </li>`;
}

let sleepPersistCounter = 0;

function makeSleepTracker() {
  return new SleepTracker({
    onTick: (sec) => {
      $('#sleep-timer').textContent = fmtDuration(sec, true);
      // salvăm periodic progresul, ca sesiunea să reziste la repornire
      if (sleepUI.active && ++sleepPersistCounter % 20 === 0) {
        Store.setActiveSleep({
          start: sleepUI.tracker.startAt,
          moveEvents: sleepUI.tracker.moveEvents,
        });
      }
    },
  });
}

function enterSleepActiveUI() {
  sleepUI.active = true;
  requestWakeLock();
  $('#sleep-toggle').textContent = '☀️ M-am trezit';
  $('#sleep-state').textContent = 'Dormi liniștit… apasă dimineața „M-am trezit”';
  $('.sleep-hero').classList.add('active');
}

function exitSleepActiveUI() {
  sleepUI.active = false;
  releaseWakeLock();
  $('#sleep-toggle').textContent = '🌙 Adorm';
  $('#sleep-timer').textContent = '00:00:00';
  $('#sleep-state').textContent = 'Apasă „Adorm” când te culci';
  $('.sleep-hero').classList.remove('active');
}

/** Reia o sesiune de somn salvată (după reîncărcarea aplicației). */
function restoreSleepIfAny() {
  const saved = Store.getActiveSleep();
  if (!saved || !saved.start) return;
  sleepUI.tracker = makeSleepTracker();
  sleepUI.tracker.resume(saved.start, saved.moveEvents || 0);
  enterSleepActiveUI();
}

function toggleSleep() {
  if (!sleepUI.tracker) sleepUI.tracker = makeSleepTracker();

  if (!sleepUI.active) {
    sleepUI.tracker.start();
    enterSleepActiveUI();
    Store.setActiveSleep({ start: sleepUI.tracker.startAt, moveEvents: 0 });
    toast('Somn plăcut! 😴');
  } else {
    const rec = sleepUI.tracker.stop();
    exitSleepActiveUI();
    Store.clearActiveSleep();
    sleepUI.tracker = null;
    if (rec) {
      Store.addSleep(rec);
      const q = qualityLabel(rec.quality);
      toast(`Ai dormit ${fmtHm(rec.durationSec)} · ${q.text}`);
      renderSleepList();
    } else {
      toast('Sesiune prea scurtă, nu am salvat-o.');
    }
  }
}
$('#sleep-toggle').addEventListener('click', toggleSleep);

// somn manual
$('#sleep-manual-btn').addEventListener('click', () => {
  const f = $('#sleep-manual-form');
  f.hidden = !f.hidden;
  if (!f.hidden) {
    const now = new Date();
    const bed = new Date(now); bed.setHours(23, 0, 0, 0); bed.setDate(bed.getDate() - 1);
    const wake = new Date(now); wake.setHours(7, 0, 0, 0);
    $('#sleep-in').value = toLocalInput(bed);
    $('#sleep-out').value = toLocalInput(wake);
  }
});
$('#sleep-manual-cancel').addEventListener('click', () => { $('#sleep-manual-form').hidden = true; });
$('#sleep-manual-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const start = new Date($('#sleep-in').value).getTime();
  const end = new Date($('#sleep-out').value).getTime();
  if (!start || !end || end <= start) { toast('Verifică orele introduse.'); return; }
  Store.addSleep({
    start, end,
    durationSec: Math.round((end - start) / 1000),
    quality: Number($('#sleep-quality').value),
    source: 'manual',
  });
  $('#sleep-manual-form').hidden = true;
  renderSleepList();
  toast('Noapte adăugată ✓');
});

function toLocalInput(d) {
  const pad = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// =====================================================
//  SPORT
// =====================================================
const sportUI = {
  tracker: null,
  running: false,
  sport: 'running',
  lastPath: [],
  redraw() { drawRoute($('#route-map'), this.lastPath); },
};

$$('.sport-chip').forEach((chip) =>
  chip.addEventListener('click', () => {
    if (sportUI.running) { toast('Oprește antrenamentul curent întâi.'); return; }
    sportUI.sport = chip.dataset.sport;
    $$('.sport-chip').forEach((c) => c.classList.toggle('active', c === chip));
    updateSportLabels();
  })
);

function updateSportLabels() {
  const meta = SPORT_META[sportUI.sport];
  $('#sport-pace-label').textContent = meta.pace ? 'ritm /km' : 'viteză';
}

function renderSportStats(u) {
  const meta = SPORT_META[sportUI.sport];
  $('#sport-distance').textContent = (u.distanceM / 1000).toFixed(2);
  $('#sport-duration').textContent = fmtDuration(u.durationSec);
  $('#sport-pace').textContent = meta.pace
    ? paceMinKm(u.distanceM, u.durationSec)
    : u.kmh.toFixed(1);
  $('#sport-calories').textContent = String(u.calories);
  sportUI.lastPath = u.path;
  sportUI.redraw();
}

$('#sport-start').addEventListener('click', () => {
  $('#sport-error').hidden = true;
  const p = Store.getProfile();
  sportUI.tracker = new ActivityTracker({
    sport: sportUI.sport,
    weightKg: p.weight,
    onUpdate: renderSportStats,
    onStatus: (s) => { $('#gps-status').textContent = s; },
  });
  try {
    sportUI.tracker.start();
    sportUI.running = true;
    requestWakeLock();
    $('#gps-indicator').hidden = false;
    $('#sport-start').hidden = true;
    $('#sport-pause').hidden = false;
    $('#sport-stop').hidden = false;
    toast(`${SPORT_META[sportUI.sport].name} pornit! 🏃`);
  } catch (e) {
    $('#sport-error').textContent = e.message;
    $('#sport-error').hidden = false;
  }
});

$('#sport-pause').addEventListener('click', () => {
  const btn = $('#sport-pause');
  if (sportUI.tracker.state === 'running') {
    sportUI.tracker.pause();
    btn.textContent = '▶ Reia';
  } else {
    sportUI.tracker.resume();
    btn.textContent = '⏸ Pauză';
  }
});

$('#sport-stop').addEventListener('click', () => {
  const rec = sportUI.tracker.stop();
  sportUI.running = false;
  releaseWakeLock();
  $('#gps-indicator').hidden = true;
  $('#sport-start').hidden = false;
  $('#sport-pause').hidden = true;
  $('#sport-pause').textContent = '⏸ Pauză';
  $('#sport-stop').hidden = true;
  if (rec && rec.distanceM > 20) {
    Store.addActivity(rec);
    toast(`Salvat: ${(rec.distanceM / 1000).toFixed(2)} km · ${rec.calories} kcal`);
    renderSportHistory();
  } else {
    toast('Distanță prea mică, nu am salvat.');
    sportUI.lastPath = [];
    sportUI.redraw();
  }
  // resetare afișaj
  renderSportStats({ distanceM: 0, durationSec: 0, kmh: 0, calories: 0, path: sportUI.lastPath });
});

function renderSportHistory() {
  const list = $('#sport-history');
  const acts = Store.getActivities();
  if (!acts.length) {
    list.innerHTML = '<li class="empty">Niciun antrenament salvat 🚴</li>';
    return;
  }
  list.innerHTML = acts.slice(0, 30).map(activityRow).join('');
}

// =====================================================
//  PROFIL
// =====================================================
function fillProfileForm() {
  const p = Store.getProfile();
  $('#p-name').value = p.name || '';
  $('#p-sex').value = p.sex || 'm';
  $('#p-age').value = p.age ?? '';
  $('#p-height').value = p.height ?? '';
  $('#p-weight').value = p.weight ?? '';
  $('#p-goal').value = p.goal ?? 8000;
  $('#p-bedtime').value = p.bedtime || '';
  $('#p-keepawake').checked = !!p.keepAwake;
}

$('#profile-form').addEventListener('submit', (e) => {
  e.preventDefault();
  Store.saveProfile({
    name: $('#p-name').value.trim(),
    sex: $('#p-sex').value,
    age: numOrNull($('#p-age').value),
    height: numOrNull($('#p-height').value),
    weight: numOrNull($('#p-weight').value),
    goal: Number($('#p-goal').value) || 8000,
    bedtime: $('#p-bedtime').value || '',
    keepAwake: $('#p-keepawake').checked,
  });
  const note = $('#profile-saved');
  note.hidden = false;
  setTimeout(() => { note.hidden = true; }, 1800);
  toast('Profil salvat ✓');
});

function numOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) && v !== '' ? n : null;
}

$('#export-data').addEventListener('click', () => {
  const blob = new Blob([Store.exportJSON()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `pulsfit-date-${dayKey()}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

$('#reset-data').addEventListener('click', () => {
  if (confirm('Sigur ștergi TOATE datele? Această acțiune nu poate fi anulată.')) {
    Store.resetAll();
    fillProfileForm();
    toast('Toate datele au fost șterse.');
    goto('dashboard');
  }
});

// =====================================================
//  Pornire
// =====================================================
function redrawCharts() {
  const active = $$('.view').find((v) => !v.hidden)?.dataset.view;
  if (active === 'dashboard') renderDashboard();
  if (active === 'steps') renderStepsView();
  if (active === 'sport') sportUI.redraw();
}
window.addEventListener('resize', () => { clearTimeout(window._rz); window._rz = setTimeout(redrawCharts, 200); });

// service worker (PWA offline)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

updateSportLabels();
restoreSleepIfAny();
goto('dashboard');
