/* ============================================================
   engine.js — Quiz Engine (Topic-Agnostic Core)
   Handles: state, scoring, validation, autocomplete,
            stacked rounds, and topic switching.
   Does NOT touch the DOM directly — calls ui.js for rendering.
   ============================================================ */

// ──────────────────────────────────────────────
// DEVELOPER MODE
// ──────────────────────────────────────────────

/**
 * Set to `true` for debug helpers (valid-answer panel + console logs).
 * Set to `false` before sharing or deploying.
 */
const DEV_MODE = true;

// ──────────────────────────────────────────────
// GLOBAL CONFIG
// ──────────────────────────────────────────────

const CONFIG = {
  /** Maximum number of stacked rounds visible at once */
  MAX_ACTIVE_ROUNDS: 5,

  /** Base URL — local proxy forwards to v3.football.api-sports.io (run proxy.py) */
  API_BASE: "https://v3.football.api-sports.io",

  /**
   * Default Football API leagues used when loading the built-in Football topic
   * WITHOUT an apiConfig (legacy fallback — keeps backward compatibility).
   */
  LEAGUES_TO_FETCH: [
    { id: 39,  season: 2024, name: "Premier League" },
    { id: 140, season: 2024, name: "La Liga" },
    { id: 135, season: 2024, name: "Serie A" },
    { id: 78,  season: 2024, name: "Bundesliga" },
    { id: 61,  season: 2024, name: "Ligue 1" },
    { id: 253, season: 2024, name: "MLS" },
  ],

  /** Max pages per league fetch */
  MAX_PAGES_PER_LEAGUE: 10,

  /** localStorage keys */
  LS_HIGH_SCORE: "quizEngineHighScore",
  LS_PLAYERS:    "quizEnginePlayers",       // legacy key — Football topic fallback
  LS_FETCH_TS:   "quizEngineFetchTimestamp", // legacy key — Football topic fallback
  LS_TOPIC:      "quizEngineTopic",

  /** Per-topic cache key prefix (topicKey is appended) */
  LS_CACHE_PREFIX:    "quizEngineCache_",
  LS_CACHE_TS_PREFIX: "quizEngineCacheTs_",
  LS_CACHE_SIG_PREFIX: "quizEngineCacheSig_",

  /** Re-fetch from API if cached data is older than this (ms) */
  CACHE_TTL: 24 * 60 * 60 * 1000, // 24 hours
};

// ──────────────────────────────────────────────
// PER-TOPIC CACHE KEY HELPERS
// ──────────────────────────────────────────────

/**
 * Returns the localStorage key used to store cached items for a topic.
 * @param {string} topicKey
 * @returns {string}
 */
function lsCacheKey(topicKey) {
  return CONFIG.LS_CACHE_PREFIX + topicKey;
}

/**
 * Returns the localStorage key used to store the fetch timestamp for a topic.
 * @param {string} topicKey
 * @returns {string}
 */
function lsCacheTsKey(topicKey) {
  return CONFIG.LS_CACHE_TS_PREFIX + topicKey;
}

/**
 * Returns the localStorage key used to store the config signature for a topic.
 * The signature captures the league IDs + season so we can detect config changes.
 * @param {string} topicKey
 * @returns {string}
 */
function lsCacheSigKey(topicKey) {
  return CONFIG.LS_CACHE_SIG_PREFIX + topicKey;
}

// ──────────────────────────────────────────────
// API KEY STORE (module-scoped, never on window)
// ──────────────────────────────────────────────

/**
 * Maps topicKey → apiKey for the current session.
 * Keys are never stored in global variables or on the window object.
 * @type {Map<string, string>}
 */
const _apiKeys = new Map();

/**
 * Base depth bonus multipliers by row position.
 * rowIndex 0 (top/newest) = 1×, rowIndex 4 (bottom/oldest) = 3×.
 * Each round also carries an `extraBonus` that grows +0.5× each time
 * it survives a timeout at max depth (oldest row).
 */
const DEPTH_BONUS = [1, 1.5, 2, 2.5, 3];

// ──────────────────────────────────────────────
// FOOTBALL API HELPERS (Football topic only)
// ──────────────────────────────────────────────

/** Maps raw API positions to our game positions. */
const POSITION_MAP = {
  "attacker":   ["Striker", "Winger"],
  "midfielder": ["Attacking Midfielder", "Central Midfielder", "Defensive Midfielder"],
  "defender":   ["Centre-Back", "Full-Back", "Wing-Back"],
  "goalkeeper": ["Goalkeeper"],
};

function mapApiPosition(apiPos) {
  const options = POSITION_MAP[apiPos.toLowerCase()];
  if (!options) return apiPos;
  return options[Math.floor(Math.random() * options.length)];
}

// ──────────────────────────────────────────────
// ENGINE STATE
// ──────────────────────────────────────────────

/**
 * All mutable game state lives here.
 * Never read state directly from ui.js — pass it as arguments.
 */
const state = {
  /** The active topic object (from TOPICS registry in topics.js) */
  topic: null,

  /**
   * The items list for the current topic — each item is:
   * { name, searchName, attributes: { [categoryKey]: value } }
   */
  items: [],

  /** Whether items came from the live Football API */
  isLiveData: false,

  /** Scores */
  score: 0,
  highScore: 0,

  /**
   * Stacked rounds array — each round object:
   * {
   *   id: number,
   *   attributes: { [categoryKey]: value },  ← dynamic per topic
   *   basePoints: number,
   *   rowIndex: number,   ← 0 = newest/top
   *   createdAt: number,
   * }
   */
  activeRounds: [],

  /** Auto-incrementing round id */
  nextRoundId: 1,

  /** Tracks whether the current round already had a submission */
  answered: false,

  /** Names/answers already used this session */
  usedNames: new Set(),
};

// ──────────────────────────────────────────────
// UTILITY HELPERS
// ──────────────────────────────────────────────

/** Pick a random element from an array. */
const randomFrom = (arr) => arr[Math.floor(Math.random() * arr.length)];

/** Normalize a string for comparison (trim + lowercase). */
const normalize = (str) => (str || "").trim().toLowerCase();

/** Safe localStorage get. */
function lsGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

