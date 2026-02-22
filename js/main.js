/* ============================================================
   main.js — Entry Point
   Wires the engine, ui, and topics together.
   Sets up event listeners and kicks off initialisation.
   ============================================================ */

// ──────────────────────────────────────────────
// TOPIC SWITCHER
// ──────────────────────────────────────────────

/** Football-only mode: always run the Football topic. */
const SINGLE_TOPIC_KEY = "Football";

/**
 * Restart the game in Football-only mode.
 */
async function setTopicAndRestart() {
  ui.hideGameOver();
  ui.showLoading(true, "Loading…");

  // setTopic merges builder-saved settings and resolves runtime API key from session.
  await setTopic(SINGLE_TOPIC_KEY);

  ui.showLoading(false);

  ui.applyTopicUI(state.topic);
  ui.updateStatusBar(state.items.length, state.isLiveData);

  const ts = getTopicCacheTimestamp(state.topic.topicKey);
  ui.updateLastFetched(state.isLiveData ? ts : null);

  // Show Refresh button only when the topic has live API enabled and a runtime key.
  const ac = state.topic?.apiConfig;
  ui.setRefreshEnabled(!!(ac?.enabled && hasRuntimeApiKey(state.topic.topicKey)));

  // Season badge — derive season from apiConfig, or legacy Football fallback
  const season = state.isLiveData
    ? (ac?.season || (state.topic.topicKey === "Football" ? (CONFIG.LEAGUES_TO_FETCH[0]?.season || null) : null))
    : null;
  ui.updateSeasonBadge(season);

  ui.updateScore(state.score);
  ui.updateHighScore(state.highScore); // always keep the Best display in sync
  ui.renderUsedNames(state.usedNames);
  pushNewRound(true); // true = select the first round automatically
}

// ──────────────────────────────────────────────
// API REFRESH HANDLER
// ──────────────────────────────────────────────

/**
 * Triggered by the "🔄 Refresh" button.
 * Busts the cache for the current topic and re-fetches from the API.
 * The key comes from runtime session storage (set in API Settings).
 */
async function handleApiRefresh() {
  if (!state.topic) return;

  const ac = state.topic.apiConfig;
  if (!ac?.enabled || !hasRuntimeApiKey(state.topic.topicKey)) return;

  ui.setRefreshEnabled(false);
  ui.showLoading(true, "Refreshing data…");
  try {
    await refreshTopicData(state.topic.topicKey);
    ui.updateStatusBar(state.items.length, state.isLiveData);

    const ts = getTopicCacheTimestamp(state.topic.topicKey);
    ui.updateLastFetched(state.isLiveData ? ts : null);

    // Refresh season badge after re-fetch
    const refreshAc = state.topic?.apiConfig;
    const refreshSeason = state.isLiveData
      ? (refreshAc?.season || (state.topic.topicKey === "Football" ? (CONFIG.LEAGUES_TO_FETCH[0]?.season || null) : null))
      : null;
    ui.updateSeasonBadge(refreshSeason);
  } catch (err) {
    console.error("[Main] API refresh failed:", err);
    ui.showFeedback("Could not refresh live data. Please try again.", "incorrect");
  } finally {
    ui.showLoading(false);
    const refreshAc = state.topic?.apiConfig;
    ui.setRefreshEnabled(!!(refreshAc?.enabled && hasRuntimeApiKey(state.topic.topicKey)));
  }
}

// ──────────────────────────────────────────────
// EVENT LISTENERS
// ──────────────────────────────────────────────

// Form submission
ui.dom.answerForm.addEventListener("submit", (e) => {
  e.preventDefault();
  ui.clearSuggestions();
  handleSubmit(ui.dom.answerInput.value);
});

// Play Again button inside the game-over modal
if (ui.dom.playAgainBtn) {
  ui.dom.playAgainBtn.addEventListener("click", () => {
    ui.hideGameOver();
    setTopicAndRestart();
  });
}

if (ui.dom.apiRefreshBtn) {
  ui.dom.apiRefreshBtn.addEventListener("click", handleApiRefresh);
}

// Autocomplete: input (debounced filter)
ui.dom.answerInput.addEventListener("input", (e) => {
  handleAutocompleteInput(e.target.value);
});

// Autocomplete: keyboard navigation
ui.dom.answerInput.addEventListener("keydown", (e) => {
  const itemCount = ui.dom.autocompleteList.querySelectorAll(
    ".autocomplete-item"
  ).length;
  handleAutocompleteKeydown(e, itemCount);
});

// Close autocomplete on outside click
document.addEventListener("click", (e) => {
  if (
    !ui.dom.answerInput.contains(e.target) &&
    !ui.dom.autocompleteList.contains(e.target)
  ) {
    ui.clearSuggestions();
  }
});

// ──────────────────────────────────────────────
// INITIALISE
// ──────────────────────────────────────────────

(async function init() {
  state.highScore = loadHighScore();
  ui.updateHighScore(state.highScore);

  ui.renderUsedNames(state.usedNames);
  await setTopicAndRestart();
})();
