/* ============================================================
   ui.js — UI Rendering Layer
   All DOM reads and writes live here.
   The engine calls these functions — it never touches the DOM.
   ============================================================ */

// ──────────────────────────────────────────────
// DOM REFERENCES
// ──────────────────────────────────────────────

/**
 * Grab all DOM nodes once at startup.
 * Named `dom` so references are explicit (dom.scoreDisplay, etc.)
 */
const dom = {
  // Loading & API config
  loadingOverlay: document.getElementById("loading-overlay"),
  loadingText:    document.getElementById("loading-text"),


  // Header / scores
  appTitle:        document.getElementById("app-title"),
  scoreDisplay:    document.getElementById("score"),
  highScoreDisplay: document.getElementById("high-score"),

  // Data status bar
  statusText:     document.getElementById("status-text"),
  playerCount:    document.getElementById("player-count"),
  apiRefreshBtn:  document.getElementById("api-refresh-btn"),
  apiLastFetch:   document.getElementById("api-last-fetch"),
  dataFetchRow:   document.getElementById("data-fetch-row"),
  storageDebug:   document.getElementById("storage-debug"),

  // Topic switcher
  topicSelect: document.getElementById("topic-select"),

  // Stacked round board
  roundStack: document.getElementById("round-stack"),

  // Difficulty / points badge
  pointsAvailable: document.getElementById("points-available"),

  // Answer form
  answerForm:  document.getElementById("answer-form"),
  answerInput: document.getElementById("answer-input"),
  submitBtn:   document.getElementById("submit-btn"),

  // Autocomplete
  autocompleteList: document.getElementById("autocomplete-list"),

  // Feedback
  feedbackEl: document.getElementById("feedback"),

  // Used answers
  usedList:  document.getElementById("used-list"),
  usedEmpty: document.getElementById("used-empty"),
  usedHeading: document.getElementById("used-heading"),

  // Season badge (shown for live API topics with a known season)
  seasonBadge: document.getElementById("season-badge"),
  seasonSep:   document.getElementById("season-sep"),

  // Dev panel
  devPanel: document.getElementById("dev-answers"),

  // How-to-play
  howToPlayList: document.getElementById("how-to-play-list"),

  // Game over modal
  gameOverOverlay:   document.getElementById("game-over-overlay"),
  gameOverScore:     document.getElementById("game-over-score"),
  gameOverHighScore: document.getElementById("game-over-high-score"),
  playAgainBtn:      document.getElementById("play-again-btn"),
};

// ──────────────────────────────────────────────
// TOPIC UI — update text labels when topic changes
// ──────────────────────────────────────────────

/**
 * Update all static UI text to reflect the active topic.
 * Call once after setTopic() resolves.
 *
 * @param {object} topic — the active topic from TOPICS
 */
function applyTopicUI(topic) {
  // Page title
  document.title = `${topic.topicName} Quiz`;
  if (dom.appTitle) {
    dom.appTitle.textContent = `${topic.icon} ${topic.topicName} Quiz`;
  }

  // Input placeholder
  if (dom.answerInput) {
    dom.answerInput.placeholder = topic.placeholder;
  }

  // Used-answers heading
  if (dom.usedHeading) {
    dom.usedHeading.textContent = topic.usedLabel;
  }

  // How-to-play — update the first step with the correct category names
  if (dom.howToPlayList) {
    const categoryNames = topic.categories
      .map((cat) => `<strong>${topic.categoryLabels[cat]}</strong>`)
      .join(", ");
    const firstLi = dom.howToPlayList.querySelector("li:first-child");
    if (firstLi) {
      firstLi.innerHTML = `Rounds stack up — each row shows ${categoryNames}.`;
    }
  }
}

// ──────────────────────────────────────────────
// STACK RENDERING (dynamic, topic-aware)
// ──────────────────────────────────────────────

/**
 * Re-render all stacked round rows inside #round-stack.
 * Reads the topic's categories dynamically — works for any topic.
 *
 * @param {object[]} rounds       — from engine state.activeRounds
 * @param {number}   selectedId   — currently selected round id
 * @param {object}   topic        — active topic object
 */
