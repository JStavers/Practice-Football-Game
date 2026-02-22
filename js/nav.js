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
  const sidebar = document.querySelector(".sidebar");

  function setNavOpen(open) {
    document.body.classList.toggle("nav-open", open);
    if (toggle) toggle.setAttribute("aria-expanded", open ? "true" : "false");
    if (overlay) overlay.setAttribute("aria-hidden", open ? "false" : "true");
  }

  /**
   * Opens or closes the mobile sidebar by toggling .nav-open on
   * the <body> and syncing ARIA state.
   */
  function toggleNav() {
    const isOpen = document.body.classList.contains("nav-open");
    setNavOpen(!isOpen);
    if (!isOpen && sidebar) {
      const firstLink = sidebar.querySelector(".nav-item, .sidebar__brand");
      if (firstLink) firstLink.focus();
    }
  }

  /** Closes the sidebar (used by overlay click and nav links). */
  function closeNav() {
    setNavOpen(false);
  }

  if (toggle)  toggle.addEventListener("click", toggleNav);
  if (overlay) overlay.addEventListener("click", closeNav);

  /* ── Close sidebar when a nav link is tapped on mobile ──────── */
  document.querySelectorAll(".nav-item[href]").forEach(link => {
    link.addEventListener("click", closeNav);
  });

  /* ── Keyboard: close sidebar with Escape ────────────────────── */
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      closeNav();
      if (toggle) toggle.focus();
    }
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 700) {
      closeNav();
    }
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
