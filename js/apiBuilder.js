/* ============================================================
   apiBuilder.js  —  Custom API Configuration & Test UI
   ============================================================
   Manages the "Section 6 · Custom API Builder" panel in the
   Topic Builder.

   Responsibilities:
     • State mutations for customApiConfig + fieldMapping
     • renderCustomApiSection() — syncs the Section 6 DOM to state
     • runApiTest()             — fetches sample data & shows results
     • initCustomApiSection()   — wires all event listeners once

   Reads state / makeId / onStateChange from builder.js.
   Calls escHtml() from builder-ui.js (loaded after this file).
   Calls performCustomApiFetch / collectKeys from topicStorage.js
   and mappingEngine.js.

   Load order:
     mappingEngine.js → topicStorage.js → builder.js
       → apiBuilder.js → builder-ui.js
   ============================================================ */

"use strict";

/* ── Module-level transient state ──────────────────────────────
   These are NOT saved — they exist only for the current session.
   Reset when a new topic is loaded.
   ──────────────────────────────────────────────────────────── */

/** Key paths collected from the last successful API test */
let _sampleKeys = [];

/** First 5 raw items from the last API test (for preview) */
let _rawSample  = [];

/** True while a test fetch is in-flight */
let _isTesting  = false;

/**
 * Called by loadTopicIntoEditor (builder.js) to clear transient
 * test state when a new topic is opened.
 */
function resetApiBuilderState() {
  _sampleKeys = [];
  _rawSample  = [];
  _isTesting  = false;
}

/* ============================================================
   STATE MUTATIONS  —  customApiConfig
   These write directly to builder.js `state` and trigger render.
   ============================================================ */

/** Update any simple scalar field on state.customApiConfig */
function updateCustomApiField(field, value) {
  state.customApiConfig[field] = value;
  onStateChange();
}

/**
 * Update a field inside state.customApiConfig.auth.
 * @param {"type"|"credential"|"headerName"} field
 * @param {string} value
 */
function updateCustomAuth(field, value) {
  state.customApiConfig.auth[field] = value;
  onStateChange();
}

/* ── Headers ── */

function addCustomHeader() {
  state.customApiConfig.headers.push({ id: makeId(), key: "", value: "" });
  onStateChange();
}

function removeCustomHeader(id) {
  state.customApiConfig.headers =
    state.customApiConfig.headers.filter(h => h.id !== id);
  onStateChange();
}

/**
 * @param {string} id   — the header row's id
 * @param {"key"|"value"} prop
 * @param {string} val
 */
function updateCustomHeader(id, prop, val) {
  const h = state.customApiConfig.headers.find(h => h.id === id);
  if (h) h[prop] = val;
  onStateChange();
}

/* ── Query params ── */

function addCustomParam() {
  state.customApiConfig.queryParams.push({ id: makeId(), key: "", value: "" });
  onStateChange();
}

function removeCustomParam(id) {
  state.customApiConfig.queryParams =
    state.customApiConfig.queryParams.filter(p => p.id !== id);
  onStateChange();
}

/**
 * @param {string} id   — the param row's id
 * @param {"key"|"value"} prop
 * @param {string} val
 */
function updateCustomParam(id, prop, val) {
  const p = state.customApiConfig.queryParams.find(p => p.id === id);
  if (p) p[prop] = val;
  onStateChange();
}

/* ============================================================
   STATE MUTATIONS  —  fieldMapping
   ============================================================ */

/** Set the name field path */
function updateFieldMappingName(nameField) {
  state.fieldMapping.nameField = nameField;
  onStateChange();
}

/** Add a new blank category → field mapping row */
function addFieldMappingCategory() {
  state.fieldMapping.categories.push({
    id:           makeId(),
    categoryName: "",
    fieldKey:     "",
    transform:    "",
  });
  onStateChange();
}

/**
 * @param {string} id
 * @param {"categoryName"|"fieldKey"} prop
 * @param {string} val
 */
function updateFieldMappingCategory(id, prop, val) {
  const c = state.fieldMapping.categories.find(c => c.id === id);
  if (c) c[prop] = val;
  onStateChange();
}

function removeFieldMappingCategory(id) {
  state.fieldMapping.categories =
    state.fieldMapping.categories.filter(c => c.id !== id);
  onStateChange();
}

/* ============================================================
   RENDER  —  main entry point called by builder-ui.js render()
   ============================================================ */

