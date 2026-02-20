/* ============================================================
   nav.js  —  Shared sidebar navigation logic
   Handles mobile toggle, overlay dismiss, and active-page
   highlighting. Load this script on every page AFTER nav.css.
   ============================================================ */

"use strict";

(function () {
  /* ── Hamburger toggle ──────────────────────────────────────── */
  const toggle  = document.getElementById("nav-toggle");
  const overlay = document.getElementById("nav-overlay");

  /**
   * Opens or closes the mobile sidebar by toggling .nav-open on
   * the <body>.  Traps focus inside the sidebar while it's open.
   */
  function toggleNav() {
    document.body.classList.toggle("nav-open");
  }

  /** Closes the sidebar (used by overlay click and nav links). */
  function closeNav() {
    document.body.classList.remove("nav-open");
  }

  if (toggle)  toggle.addEventListener("click", toggleNav);
  if (overlay) overlay.addEventListener("click", closeNav);

  /* ── Close sidebar when a nav link is tapped on mobile ──────── */
  document.querySelectorAll(".nav-item[href]").forEach(link => {
    link.addEventListener("click", closeNav);
  });

  /* ── Keyboard: close sidebar with Escape ────────────────────── */
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") closeNav();
  });

  /* ── Active-page highlighting ───────────────────────────────── */
  /*
   * Compares each nav link's href to the current page filename
   * and adds .nav-item--active to the matching link.
   */
  const currentPage = window.location.pathname.split("/").pop() || "index.html";

  document.querySelectorAll(".nav-item[href]").forEach(link => {
    const linkPage = link.getAttribute("href").split("/").pop();
    if (linkPage === currentPage) {
      link.classList.add("nav-item--active");
      link.setAttribute("aria-current", "page");
    }
  });
})();
