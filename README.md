# Practice Football Game

Football-only quiz app with live API-Football data and Android support via Capacitor.

## Current Scope

- Single topic only: `Football`
- Season input is capped at `2024` maximum
- Android build + install flow supported

## Project Structure

- `index.html` - app shell
- `js/main.js` - app bootstrap and event wiring
- `js/engine.js` - game engine, API fetch, caching
- `js/ui.js` - rendering layer
- `js/topics.js` - Football topic definition
- `builder.html` + `js/builder*.js` - topic/API config builder
- `scripts/init-android.js` - Android bootstrap for missing `android/`

## Local Setup

```bash
npm install
```

## Configure Live Football API

1. Open `builder.html`
2. In **Section 5 · Live API Fetch**:
   - Enable live data
   - Provider: `API-Football`
   - Add your API key
   - Add league IDs (example: `39,140,135,78,61,253`)
   - Set season (`2000` to `2024`)
3. Click **Save Topic**
4. Open the quiz and click **Refresh**

## Android Commands

From repo root:

```bash
npm run android:init
npm run sync
npm run open
```

Build debug APK from CLI:

```bash
npm run android:apk
```

APK output:

`android/app/build/outputs/apk/debug/app-debug.apk`

## Install On Your Phone (Android)

### Option A - USB install with ADB (fastest)

1. On phone:
   - Enable **Developer options**
   - Enable **USB debugging**
2. Connect phone to PC with USB and accept trust prompt
3. Verify device:

```bash
adb devices
```

4. Install APK:

```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

### Option B - Manual APK transfer

1. Copy `android/app/build/outputs/apk/debug/app-debug.apk` to phone
2. Open APK on phone
3. Allow installs from unknown apps for your file manager/browser
4. Install

## Update Cycle After Code Changes

```bash
npm run sync
npm run android:apk
```

Reinstall with:

```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```
