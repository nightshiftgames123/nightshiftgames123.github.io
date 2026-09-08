# الهروب — Robot Escape · Android build guide

The game in `robotescape/` is a self-contained, offline-capable PWA. Nothing
needs bundling or compiling to run it: it is one HTML file, a manifest, a
service worker and five PNGs, served straight from GitHub Pages at

    https://nightshiftgames123.github.io/robotescape/

From there you have two ways to get a Play Store package. **Route A (TWA)** is
the recommended one — it ships the real Chrome engine, weighs a few hundred KB
and updates the moment you push to `main`. **Route B (Capacitor)** bundles the
files inside the APK instead, which suits an offline-first release or one that
needs native plugins (AdMob, billing, Play Games).

---

## Route A — Trusted Web Activity (recommended)

### 1. Prerequisites

* Node 18+
* JDK 17
* Android SDK (Android Studio, or `sdkmanager` command-line tools)

```bash
npm install -g @bubblewrap/cli
```

### 2. Initialise the project

```bash
mkdir -p ~/robot-escape-twa && cd ~/robot-escape-twa
cp /path/to/repo/robotescape/android/twa-manifest.json .
bubblewrap init --manifest ./twa-manifest.json
```

Bubblewrap reads `twa-manifest.json`, so accept the values it echoes back.
Everything is already set for this game: `packageId`
`com.nightshiftgames.robotescape`, fullscreen display, landscape orientation,
and `#0a0e14` for the theme, splash and navigation bars.

If you host the game on the other domain, change `host`, `webManifestUrl`,
`iconUrl`, `maskableIconUrl` and `fullScopeUrl` to point at
`nightshiftgames.github.io` first.

### 3. Build

```bash
bubblewrap build
```

This produces `app-release-bundle.aab` (upload this to Play) and
`app-release-signed.apk` (sideload this to test). The first build creates
`android.keystore` — **back it up**, Play will refuse an update signed with a
different key.

### 4. Link the app to the site (required, or the app shows a URL bar)

Get the SHA-256 fingerprint of the key that will sign the release:

```bash
# your own upload key
keytool -list -v -keystore android.keystore -alias android | grep SHA256
```

If you enrol in **Play App Signing** (default for new apps), use the
fingerprint Play shows under *Release → Setup → App signing → App signing key
certificate* instead — that is the key that actually signs what users install.

Then paste it into `.well-known/assetlinks.json` at the repo root, replacing
`REPLACE_WITH_YOUR_SHA256_SIGNING_FINGERPRINT`, and push. Both fingerprints can
be listed at once if you want the locally-signed APK and the Play build to work:

```json
"sha256_cert_fingerprints": [
  "AA:BB:...:upload key",
  "11:22:...:play app signing key"
]
```

Verify it is live before uploading:

```bash
curl https://nightshiftgames123.github.io/.well-known/assetlinks.json
```

The repo root contains a `.nojekyll` file so GitHub Pages serves the
`.well-known/` directory — Jekyll would otherwise skip any dot-directory.

### 5. Ship

Upload the `.aab` in the Play Console. The store listing needs a privacy
policy URL; `privacy.html` on the site currently covers Gravity Flip only, so
add a section (or a second page) for Robot Escape before you submit. For the
record, the game itself collects nothing: progress, stars, unlocked skins and
the sound/vibration settings live in `localStorage` on the device and are never
transmitted.

---

## Route B — Capacitor (assets bundled in the APK)

Use this when you want the game to work with no network on first launch, or you
need native SDKs such as AdMob.

```bash
mkdir -p ~/robot-escape-cap && cd ~/robot-escape-cap
npm init -y
npm install @capacitor/core @capacitor/android
npm install -D @capacitor/cli

mkdir www
cp -r /path/to/repo/robotescape/* www/
rm -rf www/android                       # build tooling, not game assets

cp /path/to/repo/robotescape/android/capacitor.config.json .
npx cap add android
npx cap sync
npx cap open android                     # build / run from Android Studio
```

Two things to change inside the generated Android project:

* `android/app/src/main/AndroidManifest.xml` — set
  `android:screenOrientation="sensorLandscape"` on the main activity so the
  game opens the way it is designed to.
* The service worker is redundant when the assets are local; it is harmless,
  but you can delete `www/sw.js` and the registration block at the bottom of
  `www/index.html` if you prefer.

---

## Regenerating the icons

`tools/make-icons.py` draws the ESC-9 robot and writes every icon size. It uses
only the Python standard library:

```bash
python3 robotescape/android/tools/make-icons.py
```

## Play Store checklist

| Item | Where |
| --- | --- |
| App icon 512×512 | `robotescape/icons/icon-512.png` |
| Adaptive/maskable icon | `robotescape/icons/icon-maskable-512.png` |
| Feature graphic 1024×500 | still to be made |
| Screenshots (min 2, landscape) | capture from a device |
| Privacy policy URL | add a Robot Escape section to `privacy.html` |
| Data safety form | "No data collected" — the game has no analytics, no ads, no network calls |
| Target API level | Bubblewrap targets the current requirement automatically |