/** Safe localStorage set. */
function lsSet(key, value) {
  try { localStorage.setItem(key, value); } catch { /* quota blocked */ }
}

// ──────────────────────────────────────────────
// TOPIC MANAGEMENT
// ──────────────────────────────────────────────

/**
 * Switch the active topic and kick off data initialisation.
 * Returns a Promise that resolves once state.items is ready —
 * callers that need to wait for live data should await this.
 *
 * @param {string} topicKey — must be a key in TOPICS (from topics.js)
 * @param {string|null} [apiKeyOverride] — optional API key supplied by the
 *   quiz UI at runtime (takes priority over any key embedded in the topic).
 * @returns {Promise<void>}
 */
async function setTopic(topicKey, apiKeyOverride = null) {
  // Start with the built-in topic definition (may be undefined for user-created topics)
  let topic = TOPICS[topicKey] || null;

  // Check quizBuilderTopics localStorage — used both as an override for
  // built-ins and as the sole source for user-created topics.
  try {
    const raw = localStorage.getItem("quizBuilderTopics");
    if (raw) {
      const saved = JSON.parse(raw);
      const override = Array.isArray(saved)
        ? saved.find((t) => t.topicKey === topicKey)
        : null;
      if (override) {
        // convertRawTopic normalises the override into the engine's internal
        // format (searchName, multipliers, apiConfig pass-through, etc.)
        const converted = convertRawTopic(override);

        // If the override has no difficultyWeights (empty object), inherit
        // the built-in topic's multipliers so scoring still works correctly.
        if (topic && (!override.difficultyWeights || Object.keys(override.difficultyWeights).length === 0)) {
          converted.multipliers = topic.multipliers;
        }

        // If the override has no static data items, inherit the built-in's
        // data as the offline fallback (live API will replace it at runtime).
        if (!converted.data || converted.data.length === 0) {
          converted.data = topic.data;
        }

        topic = converted;
      }
    }
  } catch (e) {
    console.warn("[Engine] Could not read quizBuilderTopics from localStorage:", e);
  }

  // If topic is still null here, it's neither a built-in nor a saved topic
  if (!topic) {
    console.error(`[Engine] Unknown topic key: "${topicKey}"`);
    return;
  }

  // Save preference
  lsSet(CONFIG.LS_TOPIC, topicKey);

  state.topic = topic;
  state.isLiveData = false;

  // Full reset
  state.score        = 0;
  state.activeRounds = [];
  state.nextRoundId  = 1;
  state.answered     = false;
  state.usedNames    = new Set();

  // Resolve the API key (runtime override beats embedded key)
  if (apiKeyOverride) {
    _apiKeys.set(topicKey, apiKeyOverride);
  }

  // Load items — async when apiConfig.enabled, sync otherwise
  await initTopicData(topic);
}

/** Return the currently active topic. Throws if none set. */
function requireTopic() {
  if (!state.topic) throw new Error("[Engine] No topic set. Call setTopic() first.");
  return state.topic;
}

// ──────────────────────────────────────────────
// JSON TOPIC IMPORT SYSTEM
// ──────────────────────────────────────────────

/**
 * Validate a single raw topic object parsed from JSON.
 * Returns an array of human-readable error strings.
 * An empty array means the topic is valid.
 *
 * Rules checked:
 *   - Required top-level fields are present and the right type.
 *   - `categories` has at least 1 entry and no duplicates.
 *   - `data` has at least 1 item.
 *   - Every data item has a non-empty `name` string.
 *   - Every data item has an `attributes` object that contains
 *     a non-empty value for every declared category.
 *   - Optional `difficultyWeights` values must be positive numbers.
 *
 * @param {object} raw  — one topic object straight from JSON.parse()
 * @param {number} idx  — index in the array (for error messages)
 * @returns {string[]}  — list of validation errors (empty = valid)
 */
