/* ============================================================
   topicStorage.js  —  Custom API Topic Cache Helpers
   ============================================================
   Stores and retrieves normalized items in localStorage so
   that live-fetch custom-API topics don't re-hit the network
   on every page load.

   Also provides performCustomApiFetch() — the main entry point
   for fetching and normalizing data from a custom API endpoint.

   Depends on: mappingEngine.js  (must be loaded first)
   ============================================================ */

"use strict";

/* ── Cache key prefixes ──────────────────────────────────────── */
const CUSTOM_CACHE_PREFIX    = "quizCustomApiCache_";
const CUSTOM_CACHE_TS_PREFIX = "quizCustomApiCacheTs_";

/** Re-fetch after 24 hours */
const CUSTOM_CACHE_TTL = 24 * 60 * 60 * 1000;

/* ── Cache write ─────────────────────────────────────────────── */

/**
 * Saves an array of normalized items to localStorage for a topic.
 * @param {string}   topicKey  — unique topic identifier
 * @param {object[]} items     — normalized { name, attributes } items
 */
function cacheCustomApiItems(topicKey, items) {
  try {
    const key = CUSTOM_CACHE_PREFIX + topicKey;
    const ts  = CUSTOM_CACHE_TS_PREFIX + topicKey;
    localStorage.setItem(key, JSON.stringify(items));
    localStorage.setItem(ts,  Date.now().toString());
  } catch {
    /* localStorage quota exceeded — silently skip */
  }
}

/* ── Cache read ──────────────────────────────────────────────── */

/**
 * Returns cached items for a topic, or null if missing / expired.
 * @param {string} topicKey
 * @returns {object[]|null}
 */
