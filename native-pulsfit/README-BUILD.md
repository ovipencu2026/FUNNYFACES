# PulsFit nativ (Android) — cum obții aplicația pe telefon

Aceasta e versiunea **nativă** a PulsFit pentru Android. Spre deosebire de
varianta web, **numără pașii chiar cu ecranul stins și aplicația închisă**,
pentru că citește pașii din **Health Connect** — locul unde Android salvează
pașii numărați non-stop de cipul telefonului.

> **v1 = doar pași.** După ce merge numărarea cu ecranul stins, adăugăm somn și
> sport GPS în versiunile următoare.

---

## Ce îți trebuie (o singură dată)

1. **Node.js** instalat pe calculator — https://nodejs.org (versiunea „LTS").
2. **Cont Expo** gratuit — https://expo.dev/signup

## Pașii de build (pe calculator, în Terminal / PowerShell)

Deschide un terminal **în folderul `native-pulsfit`** (unde e acest fișier).

```bash
# 1. Instalează dependențele proiectului
npm install

# 2. Instalează unealta de build EAS (o singură dată, global)
npm install -g eas-cli

# 3. Autentifică-te cu contul Expo
eas login

# 4. Leagă proiectul de contul tău (răspunde „Y” la întrebări)
eas build:configure

# 5. Construiește APK-ul pentru Android
eas build -p android --profile preview
```

Build-ul rulează **în cloud** (~10–20 min). La final primești un **link** în
terminal și în contul tău expo.dev de unde descarci fișierul **`.apk`**.

## Instalarea pe telefon

1. Deschide linkul de la EAS pe telefon (sau descarcă APK-ul pe calculator și
   trimite-l pe telefon).
2. Apasă pe fișierul `.apk` → Android îți cere să permiți „instalarea din surse
   necunoscute" → **permite** → **Instalează**.
3. Deschide **PulsFit** din ecranul de start.

## Prima pornire

1. La deschidere, aplicația cere permisiune de **Activity Recognition** (mișcare)
   și acces la **Health Connect** → apasă **Permite / Allow**.
2. Ai nevoie de **Health Connect** pe telefon:
   - pe Android 14+ e deja instalat;
   - altfel instalează-l din Play Store (link în aplicație).
3. Health Connect are nevoie de o **sursă de pași**: de obicei telefonul scrie
   direct, sau o aplicație ca **Samsung Health** / **Google Fit**. Dacă
   aplicația spune „azi nu are pași", deschide Health Connect și verifică sursa.

## Testul care contează 🎯

1. Deschide PulsFit, notează numărul de pași.
2. **Stinge ecranul**, pune telefonul în buzunar, mergi 100–200 de pași.
3. Redeschide PulsFit (sau trage în jos pentru „reîmprospătează").
4. Pașii au crescut ✅ — chiar dacă ecranul a fost stins. Asta e ce nu putea
   face varianta web.

---

## Probleme frecvente

- **„Health Connect nu e disponibil"** → instalează-l din Play Store (link în
  aplicație), apoi redeschide PulsFit.
- **„azi nu are pași"** → deschide Health Connect → Data & access → verifică să
  existe o sursă care scrie „Steps"; acordă lui PulsFit permisiunea de citire.
- **Build-ul eșuează** → trimite-mi textul erorii din terminal, îl rezolvăm.

Orice pas nu merge, spune-mi exact ce scrie pe ecran și te ajut.
