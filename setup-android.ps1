# ==============================================================
#  setup-android.ps1  —  One-time Capacitor + Android setup
#  Run from the project root in PowerShell:
#
#    .\setup-android.ps1
#
#  Prerequisites (must be installed BEFORE running this):
#    1. Node.js 18+  →  https://nodejs.org
#    2. Java JDK 17+ →  https://adoptium.net
#    3. Android Studio (for Android SDK + emulator / USB build)
#       →  https://developer.android.com/studio
#       In Android Studio → SDK Manager, install:
#         • Android SDK Platform 34  (API 34)
#         • Android SDK Build-Tools 34.x
# ==============================================================

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  Quiz Engine — Capacitor Android Setup" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# ── Step 1: Install npm dependencies ─────────────────────────
Write-Host "[1/5] Installing npm dependencies..." -ForegroundColor Yellow
npm install
if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: npm install failed." -ForegroundColor Red; exit 1 }

# ── Step 2: Build (copy web assets to www/) ──────────────────
Write-Host ""
Write-Host "[2/5] Building web assets into www/..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: build failed." -ForegroundColor Red; exit 1 }

# ── Step 3: Initialise Capacitor (skipped if already done) ───
if (-not (Test-Path "android")) {
  Write-Host ""
  Write-Host "[3/5] Adding Android platform..." -ForegroundColor Yellow
  npx cap add android
  if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: cap add android failed." -ForegroundColor Red; exit 1 }

  # ── Apply AndroidManifest patches ────────────────────────
  Write-Host ""
  Write-Host "[3b] Patching AndroidManifest.xml..." -ForegroundColor Yellow

  $manifestPath = "android\app\src\main\AndroidManifest.xml"
  if (Test-Path $manifestPath) {
    $manifest = Get-Content $manifestPath -Raw

    # Portrait orientation (add to <activity> tag)
    $manifest = $manifest -replace `
      '(android:name="com\.getcapacitor\.BridgeActivity")', `
      '$1' + "`n        android:screenOrientation=`"portrait`""

    # Hardware acceleration (usually already present, ensure it's true)
    if ($manifest -notmatch 'android:hardwareAccelerated') {
      $manifest = $manifest -replace `
        '(android:name="com\.getcapacitor\.BridgeActivity")', `
        '$1' + "`n        android:hardwareAccelerated=`"true`""
    }

    Set-Content $manifestPath $manifest -NoNewline
    Write-Host "     AndroidManifest.xml patched." -ForegroundColor Green
  } else {
    Write-Host "     WARNING: AndroidManifest not found at expected path." -ForegroundColor DarkYellow
    Write-Host "     Manually apply the patches from android-patches\MANIFEST_CHANGES.txt" -ForegroundColor DarkYellow
  }

} else {
  Write-Host ""
  Write-Host "[3/5] android/ already exists — skipping cap add android." -ForegroundColor Gray
}

# ── Step 4: Sync web assets to Android project ───────────────
Write-Host ""
Write-Host "[4/5] Syncing assets into Android project..." -ForegroundColor Yellow
npx cap sync android
if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: cap sync failed." -ForegroundColor Red; exit 1 }

# ── Step 5: Done ──────────────────────────────────────────────
Write-Host ""
Write-Host "================================================" -ForegroundColor Green
Write-Host "  Setup complete!" -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host ""
Write-Host "  DEBUG APK (USB / emulator):" -ForegroundColor White
Write-Host "    cd android"
Write-Host "    .\gradlew assembleDebug"
Write-Host "    Output: android\app\build\outputs\apk\debug\app-debug.apk"
Write-Host ""
Write-Host "  RELEASE APK (Play Store / sideload):"  -ForegroundColor White
Write-Host "    cd android"
Write-Host "    .\gradlew assembleRelease   (then sign with jarsigner)"
Write-Host ""
Write-Host "  OPEN IN ANDROID STUDIO (recommended):" -ForegroundColor White
Write-Host "    npm run open"
Write-Host ""
Write-Host "  SYNC after any web file changes:" -ForegroundColor White
Write-Host "    npm run sync"
Write-Host ""
