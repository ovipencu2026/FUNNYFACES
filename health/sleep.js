// Urmărire somn: cronometru pentru sesiunea de somn + estimare a calității
// din mișcare (actigrafie). Telefonul stă pe saltea; mișcările frecvente =
// somn agitat. Scorul de calitate scade cu numărul de episoade de mișcare.

const MOVE_THRESHOLD = 1.2; // m/s^2 abatere față de repaus = mișcare
const MOVE_DEBOUNCE = 4000; // ms între două episoade numărate

export class SleepTracker {
  constructor({ onTick } = {}) {
    this.onTick = onTick || (() => {});
    this.active = false;
    this.startAt = 0;
    this.moveEvents = 0;
    this._baseline = null;
    this._lastMove = 0;
    this._motionHandler = this._onMotion.bind(this);
    this._interval = null;
  }

  start() {
    if (this.active) return;
    this.startAt = Date.now();
    this.moveEvents = 0;
    this._begin();
  }

  /** Reia o sesiune întreruptă (ex. după repornirea aplicației noaptea). */
  resume(startAt, moveEvents = 0) {
    if (this.active) return;
    this.startAt = startAt;
    this.moveEvents = moveEvents;
    this._begin();
  }

  _begin() {
    this.active = true;
    this._baseline = null;
    this._lastMove = 0;
    if (typeof DeviceMotionEvent !== 'undefined') {
      window.addEventListener('devicemotion', this._motionHandler, { passive: true });
    }
    this._interval = setInterval(() => this.onTick(this.elapsed()), 1000);
    this.onTick(this.elapsed());
  }

  /** Oprește sesiunea și întoarce înregistrarea (sau null dacă prea scurtă). */
  stop() {
    if (!this.active) return null;
    this.active = false;
    window.removeEventListener('devicemotion', this._motionHandler);
    clearInterval(this._interval);
    this._interval = null;

    const end = Date.now();
    const durationSec = Math.round((end - this.startAt) / 1000);
    if (durationSec < 60) return null; // prea scurt, ignorăm

    return {
      start: this.startAt,
      end,
      durationSec,
      quality: this._qualityScore(durationSec),
      restless: this.moveEvents,
      source: 'auto',
    };
  }

  elapsed() {
    return this.active ? Math.round((Date.now() - this.startAt) / 1000) : 0;
  }

  _onMotion(ev) {
    const a = ev.accelerationIncludingGravity || ev.acceleration;
    if (!a || a.x == null) return;
    const mag = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
    if (this._baseline == null) {
      this._baseline = mag;
      return;
    }
    this._baseline = this._baseline * 0.98 + mag * 0.02;
    if (Math.abs(mag - this._baseline) > MOVE_THRESHOLD) {
      const now = Date.now();
      if (now - this._lastMove > MOVE_DEBOUNCE) {
        this._lastMove = now;
        this.moveEvents++;
      }
    }
  }

  /** Scor 0–100: pornim de la durată bună și penalizăm agitația. */
  _qualityScore(durationSec) {
    const hours = durationSec / 3600;
    // componenta de durată: optim 7-9h
    let durScore;
    if (hours >= 7 && hours <= 9) durScore = 100;
    else if (hours < 7) durScore = Math.max(30, (hours / 7) * 100);
    else durScore = Math.max(60, 100 - (hours - 9) * 10);

    // penalizare pentru mișcare (episoade pe oră)
    const perHour = hours > 0 ? this.moveEvents / hours : 0;
    const restlessPenalty = Math.min(45, perHour * 5);

    return Math.round(Math.max(10, durScore - restlessPenalty));
  }
}

/** Etichetă + culoare pentru un scor de calitate. */
export function qualityLabel(q) {
  if (q >= 85) return { text: 'Excelent', color: '#46d98a' };
  if (q >= 70) return { text: 'Bun', color: '#38e0c8' };
  if (q >= 50) return { text: 'Mediu', color: '#ffb24d' };
  return { text: 'Slab', color: '#ff5d73' };
}