function renderStack(rounds, topic) {
  dom.roundStack.innerHTML = "";

  rounds.forEach((round) => {
    const row = document.createElement("div");
    row.classList.add("stack-row");
    row.dataset.roundId = round.id;
    row.dataset.depth   = round.rowIndex;
    row.dataset.cols    = topic.categories.length;

    // Depth bonus badge — top-right corner
    // Shows combined multiplier: base depth bonus × any extra bonus earned from timeouts
    const depthBadge = document.createElement("span");
    depthBadge.classList.add("stack-row__depth");
    const baseDepth  = DEPTH_BONUS[round.rowIndex] || 1;
    const extraBonus = round.extraBonus || 1.0;
    const combined   = Math.round(baseDepth * extraBonus * 10) / 10;
    depthBadge.textContent = `${combined}×`;

    // Cells container — dynamically built from topic.categories
    const cells = document.createElement("div");
    cells.classList.add("stack-row__cells");

    topic.categories.forEach((cat) => {
      const colorMod = topic.categoryColors[cat] || "position";
      const label    = topic.categoryLabels[cat]  || cat;
      const value    = round.attributes[cat]       || "—";

      const cell = document.createElement("div");
      cell.classList.add("stack-row__cell", `stack-row__cell--${colorMod}`);

      const lbl = document.createElement("span");
      lbl.classList.add("stack-row__label");
      lbl.textContent = label;

      const val = document.createElement("span");
      val.classList.add("stack-row__value");
      val.textContent = value;

      cell.appendChild(lbl);
      cell.appendChild(val);
      cells.appendChild(cell);
    });

    row.appendChild(depthBadge);
    row.appendChild(cells);

    row.style.animationDelay = `${round.rowIndex * 0.06}s`;
    row.classList.add("slide-up");

    dom.roundStack.appendChild(row);
  });
}

// ──────────────────────────────────────────────
// SCORE / POINTS DISPLAY
// ──────────────────────────────────────────────

function updateScore(score) {
  dom.scoreDisplay.textContent = score;
  dom.scoreDisplay.parentElement.classList.add("pop");
  setTimeout(() => dom.scoreDisplay.parentElement.classList.remove("pop"), 400);
}

function updateHighScore(score) {
  dom.highScoreDisplay.textContent = score;
  dom.highScoreDisplay.parentElement.classList.add("pop");
  setTimeout(
    () => dom.highScoreDisplay.parentElement.classList.remove("pop"),
    400
  );
}

function updatePointsDisplay(points) {
  dom.pointsAvailable.textContent = points;
}

// ──────────────────────────────────────────────
// DATA STATUS BAR
// ──────────────────────────────────────────────

function updateStatusBar(count, isLive) {
  dom.playerCount.textContent = count;
  dom.statusText.textContent  = isLive ? "Live data" : "Offline data";
}

/**
 * Update the "Last pulled" timestamp and show/hide the fetch row.
 *
 * @param {number|null} ts — epoch ms, or null to clear
 */
function updateLastFetched(ts) {
  const text = ts ? `Last pulled: ${formatFetchTime(ts)}` : "";
  if (dom.apiLastFetch) dom.apiLastFetch.textContent = text;
  if (dom.dataFetchRow) dom.dataFetchRow.classList.toggle("hidden", !ts);
}

/**
 * Format a season year into a short slash-notation label.
 * e.g. 2024 → "24/25", 2023 → "23/24"
 * @param {number|string} year
 * @returns {string}
 */
function formatSeasonLabel(year) {
  const y = Number(year);
  if (isNaN(y)) return String(year);
  const start = String(y).slice(-2);
  const end   = String(y + 1).slice(-2);
  return `${start}/${end} Season`;
}

/**
 * Show or hide the season badge in the data-status bar.
 * Pass a year (e.g. 2024) to display it; pass null/undefined to hide it.
 * @param {number|string|null} season
 */
function updateSeasonBadge(season) {
  if (!dom.seasonBadge || !dom.seasonSep) return;
  if (season != null && season !== "") {
    dom.seasonBadge.textContent = formatSeasonLabel(season);
    dom.seasonBadge.classList.remove("hidden");
    dom.seasonSep.classList.remove("hidden");
  } else {
    dom.seasonBadge.classList.add("hidden");
    dom.seasonSep.classList.add("hidden");
  }
}

/**
 * Show or hide the Refresh button (it lives in the always-visible status bar).
 * @param {boolean} enabled
 */
function setRefreshEnabled(enabled) {
  if (!dom.apiRefreshBtn) return;
  dom.apiRefreshBtn.classList.toggle("hidden", !enabled);
  dom.apiRefreshBtn.disabled = !enabled;
}

function updateStorageDebug(text) {
  if (!dom.storageDebug) return;
  dom.storageDebug.textContent = text || "";
}

