"use strict";

const { existsSync } = require("fs");
const { spawnSync } = require("child_process");

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit", shell: true });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const hasAndroid = existsSync("android");

if (!hasAndroid) {
  console.log("📱 Android project not found. Creating with Capacitor...");
  run("npx", ["cap", "add", "android"]);
} else {
  console.log("📱 Android project already exists. Skipping cap add android.");
}

console.log("🔄 Syncing web assets + native project...");
run("npm", ["run", "sync"]);

console.log("✅ Android project is ready.");
