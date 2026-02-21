/* ============================================================
   mappingEngine.js  —  Field Mapping & Normalization
   ============================================================
   Pure utility functions — no DOM access, no side effects.

   Converts raw API response items into the normalized format
   that the quiz engine expects:
     { name: string, attributes: { [categoryKey]: value } }

   Load order: this file must be loaded BEFORE topicStorage.js,
   apiBuilder.js, and engine.js.
   ============================================================ */

"use strict";

/* ── TMDB genre ID → name lookup ─────────────────────────────────
   Genre IDs returned by /discover/movie — id set is fixed by TMDB.
   Used by the "tmdb_genre" transform.
   ────────────────────────────────────────────────────────────────── */
const TMDB_GENRE_MAP = {
  28:    "Action",
  12:    "Adventure",
  16:    "Animation",
  35:    "Comedy",
  80:    "Crime",
  99:    "Documentary",
  18:    "Drama",
  10751: "Family",
  14:    "Fantasy",
  36:    "History",
  27:    "Horror",
  10402: "Music",
  9648:  "Mystery",
  10749: "Romance",
  878:   "Science Fiction",
  10770: "TV Movie",
  53:    "Thriller",
  10752: "War",
  37:    "Western",
};

/* ── ISO 639-1 language code → readable name ────────────────────
   Used by the "language_name" transform.
   ────────────────────────────────────────────────────────────────── */
const LANGUAGE_NAMES = {
  ab: "Abkhazian",     af: "Afrikaans",      ar: "Arabic",
  az: "Azerbaijani",  be: "Belarusian",     bg: "Bulgarian",
  bn: "Bengali",      bs: "Bosnian",        ca: "Catalan",
  cs: "Czech",        cy: "Welsh",          da: "Danish",
  de: "German",       el: "Greek",          en: "English",
  eo: "Esperanto",    es: "Spanish",        et: "Estonian",
  eu: "Basque",       fa: "Persian",        fi: "Finnish",
  fr: "French",       gl: "Galician",       gu: "Gujarati",
  he: "Hebrew",       hi: "Hindi",          hr: "Croatian",
  hu: "Hungarian",    hy: "Armenian",       id: "Indonesian",
  is: "Icelandic",    it: "Italian",        ja: "Japanese",
  ka: "Georgian",     kk: "Kazakh",         km: "Khmer",
  kn: "Kannada",      ko: "Korean",         lt: "Lithuanian",
  lv: "Latvian",      mk: "Macedonian",     ml: "Malayalam",
  mn: "Mongolian",    ms: "Malay",          my: "Burmese",
  nb: "Norwegian",    nl: "Dutch",          no: "Norwegian",
  pa: "Punjabi",      pl: "Polish",         ps: "Pashto",
  pt: "Portuguese",   ro: "Romanian",       ru: "Russian",
  si: "Sinhalese",    sk: "Slovak",         sl: "Slovenian",
  sq: "Albanian",     sr: "Serbian",        sv: "Swedish",
  sw: "Swahili",      ta: "Tamil",          te: "Telugu",
  th: "Thai",         tl: "Filipino",       tr: "Turkish",
  uk: "Ukrainian",    ur: "Urdu",           uz: "Uzbek",
  vi: "Vietnamese",   zh: "Chinese",        zu: "Zulu",
};

/* ── applyTransform ─────────────────────────────────────────────────
   Applies an optional value transform to a raw field value.
   Called by normalizeItems() for each category attribute.

   Built-in transforms:
     year_from_date   "1994-09-23"  → "1994"
     round_1dp        7.461         → "7.5"
     tmdb_genre       28            → "Action"
     language_name    "en"          → "English"

   @param {*}      value      — the raw extracted value
   @param {string} transform  — one of the keys above, or "" / undefined
   @returns {string}
   ────────────────────────────────────────────────────────────────── */
function applyTransform(value, transform) {
  if (!transform || transform === "none") return String(value);
  const str = String(value).trim();

  switch (transform) {
    case "year_from_date":
      // "1994-09-23" → "1994" (first 4 chars of any date-like string)
      return str.length >= 4 ? str.slice(0, 4) : str;

    case "round_1dp": {
      const n = parseFloat(str);
      return isNaN(n) ? str : String(Math.round(n * 10) / 10);
    }

    case "tmdb_genre": {
      const id = parseInt(str, 10);
      return TMDB_GENRE_MAP[id] || str;
    }

    case "language_name":
      return LANGUAGE_NAMES[str.toLowerCase()] || str.toUpperCase();

    default:
      return str;
  }
}

/* ── getNestedValue ─────────────────────────────────────────────
   Safely reads a value from an object using a dot-notation path.

   Examples:
     getNestedValue({ player: { name: "Messi" } }, "player.name")  → "Messi"
     getNestedValue({ a: 1 }, "a.b.c")                             → ""

   @param {object} obj   — the object to read from
   @param {string} path  — dot-separated path, e.g. "player.nationality"
   @returns {*}          — the value, or "" if not found
   ──────────────────────────────────────────────────────────── */
