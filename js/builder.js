/* ============================================================
   builder.js  —  State & Logic for the Topic Builder
   ============================================================
   This file owns the single source-of-truth state object and
   provides pure helper functions (no DOM access at all).

   Load order:  builder.js → builder-ui.js → builder-export.js
   ============================================================ */

"use strict";
const MAX_FOOTBALL_SEASON = 2024;

/**
 * Return the API-Football season start year for "now".
 * Example: Feb 2026 -> 2025, Aug 2026 -> 2026.
 * @param {Date} [now]
 * @returns {number}
 */
function getDefaultFootballSeason(now = new Date()) {
  const year = now.getFullYear();
  const inferred = now.getMonth() >= 6 ? year : year - 1;
  return Math.min(inferred, MAX_FOOTBALL_SEASON);
}

/**
 * Parse/sanitize a season value into a valid 4-digit season year.
 * @param {unknown} value
 * @param {number} [fallback]
 * @returns {number}
 */
function normalizeFootballSeason(value, fallback = getDefaultFootballSeason()) {
  const season = Number.parseInt(value, 10);
  if (!Number.isFinite(season) || season < 2000) {
    return fallback;
  }
  return Math.min(season, MAX_FOOTBALL_SEASON);
}

/* ── State ──────────────────────────────────────────────────────
   The entire builder state lives here. builder-ui.js reads it
   to render the page; builder-export.js reads it to build JSON.
   ────────────────────────────────────────────────────────────── */
const state = {
  /* ── Topic meta ── */
  meta: {
    topicKey:       "",   // e.g. "Football"
    topicName:      "",   // display name
    icon:           "",   // emoji or URL
    description:    "",   // optional blurb
    placeholder:    "",   // input placeholder shown in quiz
    usedLabel:      "",   // label above the "used answers" list
    difficultyKey:  "",   // which category key is the difficulty axis
  },

  /* ── Live API config (optional) ──
     When enabled, the quiz engine fetches live data from the
     specified API provider instead of using the static data[] array.
     The apiKey is kept in memory only — never exposed on window.
  ── */
  apiConfig: {
    enabled:  false,
    provider: "API-Football",
    apiKey:   "",
    leagues:  [],          // array of numeric league IDs e.g. [39, 140]
    season:   getDefaultFootballSeason(),
  },

  /* ── Categories ──
     Array of objects: { id, label }
     'id' is a uuid-style string used as React-like key; stable even when
     the user reorders rows.  The 'label' is what the user types
     (e.g. "Position").  The derived key (lowercase, trimmed) is
     computed on-the-fly by labelToKey().
  ── */
  categories: [],

  /* ── Difficulty weights ──
     Array of objects: { id, value, multiplier }
     'value'      — string the data item uses (e.g. "Premier League")
     'multiplier' — numeric string (e.g. "1.5")
  ── */
  weights: [],

  /* ── Data items ──
     Array of objects: { id, name, attrs }
     'name'  — the answer the player guesses
     'attrs' — plain object keyed by category key, e.g. { position: "Striker" }
  ── */
  items: [],

  /* ── Custom API config (Section 6) ──
     Generic REST API configuration. Unlike the API-Football section
     (Section 5), this works with any JSON API by letting the user
     specify the URL, headers, query params, data path, and field mapping.
  ── */
  customApiConfig: {
    enabled:     false,
    baseUrl:     "",
    endpoint:    "",
    method:      "GET",
    /* ── Authorization (assembled into a header automatically) ── */
    auth: {
      type:        "none",    // "none" | "bearer" | "basic" | "apikey"
      credential:  "",        // bearer: token; basic: "user:pass"; apikey: key value
      headerName:  "X-API-Key", // used only when type === "apikey"
    },
    headers:     [],     // [{id, key, value}]  — converted to plain obj on export
    queryParams: [],     // [{id, key, value}]  — same
    dataPath:    "",     // dot-path to the array, e.g. "response" or "data.players"
    maxPages:    1,      // auto-paginate up to this many pages (TMDB-style ?page=N)
    schemaUrl:   "",     // alternate URL used ONLY for the Test / field-discovery fetch
  },

  /* ── Field mapping ──
     Maps raw API field paths to quiz item fields.
     nameField   — dot-path used as item.name
     categories  — [{id, categoryName, fieldKey}] — each category label + its dot-path
  ── */
  fieldMapping: {
    nameField:  "",
    categories: [],
  },
};

