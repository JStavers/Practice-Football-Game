/* ============================================================
   scripts/prepare-www.js
   ============================================================
   Copies all web-app assets from the project root into the
   www/ folder that Capacitor uses as its webDir.

   Run via:
     npm run build      ← just copies assets
     npm run sync       ← copies then syncs to Android project

   Files copied:
     index.html, builder.html, manifest.json, sw.js
     css/, js/, data/, icons/
   ============================================================ */

"use strict";

const fs   = require("fs");
const path = require("path");

/* ── Root of the project (one level above scripts/) ──────── */
const ROOT = path.resolve(__dirname, "..");
const DEST = path.join(ROOT, "www");

/* ── Top-level files to copy ─────────────────────────────── */
const FILES = [
  "index.html",
  "builder.html",
  "manifest.json",
  "sw.js",
];

/* ── Directories to copy recursively ─────────────────────── */
const DIRS = [
  "css",
  "js",
  "data",
  "icons",
];

/* ──────────────────────────────────────────────────────────────
   UTILS
   ────────────────────────────────────────────────────────────── */

/** Copy a single file, creating parent dirs if needed. */
function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

/**
 * Recursively copy a directory from src to dest.
 * Skips files/folders listed in `skip`.
 */
function copyDir(src, dest, skip = []) {
  if (!fs.existsSync(src)) {
    console.warn(`  [skip] Directory not found: ${src}`);
    return;
  }
  fs.mkdirSync(dest, { recursive: true });

  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (skip.includes(entry.name)) continue;

    const srcPath  = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      copyFile(srcPath, destPath);
    }
  }
}

/* ──────────────────────────────────────────────────────────────
   MAIN
   ────────────────────────────────────────────────────────────── */

console.log("🔨 Quiz Engine — preparing www/ for Capacitor…\n");

/* 1. Clean www/ so stale files don't linger */
if (fs.existsSync(DEST)) {
  fs.rmSync(DEST, { recursive: true, force: true });
  console.log("  ♻️  Cleaned old www/");
}
fs.mkdirSync(DEST, { recursive: true });

/* 2. Copy individual root files */
for (const file of FILES) {
  const src = path.join(ROOT, file);
  if (fs.existsSync(src)) {
    copyFile(src, path.join(DEST, file));
    console.log(`  ✅  ${file}`);
  } else {
    console.warn(`  ⚠️  Not found (skipping): ${file}`);
  }
}

/* 3. Copy asset directories */
for (const dir of DIRS) {
  const src = path.join(ROOT, dir);
  const dst = path.join(DEST, dir);
  copyDir(src, dst);
  console.log(`  ✅  ${dir}/`);
}

console.log(`\n✨ Done! Assets ready in: www/`);
console.log("   Run  \"npm run sync\"  to push them into the Android project.\n");
