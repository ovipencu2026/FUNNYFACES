// Motor de numărare a pașilor prin detecție de vârfuri pe magnitudinea
// accelerației. Funcționează cât timp pagina e vizibilă și senzorul emite date.
//
// Algoritm:
//  1. calculăm magnitudinea vectorului de accelerație (cu gravitație);
//  2. filtru trece-jos (medie mobilă exponențială) pentru a scoate zgomotul;
//  3. urmărim media dinamică a semnalului (prag adaptiv);
//  4. numărăm o trecere ascendentă peste prag ca „pas”, cu o amplitudine
//     minimă și un interval minim între pași (anti dublă-numărare).

const MIN_STEP_INTERVAL = 260; // ms — max ~230 pași/min
const MAX_STEP_INTERVAL = 2000; // ms — resetare cadență dacă e pauză
const MIN_AMPLITUDE = 0.8; // m/s^2 peste medie ca să conteze un vârf

export class StepCounter {
  constructor({ onStep, onCadence } = {}) {
    this.onStep = onStep || (() => {});
    this.onCadence = onCadence || (() => {});
    this.running = false;
    this._reset();
    this._handler = this._onMotion.bind(this);
  }

  _reset() {
    this.smooth = null;      // valoare filtrată
    this.avg = null;         // media dinamică (linia de bază)
    this.above = false;      // suntem deasupra pragului?
    this.lastStepAt = 0;
    this.recentIntervals = [];
    this.peakInWindow = 0;
  }

  /** iOS 13+ cere permisiune explicită pentru senzorii de mișcare. */
  static needsPermission() {
    return (
      typeof DeviceMotionEvent !== 'undefined' &&
      typeof DeviceMotionEvent.requestPermission === 'function'
    );
  }

  static async requestPermission() {
    if (!StepCounter.needsPermission()) return 'granted';
    try {
      return await DeviceMotionEvent.requestPermission();
    } catch (e) {
      return 'denied';
    }
  }

  static isSupported() {
    return typeof DeviceMotionEvent !== 'undefined';
  }

  async start() {
    if (this.running) return true;
    if (!StepCounter.isSupported()) {
      throw new Error('Telefonul/browserul nu oferă senzor de mișcare.');
    }
    const perm = await StepCounter.requestPermission();
    if (perm !== 'granted') {
      throw new Error('Permisiunea pentru senzorul de mișcare a fost refuzată.');
    }
    this._reset();
    window.addEventListener('devicemotion', this._handler, { passive: true });
    this.running = true;
    return true;
  }

  stop() {
    if (!this.running) return;
    window.removeEventListener('devicemotion', this._handler);
    this.running = false;
    this.onCadence(0);
  }

  _onMotion(ev) {
    const a =
      ev.accelerationIncludingGravity ||
      ev.acceleration ||
      null;
    if (!a || a.x == null) return;

    const mag = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);

    // Filtru trece-jos exponențial.
    this.smooth = this.smooth == null ? mag : this.smooth * 0.8 + mag * 0.2;
    // Linia de bază urmărește lent semnalul.
    this.avg = this.avg == null ? this.smooth : this.avg * 0.95 + this.smooth * 0.05;

    const threshold = this.avg + MIN_AMPLITUDE;
    const now = performance.now();

    if (!this.above && this.smooth > threshold) {
      this.above = true;
      const dt = now - this.lastStepAt;
      if (dt > MIN_STEP_INTERVAL) {
        this.lastStepAt = now;
        this._registerStep(dt);
      }
    } else if (this.above && this.smooth < this.avg + MIN_AMPLITUDE * 0.5) {
      this.above = false;
    }
  }

  _registerStep(dt) {
    this.onStep(1);
    if (dt < MAX_STEP_INTERVAL) {
      this.recentIntervals.push(dt);
      if (this.recentIntervals.length > 6) this.recentIntervals.shift();
      const mean =
        this.recentIntervals.reduce((s, x) => s + x, 0) /
        this.recentIntervals.length;
      this.onCadence(Math.round(60000 / mean));
    } else {
      this.recentIntervals = [];
    }
  }
}