/* ── Monotonic ID counter ───────────────────────────────────── */
let _nextId = 1;

/**
 * Returns a simple unique string ID.
 * Not globally unique, just unique within this builder session.
 * @returns {string}
 */
function makeId() {
  return `b${_nextId++}`;
}

/* ── Label → Key conversion ─────────────────────────────────── */

/**
 * Converts a human-readable category label to a safe key.
 * "Premier League" → "premier_league"
 * Strips anything that isn't a letter, digit, or space/underscore,
 * then lowercases and replaces spaces with underscores.
 * @param {string} label
 * @returns {string}
 */
function labelToKey(label) {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9 _]/g, "")  // remove special chars
    .replace(/\s+/g, "_");         // spaces → underscores
}

/* ── Category CRUD ──────────────────────────────────────────── */

/**
 * Adds a new blank category to state and triggers a UI refresh.
 */
function addCategory() {
  state.categories.push({ id: makeId(), label: "" });
  onStateChange();
}

/**
 * Removes the category with the given id from state.
 * Also removes that attribute key from every data item.
 * @param {string} id
 */
function removeCategory(id) {
  const cat = state.categories.find(c => c.id === id);
  if (!cat) return;

  const key = labelToKey(cat.label);

  // Remove from categories list
  state.categories = state.categories.filter(c => c.id !== id);

  // Remove the corresponding attribute from all items
  state.items.forEach(item => {
    delete item.attrs[key];
  });

  // If the removed category was the difficulty key, reset it
  if (state.meta.difficultyKey === key) {
    state.meta.difficultyKey = "";
  }

  onStateChange();
}

/**
 * Updates the label for an existing category.
 * Migrates existing item attribute keys to the new derived key.
 * @param {string} id
 * @param {string} newLabel
 */
function updateCategoryLabel(id, newLabel) {
  const cat = state.categories.find(c => c.id === id);
  if (!cat) return;

  const oldKey = labelToKey(cat.label);
  const newKey = labelToKey(newLabel);

  cat.label = newLabel;

  // Migrate attribute keys in every item
  if (oldKey !== newKey) {
    state.items.forEach(item => {
      if (Object.prototype.hasOwnProperty.call(item.attrs, oldKey)) {
        item.attrs[newKey] = item.attrs[oldKey];
        delete item.attrs[oldKey];
      }
    });

    // Migrate difficulty key if needed
    if (state.meta.difficultyKey === oldKey) {
      state.meta.difficultyKey = newKey;
    }
  }

  onStateChange();
}

/**
 * Reorders categories by moving the item at fromIndex to toIndex.
 * @param {number} fromIndex
 * @param {number} toIndex
 */
function reorderCategories(fromIndex, toIndex) {
  if (fromIndex === toIndex) return;
  const moved = state.categories.splice(fromIndex, 1)[0];
  state.categories.splice(toIndex, 0, moved);
  onStateChange();
}

/* ── Weight CRUD ────────────────────────────────────────────── */

/**
 * Adds a blank difficulty weight row.
 */
function addWeight() {
  state.weights.push({ id: makeId(), value: "", multiplier: "1" });
  onStateChange();
}

/**
 * Removes a weight row by id.
 * @param {string} id
 */
function removeWeight(id) {
  state.weights = state.weights.filter(w => w.id !== id);
  onStateChange();
}

/**
 * Updates a weight row's value or multiplier field.
 * @param {string} id
 * @param {"value"|"multiplier"} field
 * @param {string} newVal
 */
function updateWeight(id, field, newVal) {
  const w = state.weights.find(w => w.id === id);
  if (w) w[field] = newVal;
  onStateChange();
}