/**
 * Format an epoch-ms timestamp into a human-readable string like
 * "20 Feb 2026, 14:32" using the browser's local timezone.
 * @param {number} ts
 * @returns {string}
 */
function formatFetchTime(ts) {
  return new Date(ts).toLocaleString(undefined, {
    day:    "numeric",
    month:  "short",
    year:   "numeric",
    hour:   "2-digit",
    minute: "2-digit",
  });
}

// ──────────────────────────────────────────────
// FEEDBACK AREA
// ──────────────────────────────────────────────

function showFeedback(message, type) {
  dom.feedbackEl.textContent = message;
  dom.feedbackEl.className   = "feedback";
  dom.feedbackEl.classList.add(`feedback--${type}`);
}

function clearFeedback() {
  dom.feedbackEl.textContent = "";
  dom.feedbackEl.className   = "feedback";
}

// ──────────────────────────────────────────────
// INPUT HELPERS
// ──────────────────────────────────────────────

function resetInput() {
  dom.answerInput.value    = "";
  dom.answerInput.disabled = false;
  dom.submitBtn.disabled   = false;
  clearSuggestions();
  dom.answerInput.focus();
}

function setInputEnabled(enabled) {
  dom.answerInput.disabled = !enabled;
  dom.submitBtn.disabled   = !enabled;
}

function shakeInput() {
  dom.answerInput.classList.add("shake");
  setTimeout(() => dom.answerInput.classList.remove("shake"), 400);
}

// ──────────────────────────────────────────────
// USED ANSWERS LIST
// ──────────────────────────────────────────────

function renderUsedNames(usedSet) {
  dom.usedList.innerHTML = "";
  if (usedSet.size === 0) {
    dom.usedEmpty.style.display = "";
    return;
  }
  dom.usedEmpty.style.display = "none";
  usedSet.forEach((name) => {
    const li = document.createElement("li");
    li.textContent = name.replace(/\b\w/g, (c) => c.toUpperCase());
    dom.usedList.appendChild(li);
  });
}

// ──────────────────────────────────────────────
// LOADING OVERLAY
// ──────────────────────────────────────────────

function showLoading(show, text) {
  if (text) dom.loadingText.textContent = text;
  dom.loadingOverlay.classList.toggle("hidden", !show);
}

function setLoadingText(text) {
  dom.loadingText.textContent = text;
}

// ──────────────────────────────────────────────
// DEV MODE PANEL
// ──────────────────────────────────────────────

function renderDevAnswers(rowAnswers, selectedRoundId) {
  if (!dom.devPanel) return;
  dom.devPanel.classList.remove("hidden");
  const list = dom.devPanel.querySelector(".dev-answers__list");
  if (!list) return;

  list.innerHTML = "";

  if (!rowAnswers || rowAnswers.length === 0) {
    const li = document.createElement("li");
    li.textContent = "(no active rounds)";
    li.style.fontStyle = "italic";
    list.appendChild(li);
    return;
  }

  rowAnswers.forEach(({ round, answers }) => {
    // Section heading for this row
    const heading = document.createElement("li");
    const isSelected = round.id === selectedRoundId;
    heading.style.cssText = [
      "font-weight: 700",
      "font-size: 0.75rem",
      "text-transform: uppercase",
      "letter-spacing: 0.5px",
      "margin-top: 8px",
      `color: ${isSelected ? "#38bdf8" : "#94a3b8"}`,
      "list-style: none",
    ].join(";");
    heading.textContent = `Row ${round.rowIndex + 1}${ isSelected ? " \u25c4 selected" : ""} — ${answers.length} answer${answers.length !== 1 ? "s" : ""}`;
    list.appendChild(heading);

    if (answers.length === 0) {
      const li = document.createElement("li");
      li.textContent = "(none found)";
      li.style.fontStyle = "italic";
      list.appendChild(li);
    } else {
      answers.forEach((name) => {
        const li = document.createElement("li");
        li.textContent = name;
        list.appendChild(li);
      });
    }
  });
}

function hideDevPanel() {
  if (dom.devPanel) dom.devPanel.classList.add("hidden");
}

// ──────────────────────────────────────────────
// GAME OVER MODAL
// ──────────────────────────────────────────────

/**
 * Show the game-over modal with the player's final score and best score.
 * @param {number} score
 * @param {number} highScore
 */
function showGameOver(score, highScore) {
  if (!dom.gameOverOverlay) return;
  dom.gameOverScore.textContent     = score;
  dom.gameOverHighScore.textContent = highScore;
  dom.gameOverOverlay.classList.remove("hidden");
}