function getCachedCustomApiItems(topicKey) {
  try {
    const ts = localStorage.getItem(CUSTOM_CACHE_TS_PREFIX + topicKey);
    if (!ts) return null;

    // Check TTL
    if (Date.now() - Number(ts) > CUSTOM_CACHE_TTL) return null;

    const raw = localStorage.getItem(CUSTOM_CACHE_PREFIX + topicKey);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/* ── Cache clear ─────────────────────────────────────────────── */

/**
 * Removes cached items for a topic so the next load triggers
 * a fresh API fetch.
 * @param {string} topicKey
 */
function clearCustomApiCache(topicKey) {
  localStorage.removeItem(CUSTOM_CACHE_PREFIX + topicKey);
  localStorage.removeItem(CUSTOM_CACHE_TS_PREFIX + topicKey);
}

/* ── URL builder ─────────────────────────────────────────────── */

/**
 * Constructs a full URL from the three parts of a custom API config.
 *
 * @param {string} baseUrl      — e.g. "https://api.example.com"
 * @param {string} endpoint     — e.g. "/v1/players"
 * @param {object} queryParams  — plain object { key: value }
 * @returns {string}            — the complete URL including query string
 */
function buildCustomFetchUrl(baseUrl, endpoint, queryParams) {
  // Strip trailing slash from base, ensure endpoint starts with /
  const base = (baseUrl || "").replace(/\/+$/, "");
  const ep   = endpoint
    ? (endpoint.startsWith("/") ? endpoint : "/" + endpoint)
    : "";

  const url = new URL(base + ep);

  // Add query params
  if (queryParams && typeof queryParams === "object") {
    Object.entries(queryParams).forEach(([k, v]) => {
      if (k && k.trim()) url.searchParams.set(k.trim(), v ?? "");
    });
  }

  return url.toString();
}

/* ── Main fetch function ─────────────────────────────────────── */

/**
 * Fetches data from a custom API endpoint, extracts the target
 * array, optionally normalizes the items using a field mapping,
 * and returns everything the caller needs.
 *
 * Depends on: extractArray(), collectKeys(), normalizeItems()
 * from mappingEngine.js.
 *
 * @param {object} customApiConfig — serialized config:
 *   {
 *     baseUrl:     string,
 *     endpoint:    string,
 *     method:      "GET" | "POST",
 *     headers:     { key: value },   ← plain object
 *     queryParams: { key: value },   ← plain object
 *     dataPath:    string,
 *   }
 * @param {object|null} fieldMapping — serialized mapping:
 *   {
 *     name:       string,            ← dot-path for item.name
 *     categories: { catKey: path },  ← each category key → field path
 *   }
 *   Pass null to skip normalization (returns rawItems + keys only).
 *
 * @returns {Promise<{
 *   items:    object[],   ← normalized items (empty if no fieldMapping)
 *   rawItems: object[],   ← raw items from API
 *   keys:     string[],   ← available key paths from first raw item
 *   error:    string,     ← non-empty string if something went wrong
 * }>}
 */
async function performCustomApiFetch(customApiConfig, fieldMapping) {
  const {
    baseUrl     = "",
    endpoint    = "",
    method      = "GET",
    headers     = {},
    queryParams = {},
    dataPath    = "",
    maxPages    = 1,   // number of pages to auto-paginate (TMDB-style)
  } = customApiConfig || {};

  /* ── 1. Validate base URL ── */
  if (!baseUrl.trim()) {
    return { items: [], rawItems: [], keys: [], error: "Base URL is required." };
  }

  const safeHeaders = (headers && typeof headers === "object") ? headers : {};
  const httpMethod  = (method || "GET").toUpperCase();

  /* ── 2. Inner single-page fetch helper ── */
  async function _fetchPage(pageNum) {
    // Merge in the `page` query param only when paging beyond the first
    const params = (pageNum > 1)
      ? Object.assign({}, queryParams, { page: pageNum })
      : queryParams;

    let pageUrl;
    try {
      pageUrl = buildCustomFetchUrl(baseUrl.trim(), endpoint.trim(), params);
    } catch (err) {
      return { raw: null, totalPages: 1, error: `Invalid URL: ${err.message}` };
    }

    let response;
    try {
      response = await fetch(pageUrl, { method: httpMethod, headers: safeHeaders });
    } catch (err) {
      return { raw: null, totalPages: 1, error: `Network error: ${err.message}` };
    }

    if (!response.ok) {
      return { raw: null, totalPages: 1, error: `HTTP ${response.status}: ${response.statusText}` };
    }

    let parsed;
    try {
      parsed = await response.json();
    } catch (err) {
      return { raw: null, totalPages: 1, error: `Failed to parse JSON: ${err.message}` };
    }

    // Try to detect total pages from common pagination fields in the root object
    const totalPages = (parsed && typeof parsed === "object")
      ? (parsed.total_pages || parsed.totalPages || parsed.pages || parsed.last_page || 1)
      : 1;

    return { raw: parsed, totalPages, error: "" };
  }

  /* ── 3. Fetch page 1 ── */
  const page1 = await _fetchPage(1);
  if (page1.error) {
    return { items: [], rawItems: [], keys: [], error: page1.error };
  }

  // Extract the data array from page 1
  const { items: page1Items, error: pathError1 } = extractArray(page1.raw, dataPath);
  if (pathError1) {
    return { items: [], rawItems: [], keys: [], error: pathError1 };
  }

  let allRawItems = [...page1Items];

  /* ── 4. Multi-page fetch (only when maxPages > 1) ── */
  if (maxPages > 1 && page1.totalPages > 1) {
    const lastPage = Math.min(maxPages, page1.totalPages);

    for (let p = 2; p <= lastPage; p++) {
      const pageN = await _fetchPage(p);
      if (pageN.error) break;  // stop on first error, return what we have

      const { items: pageNItems } = extractArray(pageN.raw, dataPath);
      if (pageNItems.length > 0) allRawItems.push(...pageNItems);
    }
  }

  /* ── 5. Collect available key paths from the first item ── */
  const keys = allRawItems.length > 0 ? collectKeys(allRawItems[0]) : [];

  /* ── 6. Normalize (only if a full fieldMapping is provided) ── */
  let items = [];
  if (fieldMapping && fieldMapping.name) {
    items = normalizeItems(allRawItems, fieldMapping);
  }

  return { items, rawItems: allRawItems, keys, error: "" };
}