/* ── Item CRUD ──────────────────────────────────────────────── */

/**
 * Adds a new blank data item.
 * Pre-populates attrs keys from current categories.
 */
function addItem() {
  const attrs = {};
  state.categories.forEach(c => {
    attrs[labelToKey(c.label)] = "";
  });
  state.items.push({ id: makeId(), name: "", attrs });
  onStateChange();
}

/**
 * Removes a data item by id.
 * @param {string} id
 */
function removeItem(id) {
  state.items = state.items.filter(item => item.id !== id);
  onStateChange();
}

/**
 * Updates the name field of a data item.
 * @param {string} id
 * @param {string} newName
 */
function updateItemName(id, newName) {
  const item = state.items.find(i => i.id === id);
  if (item) item.name = newName;
  onStateChange();
}

/**
 * Updates one attribute value of a data item.
 * @param {string} id        item id
 * @param {string} catKey    attribute key (e.g. "position")
 * @param {string} newVal
 */
function updateItemAttr(id, catKey, newVal) {
  const item = state.items.find(i => i.id === id);
  if (item) item.attrs[catKey] = newVal;
  onStateChange();
}

/**
 * Reorders items by moving fromIndex to toIndex (drag-and-drop).
 * @param {number} fromIndex
 * @param {number} toIndex
 */
function reorderItems(fromIndex, toIndex) {
  if (fromIndex === toIndex) return;
  const moved = state.items.splice(fromIndex, 1)[0];
  state.items.splice(toIndex, 0, moved);
  onStateChange();
}

/* ── Meta update ────────────────────────────────────────────── */

/**
 * Updates any field in state.meta.
 * @param {string} field  — key of state.meta
 * @param {string} value
 */
function updateMeta(field, value) {
  state.meta[field] = value;
  onStateChange();
}

/* ── Custom API Config update ───────────────────────────────── */

// NOTE: The per-field update functions for customApiConfig and fieldMapping
// are defined in apiBuilder.js (updateCustomApiField, addCustomHeader, etc.)
// so that all Section 6 logic stays in one module.

/* ── API Config update ──────────────────────────────────────── */

/**
 * Updates any field in state.apiConfig.
 * Special handling for 'leagues': always stores as a numeric array.
 * @param {string} field  — key of state.apiConfig
 * @param {*}      value
 */
function updateApiConfig(field, value) {
  if (field === "leagues") {
    // Accept either an array already, or a comma-separated string
    if (Array.isArray(value)) {
      state.apiConfig.leagues = value.map(Number).filter(n => !isNaN(n) && n > 0);
    } else {
      state.apiConfig.leagues = String(value)
        .split(",")
        .map(s => parseInt(s.trim(), 10))
        .filter(n => !isNaN(n) && n > 0);
    }
  } else if (field === "season") {
    state.apiConfig.season = normalizeFootballSeason(value, getDefaultFootballSeason());
  } else if (field === "enabled") {
    state.apiConfig.enabled = Boolean(value);
  } else {
    state.apiConfig[field] = value;
  }
  onStateChange();
}

/* ── onStateChange hook ─────────────────────────────────────── */
/**
 * Called every time state mutates.
 * builder-ui.js overwrites this with its own render function.
 * We start with a no-op so nothing breaks if ui hasn't loaded yet.
 */
let onStateChange = function () {};

/* ── Topic Store (localStorage persistence) ─────────────────── */

/** The localStorage key that holds the array of saved topics. */
const LS_BUILDER_TOPICS = "quizBuilderTopics";

/** The localStorage key that holds the set of deleted topic keys. */
const LS_BUILDER_DELETED = "quizBuilderDeletedTopics";

/** Returns the Set of topic keys the user has marked as deleted. */
function loadDeletedKeys() {
  try {
    const raw = localStorage.getItem(LS_BUILDER_DELETED);
    if (raw) return new Set(JSON.parse(raw));
  } catch { /* ignore */ }
  return new Set();
}