/**
 * Syncs the entire Section 6 DOM to the current state.
 * Uses the "controlled input" pattern: we only overwrite element
 * values when the element is NOT currently focused, so typing is
 * never interrupted.
 */
function renderCustomApiSection() {
  const cfg = state.customApiConfig;

  /* ── Enable toggle ── */
  _syncCheckbox("custom-api-enabled", cfg.enabled);

  /* ── Show / hide the fields container ── */
  _toggleHidden("custom-api-fields", !cfg.enabled);

  if (!cfg.enabled) return; // nothing else to render

  /* ── Scalar inputs ── */
  _syncInput ("custom-api-base-url",  cfg.baseUrl  );
  _syncInput ("custom-api-endpoint",  cfg.endpoint );
  _syncSelect("custom-api-method",    cfg.method   );
  _syncInput ("custom-api-data-path", cfg.dataPath );

  /* ── Authorization ── */
  const auth = cfg.auth || { type: "none", credential: "", headerName: "X-API-Key" };
  _syncSelect("custom-api-auth-type", auth.type);
  _toggleHidden("auth-credential-row",    auth.type === "none");
  _toggleHidden("auth-credential-bearer", auth.type !== "bearer");
  _toggleHidden("auth-credential-basic",  auth.type !== "basic");
  _toggleHidden("auth-credential-apikey", auth.type !== "apikey");
  // Sync credential to all inputs (only the visible one is meaningful,
  // but keeping them in sync means switching type doesn't lose the value)
  _syncInput("custom-api-auth-credential-bearer", auth.credential);
  _syncInput("custom-api-auth-credential-basic",  auth.credential);
  _syncInput("custom-api-auth-credential-apikey", auth.credential);
  _syncInput("custom-api-auth-header-name",        auth.headerName || "X-API-Key");

  /* ── Schema / discovery URL ── */
  _syncInput("custom-api-schema-url", cfg.schemaUrl);

  /* ── Max pages ── */
  _syncInput("custom-api-max-pages", cfg.maxPages >= 2 ? cfg.maxPages : "");

  /* ── Key/value lists ── */
  _renderKvList(
    "custom-api-headers",
    cfg.headers,
    (id, prop, val) => updateCustomHeader(id, prop, val),
    id               => removeCustomHeader(id)
  );

  _renderKvList(
    "custom-api-params",
    cfg.queryParams,
    (id, prop, val) => updateCustomParam(id, prop, val),
    id               => removeCustomParam(id)
  );

  /* ── Field mapping section ── */
  const fm = state.fieldMapping;

  // Show the field mapping section if we have sample keys OR an existing mapping
  const hasSampleKeys  = _sampleKeys.length > 0;
  const hasExistingMap = !!(fm.nameField || fm.categories.length > 0);
  _toggleHidden("field-mapping-section", !(hasSampleKeys || hasExistingMap));

  if (hasSampleKeys || hasExistingMap) {
    _renderFieldMapping(fm);
  }
}

/* ── DOM sync helpers ──────────────────────────────────────── */

function _syncInput(id, value) {
  const el = document.getElementById(id);
  if (el && document.activeElement !== el) el.value = value || "";
}

function _syncSelect(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value || "";
}

function _syncCheckbox(id, checked) {
  const el = document.getElementById(id);
  if (el) el.checked = !!checked;
}

function _toggleHidden(id, hide) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.toggle("hidden", hide);
}

/* ── Key/value editor ────────────────────────────────────────
   Renders a list of { id, key, value } rows as editable inputs.
   Does a smart diff: if the row count hasn't changed it just syncs
   values without rebuilding the DOM (preserves cursor position).
   ──────────────────────────────────────────────────────────── */

/**
 * @param {string}   containerId
 * @param {object[]} items       — [{ id, key, value }]
 * @param {Function} onUpdate    — (id, prop, val) => void
 * @param {Function} onRemove    — (id) => void
 */
