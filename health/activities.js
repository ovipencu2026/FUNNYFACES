// Urmărire antrenament pe GPS: distanță (Haversine cumulat), timp, viteză,
// ritm, traseu și calorii. Folosește geolocation.watchPosition.
import { haversine, metFor, calories, speedKmh } from './utils.js';

const MIN_ACCURACY = 40;   // m — ignorăm poziții cu eroare mai mare
const MIN_MOVE = 3;        // m — filtrăm jitterul GPS în repaus

export class ActivityTracker {
  constructor({ sport, weightKg, onUpdate, onStatus } = {}) {
    this.sport = sport || 'running';
    this.weightKg = weightKg || 70;
    this.onUpdate = onUpdate || (() => {});
    this.onStatus = onStatus || (() => {});

    this.state = 'idle'; // idle | running | paused | stopped
    this.distanceM = 0;
    this.movingSec = 0;
    this.startAt = 0;
    this.path = [];       // [{lat, lon, t}]
    this.lastFix = null;
    this._watchId = null;
    this._tick = null;
    this._lastTickAt = 0;
  }

  static isSupported() {
    return 'geolocation' in navigator;
  }

  start() {
    if (this.state === 'running') return;
    if (!ActivityTracker.isSupported()) {
      throw new Error('Acest telefon/browser nu oferă GPS (geolocation).');
    }
    if (this.state === 'idle') {
      this.startAt = Date.now();
      this.distanceM = 0;
      this.movingSec = 0;
      this.path = [];
      this.lastFix = null;
    }
    this.state = 'running';
    this._lastTickAt = performance.now();
    this.onStatus('Se caută semnal GPS…');

    this._watchId = navigator.geolocation.watchPosition(
      (pos) => this._onFix(pos),
      (err) => this._onError(err),
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 }
    );

    // cronometru independent de GPS pentru timpul de mișcare
    this._tick = setInterval(() => {
      if (this.state !== 'running') return;
      const now = performance.now();
      this.movingSec += (now - this._lastTickAt) / 1000;
      this._lastTickAt = now;
      this._emit();
    }, 1000);
  }

  pause() {
    if (this.state !== 'running') return;
    this.state = 'paused';
    this._teardownWatch();
    this.onStatus('În pauză');
    this._emit();
  }

  resume() {
    if (this.state !== 'paused') return;
    this.start();
  }

  /** Oprește și întoarce înregistrarea antrenamentului. */
  stop() {
    if (this.state === 'idle') return null;
    this.state = 'stopped';
    this._teardownWatch();
    if (this._tick) {
      clearInterval(this._tick);
      this._tick = null;
    }
    const durationSec = Math.round(this.movingSec);
    const kmh = speedKmh(this.distanceM, durationSec);
    const kcal = Math.round(
      calories(metFor(this.sport, kmh), this.weightKg, durationSec)
    );
    return {
      sport: this.sport,
      start: this.startAt,
      end: Date.now(),
      durationSec,
      distanceM: Math.round(this.distanceM),
      calories: kcal,
      path: this.path.map((p) => [p.lat, p.lon]),
    };
  }

  _teardownWatch() {
    if (this._watchId != null) {
      navigator.geolocation.clearWatch(this._watchId);
      this._watchId = null;
    }
  }

  _onFix(pos) {
    if (this.state !== 'running') return;
    const { latitude: lat, longitude: lon, accuracy } = pos.coords;
    if (accuracy != null && accuracy > MIN_ACCURACY) {
      this.onStatus(`GPS slab (±${Math.round(accuracy)} m)…`);
      return;
    }
    this.onStatus('GPS activ');
    const fix = { lat, lon, t: Date.now() };

    if (this.lastFix) {
      const d = haversine(this.lastFix, fix);
      if (d >= MIN_MOVE) {
        this.distanceM += d;
        this.lastFix = fix;
        this.path.push(fix);
      }
    } else {
      this.lastFix = fix;
      this.path.push(fix);
    }
    this._emit();
  }

  _onError(err) {
    let msg = 'Eroare GPS.';
    if (err.code === 1) msg = 'Permisiunea pentru locație a fost refuzată.';
    else if (err.code === 2) msg = 'Poziție indisponibilă (semnal slab).';
    else if (err.code === 3) msg = 'GPS-ul nu răspunde (timeout).';
    this.onStatus(msg);
  }

  _emit() {
    const durationSec = Math.round(this.movingSec);
    const kmh = speedKmh(this.distanceM, durationSec);
    const kcal = Math.round(
      calories(metFor(this.sport, kmh), this.weightKg, durationSec)
    );
    this.onUpdate({
      distanceM: this.distanceM,
      durationSec,
      kmh,
      calories: kcal,
      path: this.path,
    });
  }
}

/** Desenează traseul pe un canvas (fără hărți externe — totul offline). */
export function drawRoute(canvas, path) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight || 200;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  if (!path || path.length < 2) {
    ctx.fillStyle = '#9aa6d4';
    ctx.font = '14px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Traseul apare aici când pornești', w / 2, h / 2);
    return;
  }

  const lats = path.map((p) => p.lat ?? p[0]);
  const lons = path.map((p) => p.lon ?? p[1]);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLon = Math.min(...lons), maxLon = Math.max(...lons);
  const pad = 24;
  const spanLat = maxLat - minLat || 1e-6;
  const spanLon = maxLon - minLon || 1e-6;
  // corecție aproximativă pentru latitudine (longitudinea se „strânge”)
  const lonScale = Math.cos((minLat * Math.PI) / 180);
  const gw = w - pad * 2;
  const gh = h - pad * 2;
  const scale = Math.min(gw / (spanLon * lonScale), gh / spanLat);

  const px = (lon) => pad + (lon - minLon) * lonScale * scale + (gw - spanLon * lonScale * scale) / 2;
  const py = (lat) => h - pad - (lat - minLat) * scale - (gh - spanLat * scale) / 2;

  ctx.lineWidth = 4;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#5b8cff';
  ctx.shadowColor = 'rgba(91,140,255,.5)';
  ctx.shadowBlur = 8;
  ctx.beginPath();
  path.forEach((p, i) => {
    const x = px(p.lon ?? p[1]);
    const y = py(p.lat ?? p[0]);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.shadowBlur = 0;

  // start (verde) și poziția curentă (roșu)
  const start = path[0], end = path[path.length - 1];
  ctx.fillStyle = '#46d98a';
  ctx.beginPath();
  ctx.arc(px(start.lon ?? start[1]), py(start.lat ?? start[0]), 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ff5d73';
  ctx.beginPath();
  ctx.arc(px(end.lon ?? end[1]), py(end.lat ?? end[0]), 6, 0, Math.PI * 2);
  ctx.fill();
}