/** Adds a key to the deleted set and persists it. */
function markDeleted(topicKey) {
  const keys = loadDeletedKeys();
  keys.add(topicKey);
  try {
    localStorage.setItem(LS_BUILDER_DELETED, JSON.stringify([...keys]));
  } catch { /* quota exceeded */ }
}

/** Removes a key from the deleted set (used when re-saving a deleted built-in). */
function unmarkDeleted(topicKey) {
  const keys = loadDeletedKeys();
  keys.delete(topicKey);
  try {
    localStorage.setItem(LS_BUILDER_DELETED, JSON.stringify([...keys]));
  } catch { /* quota exceeded */ }
}

/**
 * Load all topics available in the builder:
 * — Built-in topics from topics.js (TOPICS registry) come first
 * — User-saved topics from localStorage are merged in, overriding
 *   any built-in with the same topicKey so edits are preserved.
 * — Topics the user has deleted are filtered out.
 * @returns {object[]}
 */
function loadSavedTopics() {
  const deletedKeys = loadDeletedKeys();

  // Start with built-in topics (topics.js must be loaded first)
  const builtIns = (typeof TOPICS !== "undefined")
    ? Object.values(TOPICS)
    : [];

  // Load user-saved topics from localStorage
  let saved = [];
  try {
    const raw = localStorage.getItem(LS_BUILDER_TOPICS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) saved = parsed;
    }
  } catch { /* ignore parse errors */ }

  // Merge: built-ins first, then overlay any user-saved versions
  const map = new Map();
  builtIns.forEach(t => map.set(t.topicKey, t));
  saved.forEach(t => map.set(t.topicKey, t)); // user-saved overrides built-in

  // Filter out anything the user has deleted
  return Array.from(map.values()).filter(t => !deletedKeys.has(t.topicKey));
}

/**
 * Persist an array of topics to localStorage.
 * @param {object[]} topics
 */
function saveTopicsToStorage(topics) {
  try {
    localStorage.setItem(LS_BUILDER_TOPICS, JSON.stringify(topics));
  } catch { /* quota exceeded — silently skip */ }
}

/**
 * Upsert the current editor state into the saved topics list.
 * If a topic with the same topicKey already exists it is replaced;
 * otherwise the new topic is appended.
 *
 * @param {object} topicObj — the fully-built topic object from buildTopicObject()
 */
function upsertTopic(topicObj) {
  // If this topic was previously deleted, restore it
  unmarkDeleted(topicObj.topicKey);

  // Load raw saved array (not via loadSavedTopics which filters deleted)
  let saved = [];
  try {
    const raw = localStorage.getItem(LS_BUILDER_TOPICS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) saved = parsed;
    }
  } catch { /* ignore */ }

  const idx = saved.findIndex(t => t.topicKey === topicObj.topicKey);
  if (idx >= 0) {
    saved[idx] = topicObj;
  } else {
    saved.push(topicObj);
  }
  saveTopicsToStorage(saved);
}

/**
 * Delete a topic by topicKey.
 * Removes it from the saved localStorage array AND marks it deleted
 * so built-in topics (which live in topics.js, not localStorage) are
 * also hidden from the sidebar.
 * @param {string} topicKey
 */
function deleteSavedTopic(topicKey) {
  // Remove from saved array (handles user-saved topics)
  const raw = localStorage.getItem(LS_BUILDER_TOPICS);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        saveTopicsToStorage(parsed.filter(t => t.topicKey !== topicKey));
      }
    } catch { /* ignore */ }
  }
  // Mark deleted so built-in topics are also hidden
  markDeleted(topicKey);
}

/**
 * Load a saved topic object into the editor state, replacing all current values.
 * @param {object} topic — raw topic object from loadSavedTopics()
 */