function _renderKvList(containerId, items, onUpdate, onRemove) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const existing = container.querySelectorAll(".kv-row");

  /* Fast path: just sync values when the row count is the same */
  if (existing.length === items.length) {
    items.forEach((item, i) => {
      const row  = existing[i];
      if (!row) return;
      const keyIn = row.querySelector(".kv-key");
      const valIn = row.querySelector(".kv-val");
      if (keyIn && document.activeElement !== keyIn) keyIn.value = item.key   ?? "";
      if (valIn && document.activeElement !== valIn) valIn.value = item.value ?? "";
    });
    return;
  }

  /* Full rebuild */
  container.innerHTML = "";

  if (items.length === 0) {
    container.innerHTML =
      `<p class="form-hint kv-empty">No rows yet.</p>`;
    return;
  }

  items.forEach(item => {
    const row = document.createElement("div");
    row.className   = "kv-row";
    row.dataset.id  = item.id;

    row.innerHTML = `
      <input class="kv-key  form-input" type="text"
        placeholder="Key"   value="${_esc(item.key   ?? "")}" />
      <input class="kv-val  form-input" type="text"
        placeholder="Value" value="${_esc(item.value ?? "")}" />
      <button class="btn btn--danger kv-remove" type="button" title="Remove">✕</button>
    `;

    row.querySelector(".kv-key") .addEventListener("input",
      e => onUpdate(item.id, "key",   e.target.value));
    row.querySelector(".kv-val") .addEventListener("input",
      e => onUpdate(item.id, "value", e.target.value));
    row.querySelector(".kv-remove").addEventListener("click",
      () => onRemove(item.id));

    container.appendChild(row);
  });
}

/* ── Field mapping renderer ──────────────────────────────────── */

/**
 * Renders the name-field dropdown and the list of category mappings.
 * @param {{ nameField: string, categories: object[] }} fm
 */
function _renderFieldMapping(fm) {
  /* ── Name field dropdown ── */
  _rebuildKeyDropdown(
    "mapping-name-field",
    fm.nameField || "",
    val => updateFieldMappingName(val)
  );

  /* ── Category mapping rows ── */
  const container = document.getElementById("mapping-categories");
  if (!container) return;

  const existing = container.querySelectorAll(".mapping-cat-row");

  /* Fast sync */
  if (existing.length === fm.categories.length) {
    fm.categories.forEach((cat, i) => {
      const row   = existing[i];
      if (!row) return;
      const nameIn    = row.querySelector(".mapping-cat-name");
      const selEl     = row.querySelector(".mapping-cat-field");
      const transformSel = row.querySelector(".mapping-cat-transform");
      if (nameIn && document.activeElement !== nameIn) {
        nameIn.value = cat.categoryName || "";
      }
      if (selEl) selEl.value = cat.fieldKey || "";
      if (transformSel) transformSel.value = cat.transform || "";
    });
    return;
  }

  /* Full rebuild */
  container.innerHTML = "";

  if (fm.categories.length === 0) {
    container.innerHTML =
      `<p class="form-hint kv-empty">No category mappings yet.</p>`;
    return;
  }

  fm.categories.forEach(cat => {
    const row = document.createElement("div");
    row.className  = "mapping-cat-row";
    row.dataset.id = cat.id;

    row.innerHTML = `
      <input class="mapping-cat-name form-input" type="text"
        placeholder="Category name (e.g. Genre)"
        value="${_esc(cat.categoryName || "")}" />
      <select class="mapping-cat-field form-select">
        ${_buildKeyOptions(cat.fieldKey || "")}
      </select>
      <select class="mapping-cat-transform form-select">
        ${_buildTransformOptions(cat.transform || "")}
      </select>
      <button class="btn btn--danger mapping-cat-remove" type="button" title="Remove">✕</button>
    `;

    row.querySelector(".mapping-cat-name").addEventListener("input", e =>
      updateFieldMappingCategory(cat.id, "categoryName", e.target.value)
    );
    row.querySelector(".mapping-cat-field").addEventListener("change", e =>
      updateFieldMappingCategory(cat.id, "fieldKey", e.target.value)
    );
    row.querySelector(".mapping-cat-transform").addEventListener("change", e =>
      updateFieldMappingCategory(cat.id, "transform", e.target.value)
    );
    row.querySelector(".mapping-cat-remove").addEventListener("click", () =>
      removeFieldMappingCategory(cat.id)
    );

    container.appendChild(row);
  });
}

/* ── Key-selector dropdown helpers ──────────────────────────── */

/**
 * Completely rebuilds the <select> identified by `id` with the
 * current _sampleKeys list.  Clones the element to remove old
 * event listeners before attaching the new one.
 */
function _rebuildKeyDropdown(id, currentValue, onChange) {
  const sel = document.getElementById(id);
  if (!sel) return;

  sel.innerHTML = _buildKeyOptions(currentValue);

  /* Clone to strip old listeners */
  const fresh = sel.cloneNode(true);
  sel.parentNode.replaceChild(fresh, sel);
  fresh.addEventListener("change", e => onChange(e.target.value));
}