function validateTopicJSON(raw, idx = 0) {
  const errors = [];
  const prefix = `Topic[${idx}]`;

  // ── Required string fields ──────────────────
  const requiredStrings = ["topicKey", "topicName", "categories", "data"];
  for (const field of requiredStrings) {
    if (raw[field] === undefined || raw[field] === null) {
      errors.push(`${prefix}: missing required field "${field}".`);
    }
  }

  // Stop early if fundamental fields are absent — rest would throw
  if (errors.length > 0) return errors;

  // ── topicKey / topicName must be non-empty strings ──
  if (typeof raw.topicKey !== "string" || raw.topicKey.trim() === "") {
    errors.push(`${prefix}: "topicKey" must be a non-empty string.`);
  }
  if (typeof raw.topicName !== "string" || raw.topicName.trim() === "") {
    errors.push(`${prefix}: "topicName" must be a non-empty string.`);
  }

  // ── categories ──────────────────────────────
  if (!Array.isArray(raw.categories) || raw.categories.length === 0) {
    errors.push(`${prefix}: "categories" must be a non-empty array.`);
  } else {
    // All entries must be non-empty strings
    raw.categories.forEach((cat, ci) => {
      if (typeof cat !== "string" || cat.trim() === "") {
        errors.push(`${prefix}: categories[${ci}] must be a non-empty string.`);
      }
    });

    // No duplicates
    const seen = new Set();
    raw.categories.forEach((cat) => {
      const key = cat.trim().toLowerCase();
      if (seen.has(key)) {
        errors.push(`${prefix}: duplicate category "${cat}" in "categories".`);
      }
      seen.add(key);
    });
  }

  // ── data ────────────────────────────────────
  // Allow empty data when a custom API will supply items at runtime
  const hasCustomApi = raw.customApiConfig && raw.customApiConfig.enabled === true;
  if (!Array.isArray(raw.data)) {
    errors.push(`${prefix}: "data" must be an array.`);
  } else if (raw.data.length === 0 && !hasCustomApi) {
    errors.push(`${prefix}: "data" must be a non-empty array (or enable customApiConfig).`);
  } else {
    const categories = Array.isArray(raw.categories) ? raw.categories : [];

    raw.data.forEach((item, ii) => {
      const itemPrefix = `${prefix}.data[${ii}]`;

      // name
      if (typeof item.name !== "string" || item.name.trim() === "") {
        errors.push(`${itemPrefix}: "name" must be a non-empty string.`);
      }

      // attributes must be an object
      if (!item.attributes || typeof item.attributes !== "object" || Array.isArray(item.attributes)) {
        errors.push(`${itemPrefix}: "attributes" must be a plain object.`);
      } else {
        // Every declared category must have a non-empty value
        categories.forEach((cat) => {
          const val = item.attributes[cat];
          if (val === undefined || val === null) {
            errors.push(
              `${itemPrefix}: missing attribute "${cat}" (required by categories).`
            );
          } else if (typeof val !== "string" || val.trim() === "") {
            errors.push(
              `${itemPrefix}: attribute "${cat}" must be a non-empty string.`
            );
          }
        });
      }
    });
  }

  // ── optional difficultyWeights ───────────────
  if (raw.difficultyWeights !== undefined) {
    if (typeof raw.difficultyWeights !== "object" || Array.isArray(raw.difficultyWeights)) {
      errors.push(`${prefix}: "difficultyWeights" must be a plain object if provided.`);
    } else {
      Object.entries(raw.difficultyWeights).forEach(([key, val]) => {
        if (typeof val !== "number" || val <= 0) {
          errors.push(
            `${prefix}: difficultyWeights["${key}"] must be a positive number.`
          );
        }
      });
    }
  }

  // ── optional string fields ───────────────────
  for (const field of ["icon", "description", "placeholder", "usedLabel", "difficultyKey"]) {
    if (raw[field] !== undefined && typeof raw[field] !== "string") {
      errors.push(`${prefix}: "${field}" must be a string if provided.`);
    }
  }

  // ── optional apiConfig ───────────────────────
  if (raw.apiConfig !== undefined) {
    const ac = raw.apiConfig;
    if (typeof ac !== "object" || Array.isArray(ac)) {
      errors.push(`${prefix}: "apiConfig" must be a plain object if provided.`);
    } else {
      if (ac.enabled !== undefined && typeof ac.enabled !== "boolean") {
        errors.push(`${prefix}: apiConfig.enabled must be a boolean.`);
      }
      if (ac.provider !== undefined && typeof ac.provider !== "string") {
        errors.push(`${prefix}: apiConfig.provider must be a string.`);
      }
      if (ac.apiKey !== undefined && typeof ac.apiKey !== "string") {
        errors.push(`${prefix}: apiConfig.apiKey must be a string.`);
      }
      if (ac.leagues !== undefined) {
        if (!Array.isArray(ac.leagues)) {
          errors.push(`${prefix}: apiConfig.leagues must be an array.`);
        } else {
          ac.leagues.forEach((id, li) => {
            if (typeof id !== "number" || !Number.isInteger(id) || id <= 0) {
              errors.push(`${prefix}: apiConfig.leagues[${li}] must be a positive integer.`);
            }
          });
        }
      }
      if (ac.season !== undefined && (typeof ac.season !== "number" || ac.season < 2000 || ac.season > 2099)) {
        errors.push(`${prefix}: apiConfig.season must be a number between 2000 and 2099.`);
      }
    }
  }

  return errors;
}

/**
 * Convert a validated raw topic JSON object into the internal topic format
 * that the engine and ui.js expect.
 *
 * Handles:
 *   - Auto-generating `searchName` from `name` (lowercased)
 *   - Mapping `difficultyWeights` → `multipliers` (normalized keys)
 *   - Assigning default `categoryColors` cycling through the 3 CSS slots
 *   - Filling in optional fields with sensible defaults
 *
 * @param {object} raw  — validated raw topic from JSON
 * @returns {object}    — internal topic object ready for setTopic()
 */
function convertRawTopic(raw) {
  // CSS colour slots cycle for extra categories beyond 3
  const COLOR_SLOTS = ["position", "league", "country"];

  // Build categoryLabels (use existing or title-case the key)
  const categoryLabels = raw.categoryLabels || {};
  const categoryColors = raw.categoryColors || {};

  raw.categories.forEach((cat, i) => {
    if (!categoryLabels[cat]) {
      // Title-case the key: "myCategory" → "My Category"
      categoryLabels[cat] = cat
        .replace(/([A-Z])/g, " $1")
        .replace(/^./, (c) => c.toUpperCase())
        .trim();
    }
    if (!categoryColors[cat]) {
      categoryColors[cat] = COLOR_SLOTS[i % COLOR_SLOTS.length];
    }
  });

  // Normalise difficultyWeights keys to lowercase for engine lookup
  const multipliers = {};
  if (raw.difficultyWeights) {
    Object.entries(raw.difficultyWeights).forEach(([k, v]) => {
      multipliers[k.trim().toLowerCase()] = v;
    });
  }

  // Normalise data items: add searchName
  const data = raw.data.map((item) => ({
    name:       item.name.trim(),
    searchName: item.name.trim().toLowerCase(),
    attributes: { ...item.attributes },
  }));

  return {
    topicKey:       raw.topicKey.trim(),
    topicName:      raw.topicName.trim(),
    icon:           raw.icon           || "❓",
    description:    raw.description    || "",
    placeholder:    raw.placeholder    || `Type your answer…`,
    usedLabel:      raw.usedLabel      || "Answers Used",
    categories:     raw.categories.map((c) => c.trim()),
    categoryLabels,
    categoryColors,
    difficultyKey:  raw.difficultyKey  || raw.categories[0],
    multipliers,
    data,
    // Pass through apiConfig if present (engine will use it during initTopicData)
    apiConfig:        raw.apiConfig       || null,
    // Pass through custom API config and field mapping (Section 6)
    customApiConfig:  raw.customApiConfig || null,
    fieldMapping:     raw.fieldMapping    || null,
  };
}

/**
 * Import one or more topics from a parsed JSON value.
 * Accepts either a single topic object or an array of topic objects.
 *
 * Validates every topic before importing any of them.
 * If validation passes, each topic is registered in the TOPICS registry
 * so it becomes immediately available via setTopic().
 *
 * @param {object|object[]} json  — result of JSON.parse() on a topics file
 * @returns {{ imported: string[], errors: string[] }}
 *   `imported` — topicKeys that were successfully imported
 *   `errors`   — all validation error messages (empty = success)
 *
 * @example
 * // From a <input type="file"> handler:
 * const text = await file.text();
 * const result = importTopicsFromJSON(JSON.parse(text));
 * if (result.errors.length > 0) {
 *   console.error("Import failed:", result.errors);
 * } else {
 *   console.log("Imported:", result.imported);
 *   setTopicAndRestart(result.imported[0]);
 * }
 */
