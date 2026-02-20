/* ============================================================
   main.js — Entry Point
   Wires the engine, ui, and topics together.
   Sets up event listeners and kicks off initialisation.
   ============================================================ */

// ──────────────────────────────────────────────
// TOPIC SWITCHER
// ──────────────────────────────────────────────

/**
 * Switch the active topic and restart the game.
 * The API key is read directly from the topic's saved apiConfig — no
 * separate key store needed.
 *
 * @param {string} topicKey — must be a key in TOPICS (topics.js)
 */
async function setTopicAndRestart(topicKey) {
  ui.hideGameOver();
  ui.showLoading(true, "Loading…");

  // setTopic merges the builder-saved override (including apiConfig.apiKey)
  await setTopic(topicKey);

  ui.showLoading(false);

  ui.applyTopicUI(state.topic);
  ui.renderTopicSelect(topicKey);
  ui.updateStatusBar(state.items.length, state.isLiveData);

  const ts = getTopicCacheTimestamp(state.topic.topicKey);
  ui.updateLastFetched(state.isLiveData ? ts : null);

  // Show Refresh button only when the topic has a live API key configured
  const ac = state.topic?.apiConfig;
  ui.setRefreshEnabled(!!(ac?.enabled && ac?.apiKey));

  ui.updateScore(state.score);
  ui.renderUsedNames(state.usedNames);
  pushNewRound(true); // true = select the first round automatically
}

// ──────────────────────────────────────────────
// API REFRESH HANDLER
// ──────────────────────────────────────────────

/**
 * Triggered by the "🔄 Refresh" button.
 * Busts the cache for the current topic and re-fetches from the API.
 * The key comes from the topic's own apiConfig — no separate store needed.
 */
async function handleApiRefresh() {
  if (!state.topic) return;

  const ac = state.topic.apiConfig;
  if (!ac?.enabled || !ac?.apiKey) return;

  ui.setRefreshEnabled(false);
  ui.showLoading(true, "Refreshing data…");

  await refreshTopicData(state.topic.topicKey);

  ui.showLoading(false);
  ui.updateStatusBar(state.items.length, state.isLiveData);

  const ts = getTopicCacheTimestamp(state.topic.topicKey);
  ui.updateLastFetched(state.isLiveData ? ts : null);

  ui.setRefreshEnabled(true);
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
    setTopicAndRestart(state.topic.topicKey);
  });
}

if (ui.dom.apiRefreshBtn) {
  ui.dom.apiRefreshBtn.addEventListener("click", handleApiRefresh);
}

// Topic switcher dropdown
if (ui.dom.topicSelect) {
  ui.dom.topicSelect.addEventListener("change", (e) => {
    setTopicAndRestart(e.target.value);
  });
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
  ui.dom.highScoreDisplay.textContent = state.highScore;

  ui.renderTopicSelect("Football");
  ui.renderUsedNames(state.usedNames);

  // Restore the last-used topic (key lives in the builder-saved apiConfig)
  const savedTopic = lsGet(CONFIG.LS_TOPIC) || "Football";
  await setTopicAndRestart(savedTopic);
})();