/**
 * Returns an HTML string of <option> elements for a key selector.
 * Merges _sampleKeys with the current value so an existing mapping
 * is always shown even if _sampleKeys is empty.
 */
function _buildKeyOptions(currentValue) {
  // Combine sample keys with the current value (deduplicated)
  const all = [...new Set([
    ...(currentValue ? [currentValue] : []),
    ..._sampleKeys,
  ])];

  let opts = `<option value="">— select a field —</option>`;
  all.forEach(k => {
    const selected = k === currentValue ? " selected" : "";
    opts += `<option value="${_esc(k)}"${selected}>${_esc(k)}</option>`;
  });
  return opts;
}

/* ============================================================
   TEST API BUTTON
   ============================================================ */

/**
 * Triggered when the user clicks "🔍 Test API & Load Sample".
 * Fetches sample data from the configured API, updates _sampleKeys
 * and _rawSample, then re-renders the section.
 */
async function runApiTest() {
  if (_isTesting) return; // prevent double-click

  const btn        = document.getElementById("test-api-btn");
  const outputDiv  = document.getElementById("api-test-output");
  const statusDiv  = document.getElementById("api-test-status");
  const previewDiv = document.getElementById("api-sample-preview");
  const samplePre  = document.getElementById("api-sample-json");

  if (!outputDiv || !statusDiv) return;

  /* ── Show loading state ── */
  _isTesting = true;
  if (btn) { btn.disabled = true; btn.textContent = "🔄 Fetching…"; }
  outputDiv.classList.remove("hidden");
  if (previewDiv) previewDiv.classList.add("hidden");
  statusDiv.className   = "api-test-status api-test-status--loading";
  statusDiv.textContent = "Connecting…";

  /* ── Build the serialized config (convert arrays → objects for fetch) ── */
  const cfg = state.customApiConfig;

  // Resolve the Authorization / API-key header from the auth block
  const authHeader = _resolveAuthHeader(cfg.auth);
  // Merge auth header on top of any manually-added headers
  const mergedHeaders = Object.assign({}, _kvArrayToObj(cfg.headers), authHeader);

  // If a Schema URL is provided, use it for the test fetch instead of base+endpoint
  const schemaUrl = (cfg.schemaUrl || "").trim();
  const serializedConfig = {
    baseUrl:     schemaUrl ? schemaUrl        : (cfg.baseUrl  || ""),
    endpoint:    schemaUrl ? ""               : (cfg.endpoint || ""),
    method:      cfg.method || "GET",
    headers:     mergedHeaders,
    // When using the schemaUrl the query string is already baked in
    queryParams: schemaUrl ? {}               : _kvArrayToObj(cfg.queryParams),
    dataPath:    cfg.dataPath  || "",
  };

  /* ── Perform the fetch (no field mapping yet — we just want raw keys) ── */
  const result = await performCustomApiFetch(serializedConfig, null);

  /* ── Restore button ── */
  _isTesting = false;
  if (btn) { btn.disabled = false; btn.textContent = "🔍 Test API & Load Sample"; }

  /* ── Handle result ── */
  if (result.error) {
    statusDiv.className   = "api-test-status api-test-status--error";
    statusDiv.textContent = "❌ " + result.error;
    _sampleKeys = [];
    _rawSample  = [];
  } else {
    const count = result.rawItems.length;
    statusDiv.className   = "api-test-status api-test-status--success";
    statusDiv.textContent =
      `✅ Connected! Found ${count.toLocaleString()} item${count !== 1 ? "s" : ""}.`;

    _sampleKeys = result.keys;
    _rawSample  = result.rawItems.slice(0, 5);

    /* Show preview of first 5 items */
    if (previewDiv && samplePre) {
      samplePre.textContent = JSON.stringify(_rawSample, null, 2);
      previewDiv.classList.remove("hidden");
    }
  }

  /* Re-render so the field-mapping dropdowns appear / get populated */
  renderCustomApiSection();
}

/* ── Internal helpers ──────────────────────────────────────── */
/**
 * Resolves the auth block to a plain header object.
 * Returns an empty object when type is "none" or credential is blank.
 * @param {{ type: string, credential: string, headerName: string }} auth
 * @returns {{ [headerName: string]: string }}
 */