function importTopicsFromJSON(json) {
  // Normalise to array
  const rawTopics = Array.isArray(json) ? json : [json];

  // ── Phase 1: validate all topics first ──────
  const allErrors = [];
  rawTopics.forEach((raw, idx) => {
    const errs = validateTopicJSON(raw, idx);
    allErrors.push(...errs);
  });

  if (allErrors.length > 0) {
    console.group("%c[Engine] Topic import FAILED", "color: #f87171; font-weight: bold;");
    allErrors.forEach((e) => console.error(" •", e));
    console.groupEnd();
    return { imported: [], errors: allErrors };
  }

  // ── Phase 2: convert and register ───────────
  const imported = [];
  rawTopics.forEach((raw) => {
    const topic = convertRawTopic(raw);
    TOPICS[topic.topicKey] = topic;
    imported.push(topic.topicKey);
  });

  return { imported, errors: [] };
}

/**
 * Fetch a topic JSON file by URL and import it.
 * Convenience wrapper around importTopicsFromJSON for remote/local files.
 *
 * @param {string} url  — path to a .json file (relative or absolute)
 * @returns {Promise<{ imported: string[], errors: string[] }>}
 *
 * @example
 * const result = await importTopicsFromURL("./my-custom-topic.json");
 * if (result.errors.length === 0) setTopicAndRestart(result.imported[0]);
 */
async function importTopicsFromURL(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      const msg = `HTTP ${res.status} when fetching "${url}"`;
      console.error(`[Engine] ${msg}`);
      return { imported: [], errors: [msg] };
    }
    const json = await res.json();
    return importTopicsFromJSON(json);
  } catch (err) {
    const msg = `Failed to load "${url}": ${err.message}`;
    console.error("[Engine]", msg);
    return { imported: [], errors: [msg] };
  }
}

// ──────────────────────────────────────────────
// SCORING HELPERS
// ──────────────────────────────────────────────

/**
 * Get the difficulty multiplier for a given round.
 * Looks up the difficultyKey category value in the topic's multipliers map.
 *
 * @param {object} round
 * @returns {number}
 */
function getDifficultyMultiplier(round) {
  const topic = requireTopic();
  const key   = topic.difficultyKey;
  const value = normalize(round.attributes[key] || "");
  return topic.multipliers[value] || 1;
}

/**
 * Calculate final points for a round (base × depth bonus).
 * Base already includes difficulty multiplier baked in at creation.
 *
 * @param {object} round
 * @returns {number}
 */
function calcRoundPoints(round) {
  const depthMultiplier  = DEPTH_BONUS[round.rowIndex] || 1;
  const extra            = round.extraBonus || 1.0;
  return Math.round(round.basePoints * depthMultiplier * extra);
}

// ──────────────────────────────────────────────
// STACKED ROUND SYSTEM
// ──────────────────────────────────────────────

/**
/**
 * Create a new round from a randomly selected item.
 * @returns {object}
 */
function createRound() {
  const topic  = requireTopic();
  const pivot  = randomFrom(state.items);
  const multi  = topic.multipliers[normalize(pivot.attributes[topic.difficultyKey])] || 1;

  return {
    id:         state.nextRoundId++,
    attributes: { ...pivot.attributes }, // copy all category values
    basePoints: Math.round(10 * multi),
    rowIndex:   0,
    createdAt:  Date.now(),
    extraBonus: 1.0, // grows +0.5× each time this row survives a timeout as oldest
  };
}

/**
 * Push a new round onto the top of the stack.
 * Existing rounds shift down by one rowIndex.
 * Rounds deeper than MAX_ACTIVE_ROUNDS are removed.
 * Triggers a full UI re-render via ui.js.
 */
/**
 * Push a new round onto the top of the stack.
 * Never changes the player's selected row — they keep their current target.
 * Never restarts the global timer — the timer drives itself.
 *
 * @param {boolean} [selectNew=false] Force-select the new round
 *   (used only at game start when there's nothing else to select).
 */
function pushNewRound(selectNew = false) {
  if (state.items.length === 0) {
    ui.showFeedback("⚠ No data loaded for this topic.", "incorrect");
    return;
  }

  // Shift existing rounds down (rowIndex increases = older/deeper)
  state.activeRounds.forEach((r) => r.rowIndex++);

  // Create and insert new round at position 0 (top / newest)
  const newRound = createRound();
  state.activeRounds.unshift(newRound);

  state.answered = false;

  ui.renderStack(state.activeRounds, state.topic);
  ui.updatePointsDisplay(calcRoundPoints(state.activeRounds[state.activeRounds.length - 1]));
  ui.resetInput();
  ui.clearFeedback();
  showDevAnswers();
}

/**
 * Remove a specific round by id, then re-index rowIndex values.
 * @param {number} roundId
 */
function removeRound(roundId) {
  state.activeRounds = state.activeRounds.filter((r) => r.id !== roundId);
  state.activeRounds.forEach((r, i) => (r.rowIndex = i));
}

/**
 * Select a round as the active answer target.
 * Updates visual highlight and points display.
 *
 * @param {number} roundId
 */
// ──────────────────────────────────────────────
// ANSWER VALIDATION
// ──────────────────────────────────────────────

/**
 * Find an item in the active list that:
 *   1. Has a matching name (case-insensitive)
 *   2. Matches ALL category attribute values of the given round
 *
 * @param {string} userInput
 * @param {object} round
 * @returns {object|null} the matched item, or null
 */
function findMatchingItem(userInput, round) {
  const topic     = requireTopic();
  const inputNorm = normalize(userInput);

  // Find all items whose name matches the input
  const nameMatches = state.items.filter(item => item.searchName === inputNorm);

  // Among name matches, find one that satisfies all category constraints
  const match = nameMatches.find(item =>
    topic.categories.every(cat =>
      normalize(item.attributes[cat]) === normalize(round.attributes[cat])
    )
  );

  return match || null;
}