function loadTopicIntoEditor(topic) {
  // ── Meta ──────────────────────────────────────────────────
  state.meta.topicKey      = topic.topicKey      || "";
  state.meta.topicName     = topic.topicName     || "";
  state.meta.icon          = topic.icon          || "";
  state.meta.description   = topic.description   || "";
  state.meta.placeholder   = topic.placeholder   || "";
  state.meta.usedLabel     = topic.usedLabel      || "";
  state.meta.difficultyKey = topic.difficultyKey || "";

  // ── Categories ────────────────────────────────────────────
  state.categories = (topic.categories || []).map(key => ({
    id:    makeId(),
    label: (topic.categoryLabels && topic.categoryLabels[key]) || key,
  }));

  // ── Difficulty weights ────────────────────────────────────
  // Built-in topics use `multipliers`; exported topics use `difficultyWeights`.
  const weightSource = topic.difficultyWeights || topic.multipliers || null;
  if (weightSource && typeof weightSource === "object") {
    state.weights = Object.entries(weightSource).map(([val, mult]) => ({
      id:         makeId(),
      value:      val,
      multiplier: String(mult),
    }));
  } else {
    state.weights = [];
  }

  // ── Data items ────────────────────────────────────────────
  // If the topic uses a live API and we have cached data, show
  // those items in the editor so the user can see what was fetched.
  const ac = topic.apiConfig;
  const cacheKey = "quizEngineCache_" + (topic.topicKey || "");
  let cachedItems = null;
  if (ac && ac.enabled) {
    try {
      const raw = localStorage.getItem(cacheKey);
      if (raw) cachedItems = JSON.parse(raw);
    } catch { /* ignore */ }
  }

  if (cachedItems && Array.isArray(cachedItems) && cachedItems.length > 0) {
    // Show cached API items as read-only entries in the editor
    state.items = cachedItems.map(item => ({
      id:       makeId(),
      name:     item.name || "",
      attrs:    { ...(item.attributes || {}) },
      _fromApi: true,  // flag so the UI can render them differently
    }));
  } else {
    state.items = (topic.data || []).map(item => ({
      id:    makeId(),
      name:  item.name || "",
      attrs: { ...(item.attributes || {}) },
    }));
  }

  // ── API Config (Section 5 — API-Football) ───────────────────
  const ac2 = topic.apiConfig;
  if (ac2 && typeof ac2 === "object") {
    state.apiConfig.enabled  = Boolean(ac2.enabled);
    state.apiConfig.provider = ac2.provider || "API-Football";
    state.apiConfig.apiKey   = ac2.apiKey   || "";
    state.apiConfig.leagues  = Array.isArray(ac2.leagues) ? [...ac2.leagues] : [];
    state.apiConfig.season   = normalizeFootballSeason(ac2.season, getDefaultFootballSeason());
  } else {
    state.apiConfig.enabled  = false;
    state.apiConfig.provider = "API-Football";
    state.apiConfig.apiKey   = "";
    state.apiConfig.leagues  = [];
    state.apiConfig.season   = getDefaultFootballSeason();
  }

  // ── Custom API Config (Section 6) ────────────────────────────
  const cac = topic.customApiConfig;
  if (cac && typeof cac === "object") {
    state.customApiConfig.enabled  = Boolean(cac.enabled);
    state.customApiConfig.baseUrl  = cac.baseUrl  || "";
    state.customApiConfig.endpoint = cac.endpoint || "";
    state.customApiConfig.method   = cac.method   || "GET";
    state.customApiConfig.dataPath = cac.dataPath || "";
    // headers: stored as plain object in JSON → convert to [{id, key, value}] for editor
    state.customApiConfig.headers = Object.entries(cac.headers || {})
      .map(([key, value]) => ({ id: makeId(), key, value: String(value) }));
    // queryParams: same conversion
    state.customApiConfig.queryParams = Object.entries(cac.queryParams || {})
      .map(([key, value]) => ({ id: makeId(), key, value: String(value) }));
    // auth: restore type + headerName only (credential is session-only, never serialized)
    const loadedAuth = (cac.auth && typeof cac.auth === "object") ? cac.auth : {};
    state.customApiConfig.auth.type       = loadedAuth.type       || "none";
    state.customApiConfig.auth.headerName = loadedAuth.headerName || "X-API-Key";
    state.customApiConfig.auth.credential = ""; // never persisted
    // schemaUrl
    state.customApiConfig.schemaUrl = cac.schemaUrl || "";
    // maxPages
    state.customApiConfig.maxPages  = (typeof cac.maxPages === "number" && cac.maxPages >= 1)
      ? Math.min(Math.floor(cac.maxPages), 25)
      : 1;
  } else {
    state.customApiConfig.enabled          = false;
    state.customApiConfig.baseUrl          = "";
    state.customApiConfig.endpoint         = "";
    state.customApiConfig.method           = "GET";
    state.customApiConfig.auth.type        = "none";
    state.customApiConfig.auth.credential  = "";
    state.customApiConfig.auth.headerName  = "X-API-Key";
    state.customApiConfig.headers     = [];
    state.customApiConfig.queryParams = [];
    state.customApiConfig.dataPath    = "";
    state.customApiConfig.schemaUrl   = "";
    state.customApiConfig.maxPages    = 1;
  }

  // ── Field Mapping ─────────────────────────────────────────────
  const fm = topic.fieldMapping;
  if (fm && typeof fm === "object") {
    state.fieldMapping.nameField = fm.name || "";
    // categories: stored as { catKey: fieldPath } in JSON → [{id, categoryName, fieldKey, transform}]
    state.fieldMapping.categories = Object.entries(fm.categories || {})
      .map(([categoryName, fieldKey]) => ({
        id: makeId(),
        categoryName,
        fieldKey,
        transform: (fm.transforms && fm.transforms[categoryName]) || "",
      }));
  } else {
    state.fieldMapping.nameField  = "";
    state.fieldMapping.categories = [];
  }

  // Reset transient API test state (sample keys from a previous topic)
  if (typeof resetApiBuilderState === "function") resetApiBuilderState();

  onStateChange();
}

