// Strat de persistență peste localStorage. Toate datele rămân pe dispozitiv.
import { dayKey } from './utils.js';

const KEY = 'pulsfit.v1';

const DEFAULTS = {
  profile: {
    name: '',
    sex: 'm',
    age: null,
    height: null,
    weight: null,
    goal: 8000,
    keepAwake: true,
  },
  // steps: { 'YYYY-MM-DD': numărPași }
  steps: {},
  // sleep: [ { id, start, end, durationSec, quality, source } ]
  sleep: [],
  // activities: [ { id, sport, start, durationSec, distanceM, calories, path:[[lat,lon]] } ]
  activities: [],
};

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULTS);
    const parsed = JSON.parse(raw);
    return {
      profile: { ...DEFAULTS.profile, ...(parsed.profile || {}) },
      steps: parsed.steps || {},
      sleep: parsed.sleep || [],
      activities: parsed.activities || [],
    };
  } catch (e) {
    console.warn('Storage corupt, resetez.', e);
    return structuredClone(DEFAULTS);
  }
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('Nu am putut salva (spațiu plin?)', e);
  }
}

export const Store = {
  get state() {
    return state;
  },

  // --- Profil ---
  getProfile() {
    return { ...state.profile };
  },
  saveProfile(p) {
    state.profile = { ...state.profile, ...p };
    persist();
    return this.getProfile();
  },

  // --- Pași ---
  getSteps(key = dayKey()) {
    return state.steps[key] || 0;
  },
  setSteps(count, key = dayKey()) {
    state.steps[key] = Math.max(0, Math.round(count));
    persist();
  },
  addSteps(delta, key = dayKey()) {
    state.steps[key] = (state.steps[key] || 0) + delta;
    persist();
    return state.steps[key];
  },
  stepsSeries(keys) {
    return keys.map((k) => state.steps[k] || 0);
  },

  // --- Somn ---
  addSleep(entry) {
    entry.id = entry.id || 's_' + Date.now();
    state.sleep.unshift(entry);
    state.sleep = state.sleep.slice(0, 120);
    persist();
    return entry;
  },
  getSleep() {
    return state.sleep.slice();
  },
  deleteSleep(id) {
    state.sleep = state.sleep.filter((s) => s.id !== id);
    persist();
  },
  // durata somnului care se termină într-o anumită zi (pentru grafic)
  sleepSeries(keys) {
    const map = {};
    for (const s of state.sleep) {
      const k = dayKey(new Date(s.end));
      map[k] = (map[k] || 0) + s.durationSec;
    }
    return keys.map((k) => map[k] || 0);
  },

  // --- Activități sport ---
  addActivity(a) {
    a.id = a.id || 'a_' + Date.now();
    state.activities.unshift(a);
    state.activities = state.activities.slice(0, 200);
    persist();
    return a;
  },
  getActivities() {
    return state.activities.slice();
  },
  deleteActivity(id) {
    state.activities = state.activities.filter((a) => a.id !== id);
    persist();
  },
  activitiesOn(key = dayKey()) {
    return state.activities.filter((a) => dayKey(new Date(a.start)) === key);
  },

  // --- Utilitare globale ---
  exportJSON() {
    return JSON.stringify(state, null, 2);
  },
  resetAll() {
    state = structuredClone(DEFAULTS);
    persist();
  },
};