/**
 * Validate the user's answer against the selected round.
 *
 * @param {string} userInput
 * @param {object} round
 * @returns {"correct"|"duplicate"|"wrong"}
 */
function validateAnswer(userInput, round) {
  const item = findMatchingItem(userInput, round);
  if (!item) return "wrong";
  if (state.usedNames.has(normalize(userInput))) return "duplicate";
  return "correct";
}

// ──────────────────────────────────────────────
// ANSWER SUBMISSION HANDLER
// ──────────────────────────────────────────────

/**
 * Process a form submission.
 * Called by main.js's form submit listener.
 *
 * @param {string} answer — raw input value
 */
function handleSubmit(answer) {
  if (!answer.trim()) return;
  if (state.activeRounds.length === 0) return;

  // Check duplicate first (before scanning rows)
  if (state.usedNames.has(normalize(answer))) {
    ui.showFeedback("🔁 Already used! Try someone else.", "incorrect");
    ui.shakeInput();
    return;
  }

  // Try the answer against every active row — use the first match found
  // Prefer deeper rows first (higher multiplier) so the best score is awarded
  const sorted = [...state.activeRounds].sort((a, b) => b.rowIndex - a.rowIndex);
  let matchedRound = null;
  for (const r of sorted) {
    if (findMatchingItem(answer, r)) { matchedRound = r; break; }
  }

  if (matchedRound) {
    // Correct
    const pts = calcRoundPoints(matchedRound);
    state.score += pts;
    ui.updateScore(state.score);
    const combinedMulti = Math.round((DEPTH_BONUS[matchedRound.rowIndex] || 1) * (matchedRound.extraBonus || 1) * 10) / 10;
    ui.showFeedback(
      `✅ Correct! +${pts} points (${combinedMulti}× multiplier)`,
      "correct"
    );
    markNameUsed(answer);
    updateHighScore();
    removeRound(matchedRound.id);
    pushNewRound();
    ui.resetInput();
  } else {
    // Wrong — push a new row as penalty, or end the game if the stack is full
    if (state.activeRounds.length >= CONFIG.MAX_ACTIVE_ROUNDS) {
      ui.showFeedback("❌ Incorrect — stack is full!", "incorrect");
      ui.shakeInput();
      endGame();
    } else {
      // Boost the oldest row by +0.5× as a penalty
      const oldest = state.activeRounds.reduce((prev, r) =>
        r.rowIndex > prev.rowIndex ||
        (r.rowIndex === prev.rowIndex && r.createdAt < prev.createdAt)
          ? r : prev
      , state.activeRounds[0]);
      oldest.extraBonus = Math.round((oldest.extraBonus + 0.5) * 10) / 10;

      pushNewRound();
      ui.showFeedback("❌ Incorrect — a new row has been added!", "incorrect");
      ui.shakeInput();
    }
  }
}

// ──────────────────────────────────────────────
// GAME OVER
// ──────────────────────────────────────────────

/**
 * End the game — lock input and show the game-over modal.
 */
function endGame() {
  ui.setInputEnabled(false);
  ui.clearFeedback();
  updateHighScore();
  ui.showGameOver(state.score, state.highScore);
}

// ──────────────────────────────────────────────
// USED-NAMES TRACKER
// ──────────────────────────────────────────────

function markNameUsed(displayName) {
  state.usedNames.add(normalize(displayName));
  ui.renderUsedNames(state.usedNames);
}

// ──────────────────────────────────────────────
// HIGH SCORE
// ──────────────────────────────────────────────

function loadHighScore() {
  const saved = lsGet(CONFIG.LS_HIGH_SCORE);
  return saved ? parseInt(saved, 10) : 0;
}

function saveHighScore(score) {
  lsSet(CONFIG.LS_HIGH_SCORE, score.toString());
}

function updateHighScore() {
  if (state.score > state.highScore) {
    state.highScore = state.score;
    ui.updateHighScore(state.highScore);
    saveHighScore(state.highScore);
  }
}

// ──────────────────────────────────────────────
// DEV MODE — VALID ANSWERS PANEL
// ──────────────────────────────────────────────

/**
 * Find all valid answers for every active round.
 * Returns an array of { round, answers[] } objects, one per stacked row.
 * Used only in DEV_MODE.
 *
 * @returns {{ round: object, answers: string[] }[]}
 */
function getValidAnswers() {
  const topic = state.topic;
  if (!topic || state.activeRounds.length === 0) return [];

  return state.activeRounds.map((round) => {
    const answers = state.items
      .filter((item) =>
        topic.categories.every(
          (cat) =>
            normalize(item.attributes[cat]) === normalize(round.attributes[cat])
        )
      )
      .map((item) => item.name);
    return { round, answers };
  });
}

/** Refresh the dev-answers panel (no-op if DEV_MODE is false). */
function showDevAnswers() {
  if (!DEV_MODE) {
    ui.hideDevPanel();
    return;
  }

  const rowAnswers = getValidAnswers();
  ui.renderDevAnswers(rowAnswers);
}

// ──────────────────────────────────────────────
// FOOTBALL API — LIVE PLAYER FETCH
// ──────────────────────────────────────────────

/**
 * Fetch a single league from the Football API.
 * Returns items in the standard topic data format.
 *
 * @param {string} apiKey
 * @param {number} leagueId
 * @param {number} season
 * @param {string} leagueName
 * @returns {Promise<Array>}
 */
async function fetchLeaguePlayers(apiKey, leagueId, season, leagueName) {
  const players = [];
  let page = 1;

  while (page <= CONFIG.MAX_PAGES_PER_LEAGUE) {
    const url = `${CONFIG.API_BASE}/players?league=${leagueId}&season=${season}&page=${page}`;
    const res = await fetch(url, {
      headers: {
        "x-apisports-key": apiKey,
      },
    });

    if (!res.ok) {
      console.warn(`API error (league ${leagueId}, page ${page}): ${res.status}`);
      break;
    }

    const json    = await res.json();
    const results = json.response || [];
    if (results.length === 0) break;

    for (const entry of results) {
      const p     = entry.player;
      const stats = entry.statistics?.[0];
      if (!p || !stats) continue;

      const rawPos = stats.games?.position || p.position || "";
      if (!rawPos) continue;

      const first = p.firstname || null;
      const last  = p.lastname  || null;
      const full  = last ? `${first} ${last}` : (first || p.name);

      // Prefer the league name from the response; fall back to the passed-in leagueName
      const resolvedLeague = stats.league?.name || leagueName;

      players.push({
        name:       full,
        searchName: full.toLowerCase(),
        attributes: {
          position: mapApiPosition(rawPos),
          league:   resolvedLeague,
          country:  p.nationality || "Unknown",
        },
      });
    }

    const totalPages = json.paging?.total || 1;
    if (page >= totalPages) break;
    page++;
  }

  return players;
}

