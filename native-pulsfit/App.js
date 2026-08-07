// PulsFit nativ — v1: numărare pași pe Android.
//
// Cum obținem pașii chiar cu ecranul stins / aplicația închisă:
//  - Android numără pașii non-stop în cipul de mișcare și îi salvează în
//    „Health Connect”. Citim de acolo totalul pe ziua curentă => corect chiar
//    dacă aplicația a fost închisă.
//  - Când aplicația e deschisă, adăugăm și un contor „live” (expo-sensors)
//    pentru actualizare instantanee la fiecare pas.
//
// Health Connect e încărcat defensiv, iar întreaga aplicație e învelită într-un
// ErrorBoundary, ca orice problemă să fie AFIȘATĂ pe ecran, nu să închidă
// aplicația.

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  AppState, PermissionsAndroid, Platform, Linking, RefreshControl,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';

// --- Încărcare defensivă a modulelor native ---
let HC = {};
let hcLoadError = null;
try {
  HC = require('react-native-health-connect');
} catch (e) {
  hcLoadError = e?.message || String(e);
}
let Pedometer = null;
try {
  Pedometer = require('expo-sensors').Pedometer;
} catch (e) {
  // contorul live e opțional
}

const GOAL_KEY = 'pulsfit.goal';
const DEFAULT_GOAL = 8000;
const STRIDE_M = 0.75; // lungime pas aproximativă (m)
const SDK_AVAILABLE = HC?.SdkAvailabilityStatus?.SDK_AVAILABLE ?? 3;

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function App() {
  const [goal, setGoal] = useState(DEFAULT_GOAL);
  const [hcSteps, setHcSteps] = useState(0);
  const [liveDelta, setLiveDelta] = useState(0);
  const [status, setStatus] = useState('Se inițializează…');
  const [hcReady, setHcReady] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const hcBaseAtLive = useRef(0);
  const liveSub = useRef(null);

  const steps = Math.max(hcSteps, hcBaseAtLive.current + liveDelta);
  const pct = Math.min(1, steps / goal);
  const distanceKm = (steps * STRIDE_M) / 1000;
  const calories = Math.round(distanceKm * 60);

  const initHealthConnect = useCallback(async () => {
    if (Platform.OS !== 'android') {
      setStatus('Aplicația nativă e pentru Android.');
      return false;
    }
    if (hcLoadError || typeof HC.getSdkStatus !== 'function') {
      setStatus('Modulul Health Connect nu e disponibil: ' + (hcLoadError || 'nelegat'));
      return false;
    }
    try {
      const sdk = await HC.getSdkStatus();
      if (sdk !== SDK_AVAILABLE) {
        setStatus('Health Connect nu e instalat/activ. Instalează „Health Connect” din Play Store, apoi reîncearcă.');
        return false;
      }
      const ok = await HC.initialize();
      if (!ok) { setStatus('Nu am putut porni Health Connect.'); return false; }
      await HC.requestPermission([{ accessType: 'read', recordType: 'Steps' }]);
      setHcReady(true);
      return true;
    } catch (e) {
      setStatus('Eroare Health Connect: ' + (e?.message || e));
      return false;
    }
  }, []);

  const readSteps = useCallback(async () => {
    if (Platform.OS !== 'android' || typeof HC.readRecords !== 'function') return;
    try {
      const res = await HC.readRecords('Steps', {
        timeRangeFilter: {
          operator: 'between',
          startTime: startOfToday().toISOString(),
          endTime: new Date().toISOString(),
        },
      });
      const records = res?.records || [];
      const total = records.reduce((s, r) => s + (r.count || 0), 0);
      setHcSteps(total);
      hcBaseAtLive.current = total;
      setLiveDelta(0);
      setStatus(total > 0
        ? 'Sincronizat cu Health Connect ✓'
        : 'Health Connect e activ, dar azi nu are încă pași înregistrați.');
    } catch (e) {
      setStatus('Nu am putut citi pașii: ' + (e?.message || e));
    }
  }, []);

  const startLive = useCallback(async () => {
    try {
      if (Platform.OS === 'android') {
        await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACTIVITY_RECOGNITION);
      }
      if (!Pedometer) return;
      const available = await Pedometer.isAvailableAsync();
      if (!available) return;
      liveSub.current = Pedometer.watchStepCount((r) => setLiveDelta(r.steps || 0));
    } catch (e) {
      // opțional
    }
  }, []);

  const stopLive = useCallback(() => {
    liveSub.current?.remove?.();
    liveSub.current = null;
  }, []);

  const fullRefresh = useCallback(async () => {
    setRefreshing(true);
    const ok = hcReady || (await initHealthConnect());
    if (ok) await readSteps();
    setRefreshing(false);
  }, [hcReady, initHealthConnect, readSteps]);

  useEffect(() => {
    (async () => {
      try {
        const g = await AsyncStorage.getItem(GOAL_KEY);
        if (g) setGoal(Number(g) || DEFAULT_GOAL);
      } catch (e) {}
      const ok = await initHealthConnect();
      if (ok) await readSteps();
      startLive();
    })();

    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') readSteps();
    });
    const interval = setInterval(readSteps, 30000);
    return () => {
      sub.remove();
      clearInterval(interval);
      stopLive();
    };
  }, [initHealthConnect, readSteps, startLive, stopLive]);

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={fullRefresh} tintColor="#5b8cff" />}
      >
        <Text style={styles.brand}>PulsFit</Text>
        <Text style={styles.subtitle}>Pași — azi</Text>

        <View style={styles.ringWrap}>
          <Text style={styles.bigSteps}>{steps.toLocaleString('ro-RO')}</Text>
          <Text style={styles.goalText}>obiectiv {goal.toLocaleString('ro-RO')}</Text>
          <View style={styles.barBg}>
            <View style={[styles.barFg, { width: `${pct * 100}%` }]} />
          </View>
          <Text style={styles.pctText}>{Math.round(pct * 100)}%</Text>
        </View>

        <View style={styles.statRow}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{distanceKm.toFixed(2)}</Text>
            <Text style={styles.statLabel}>km</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{calories}</Text>
            <Text style={styles.statLabel}>kcal</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{liveDelta}</Text>
            <Text style={styles.statLabel}>live acum</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.btn} onPress={fullRefresh}>
          <Text style={styles.btnText}>↻ Reîmprospătează</Text>
        </TouchableOpacity>

        <View style={styles.statusBox}>
          <Text style={styles.statusText}>{status}</Text>
        </View>

        <View style={styles.help}>
          <Text style={styles.helpTitle}>Cum funcționează cu ecranul stins</Text>
          <Text style={styles.helpText}>
            Android numără pașii tot timpul în cipul telefonului și îi trimite în
            „Health Connect”. PulsFit citește totalul de acolo — deci vezi pașii
            corect chiar dacă aplicația a fost închisă și ecranul stins.
          </Text>
          <TouchableOpacity onPress={() => Linking.openURL('https://play.google.com/store/apps/details?id=com.google.android.apps.healthdata')}>
            <Text style={styles.link}>Deschide Health Connect în Play Store →</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

