/* ============================================================
   builder-export.js  —  Validation, JSON build, Copy & Export
   ============================================================
   Reads `state` (builder.js) and calls UI helpers (builder-ui.js).
   Has no direct DOM writes except via showValidationErrors / showToast.

   Exposes two public functions used by builder-ui.js:
     buildTopicObject()  — returns the plain JS object (for preview)
     exportTopic()       — validates, then downloads JSON file
   ============================================================ */

"use strict";

/* ============================================================
   BUILD — assemble the topic object from current state
   ============================================================ */

/**
 * Builds and returns the raw topic object that matches the JSON
 * schema expected by importTopicsFromJSON() in engine.js.
 *
 * Called on every render cycle by builder-ui.js to power the
 * live preview, and again just before export to get final data.
 *
 * @returns {object}  The topic object (NOT yet stringified).
 */
function buildTopicObject() {
  const m    = state.meta;
  const keys = getCategoryKeys();

  /* ── categoryLabels — derive from state.categories ── */
  const categoryLabels = {};
  state.categories.forEach(cat => {
    const key = labelToKey(cat.label);
    if (key) categoryLabels[key] = cat.label || toTitleCase(key);
  });

  /* ── categoryColors — cycle through the three built-in CSS slots ── */
  const COLOR_SLOTS = ["position", "league", "country"];
  const categoryColors = {};
  state.categories.forEach((cat, i) => {
    const key = labelToKey(cat.label);
    if (key) categoryColors[key] = COLOR_SLOTS[i % COLOR_SLOTS.length];
  });

  /* ── difficultyWeights — only include non-empty rows ── */
  const difficultyWeights = {};
  state.weights.forEach(w => {
    const val  = w.value.trim();
    const mult = parseFloat(w.multiplier);
    if (val && !isNaN(mult) && mult > 0) {
      difficultyWeights[val] = mult;
    }
  });

  /* ── data items (exclude API-sourced items — those come from the live feed) ── */
  const data = state.items
    .filter(item => !item._fromApi)
    .map(item => {
      const attributes = {};
      keys.forEach(key => {
        attributes[key] = (item.attrs[key] ?? "").trim();
      });
      return {
        name:       item.name.trim(),
        attributes,
      };
    });

  /* ── Assemble final object ── */
  const obj = {
    topicKey:    m.topicKey   || "MyTopic",
    topicName:   m.topicName  || m.topicKey || "My Topic",
    icon:        m.icon        || "❓",
    description: m.description || "",
    placeholder: m.placeholder || "Type your answer…",
    usedLabel:   m.usedLabel   || "Answers Used",

    categories:       keys,
    categoryLabels,
    categoryColors,

    difficultyKey:     m.difficultyKey || keys[0] || "",
    difficultyWeights: Object.keys(difficultyWeights).length
      ? difficultyWeights
      : undefined,          // omit the key entirely if no weights defined

    data,
  };

  /* ── Attach apiConfig when enabled ── */
  const ac = state.apiConfig;
  if (ac.enabled) {
    obj.apiConfig = {
      enabled:  true,
      provider: ac.provider || "API-Football",
      // Only embed the key if the user typed one in — they can also
      // supply it at runtime via the quiz UI.
      ...(ac.apiKey ? { apiKey: ac.apiKey } : {}),
      leagues:  ac.leagues.length ? ac.leagues : [],
      season:   ac.season || 2024,
    };
  }

  // Remove undefined keys so they don't appear in the JSON output
  return stripUndefined(obj);
}

/* ============================================================
   VALIDATE — check the state for errors before exporting
   ============================================================ */

/**
 * Validates the current state and returns an array of error strings.
 * An empty array means the state is valid and safe to export.
 *
 * @returns {string[]}
 */