/**
 * Fetch from ALL configured leagues.
 * @deprecated Use fetchTopicViaApiFootball() instead.
 * @param {string} apiKey
 * @returns {Promise<Array>}
 */
async function fetchFootballPlayers(apiKey) {
  const all    = [];
  const leagues = CONFIG.LEAGUES_TO_FETCH;

  for (let i = 0; i < leagues.length; i++) {
    const lg = leagues[i];
    ui.setLoadingText(`Fetching ${lg.name}… (${i + 1}/${leagues.length})`);

    try {
      const players = await fetchLeaguePlayers(apiKey, lg.id, lg.season, lg.name);
      all.push(...players);
    } catch (err) {
      console.error(`Failed to fetch ${lg.name}:`, err);
    }
  }

  // De-duplicate by name (simple)
  const seen   = new Set();
  return all.filter((p) => {
    if (seen.has(p.searchName)) return false;
    seen.add(p.searchName);
    return true;
  });
}

// ──────────────────────────────────────────────
// GENERIC PER-TOPIC CACHE
// ──────────────────────────────────────────────

/**
 * Persist fetched items for a given topic to localStorage.
 * @param {string} topicKey
 * @param {object[]} items
 */
/**
 * Build a short fingerprint string from an apiConfig's leagues + season.
 * Used to detect when the user changes their league selection.
 * @param {object|null} ac — topic.apiConfig
 * @returns {string}
 */
function buildCacheSig(ac) {
  if (!ac || !Array.isArray(ac.leagues)) return "";
  const ids = [...ac.leagues].sort((a, b) => a - b).join(",");
  return `${ac.season || 2024}:${ids}`;
}

function cacheTopicItems(topicKey, items, ac) {
  lsSet(lsCacheKey(topicKey),   JSON.stringify(items));
  lsSet(lsCacheTsKey(topicKey), Date.now().toString());
  lsSet(lsCacheSigKey(topicKey), buildCacheSig(ac));
}

/**
 * Return the stored fetch timestamp (ms) for a topic, or null if none.
 * Used by the UI to display "Last pulled: …".
 * @param {string} topicKey
 * @returns {number|null}
 */
function getTopicCacheTimestamp(topicKey) {
  const ts = lsGet(lsCacheTsKey(topicKey));
  return ts ? parseInt(ts, 10) : null;
}

/**
 * Bust the per-topic cache and immediately re-fetch from the API.
 * Resolves once state.items has been updated (or the fetch fails).
 * The caller should re-render the UI after awaiting this.
 *
 * @param {string} topicKey — topic to refresh (defaults to current topic)
 * @returns {Promise<void>}
 */
async function refreshTopicData(topicKey) {
  const key = topicKey || state.topic?.topicKey;
  if (!key) return;

  // Clear the per-topic cache so initTopicData always goes to the API
  try {
    localStorage.removeItem(lsCacheKey(key));
    localStorage.removeItem(lsCacheTsKey(key));
    localStorage.removeItem(lsCacheSigKey(key));
  } catch { /* quota errors ignored */ }

  // Re-run data init for the current topic object
  if (state.topic && state.topic.topicKey === key) {
    await initTopicData(state.topic);
  }
}

/**
 * Load cached items for a topic. Returns null if missing or expired.
 * @param {string} topicKey
 * @returns {object[]|null}
 */
function loadCachedTopicItems(topicKey) {
  const raw = lsGet(lsCacheKey(topicKey));
  const ts  = lsGet(lsCacheTsKey(topicKey));
  if (!raw || !ts) return null;

  const age = Date.now() - parseInt(ts, 10);
  if (age > CONFIG.CACHE_TTL) return null;

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

// ──────────────────────────────────────────────
// LEGACY FOOTBALL CACHE (backward-compat helpers)
// ──────────────────────────────────────────────

/** @deprecated Use cacheTopicItems / loadCachedTopicItems instead. */
function cachePlayers(players) {
  lsSet(CONFIG.LS_PLAYERS, JSON.stringify(players));
  lsSet(CONFIG.LS_FETCH_TS, Date.now().toString());
}

/** @deprecated Use loadCachedTopicItems instead. */
function loadCachedPlayers() {
  const raw = lsGet(CONFIG.LS_PLAYERS);
  const ts  = lsGet(CONFIG.LS_FETCH_TS);
  if (!raw || !ts) return null;

  const age = Date.now() - parseInt(ts, 10);
  if (age > CONFIG.CACHE_TTL) return null;

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    if (!parsed[0].attributes?.position) return null;
    return parsed;
  } catch {
    return null;
  }
}

// ──────────────────────────────────────────────
// GENERIC TOPIC DATA INIT (API or fallback)
// ──────────────────────────────────────────────

/**
 * Load data for the given topic into state.items.
 *
 * Priority order:
 *   1. Per-topic localStorage cache (within TTL)
 *   2. Live API fetch (if topic.apiConfig.enabled)
 *   3. Fallback to topic.data (static array from topics.js / JSON import)
 *
 * For the legacy built-in Football topic (no apiConfig) a runtime API key
 * stored in _apiKeys is still honoured so existing main.js callers continue
 * to work without changes.
 *
 * @param {object} topic — internal topic object (from TOPICS or convertRawTopic)
 */