// --- ErrorBoundary: afișează eroarea pe ecran în loc să închidă aplicația ---
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch() {}
  render() {
    if (this.state.error) {
      const err = this.state.error;
      return (
        <ScrollView style={styles.root} contentContainerStyle={styles.scroll}>
          <Text style={styles.brand}>PulsFit — eroare</Text>
          <Text style={[styles.helpText, { color: '#ff8a9c', marginTop: 12 }]}>
            {String(err?.message || err)}
          </Text>
          <Text style={[styles.helpText, { fontSize: 11, color: '#7c88b8' }]}>
            {String(err?.stack || '').slice(0, 1500)}
          </Text>
        </ScrollView>
      );
    }
    return this.props.children;
  }
}

export default function AppRoot() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0b1020' },
  scroll: { padding: 22, paddingTop: 64, paddingBottom: 48 },
  brand: { color: '#eef1ff', fontSize: 30, fontWeight: '800', letterSpacing: -0.5 },
  subtitle: { color: '#9aa6d4', fontSize: 15, marginTop: 2, marginBottom: 18 },
  ringWrap: {
    backgroundColor: '#182042', borderRadius: 20, padding: 28, alignItems: 'center',
    borderWidth: 1, borderColor: '#2a356a',
  },
  bigSteps: { color: '#eef1ff', fontSize: 60, fontWeight: '800', letterSpacing: -1 },
  goalText: { color: '#38e0c8', fontSize: 14, marginTop: 4, marginBottom: 16 },
  barBg: { width: '100%', height: 12, borderRadius: 8, backgroundColor: '#1e2750', overflow: 'hidden' },
  barFg: { height: '100%', borderRadius: 8, backgroundColor: '#5b8cff' },
  pctText: { color: '#9aa6d4', fontSize: 13, marginTop: 8 },
  statRow: { flexDirection: 'row', gap: 12, marginTop: 16 },
  stat: {
    flex: 1, backgroundColor: '#182042', borderRadius: 16, padding: 16, alignItems: 'center',
    borderWidth: 1, borderColor: '#2a356a',
  },
  statValue: { color: '#eef1ff', fontSize: 22, fontWeight: '700' },
  statLabel: { color: '#9aa6d4', fontSize: 12, marginTop: 2 },
  btn: { marginTop: 18, backgroundColor: '#5b8cff', borderRadius: 14, padding: 16, alignItems: 'center' },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  statusBox: {
    marginTop: 14, backgroundColor: '#151c3a', borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: '#2a356a',
  },
  statusText: { color: '#c7cffa', fontSize: 13.5, textAlign: 'center' },
  help: { marginTop: 22 },
  helpTitle: { color: '#eef1ff', fontSize: 16, fontWeight: '700', marginBottom: 8 },
  helpText: { color: '#9aa6d4', fontSize: 14, lineHeight: 21, marginBottom: 10 },
  link: { color: '#6f92ff', fontSize: 14, fontWeight: '600' },
});