function validateState() {
  const errors = [];
  const m = state.meta;

  /* ── Meta checks ── */
  if (!m.topicKey.trim()) {
    errors.push("Topic Key is required (Section 1).");
  } else if (/\s/.test(m.topicKey)) {
    errors.push("Topic Key must not contain spaces. Use camelCase or PascalCase.");
  }

  if (!m.topicName.trim()) {
    errors.push("Display Name is required (Section 1).");
  }

  /* ── Category checks ── */
  if (state.categories.length === 0) {
    errors.push("Add at least one category (Section 2).");
  } else {
    const seenKeys = new Set();
    state.categories.forEach((cat, i) => {
      const key = labelToKey(cat.label);
      if (!key) {
        errors.push(`Category ${i + 1} has an empty label. Please fill it in.`);
      } else if (seenKeys.has(key)) {
        errors.push(`Duplicate category key "${key}". Each category must be unique.`);
      } else {
        seenKeys.add(key);
      }
    });
  }

  /* ── Weight checks ── */
  state.weights.forEach((w, i) => {
    const num = parseFloat(w.multiplier);
    if (w.value.trim() && (isNaN(num) || num <= 0)) {
      errors.push(
        `Weight row ${i + 1}: multiplier must be a positive number (got "${w.multiplier}").`
      );
    }
    if (!w.value.trim() && w.multiplier !== "1") {
      errors.push(
        `Weight row ${i + 1}: value is empty. Fill in the value or remove this row.`
      );
    }
  });

  /* ── Data item checks (skip when API provides data) ── */
  const usingApi = state.apiConfig.enabled;
  const manualItems = state.items.filter(item => !item._fromApi);
  if (!usingApi && manualItems.length === 0) {
    errors.push("Add at least one data item (Section 4), or enable the API in Section 5.");
  } else if (!usingApi) {
    const validKeys = getValidCategoryKeys();
    manualItems.forEach((item, i) => {
      const label = `Item ${i + 1}${item.name ? ` ("${item.name}")` : ""}`;

      if (!item.name.trim()) {
        errors.push(`${label}: Name is required.`);
      }

      validKeys.forEach(key => {
        if (!item.attrs[key]?.trim()) {
          // Find the human-readable label for this key
          const cat = state.categories.find(c => labelToKey(c.label) === key);
          const catLabel = cat?.label || key;
          errors.push(`${label}: "${catLabel}" attribute is empty.`);
        }
      });
    });
  }

  /* ── API Config checks (only when enabled) ── */
  const ac = state.apiConfig;
  if (ac.enabled) {
    if (!ac.provider) {
      errors.push("API Config (Section 5): Provider is required.");
    }
    if (ac.leagues.length === 0) {
      errors.push("API Config (Section 5): Enter at least one League ID.");
    }
    if (!ac.season || ac.season < 2000 || ac.season > 2099) {
      errors.push("API Config (Section 5): Season must be a valid year (2000–2099).");
    }
    // Note: apiKey is optional at export time — can be entered in the quiz UI
  }

  return errors;
}

/* ============================================================
   EXPORT — download as .json file
   ============================================================ */

/**
 * Validates state, then triggers a JSON file download.
 * Shows validation errors instead if anything is wrong.
 */
function exportTopic() {
  // First validate
  const errors = validateState();
  showValidationErrors(errors);
  if (errors.length > 0) return;

  // Build JSON string (pretty-printed)
  const obj  = buildTopicObject();
  const json = JSON.stringify([obj], null, 2); // wrap in array — engine expects an array

  // Create a temporary download link
  const blob = new Blob([json], { type: "application/json" });
  const url  = URL.createObjectURL(blob);

  const a       = document.createElement("a");
  a.href        = url;
  a.download    = `${(state.meta.topicKey || "topic").toLowerCase()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  // Release the object URL after a short delay
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  showToast("✅ JSON file downloaded!");
}

/* ============================================================
   COPY — copy JSON to clipboard
   ============================================================ */

/**
 * Copies the current JSON (valid or not) to the clipboard.
 * Warns via toast if clipboard access is denied.
 */
async function copyToClipboard() {
  const obj  = buildTopicObject();
  const json = JSON.stringify([obj], null, 2);

  try {
    await navigator.clipboard.writeText(json);
    showToast("📋 Copied to clipboard!");
  } catch (err) {
    // Fallback for older browsers / non-HTTPS contexts
    fallbackCopy(json);
  }
}

/**
 * Textarea-based copy fallback for non-HTTPS environments.
 * @param {string} text
 */
function fallbackCopy(text) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity  = "0";
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand("copy");
    showToast("📋 Copied to clipboard!");
  } catch {
    showToast("❌ Could not copy. Try exporting instead.", "error");
  }
  document.body.removeChild(ta);
}

/* ============================================================
   BUTTON LISTENERS (wired here since we own the logic)
   ============================================================ */

dom.exportBtn.addEventListener("click", exportTopic);
dom.copyBtn.addEventListener("click", copyToClipboard);

/* ── Save topic to localStorage ──────────────────────────────── */
if (dom.saveTopicBtn) {
  dom.saveTopicBtn.addEventListener("click", () => {
    const errors = validateState();
    showValidationErrors(errors);
    if (errors.length > 0) return;

    const obj = buildTopicObject();
    upsertTopic(obj);
    renderTopicList();
    clearDirty();
    showToast("✅ Topic saved!");
  });
}

/* ── Delete topic from localStorage ─────────────────────────── */
if (dom.deleteTopicBtn) {
  dom.deleteTopicBtn.addEventListener("click", () => {
    const key = state.meta.topicKey;
    if (!key) {
      showToast("❌ No topic key set.", "error");
      return;
    }

    if (!confirm(`Delete "${state.meta.topicName || key}"?`)) return;

    deleteSavedTopic(key);
    _suppressDirty = true;
    resetEditorToBlank();
    _suppressDirty = false;
    clearDirty();
    render();
    renderTopicList();
    showToast("🗑️ Topic deleted.");
  });
}


/* ============================================================
   UTILITIES
   ============================================================ */

/**
 * Converts a snake_case or lower_case key to Title Case.
 * "premier_league" → "Premier League"
 * @param {string} key
 * @returns {string}
 */
function toTitleCase(key) {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, ch => ch.toUpperCase());
}

/**
 * Removes all keys with value === undefined from an object (shallow).
 * Needed because JSON.stringify omits undefined values, but we want
 * clean output with no dangling keys at the top level.
 * @param {object} obj
 * @returns {object}
 */
function stripUndefined(obj) {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined)
  );
}
