// Plugin Expo local: înregistrează delegatul de permisiuni Health Connect în
// MainActivity.onCreate. Fără acesta, react-native-health-connect aruncă
// „lateinit property requestPermission has not been initialized" la primul
// requestPermission și aplicația crapă.
const { withMainActivity } = require('expo/config-plugins');

const IMPORT_LINE =
  'import dev.matinzd.healthconnect.permissions.HealthConnectPermissionDelegate';
const CALL_KT = 'HealthConnectPermissionDelegate.setPermissionDelegate(this)';

module.exports = function withHealthConnectPermissionDelegate(config) {
  return withMainActivity(config, (cfg) => {
    let src = cfg.modResults.contents;
    const isKotlin = cfg.modResults.language === 'kt';

    if (!isKotlin) {
      // Proiectul Expo SDK 51 folosește Kotlin; dacă nu, nu modificăm.
      return cfg;
    }

    // 1) adaugă importul o singură dată, după linia `package ...`
    if (!src.includes(IMPORT_LINE)) {
      src = src.replace(/(^package .*$)/m, `$1\n\n${IMPORT_LINE}`);
    }

    // 2) apelează setPermissionDelegate după super.onCreate(...)
    if (!src.includes(CALL_KT)) {
      src = src.replace(
        /(super\.onCreate\([^)]*\)\s*)/,
        `$1\n    ${CALL_KT}\n`
      );
    }

    cfg.modResults.contents = src;
    return cfg;
  });
};
