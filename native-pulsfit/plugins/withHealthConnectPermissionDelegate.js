// Plugin Expo local pentru Health Connect. Face două lucruri esențiale pe care
// react-native-health-connect NU le face singur pe Expo:
//  1. înregistrează delegatul de permisiuni în MainActivity.onCreate
//     (altfel: crash „lateinit property requestPermission not initialized");
//  2. declară permisiunea android.permission.health.READ_STEPS în manifest
//     (altfel: SecurityException la citire + aplicația nu apare în Health Connect).
const { withMainActivity, withAndroidManifest } = require('expo/config-plugins');

const IMPORT_LINE =
  'import dev.matinzd.healthconnect.permissions.HealthConnectPermissionDelegate';
const CALL_KT = 'HealthConnectPermissionDelegate.setPermissionDelegate(this)';
const HEALTH_PERMISSIONS = ['android.permission.health.READ_STEPS'];

function withPermissionDelegateActivity(config) {
  return withMainActivity(config, (cfg) => {
    if (cfg.modResults.language !== 'kt') return cfg;
    let src = cfg.modResults.contents;
    if (!src.includes(IMPORT_LINE)) {
      src = src.replace(/(^package .*$)/m, `$1\n\n${IMPORT_LINE}`);
    }
    if (!src.includes(CALL_KT)) {
      src = src.replace(/(super\.onCreate\([^)]*\)\s*)/, `$1\n    ${CALL_KT}\n`);
    }
    cfg.modResults.contents = src;
    return cfg;
  });
}

function withHealthPermissions(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    manifest['uses-permission'] = manifest['uses-permission'] || [];
    for (const name of HEALTH_PERMISSIONS) {
      const exists = manifest['uses-permission'].some(
        (p) => p?.$?.['android:name'] === name
      );
      if (!exists) {
        manifest['uses-permission'].push({ $: { 'android:name': name } });
      }
    }
    return cfg;
  });
}

module.exports = function withPulsfitHealthConnect(config) {
  config = withPermissionDelegateActivity(config);
  config = withHealthPermissions(config);
  return config;
};
