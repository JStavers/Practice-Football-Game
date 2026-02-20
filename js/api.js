/* ============================================================
   api.js  —  API Fetch & Normalisation Module
   ============================================================
   Responsible for:
     • Fetching player/item data from external API providers
     • Normalising raw API responses into the engine's internal
       item format:  { name, searchName, attributes }
     • Providing a clean provider-dispatch interface so new APIs
       can be added later without touching engine.js

   This module has NO DOM access and no dependency on engine.js.
   It is loaded by builder.html for the "Test Fetch" button, and
   also called internally by engine.js's fetchTopicDataFromAPI().

   Load order:  (standalone) — no dependencies required.
   ============================================================ */

"use strict";

// ──────────────────────────────────────────────
// PROVIDER REGISTRY
// ──────────────────────────────────────────────

/**
 * Maps provider name strings to their fetch functions.
 * Add new providers here — the engine will dispatch automatically.
 *
 * Each fetch function receives: (apiConfig, progressCallback)
 *   apiConfig       — { provider, apiKey, leagues[], season }
 *   progressCallback — optional fn(message) for UI status updates
 *
 * Each fetch function must return: Promise<object[]>
 *   where each object is: { name, searchName, attributes }
 *
 * @type {Object.<string, Function>}
 */
const API_PROVIDERS = {
  "API-Football": fetchFromApiFootball,
};

// ──────────────────────────────────────────────
// PUBLIC ENTRY POINT
// ──────────────────────────────────────────────

/**
 * Fetch and normalise items for a topic using its apiConfig.
 * Dispatches to the correct provider function based on apiConfig.provider.
 *
 * @param {object}   apiConfig           — the topic's apiConfig object
 * @param {Function} [progressCallback]  — fn(message) called for status updates
 * @returns {Promise<object[]>}          — normalised items or [] on error
 */
async function apiFetchItems(apiConfig, progressCallback = null) {
  const provider = (apiConfig?.provider || "API-Football").trim();
  const fn = API_PROVIDERS[provider];

  if (!fn) {
    console.error(`[api.js] Unknown provider: "${provider}"`);
    return [];
  }

  try {
    return await fn(apiConfig, progressCallback);
  } catch (err) {
    console.error(`[api.js] Fetch failed for provider "${provider}":`, err);
    return [];
  }
}

// ──────────────────────────────────────────────
// API-FOOTBALL PROVIDER
// ──────────────────────────────────────────────

/** Base URL — local proxy forwards to v3.football.api-sports.io (run proxy.py) */
const API_FOOTBALL_BASE = "https://v3.football.api-sports.io";

/** Max pages to fetch per league (to stay within API rate limits) */
const MAX_PAGES_PER_LEAGUE = 10;

/**
 * Maps a raw API-Football position string to one of the engine's
 * four canonical position labels.
 *
 * @param {string} rawPos — e.g. "Midfielder", "G", "Attacker"
 * @returns {string}      — one of: Goalkeeper, Defender, Midfielder, Forward
 */
function normalisePosition(rawPos) {
  const p = (rawPos || "").toLowerCase().trim();
  if (p.startsWith("g"))  return "Goalkeeper";
  if (p.startsWith("d"))  return "Defender";
  if (p.startsWith("m"))  return "Midfielder";
  if (p.startsWith("a") || p.startsWith("f") || p.startsWith("s")) return "Forward";
  return rawPos || "Unknown";
}

/**
 * Fetch all players from a single league via API-Football.
 * Pages through results up to MAX_PAGES_PER_LEAGUE.
 *
 * @param {string} apiKey
 * @param {number} leagueId
 * @param {number} season
 * @param {string} leagueName     — display name for the league attribute
 * @returns {Promise<object[]>}   — normalised player items
 */
async function fetchLeague(apiKey, leagueId, season, leagueName) {
  const players = [];
  let page = 1;

  while (page <= MAX_PAGES_PER_LEAGUE) {
    const url = `${API_FOOTBALL_BASE}/players?league=${leagueId}&season=${season}&page=${page}`;

    const res = await fetch(url, {
      headers: {
        "x-apisports-key": apiKey,
      },
    });

    if (!res.ok) {
      console.warn(`[api.js] API-Football HTTP ${res.status} (league ${leagueId}, page ${page})`);
      break;
    }

    const json    = await res.json();
    const results = json.response || [];
    if (results.length === 0) break; // no more pages

    for (const entry of results) {
      const p     = entry.player;
      const stats = entry.statistics?.[0];
      if (!p || !stats) continue;

      // Build full display name
      const first = p.firstname || null;
      const last  = p.lastname  || null;
      const full  = last ? `${first} ${last}` : (first || p.name || "Unknown");

      // Position from statistics (more reliable than player.position)
      const rawPos = stats.games?.position || p.position || "";

      // Prefer the league name the API returned; fall back to the passed-in leagueName
      const resolvedLeague = stats.league?.name || leagueName;

      players.push({
        name:       full,
        searchName: full.toLowerCase(),
        attributes: {
          position: normalisePosition(rawPos),
          league:   resolvedLeague,
          country:  p.nationality || "Unknown",
        },
      });
    }

    // Check if there are more pages
    const totalPages = json.paging?.total || 1;
    if (page >= totalPages) break;
    page++;
  }

  return players;
}

/**
 * Fetch all players from all leagues defined in apiConfig.
 * De-duplicates by searchName (first occurrence wins).
 *
 * @param {object}   apiConfig          — { apiKey, leagues[], season }
 * @param {Function} [progressCallback] — fn(message) for status updates
 * @returns {Promise<object[]>}
 */
async function fetchFromApiFootball(apiConfig, progressCallback) {
  const { apiKey, leagues = [], season = 2024 } = apiConfig;

  if (!apiKey) {
    console.warn("[api.js] API-Football: no apiKey provided.");
    return [];
  }

  if (leagues.length === 0) {
    console.warn("[api.js] API-Football: no leagues specified.");
    return [];
  }

  const all = [];

  for (let i = 0; i < leagues.length; i++) {
    const leagueId   = leagues[i];
    const leagueName = getLeagueName(leagueId);

    if (progressCallback) {
      progressCallback(`Fetching league ${leagueId}… (${i + 1}/${leagues.length})`);
    }

    try {
      const players = await fetchLeague(apiKey, leagueId, season, leagueName);
      all.push(...players);
    } catch (err) {
      console.error(`[api.js] Failed to fetch league ${leagueId}:`, err);
    }
  }

  // De-duplicate: first occurrence by searchName wins
  const seen = new Set();
  const unique = all.filter(p => {
    if (seen.has(p.searchName)) return false;
    seen.add(p.searchName);
    return true;
  });

  return unique;
}

// ──────────────────────────────────────────────
// WELL-KNOWN LEAGUE ID → NAME MAP (API-Football)
// ──────────────────────────────────────────────

/**
 * Maps common API-Football league IDs to human-readable names.
 * Used by the builder UI to show friendly labels in the league selector.
 * @type {Object.<number, string>}
 */
const KNOWN_LEAGUES = {
  39:  "Premier League",
  140: "La Liga",
  135: "Serie A",
  78:  "Bundesliga",
  61:  "Ligue 1",
  253: "MLS",
  94:  "Primeira Liga",
  88:  "Eredivisie",
  144: "Pro League (Belgium)",
  203: "Süper Lig",
  307: "Saudi Pro League",
};

/**
 * Returns the display name for a known league ID, or a generic fallback.
 * @param {number} id
 * @returns {string}
 */
function getLeagueName(id) {
  return KNOWN_LEAGUES[id] || `League ${id}`;
}
