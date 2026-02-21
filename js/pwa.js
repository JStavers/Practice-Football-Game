/* ============================================================
   pwa.js — Progressive Web App Utilities
   ============================================================
   Handles:
     1. Service worker registration
     2. Install prompt capture + custom "Install App" button
     3. Cache clear / force-update
     4. Update banner (new version available)
     5. App version display in the UI

   Load order: this file must be loaded LAST in index.html,
   after all other scripts, so the DOM is fully available.
   ============================================================ */

"use strict";

/* ── App version — bump this to signal a new release ─────── */
const APP_VERSION = "2.0.0";

/* ── Stores the deferred install prompt event ────────────── */
let _installPrompt = null;

/* ══════════════════════════════════════════════════════════
   1. SERVICE WORKER REGISTRATION
   ══════════════════════════════════════════════════════════ */

/**
 * Registers sw.js from the app root.
 * - Safe to call on any page (no-ops silently if unsupported).
 * - Listens for updates: when a new SW is waiting, shows the
 *   update banner so the user can refresh.
 *
 * NOTE: Service workers require HTTPS (or localhost).
 *       Over plain HTTP the registration is silently skipped
 *       and the app works normally without offline support.
 */
async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    console.log("[PWA] Service workers are not supported in this browser.");
    return;
  }

  try {
    const registration = await navigator.serviceWorker.register("./sw.js", {
      // Scope: the SW controls everything under "./"
      scope: "./",
    });

    console.log("[PWA] Service worker registered. Scope:", registration.scope);

    // Poll for updates whenever the page regains focus
    registration.update();

    // Listen for a new service worker being installed
    registration.addEventListener("updatefound", () => {
      const incoming = registration.installing;
      if (!incoming) return;

      incoming.addEventListener("statechange", () => {
        // "installed" + a controller means an update is waiting
        if (incoming.state === "installed" && navigator.serviceWorker.controller) {
          console.log("[PWA] New version cached and ready.");
          showUpdateBanner();
        }
      });
    });

  } catch (err) {
    console.error("[PWA] Service worker registration failed:", err);
  }
}

/* ══════════════════════════════════════════════════════════
   2. INSTALL PROMPT
   ══════════════════════════════════════════════════════════ */

/**
 * The browser fires beforeinstallprompt when the PWA criteria
 * are met and the app can be installed.  We capture the event
 * and prevent the default mini-infobar so we can show our own
 * styled install button instead.
 */
window.addEventListener("beforeinstallprompt", (event) => {
  // Stop the browser showing its own automatic prompt
  event.preventDefault();

  // Save the event so we can fire it when the user clicks our button
  _installPrompt = event;

  // Reveal the custom install button in the UI
  setInstallButtonVisible(true);

  console.log("[PWA] Install prompt is ready.");
});

/**
 * Called when the user clicks the "📲 Install App" button.
 * Shows the native browser install dialog and cleans up afterwards.
 */
async function handleInstallClick() {
  if (!_installPrompt) return;

  // Fire the native install dialog
  _installPrompt.prompt();

  // Wait to see what the user chose
  const { outcome } = await _installPrompt.userChoice;
  console.log(`[PWA] Install outcome: ${outcome}`);

  // The prompt can only be used once, so clear it
  _installPrompt = null;
  setInstallButtonVisible(false);
}

/**
 * When the app is successfully installed, hide the install button.
 */
window.addEventListener("appinstalled", () => {
  console.log("[PWA] App installed on home screen!");
  setInstallButtonVisible(false);
  _installPrompt = null;
});

/* ══════════════════════════════════════════════════════════
   3. CACHE CLEAR / FORCE UPDATE
   ══════════════════════════════════════════════════════════ */

/**
 * Deletes all browser caches for this app and reloads the page.
 * Use this when a user needs to clear stale data or force a
 * full refresh after an app update.
 */
async function clearAllCaches() {
  if (!("caches" in window)) {
    console.warn("[PWA] Cache API is not available in this browser.");
    return;
  }

  const cacheNames = await caches.keys();
  await Promise.all(cacheNames.map((name) => caches.delete(name)));

  console.log("[PWA] All caches cleared. Reloading…");

  // Reload so fresh resources are fetched from the network
  window.location.reload();
}

/* ══════════════════════════════════════════════════════════
   4. UPDATE BANNER
   ══════════════════════════════════════════════════════════ */

/**
 * Reveals the update banner when a new service worker version
 * is waiting.  The user can click "Refresh" to load the update.
 */
function showUpdateBanner() {
  const banner = document.getElementById("pwa-update-banner");
  if (banner) banner.classList.remove("hidden");
}

/** Hides the update banner. */
function hideUpdateBanner() {
  const banner = document.getElementById("pwa-update-banner");
  if (banner) banner.classList.add("hidden");
}

/* ══════════════════════════════════════════════════════════
   5. DOM HELPERS
   ══════════════════════════════════════════════════════════ */

/** Show or hide the "Install App" button. */
function setInstallButtonVisible(visible) {
  const btn = document.getElementById("pwa-install-btn");
  if (btn) btn.classList.toggle("hidden", !visible);
}

/* ══════════════════════════════════════════════════════════
   6. INIT — wire everything up once the DOM is ready
   ══════════════════════════════════════════════════════════ */

document.addEventListener("DOMContentLoaded", () => {

  /* ── Version label ──────────────────────────────────────── */
  const versionEl = document.getElementById("pwa-version");
  if (versionEl) versionEl.textContent = `v${APP_VERSION}`;

  /* ── Install button ─────────────────────────────────────── */
  const installBtn = document.getElementById("pwa-install-btn");
  if (installBtn) {
    installBtn.addEventListener("click", handleInstallClick);
  }

  /* ── Cache clear button ─────────────────────────────────── */
  const clearBtn = document.getElementById("pwa-clear-cache-btn");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      if (confirm("Clear the app cache and reload? This fetches fresh resources.")) {
        clearAllCaches();
      }
    });
  }

  /* ── Update banner "Refresh" button ─────────────────────── */
  const updateRefreshBtn = document.getElementById("pwa-update-refresh-btn");
  if (updateRefreshBtn) {
    updateRefreshBtn.addEventListener("click", () => {
      // Tell the waiting service worker to take over, then reload
      if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.ready.then((reg) => {
          if (reg.waiting) {
            reg.waiting.postMessage({ type: "SKIP_WAITING" });
          }
          window.location.reload();
        });
      } else {
        window.location.reload();
      }
    });
  }

  /* ── Update banner close button ─────────────────────────── */
  const updateCloseBtn = document.getElementById("pwa-update-close-btn");
  if (updateCloseBtn) {
    updateCloseBtn.addEventListener("click", hideUpdateBanner);
  }

});

/* ══════════════════════════════════════════════════════════
   7. KICK OFF — register the service worker immediately
   ══════════════════════════════════════════════════════════ */
registerServiceWorker();
