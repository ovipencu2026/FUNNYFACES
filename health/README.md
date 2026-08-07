# PulsFit — aplicație de monitorizare a sănătății

Aplicație web (PWA) care rulează direct în browserul telefonului și poate fi
instalată pe ecranul de start. Numără pași, monitorizează somnul și urmărește
antrenamente sportive cu GPS. **Toate datele rămân pe telefonul tău** (în
`localStorage`) — nimic nu se trimite pe internet.

## Funcții

| Ecran | Ce face |
|---|---|
| **Acasă** | Pași azi (inel de progres), distanță, calorii, somn, antrenamente, grafice pe 7 zile, activități recente. |
| **Pași** | Pedometru live prin accelerometru: detecție de pași, cadență (pași/min), distanță și calorii estimate, istoric. |
| **Sport** | Alergare, ciclism, mers, drumeție cu **GPS**: distanță, ritm/viteză, timp, traseu desenat, calorii. Start / pauză / stop. |
| **Somn** | Cronometru „Adorm / M-am trezit" cu estimarea calității din mișcare (actigrafie), plus adăugare manuală a nopților. Istoric și medie. |
| **Profil** | Nume, sex, vârstă, înălțime, greutate (pentru calcule precise de distanță/calorii), obiectiv zilnic, export/ștergere date. |

## Cum se rulează

PWA-ul are nevoie de un server web (senzorii și service worker-ul nu merg din
`file://`). Din rădăcina proiectului:

```bash
python3 -m http.server 8000
```

Apoi deschide pe **telefon**, în aceeași rețea Wi-Fi:

```
http://<IP-ul-calculatorului>:8000/health/index.html
```

> Senzorii de mișcare și GPS-ul necesită **HTTPS** (sau `localhost`). Pentru
> testare pe telefon prin IP local, unele browsere cer HTTPS — vezi mai jos.

### Instalare pe telefon (ca aplicație)

- **iPhone (Safari):** Share → „Add to Home Screen".
- **Android (Chrome):** meniul ⋮ → „Install app" / „Add to Home screen".

După instalare, pornește din iconița PulsFit ca o aplicație normală.

## Cum funcționează numărarea pașilor

Algoritmul (`steps.js`) analizează magnitudinea accelerației de la senzorul de
mișcare al telefonului:

1. calculează magnitudinea vectorului de accelerație;
2. aplică un filtru trece-jos pentru a elimina zgomotul;
3. urmărește o linie de bază dinamică (prag adaptiv);
4. numără fiecare trecere peste prag cu amplitudine minimă și interval minim
   între pași (anti dublă-numărare), estimând și cadența.

La primul start, iOS 13+ cere permisiune explicită pentru senzorul de mișcare.

## Limitări importante (de ce e „prototip web")

- **Numărarea pașilor merge doar cât timp aplicația e deschisă pe ecran.** Un
  browser **nu** poate accesa cipul dedicat de pași (Apple CMPedometer /
  Android step counter) care numără în fundal. Pentru numărare continuă,
  în fundal, cu ecranul stins, e nevoie de o **aplicație nativă**
  (React Native / Swift / Kotlin) — vezi roadmap-ul de mai jos.
- Somnul se estimează din mișcare (telefonul pe saltea), nu din puls/HRV ca un
  smartwatch.
- Precizia distanței/caloriilor depinde de datele din profil (înălțime, greutate).

## Roadmap spre aplicație nativă

Logica de UI și calcule (pași, ritm, calorii, somn) se poate porta în
**React Native** pentru a obține:

- numărare pași **în fundal** (Core Motion / Health Connect);
- citire somn din **HealthKit** (iOS) / **Health Connect** (Android);
- GPS în fundal cu ecranul stins;
- publicare în App Store / Google Play.

## Structura codului

```
health/
  index.html        # structura ecranelor + navigație
  styles.css        # temă închisă, mobile-first
  app.js            # controller: rutare, dashboard, profil, legături UI
  storage.js        # persistență localStorage
  utils.js          # date, Haversine, MET/calorii, formatare
  steps.js          # motor pedometru (accelerometru)
  sleep.js          # cronometru somn + actigrafie
  activities.js     # tracker GPS + desen traseu pe canvas
  charts.js         # grafice cu bare pe canvas
  sw.js             # service worker (offline)
  manifest.webmanifest
  icons/            # iconițe PWA
```

Fără dependențe externe, fără build — JavaScript modular nativ.