function _resolveAuthHeader(auth) {
  if (!auth || auth.type === "none") return {};
  const cred = (auth.credential || "").trim();
  if (!cred) return {};
  if (auth.type === "bearer") return { "Authorization": `Bearer ${cred}` };
  if (auth.type === "basic")  return { "Authorization": `Basic ${btoa(cred)}` };
  if (auth.type === "apikey") {
    const name = (auth.headerName || "X-API-Key").trim() || "X-API-Key";
    return { [name]: cred };
  }
  return {};
}
/** Converts [{id, key, value}] → { key: value } for the fetch call */
function _kvArrayToObj(arr) {
  const obj = {};
  if (Array.isArray(arr)) {
    arr.forEach(({ key, value }) => {
      if (key && key.trim()) obj[key.trim()] = value ?? "";
    });
  }
  return obj;
}

/**
 * Returns an HTML string of <option> elements for a transform selector.
 * @param {string} currentValue
 */
function _buildTransformOptions(currentValue) {
  const transforms = [
    { value: "",                label: "No transform" },
    { value: "year_from_date",  label: "Extract year (\"1994-09-23\" \u2192 \"1994\")" },
    { value: "round_1dp",       label: "Round to 1 decimal (7.461 \u2192 7.5)" },
    { value: "tmdb_genre",      label: "TMDB: Genre ID \u2192 name (28 \u2192 Action)" },
    { value: "language_name",   label: "Language code \u2192 name (en \u2192 English)" },
  ];
  return transforms
    .map(t => {
      const sel = t.value === currentValue ? " selected" : "";
      return `<option value="${_esc(t.value)}"${sel}>${_esc(t.label)}</option>`;
    })
    .join("");
}

/**
 * HTML-escape helper.
 * Delegates to escHtml() from builder-ui.js if available,
 * otherwise provides an inline fallback.
 */
function _esc(str) {
  if (typeof escHtml === "function") return escHtml(str);
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* ============================================================
   INIT  —  wire all event listeners once on page load
   Call this after the DOM is ready (end of builder-ui.js init).
   ============================================================ */

/**
 * Attaches one-time event listeners for all Section 6 controls.
 * Uses getElementById so buttons and inputs don't need to exist
 * at script parse time — this function is called after the DOM
 * is fully constructed.
 */
function initCustomApiSection() {
  // ── Enable toggle ──
  _on("custom-api-enabled", "change", e =>
    updateCustomApiField("enabled", e.target.checked)
  );

  // ── Base URL, Endpoint, Data Path ──
  _on("custom-api-base-url",  "input", e => updateCustomApiField("baseUrl",   e.target.value));
  _on("custom-api-endpoint",  "input", e => updateCustomApiField("endpoint",  e.target.value));
  _on("custom-api-data-path", "input", e => updateCustomApiField("dataPath",  e.target.value));

  // ── Method selector ──
  _on("custom-api-method", "change", e => updateCustomApiField("method", e.target.value));

  // ── Authorization ──
  _on("custom-api-auth-type",             "change", e => updateCustomAuth("type",       e.target.value));
  _on("custom-api-auth-credential-bearer", "input", e => updateCustomAuth("credential", e.target.value));
  _on("custom-api-auth-credential-basic",  "input", e => updateCustomAuth("credential", e.target.value));
  _on("custom-api-auth-credential-apikey", "input", e => updateCustomAuth("credential", e.target.value));
  _on("custom-api-auth-header-name",       "input", e => updateCustomAuth("headerName", e.target.value));

  // ── Schema / discovery URL ──
  _on("custom-api-schema-url", "input", e => updateCustomApiField("schemaUrl", e.target.value));

  // ── Max pages (pagination) ──
  _on("custom-api-max-pages", "input", e => {
    const v = parseInt(e.target.value, 10);
    updateCustomApiField("maxPages", (!isNaN(v) && v >= 1) ? Math.min(v, 25) : 1);
  });

  // ── Add-row buttons ──
  _on("add-header-btn",            "click", () => addCustomHeader());
  _on("add-param-btn",             "click", () => addCustomParam());
  _on("add-mapping-category-btn",  "click", () => addFieldMappingCategory());

  // ── Test API button ──
  _on("test-api-btn", "click", () => runApiTest());
}

/** Small helper: attach a listener to an element by id (no-op if absent) */
function _on(id, event, handler) {
  const el = document.getElementById(id);
  if (el) el.addEventListener(event, handler);
}
