# ⚽ Football Quiz Web App

A mobile-friendly quiz game where you match footballers to randomly generated modifiers — **Position**, **League**, and **Country**.

## How to Play

1. Three modifiers appear on screen (e.g. *Striker · Premier League · Brazil*).
2. Type the name of a real footballer who fits **all three**.
3. Harder modifier combos award more points!
4. Click **New Round** to get a fresh set of modifiers.

## Project Structure

```
├── index.html   — Page markup
├── styles.css   — Mobile-first responsive styles
├── script.js    — Game logic, data & event handling
└── .github/
    └── copilot-instructions.md
```

## Running the App

This is a **static site** — no build step required.

- **Option A** – Open `index.html` directly in a browser.
- **Option B** – Use the VS Code **Live Server** extension:
  1. Install the *Live Server* extension (`ritwickdey.liveserver`).
  2. Right-click `index.html` → **Open with Live Server**.

## Tech Stack

- HTML5, CSS3, vanilla JavaScript (ES6+)
- No frameworks, no CDNs, no dependencies

## Expanding the Quiz

The `VALID_ANSWERS` object in `script.js` maps each modifier combination to accepted player names. To add more content, simply add new entries:

```js
"position|league|country": ["player name 1", "player name 2"],
```

All keys and values should be **lowercase**.


## Android App (Capacitor)

This branch includes Capacitor Android support. If your checkout does **not** have an `android/` folder (for example, older clones/branches), run:

```bash
npm run android:init
```

That command creates `android/` (if missing) and syncs the current web app into it.

### One-time setup

```bash
npm install
npm run sync
```

### First-time one-command setup (safe to re-run)

```bash
npm run android:init
```

### Open in Android Studio

```bash
npm run open
```

### Build APK from CLI

```bash
cd android
./gradlew assembleDebug
```

Debug APK output:

`android/app/build/outputs/apk/debug/app-debug.apk`

Whenever you change web assets (`index.html`, `css/`, `js/`, etc.), run:

```bash
npm run sync
```
