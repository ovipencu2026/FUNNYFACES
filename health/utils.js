// Funcții utilitare comune: date, formatare, geo, calorii.

export const R_EARTH = 6371000; // metri

/** Cheia zilei locale (YYY-MM-DD) pentru o dată. */
export function dayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Lista ultimelor n chei de zi, cea mai veche prima. */
export function lastDays(n) {
  const out = [];
  const d = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const t = new Date(d);
    t.setDate(d.getDate() - i);
    out.push(dayKey(t));
  }
  return out;
}

/** Etichetă scurtă zi (Lu, Ma…) dintr-o cheie de zi. */
export function shortDayLabel(key) {
  const zile = ['Du', 'Lu', 'Ma', 'Mi', 'Jo', 'Vi', 'Sâ'];
  const [y, m, d] = key.split('-').map(Number);
  return zile[new Date(y, m - 1, d).getDay()];
}

/** Numărul zilei din lună (pentru grafic lunar). */
export function dayOfMonthLabel(key) {
  return String(Number(key.split('-')[2]));
}

/** Media unui șir de numere (0 dacă e gol). */
export function average(arr) {
  if (!arr.length) return 0;
  return arr.reduce((s, x) => s + x, 0) / arr.length;
}

/**
 * Serie de zile consecutive (până azi inclusiv) în care valoarea >= obiectiv.
 * Ziua de azi se numără doar dacă a atins deja obiectivul; altfel seria e cea
 * de până ieri (ca să nu „rupem” seria doar pentru că ziua nu s-a terminat).
 */
export function computeStreak(valuesOldToNew, goal) {
  const v = valuesOldToNew.slice();
  const today = v.pop() ?? 0;
  let streak = 0;
  for (let i = v.length - 1; i >= 0; i--) {
    if (v[i] >= goal) streak++;
    else break;
  }
  if (today >= goal) streak++; // azi atins → intră în serie
  return streak;
}

/** Distanță Haversine în metri între două coordonate. */
export function haversine(a, b) {
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Format cu virgulă zecimală (ro) și separator de mii. */
export function fmtNum(n, dec = 0) {
  return Number(n).toLocaleString('ro-RO', {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  });
}

/** hh:mm:ss sau mm:ss dintr-un număr de secunde. */
export function fmtDuration(sec, forceHours = false) {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const pad = (x) => String(x).padStart(2, '0');
  if (h > 0 || forceHours) return `${pad(h)}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}

/** Durată prietenoasă „7h 32m”. */
export function fmtHm(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

/** Lungimea pasului (metri) din înălțime; fallback la valori tipice. */
export function strideLength(profile) {
  const h = Number(profile.height) || 0;
  if (h >= 100) return (h * 0.415) / 100; // formula standard
  return profile.sex === 'f' ? 0.67 : 0.74;
}

/**
 * MET aproximativ în funcție de sport și viteză (km/h).
 * Valori derivate din Compendium of Physical Activities.
 */
export function metFor(sport, kmh) {
  const v = kmh || 0;
  switch (sport) {
    case 'running':
      if (v < 6) return 6;
      if (v < 8) return 8.3;
      if (v < 9.7) return 9.8;
      if (v < 11.3) return 11;
      if (v < 12.9) return 11.8;
      if (v < 14.5) return 12.8;
      return 14.5;
    case 'cycling':
      if (v < 16) return 4;
      if (v < 19) return 6.8;
      if (v < 22.5) return 8;
      if (v < 25.7) return 10;
      if (v < 30.6) return 12;
      return 15.8;
    case 'hiking':
      return 6;
    case 'walking':
    default:
      if (v < 3.2) return 2.8;
      if (v < 4.8) return 3.5;
      if (v < 6.4) return 5;
      return 6.3;
  }
}

/** Calorii = MET * greutate(kg) * ore. */
export function calories(met, weightKg, seconds) {
  const w = Number(weightKg) || 70;
  return met * w * (seconds / 3600);
}

/** Calorii estimate pentru pași (bazat pe distanță și greutate). */
export function stepCalories(steps, profile) {
  const w = Number(profile.weight) || 70;
  const distKm = (steps * strideLength(profile)) / 1000;
  // ~0.5 kcal per kg per km la mers
  return distKm * w * 0.5;
}

export const SPORT_META = {
  running: { emoji: '🏃', name: 'Alergare', pace: true },
  cycling: { emoji: '🚴', name: 'Ciclism', pace: false },
  walking: { emoji: '🚶', name: 'Mers', pace: true },
  hiking: { emoji: '🥾', name: 'Drumeție', pace: true },
};

/** Ritm min/km dintr-o distanță (m) și timp (s). */
export function paceMinKm(distM, sec) {
  if (distM < 20) return '—';
  const minPerKm = sec / 60 / (distM / 1000);
  const m = Math.floor(minPerKm);
  const s = Math.round((minPerKm - m) * 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Viteză km/h. */
export function speedKmh(distM, sec) {
  if (sec < 1) return 0;
  return (distM / 1000) / (sec / 3600);
}