async function initTopicData(topic) {
  const topicKey = topic.topicKey;
  const ac       = topic.apiConfig     || null;
  const cac      = topic.customApiConfig || null;

  // Whether API-Football live fetch is enabled
  const shouldFetchFootball = ac?.enabled === true || _apiKeys.has(topicKey);
  // Whether the generic custom-API fetch is enabled
  const shouldFetchCustom   = cac?.enabled === true;

  // ── 1. Per-topic cache ──────────────────────────────────────
  // 1a. Custom-API cache — served with a 24-hour TTL, no signature check needed.
  if (shouldFetchCustom && typeof getCachedCustomApiItems === "function") {
    const customCached = getCachedCustomApiItems(topicKey);
    if (customCached && customCached.length > 0) {
      state.items = customCached.map(item => ({
        ...item,
        searchName: (item.name || "").toLowerCase(),
      }));
      state.isLiveData = true;
      return;
    }
  }

  // 1b. API-Football cache — serve from cache unless the league config has
  //     changed since last fetch. The Refresh button also busts manually.
  const cached = loadCachedTopicItems(topicKey);
  if (cached && !shouldFetchCustom) {
    // Check if the league/season config matches what was cached
    const currentSig = buildCacheSig(ac);
    const storedSig  = lsGet(lsCacheSigKey(topicKey)) || "";
    if (!currentSig || currentSig === storedSig) {
      state.items      = cached;
      state.isLiveData = true;
      return;
    }
    // Config changed — invalidate cache so the next Refresh fetches fresh data.
    // Do NOT auto-fetch here; the user must press the Refresh button.
    try {
      localStorage.removeItem(lsCacheKey(topicKey));
      localStorage.removeItem(lsCacheTsKey(topicKey));
      localStorage.removeItem(lsCacheSigKey(topicKey));
    } catch { /* ignore */ }
  }

  // 2a. Generic Custom API fetch (Section 6 of the builder)
  // Runs before the Football fetch so custom-API topics don't fall through
  // to the Football code path.
  if (shouldFetchCustom && typeof performCustomApiFetch === "function") {
    ui.showLoading(true, "Fetching custom API data…");
    try {
      const customResult = await fetchCustomApiTopicData(topic);
      if (customResult.length > 0) {
        state.items      = customResult;
        state.isLiveData = true;
        if (typeof cacheCustomApiItems === "function") {
          cacheCustomApiItems(topicKey, customResult);
        }
        ui.showLoading(false);
        return;
      }
      console.warn(`[Engine] Custom API returned 0 items for "${topicKey}" — using static fallback.`);
    } catch (err) {
      console.error(`[Engine] Custom API fetch failed for "${topicKey}":`, err);
    }
    ui.showLoading(false);
  }

  // 2b. API-Football fetch (original logic; skipped when custom-API is active)
  // Only reached when there is NO cache at all (brand new topic, never fetched).
  // Config-change cache busts fall through to static fallback below —
  // the user must press the Refresh button to trigger a new fetch.
  const hasCacheAfterBust = !shouldFetchCustom && !!loadCachedTopicItems(topicKey);
  if (!hasCacheAfterBust && shouldFetchFootball && !shouldFetchCustom) {
    // Resolve the API key: runtime map first, then embedded in topic JSON
    const apiKey = _apiKeys.get(topicKey) || ac?.apiKey || null;

    if (!apiKey) {
      console.warn(`[Engine] API fetch enabled for "${topicKey}" but no API key found — using fallback.`);
    } else {
      ui.showLoading(true, `Connecting to ${ac?.provider || "API"}…`);

      try {
        const items = await fetchTopicDataFromAPI(topic, ac, apiKey);
        if (items.length > 0) {
          state.items      = items;
          state.isLiveData = true;
          cacheTopicItems(topicKey, items, ac);
          ui.showLoading(false);
          return;
        }
        console.warn(`[Engine] API returned 0 items for "${topicKey}" — falling back.`);
      } catch (err) {
        console.error(`[Engine] API fetch failed for "${topicKey}":`, err);
      }

      ui.showLoading(false);
    }
  }

  // ── 3. Fallback — static data ───────────────────────────────
  // Also check the old single-topic Football cache for backward-compat
  if (topicKey === "Football") {
    const legacyCached = loadCachedPlayers();
    if (legacyCached) {
      state.items      = legacyCached;
      state.isLiveData = true;
      return;
    }
  }

  state.items      = (topic.data || []).map((item) => ({ ...item }));
  state.isLiveData = false;
}

// ──────────────────────────────────────────────
// PROVIDER DISPATCH
// ──────────────────────────────────────────────

/**
 * Dispatches to the correct API provider fetch function.
 * Currently supports "API-Football".
 *
 * @param {object}      topic   — internal topic object
 * @param {object|null} ac      — apiConfig (may be null for legacy Football)
 * @param {string}      apiKey
 * @returns {Promise<object[]>} — normalised items
 */
async function fetchTopicDataFromAPI(topic, ac, apiKey) {
  const provider = (ac?.provider || "API-Football").trim();

  if (provider === "API-Football") {
    return fetchTopicViaApiFootball(topic, ac, apiKey);
  }

  throw new Error(`[Engine] Unknown API provider: "${provider}"`);
}

/**
 * Fetches and normalizes items for a topic that uses the generic
 * custom-API configuration (customApiConfig + fieldMapping).
 *
 * Depends on: performCustomApiFetch() from topicStorage.js
 *             normalizeItems() from mappingEngine.js (called internally)
 *
 * @param {object} topic — internal topic with customApiConfig + fieldMapping
 * @returns {Promise<object[]>} — normalized { name, searchName, attributes } items
 */
async function fetchCustomApiTopicData(topic) {
  const cac = topic.customApiConfig;
  const fm  = topic.fieldMapping;

  if (!cac || !cac.enabled) return [];

  // fieldMapping is stored in the JSON as { name: string, categories: object }
  const result = await performCustomApiFetch(cac, fm || null);

  if (result.error) {
    throw new Error(result.error);
  }

  // Add searchName for the engine's case-insensitive matching
  return result.items.map(item => ({
    name:       item.name,
    searchName: item.name.toLowerCase(),
    attributes: item.attributes || {},
  }));
}

/**
 * Fetch player data from API-Football for the given topic.
 * Reads league IDs and season from topic.apiConfig when present,
 * otherwise falls back to CONFIG.LEAGUES_TO_FETCH (legacy Football topic).
 *
 * @param {object}      topic
 * @param {object|null} ac      — topic.apiConfig
 * @param {string}      apiKey
 * @returns {Promise<object[]>}
 */