/**
 * Reset the editor to a completely blank new topic.
 */
function resetEditorToBlank() {
  state.meta.topicKey      = "";
  state.meta.topicName     = "";
  state.meta.icon          = "";
  state.meta.description   = "";
  state.meta.placeholder   = "";
  state.meta.usedLabel     = "";
  state.meta.difficultyKey = "";

  state.categories = [];
  state.weights    = [];
  state.items      = [];

  state.apiConfig.enabled  = false;
  state.apiConfig.provider = "API-Football";
  state.apiConfig.apiKey   = "";
  state.apiConfig.leagues  = [];
  state.apiConfig.season   = getDefaultFootballSeason();

  // ── Custom API Config ──
  state.customApiConfig.enabled          = false;
  state.customApiConfig.baseUrl          = "";
  state.customApiConfig.endpoint         = "";
  state.customApiConfig.method           = "GET";
  state.customApiConfig.auth.type        = "none";
  state.customApiConfig.auth.credential  = "";
  state.customApiConfig.auth.headerName  = "X-API-Key";
  state.customApiConfig.headers          = [];
  state.customApiConfig.queryParams      = [];
  state.customApiConfig.dataPath         = "";
  state.customApiConfig.maxPages         = 1;
  state.customApiConfig.schemaUrl        = "";

  // ── Field Mapping ──
  state.fieldMapping.nameField  = "";
  state.fieldMapping.categories = [];

  // Reset transient API test state
  if (typeof resetApiBuilderState === "function") resetApiBuilderState();

  onStateChange();
}

/* ── Derived helpers (read-only, no side effects) ───────────── */

/**
 * Returns the array of derived category keys in current order.
 * @returns {string[]}
 */
function getCategoryKeys() {
  return state.categories.map(c => labelToKey(c.label));
}

/**
 * Returns the array of non-empty, valid category keys.
 * (Filters out categories whose label hasn't been filled in yet.)
 * @returns {string[]}
 */
function getValidCategoryKeys() {
  return state.categories
    .map(c => labelToKey(c.label))
    .filter(k => k.length > 0);
}