function getNestedValue(obj, path) {
  if (obj == null || !path) return "";

  const parts = String(path).split(".");
  let current = obj;

  for (const part of parts) {
    // Handle array index access, e.g. "statistics.0.games.position"
    if (current == null) return "";

    if (Array.isArray(current)) {
      const idx = parseInt(part, 10);
      current = isNaN(idx) ? undefined : current[idx];
    } else if (typeof current === "object") {
      current = current[part];
    } else {
      return "";
    }
  }

  return current !== undefined && current !== null ? current : "";
}

/* ── normalizeItems ─────────────────────────────────────────────
   Converts a raw API response array into normalized quiz items.

   fieldMapping shape (serialized / stored-to-JSON format):
   {
     name:       "player.name",           // dot-path → item.name
     categories: {                        // each entry → item.attributes[key]
       position:   "player.position",
       nationality: "player.nationality",
     },
     transforms: {                        // optional — per cat-key transform
       genre: "tmdb_genre",
       year:  "year_from_date",
     },
   }

   @param {object[]} rawItems     — array of raw objects from the API
   @param {object}   fieldMapping — mapping config (see above)
   @returns {{ name: string, attributes: object }[]}
   ──────────────────────────────────────────────────────────── */
function normalizeItems(rawItems, fieldMapping) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) return [];
  if (!fieldMapping || !fieldMapping.name) return [];

  const { name: nameField, categories = {}, transforms = {} } = fieldMapping;

  return rawItems
    .map(raw => {
      // ── Extract the item name ──
      const name = String(getNestedValue(raw, nameField)).trim();

      // ── Build attributes object using the category mappings ──
      const attributes = {};
      Object.entries(categories).forEach(([catKey, fieldPath]) => {
        if (catKey && catKey.trim() && fieldPath && fieldPath.trim()) {
          const key       = catKey.trim();
          const rawVal    = getNestedValue(raw, fieldPath);
          const transform = (transforms && transforms[key]) || "";
          attributes[key] = applyTransform(rawVal, transform);
        }
      });

      return { name, attributes };
    })
    // Drop items that ended up with no name (junk data guard)
    .filter(item => item.name.length > 0);
}

/* ── extractArray ───────────────────────────────────────────────
   Extracts an array from a parsed JSON value using a dot-path.

   dataPath examples:
     ""              → expects parsed itself to be an array
     "response"      → parsed.response must be an array
     "data.players"  → parsed.data.players must be an array

   @param {*}      parsed   — the parsed JSON value
   @param {string} dataPath — dot-path to the array (can be "")
   @returns {{ items: object[], error: string }}
   ──────────────────────────────────────────────────────────── */
function extractArray(parsed, dataPath) {
  // Empty path → expect the root to already be an array
  if (!dataPath || !dataPath.trim()) {
    if (Array.isArray(parsed)) {
      return { items: parsed, error: "" };
    }
    return {
      items: [],
      error: "Response root is not an array. Set the Data Path to point to an array.",
    };
  }

  // Walk the dot-path
  const parts  = dataPath.trim().split(".");
  let   target = parsed;

  for (const part of parts) {
    if (target == null || typeof target !== "object") {
      return { items: [], error: `Path "${dataPath}" not found in response.` };
    }
    target = target[part];
  }

  if (!Array.isArray(target)) {
    return {
      items: [],
      error: `"${dataPath}" exists but is not an array (got: ${typeof target}).`,
    };
  }

  return { items: target, error: "" };
}

/* ── collectKeys ────────────────────────────────────────────────
   Collects all flattened dot-notation key paths from an object,
   going up to 3 levels deep.

   Example:
     { player: { name: "Messi", nationality: "Argentina" }, age: 36 }
     → ["player", "player.name", "player.nationality", "age"]

   Used to auto-populate the field-selector dropdowns after a test fetch.

   @param {object} obj          — the object to inspect
   @param {string} [prefix=""]  — used in recursion
   @param {number} [depth=0]    — current depth (max 3 before stopping)
   @returns {string[]}
   ──────────────────────────────────────────────────────────── */
function collectKeys(obj, prefix = "", depth = 0) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return [];

  const keys = [];

  for (const [k, v] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${k}` : k;
    keys.push(fullKey);

    // Recurse into nested plain objects up to depth 3
    if (depth < 3 && v && typeof v === "object" && !Array.isArray(v)) {
      keys.push(...collectKeys(v, fullKey, depth + 1));
    }
    // Also expose first element of arrays (e.g. statistics.0.games.position)
    if (depth < 3 && Array.isArray(v) && v.length > 0 && typeof v[0] === "object") {
      keys.push(`${fullKey}.0`);
      keys.push(...collectKeys(v[0], `${fullKey}.0`, depth + 1));
    }
  }

  return keys;
}