async function fetchTopicViaApiFootball(topic, ac, apiKey) {
  // Resolve leagues to fetch
  let leagues;

  if (ac && Array.isArray(ac.leagues) && ac.leagues.length > 0) {
    // Use the per-topic league list from apiConfig
    const season = ac.season || 2024;
    leagues = ac.leagues.map((id) => ({
      id,
      season,
      name: (typeof getLeagueName === "function" ? getLeagueName(id) : null) || `League ${id}`,
    }));
  } else {
    // Legacy Football topic — use the hardcoded CONFIG list
    leagues = CONFIG.LEAGUES_TO_FETCH;
  }

  const all = [];

  for (let i = 0; i < leagues.length; i++) {
    const lg = leagues[i];
    ui.setLoadingText(`Fetching ${lg.name}… (${i + 1}/${leagues.length})`);

    try {
      const players = await fetchLeaguePlayers(apiKey, lg.id, lg.season, lg.name);
      all.push(...players);
    } catch (err) {
      console.error(`[Engine] Failed to fetch league ${lg.id}:`, err);
    }
  }

  // De-duplicate by searchName
  const seen = new Set();
  return all.filter((p) => {
    if (seen.has(p.searchName)) return false;
    seen.add(p.searchName);
    return true;
  });
}

// ──────────────────────────────────────────────
// FOOTBALL TOPIC INIT — legacy wrapper kept for main.js compat
// ──────────────────────────────────────────────

/**
 * @deprecated Prefer setTopic(key, apiKey) which calls initTopicData().
 *   Kept so that existing main.js calls to initFootballPlayers() keep working.
 * @param {string|null} apiKey
 */
async function initFootballPlayers(apiKey) {
  if (apiKey) _apiKeys.set("Football", apiKey);
  await initTopicData(state.topic);
}

// ──────────────────────────────────────────────
// AUTOCOMPLETE ENGINE (fuzzy search)
// ──────────────────────────────────────────────

let acHighlightIndex = -1;
let acDebounceTimer  = null;
const AC_DEBOUNCE_MS = 200;
const AC_MAX_RESULTS = 8;

/**
 * Fuzzy-score a query against a target string.
 * Returns { score, indices } or null if no match.
 *
 * Rules (higher score = better match):
 *   +10  per matched char
 *   +15  if match starts at index 0 (prefix)
 *   +8   for consecutive matched chars
 *   -1   per gap between matches
 *   +5   for word-boundary matches (after space or hyphen)
 *
 * @param {string} query
 * @param {string} target — should both be normalized (lowercase)
 * @returns {{ score: number, indices: number[] } | null}
 */
function fuzzyScore(query, target) {
  const qLen = query.length;
  const tLen = target.length;
  if (qLen === 0 || qLen > tLen) return null;

  const indices = [];
  let score = 0;
  let tIdx  = 0;
  let consecutiveMisses = 0;
  const MAX_MISSES = 2;

  for (let qIdx = 0; qIdx < qLen; qIdx++) {
    const qChar = query[qIdx];
    let found = false;

    while (tIdx < tLen) {
      if (target[tIdx] === qChar) {
        score += 10;
        if (indices.length === 0 && tIdx === 0) score += 15;
        if (indices.length > 0 && tIdx === indices[indices.length - 1] + 1) score += 8;
        if (tIdx > 0 && (target[tIdx - 1] === " " || target[tIdx - 1] === "-")) score += 5;
        if (indices.length > 0) score -= (tIdx - indices[indices.length - 1] - 1);
        indices.push(tIdx);
        tIdx++;
        found = true;
        consecutiveMisses = 0;
        break;
      }
      tIdx++;
    }

    if (!found) {
      consecutiveMisses++;
      if (consecutiveMisses > MAX_MISSES) return null;
      score -= 5;
    }
  }

  if (indices.length < Math.ceil(qLen / 2)) return null;
  return { score, indices };
}

/**
 * Filter items using fuzzy search on the searchName field.
 * Returns top AC_MAX_RESULTS matches sorted by score.
 *
 * @param {string} query
 * @returns {Array<{ item, score, indices }>}
 */
function filterItems(query) {
  const q = normalize(query);
  if (q.length === 0) return [];

  const scored = [];
  for (const item of state.items) {
    const result = fuzzyScore(q, item.searchName);
    if (result) {
      scored.push({ item, score: result.score, indices: result.indices });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, AC_MAX_RESULTS);
}

/**
 * Handle input event — debounces filterItems → ui.renderSuggestions.
 * @param {string} rawValue
 */
function handleAutocompleteInput(rawValue) {
  if (acDebounceTimer) clearTimeout(acDebounceTimer);

  acDebounceTimer = setTimeout(() => {
    const query = rawValue.trim();
    if (query.length === 0) {
      ui.clearSuggestions();
      return;
    }
    const matches = filterItems(query);
    ui.renderSuggestions(matches);
  }, AC_DEBOUNCE_MS);
}

/**
 * Handle keydown navigation inside the autocomplete dropdown.
 * @param {KeyboardEvent} e
 * @param {number} itemCount — current number of visible suggestions
 */
function handleAutocompleteKeydown(e, itemCount) {
  if (itemCount === 0) return;

  switch (e.key) {
    case "ArrowDown":
      e.preventDefault();
      acHighlightIndex = (acHighlightIndex + 1) % itemCount;
      ui.updateHighlight(acHighlightIndex);
      break;

    case "ArrowUp":
      e.preventDefault();
      acHighlightIndex = acHighlightIndex <= 0 ? itemCount - 1 : acHighlightIndex - 1;
      ui.updateHighlight(acHighlightIndex);
      break;

    case "Enter":
      if (ui.isSuggestionsOpen()) {
        e.preventDefault();
        const idx = acHighlightIndex >= 0 ? acHighlightIndex : 0;
        const name = ui.getSuggestionName(idx);
        if (name) ui.selectSuggestion(name);
      }
      break;

    case "Escape":
      ui.clearSuggestions();
      break;
  }
}

/** Reset the autocomplete highlight index. */
function resetAcHighlight() {
  acHighlightIndex = -1;
}