/** Hide the game-over modal. */
function hideGameOver() {
  if (dom.gameOverOverlay) dom.gameOverOverlay.classList.add("hidden");
}

// ──────────────────────────────────────────────
// AUTOCOMPLETE DROPDOWN
// ──────────────────────────────────────────────

/**
 * Render suggestion items into the autocomplete dropdown.
 * Highlights matched characters using <strong> tags.
 *
 * @param {Array<{ item, score, indices }>} matches
 */
function renderSuggestions(matches) {
  dom.autocompleteList.innerHTML = "";
  resetAcHighlight();

  if (matches.length === 0) {
    dom.autocompleteList.classList.remove("open");
    return;
  }

  matches.forEach((match, idx) => {
    const li = document.createElement("li");
    li.classList.add("autocomplete-item");
    li.setAttribute("role", "option");
    li.dataset.index = idx;

    const name          = match.item.name;
    const highlightSet  = new Set(match.indices);
    let i = 0;

    while (i < name.length) {
      const isHL = highlightSet.has(i);
      let run    = name[i];
      i++;
      while (i < name.length && highlightSet.has(i) === isHL) {
        run += name[i];
        i++;
      }
      if (isHL) {
        const strong = document.createElement("strong");
        strong.textContent = run;
        li.appendChild(strong);
      } else {
        li.appendChild(document.createTextNode(run));
      }
    }

    li.addEventListener("click", () => selectSuggestion(match.item.name));
    dom.autocompleteList.appendChild(li);
  });

  dom.autocompleteList.classList.add("open");
}

/** Put the chosen name into the input and close the dropdown. */
function selectSuggestion(name) {
  dom.answerInput.value = name;
  clearSuggestions();
  dom.answerInput.focus();
}

/** Hide and empty the dropdown. */
function clearSuggestions() {
  dom.autocompleteList.innerHTML = "";
  dom.autocompleteList.classList.remove("open");
  resetAcHighlight();
}

/** Toggle the `.highlighted` class on suggestion items. */
function updateHighlight(idx) {
  const items = dom.autocompleteList.querySelectorAll(".autocomplete-item");
  items.forEach((li, i) => li.classList.toggle("highlighted", i === idx));
  if (idx >= 0 && items[idx]) {
    items[idx].scrollIntoView({ block: "nearest" });
  }
}

/** Returns true if the dropdown is currently open. */
function isSuggestionsOpen() {
  return dom.autocompleteList.classList.contains("open");
}

/**
 * Get the display name of a suggestion at a given index.
 * @param {number} idx
 * @returns {string|null}
 */
function getSuggestionName(idx) {
  const items = dom.autocompleteList.querySelectorAll(".autocomplete-item");
  return items[idx]?.textContent || null;
}

// ──────────────────────────────────────────────
// TOPIC SWITCHER DROPDOWN
// ──────────────────────────────────────────────

/** Football-only mode: render a single locked topic option when present. */
function renderTopicSelect(currentKey) {
  if (!dom.topicSelect) return;

  dom.topicSelect.innerHTML = "";
  const opt = document.createElement("option");
  opt.value = "Football";
  opt.textContent = "⚽ Football";
  opt.selected = currentKey === "Football";
  dom.topicSelect.appendChild(opt);
  dom.topicSelect.disabled = true;
}

// ──────────────────────────────────────────────
// EXPORT — public surface consumed by engine.js / main.js
// ──────────────────────────────────────────────

/**
 * `ui` is a plain object acting as a namespace.
 * engine.js calls `ui.renderStack(...)`, `ui.showFeedback(...)`, etc.
 */
const ui = {
  dom,

  // Topic
  applyTopicUI,
  renderTopicSelect,

  // Stack
  renderStack,

  // Scores
  updateScore,
  updateHighScore,
  updatePointsDisplay,

  // Status
  updateStatusBar,
  updateLastFetched,
  updateSeasonBadge,
  setRefreshEnabled,
  updateStorageDebug,

  // Feedback
  showFeedback,
  clearFeedback,

  // Input
  resetInput,
  setInputEnabled,
  shakeInput,

  // Used names
  renderUsedNames,

  // Loading
  showLoading,
  setLoadingText,

  // Dev
  renderDevAnswers,
  hideDevPanel,

  // Game over
  showGameOver,
  hideGameOver,

  // Autocomplete
  renderSuggestions,
  selectSuggestion,
  clearSuggestions,
  updateHighlight,
  isSuggestionsOpen,
  getSuggestionName,
};
