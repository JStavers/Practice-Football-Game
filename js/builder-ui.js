/* ============================================================
   builder-ui.js  —  All DOM rendering for the Topic Builder
   ============================================================
   Reads from `state` (defined in builder.js) and wires every
   input element back to the state mutation functions.

   Never owns data — only reflects state into the DOM.
   ============================================================ */

"use strict";

/* -- DOM references ------------------------------------------- */
const dom = {
  /* Meta inputs */
  metaKey:          document.getElementById("meta-key"),
  metaName:         document.getElementById("meta-name"),
  metaIcon:         document.getElementById("meta-icon"),
  metaPlaceholder:  document.getElementById("meta-placeholder"),
  metaUsedLabel:    document.getElementById("meta-used-label"),
  metaDiffKey:      document.getElementById("meta-difficulty-key"),
  metaDesc:         document.getElementById("meta-desc"),

  /* Lists */
  categoryList:     document.getElementById("category-list"),
  weightContainer:  document.getElementById("weights-container"),
  itemList:         document.getElementById("item-list"),

  /* Buttons */
  addCategoryBtn:   document.getElementById("add-category-btn"),
  addWeightBtn:     document.getElementById("add-weight-btn"),
  addItemBtn:       document.getElementById("add-item-btn"),

  /* Preview */
  jsonCode:         document.getElementById("json-code"),
  jsonPreview:      document.getElementById("json-preview"),
  copyBtn:          document.getElementById("copy-btn"),
  exportBtn:        document.getElementById("export-btn"),
  toast:            document.getElementById("toast"),

  /* Validation */
  validationBox:    document.getElementById("validation-box"),

  /* API Config (Section 5) */
  apiEnabled:       document.getElementById("api-enabled"),
  apiFields:        document.getElementById("api-fields"),
  apiProvider:      document.getElementById("api-provider"),
  apiSeason:        document.getElementById("api-season"),
  apiKey:           document.getElementById("api-key"),
  apiLeagueList:    document.getElementById("api-league-list"),
  apiLeaguesSelectAll: document.getElementById("api-leagues-select-all"),
  apiLeaguesClearAll:  document.getElementById("api-leagues-clear-all"),
  apiLeaguesCount:     document.getElementById("api-leagues-count"),
  apiSaveStatus:       document.getElementById("api-save-status"),
  /* Editor actions */
  saveTopicBtn:     document.getElementById("save-topic-btn"),

  /* Dirty banner */
  dirtyBanner:      document.getElementById("dirty-banner"),

  /* Preview collapse */
  previewCollapseBtn: document.getElementById("preview-collapse-btn"),
};

const KNOWN_API_FOOTBALL_LEAGUES = [
  { id: 39,  name: "Premier League" },
  { id: 140, name: "La Liga" },
  { id: 135, name: "Serie A" },
  { id: 78,  name: "Bundesliga" },
  { id: 61,  name: "Ligue 1" },
  { id: 253, name: "MLS" },
  { id: 94,  name: "Primeira Liga" },
  { id: 88,  name: "Eredivisie" },
  { id: 144, name: "Pro League (Belgium)" },
  { id: 203, name: "Super Lig" },
  { id: 307, name: "Saudi Pro League" },
];

function getLeagueOptions(selectedIds = []) {
  const map = new Map(KNOWN_API_FOOTBALL_LEAGUES.map((league) => [league.id, league.name]));
  selectedIds.forEach((id) => {
    if (!map.has(id)) map.set(id, `League ${id}`);
  });

  return Array.from(map.entries())
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function renderLeagueOptions(selectedIds = []) {
  const host = dom.apiLeagueList;
  if (!host) return;

  const selected = new Set(selectedIds.map(Number));
  const options = getLeagueOptions(Array.from(selected));

  host.innerHTML = options.map((opt) => {
    const checked = selected.has(opt.id) ? "checked" : "";
    return `
      <label class="league-option">
        <input type="checkbox" class="league-option__checkbox" data-league-id="${opt.id}" ${checked} />
        <span class="league-option__text">${escHtml(opt.name)} <em>(ID ${opt.id})</em></span>
      </label>
    `;
  }).join("");

  if (dom.apiLeaguesCount) {
    dom.apiLeaguesCount.textContent = `${selected.size} selected`;
  }
}

function getAllKnownLeagueIds() {
  return KNOWN_API_FOOTBALL_LEAGUES.map((league) => league.id);
}

function setSaveStatus(message) {
  if (!dom.apiSaveStatus) return;
  dom.apiSaveStatus.textContent = message;
}

/* ============================================================
   RENDER — top-level render function
   Called by onStateChange() after every state mutation.
   ============================================================ */

/**
 * Re-renders the entire UI to match current state.
 * Also syncs meta input values (needed after loadTopicIntoEditor).
 */
function render() {
  syncMetaInputs();
  renderDifficultySelect();
  renderCategoryList();
  renderWeights();
  renderItemList();
  renderApiConfig();
  renderPreview();
}

// Wire the state change hook defined in builder.js to our render function.
// From this point on, any state mutation automatically triggers render().
onStateChange = () => {
  if (!_suppressDirty) markDirty();
  render();
};

/**
 * Force Football-only builder mode and lock non-API fields.
 */
function bootstrapFootballOnlyMode() {
  let footballTopic = null;

  try {
    const saved = loadSavedTopics();
    if (Array.isArray(saved)) {
      footballTopic = saved.find((t) => t && t.topicKey === "Football") || null;
    }
  } catch {
    footballTopic = null;
  }

  if (!footballTopic && typeof TOPICS !== "undefined") {
    footballTopic = TOPICS.Football || null;
  }

  if (footballTopic) {
    _suppressDirty = true;
    loadTopicIntoEditor(footballTopic);
    _suppressDirty = false;
    clearDirty();
  }

  const lock = (el) => {
    if (!el) return;
    el.readOnly = true;
    el.disabled = true;
  };

  lock(dom.metaKey);
  lock(dom.metaName);
  lock(dom.metaIcon);
  lock(dom.metaPlaceholder);
  lock(dom.metaUsedLabel);
  lock(dom.metaDesc);
  lock(dom.metaDiffKey);
}


/* ============================================================
   META SYNC — write state values into inputs
   Called at start of render() so loadTopicIntoEditor() changes
   are reflected without the user having to re-focus inputs.
   ============================================================ */

/**
 * Syncs all meta input DOM values from state.
 * Only updates inputs that are not currently focused.
 */
function syncMetaInputs() {
  const m = state.meta;
  const els = [
    [dom.metaKey,         m.topicKey],
    [dom.metaName,        m.topicName],
    [dom.metaIcon,        m.icon],
    [dom.metaPlaceholder, m.placeholder],
    [dom.metaUsedLabel,   m.usedLabel],
    [dom.metaDesc,        m.description],
  ];
  els.forEach(([el, val]) => {
    if (el && document.activeElement !== el) {
      el.value = val ?? "";
    }
  });
}

/* ============================================================
   DIRTY TRACKING
   ============================================================ */

let _isDirty = false;
let _suppressDirty = false; // Set true during load operations to avoid false dirty state

/**
 * Shows the unsaved-changes banner.
 */
function markDirty() {
  _isDirty = true;
  if (dom.dirtyBanner) dom.dirtyBanner.classList.remove("hidden");
  setSaveStatus("Unsaved changes.");
}

/**
 * Hides the unsaved-changes banner.
 */
function clearDirty() {
  _isDirty = false;
  if (dom.dirtyBanner) dom.dirtyBanner.classList.add("hidden");
}

/* ============================================================
   COLLAPSIBLE SECTIONS
   ============================================================ */

/**
 * Wires all .section-toggle buttons for collapsible sections.
 * Uses event delegation on the form container.
 */
function initCollapsibleSections() {
  document.querySelectorAll(".section-toggle").forEach(btn => {
    btn.addEventListener("click", () => {
      const expanded = btn.getAttribute("aria-expanded") === "true";
      const body = btn.nextElementSibling; // .section-body immediately follows
      if (!body) return;

      if (expanded) {
        btn.setAttribute("aria-expanded", "false");
        body.classList.add("section-body--collapsed");
      } else {
        btn.setAttribute("aria-expanded", "true");
        body.classList.remove("section-body--collapsed");
      }
    });
  });
}

/* ============================================================
   PREVIEW COLLAPSE
   ============================================================ */

/**
 * Wires the preview panel collapse button.
 */
function initPreviewCollapse() {
  const btn = dom.previewCollapseBtn;
  if (!btn) return;

  btn.addEventListener("click", () => {
    const expanded = btn.getAttribute("aria-expanded") === "true";
    const preview = dom.jsonPreview;
    if (!preview) return;

    if (expanded) {
      btn.setAttribute("aria-expanded", "false");
      preview.classList.add("preview-collapsed");
    } else {
      btn.setAttribute("aria-expanded", "true");
      preview.classList.remove("preview-collapsed");
    }
  });
}

/* ============================================================
   META INPUTS — bind each input to updateMeta()
   ============================================================ */


dom.metaKey.addEventListener("input", e =>
  updateMeta("topicKey", e.target.value.trim())
);

dom.metaName.addEventListener("input", e =>
  updateMeta("topicName", e.target.value)
);

dom.metaIcon.addEventListener("input", e =>
  updateMeta("icon", e.target.value.trim())
);

dom.metaPlaceholder.addEventListener("input", e =>
  updateMeta("placeholder", e.target.value)
);

dom.metaUsedLabel.addEventListener("input", e =>
  updateMeta("usedLabel", e.target.value)
);

dom.metaDesc.addEventListener("input", e =>
  updateMeta("description", e.target.value)
);

dom.metaDiffKey.addEventListener("change", e =>
  updateMeta("difficultyKey", e.target.value)
);

/* ============================================================
   BUTTONS — add category / weight / item
   ============================================================ */

dom.addCategoryBtn.addEventListener("click", addCategory);
dom.addWeightBtn.addEventListener("click", addWeight);
dom.addItemBtn.addEventListener("click", addItem);

/* ============================================================
   DIFFICULTY SELECT — rebuild options from current categories
   ============================================================ */

/**
 * Rebuilds the <select> options for the difficulty key field.
 * Keeps the current selection if it still exists.
 */
function renderDifficultySelect() {
  const select = dom.metaDiffKey;
  const currentVal = state.meta.difficultyKey;

  // Clear and rebuild
  select.innerHTML = `<option value="">— none —</option>`;

  state.categories.forEach(cat => {
    const key = labelToKey(cat.label);
    if (!key) return; // skip unnamed categories
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = cat.label || key;
    if (key === currentVal) opt.selected = true;
    select.appendChild(opt);
  });
}

/* ============================================================
   CATEGORY LIST
   ============================================================ */

/**
 * Re-renders the full category list.
 */
function renderCategoryList() {
  const list = dom.categoryList;
  list.innerHTML = "";

  if (state.categories.length === 0) {
    list.innerHTML = `<li class="form-hint" style="padding:4px 0;">
      No categories yet. Click "+ Add Category" to add one.</li>`;
    return;
  }

  state.categories.forEach((cat, index) => {
    const li = createCategoryRow(cat, index);
    list.appendChild(li);
  });

  // Activate drag-and-drop on the new elements
  activateCategoryDrag();
}

/**
 * Creates a single category list item element.
 * @param {{ id: string, label: string }} cat
 * @param {number} index
 * @returns {HTMLLIElement}
 */
function createCategoryRow(cat, index) {
  const key = labelToKey(cat.label);

  const li = document.createElement("li");
  li.className = "category-row";
  li.dataset.id = cat.id;
  li.dataset.index = index;
  li.draggable = true;

  li.innerHTML = `
    <span class="drag-handle" title="Drag to reorder">?</span>
    <input
      class="category-row__label-input"
      type="text"
      placeholder="e.g. Position"
      value="${escHtml(cat.label)}"
      aria-label="Category label"
    />
    <span class="category-row__key">${escHtml(key) || "…"}</span>
    <button class="btn btn--danger" title="Remove category" aria-label="Remove category">?</button>
  `;

  // Label change
  li.querySelector(".category-row__label-input").addEventListener("input", e => {
    updateCategoryLabel(cat.id, e.target.value);
  });

  // Delete
  li.querySelector(".btn--danger").addEventListener("click", () => {
    removeCategory(cat.id);
  });

  return li;
}

/* -- Category drag-and-drop ----------------------------------- */

/** Tracks which item is being dragged. */
let dragSrcIndex = null;

/**
 * Attaches drag events to every .category-row inside the list.
 */
function activateCategoryDrag() {
  const rows = dom.categoryList.querySelectorAll(".category-row");

  rows.forEach(row => {
    row.addEventListener("dragstart", e => {
      dragSrcIndex = Number(row.dataset.index);
      row.classList.add("dragging");
      // Required for Firefox
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", dragSrcIndex);
    });

    row.addEventListener("dragend", () => {
      row.classList.remove("dragging");
      dom.categoryList.querySelectorAll(".category-row").forEach(r =>
        r.classList.remove("drag-over")
      );
    });

    row.addEventListener("dragover", e => {
      e.preventDefault(); // allow drop
      e.dataTransfer.dropEffect = "move";
      // Highlight the hovered target
      dom.categoryList.querySelectorAll(".category-row").forEach(r =>
        r.classList.remove("drag-over")
      );
      row.classList.add("drag-over");
    });

    row.addEventListener("drop", e => {
      e.preventDefault();
      const toIndex = Number(row.dataset.index);
      if (dragSrcIndex !== null && dragSrcIndex !== toIndex) {
        reorderCategories(dragSrcIndex, toIndex);
      }
    });
  });
}

/* ============================================================
   WEIGHTS
   ============================================================ */

/**
 * Re-renders the difficulty weights section.
 */
function renderWeights() {
  const container = dom.weightContainer;
  container.innerHTML = "";

  if (state.weights.length === 0) {
    container.innerHTML = `<p class="form-hint">
      No weights added. Click "+ Add Weight" to define a difficulty multiplier.</p>`;
    return;
  }

  state.weights.forEach(w => {
    container.appendChild(createWeightRow(w));
  });
}

/**
 * Creates a single weight row element.
 * @param {{ id: string, value: string, multiplier: string }} w
 * @returns {HTMLDivElement}
 */
function createWeightRow(w) {
  const div = document.createElement("div");
  div.className = "weight-row";
  div.dataset.id = w.id;

  div.innerHTML = `
    <input
      class="weight-row__value"
      type="text"
      placeholder="e.g. Premier League"
      value="${escHtml(w.value)}"
      aria-label="Difficulty value"
    />
    <span class="weight-row__mult-label">×</span>
    <input
      class="weight-row__multiplier"
      type="number"
      min="0.1"
      step="0.1"
      placeholder="1"
      value="${escHtml(w.multiplier)}"
      aria-label="Point multiplier"
    />
    <button class="btn btn--danger" title="Remove weight" aria-label="Remove weight">?</button>
  `;

  div.querySelector(".weight-row__value").addEventListener("input", e =>
    updateWeight(w.id, "value", e.target.value)
  );

  div.querySelector(".weight-row__multiplier").addEventListener("input", e =>
    updateWeight(w.id, "multiplier", e.target.value)
  );

  div.querySelector(".btn--danger").addEventListener("click", () =>
    removeWeight(w.id)
  );

  return div;
}

/* ============================================================
   DATA ITEM LIST
   ============================================================ */

/**
 * Re-renders the full data item list.
 */
function renderItemList() {
  const list = dom.itemList;
  list.innerHTML = "";

  // Check whether all items are API-sourced
  const apiItems = state.items.filter(i => i._fromApi);
  const hasApiItems = apiItems.length > 0;

  if (state.items.length === 0) {
    if (state.apiConfig.enabled) {
      list.innerHTML = `<li class="form-hint" style="padding:8px 0;">
        ?? No cached API data yet — save the topic and click <strong>?? Refresh</strong>
        in the quiz to fetch live data. It will appear here next time you open the topic.</li>`;
    } else {
      list.innerHTML = `<li class="form-hint" style="padding:4px 0;">
        No items yet. Click "+&nbsp;Add Item" to add an entry.</li>`;
    }
    return;
  }

  if (hasApiItems) {
    const banner = document.createElement("li");
    banner.className = "form-hint";
    banner.style.cssText = "padding:8px 0; color: var(--clr-accent, #4ade80);";
    banner.innerHTML = `? Showing <strong>${apiItems.length}</strong> players fetched from the API
      (read-only — managed by the live data config above).`;
    list.appendChild(banner);
  }

  state.items.forEach((item, index) => {
    const li = item._fromApi
      ? createApiItemCard(item, index)
      : createItemCard(item, index);
    list.appendChild(li);
  });

  // Activate drag-and-drop only on manually-added cards
  if (state.items.some(i => !i._fromApi)) activateItemDrag();
}

/**
 * Creates a read-only card for an API-sourced item.
 * @param {{ id: string, name: string, attrs: object }} item
 * @param {number} index
 * @returns {HTMLLIElement}
 */
function createApiItemCard(item, index) {
  const li = document.createElement("li");
  li.className = "item-card item-card--api";
  li.dataset.id = item.id;

  const attrPills = Object.entries(item.attrs)
    .map(([k, v]) => `<span class="api-item__pill"><em>${escHtml(k)}:</em> ${escHtml(v)}</span>`)
    .join(" ");

  li.innerHTML = `
    <div class="item-card__header">
      <span class="item-card__number" style="opacity:0.5;">#${index + 1}</span>
      <strong class="api-item__name">${escHtml(item.name)}</strong>
    </div>
    <div class="api-item__attrs">${attrPills}</div>
  `;

  return li;
}

/**
 * Creates a single data item card element.
 * @param {{ id: string, name: string, attrs: object }} item
 * @param {number} index
 * @returns {HTMLLIElement}
 */
function createItemCard(item, index) {
  const li = document.createElement("li");
  li.className = "item-card";
  li.dataset.id = item.id;
  li.dataset.index = index;
  li.draggable = true;

  /* -- Header -- */
  const header = document.createElement("div");
  header.className = "item-card__header";
  header.innerHTML = `
    <span class="drag-handle" title="Drag to reorder">?</span>
    <span class="item-card__number">Item ${index + 1}</span>
    <button class="btn btn--danger" title="Remove item" aria-label="Remove item ${index + 1}">?</button>
  `;
  header.querySelector(".btn--danger").addEventListener("click", () =>
    removeItem(item.id)
  );

  /* -- Body -- */
  const body = document.createElement("div");
  body.className = "item-card__body";

  /* Name field */
  const nameField = document.createElement("div");
  nameField.className = "item-field";
  nameField.innerHTML = `
    <label class="item-field__label">Name <span class="required">*</span></label>
    <input
      class="item-field__input"
      type="text"
      placeholder="e.g. Lionel Messi"
      value="${escHtml(item.name)}"
      aria-label="Item name"
    />
  `;
  nameField.querySelector("input").addEventListener("input", e =>
    updateItemName(item.id, e.target.value)
  );

  /* Attribute fields (one per category) */
  const attrsGrid = document.createElement("div");
  attrsGrid.className = "item-card__attrs";

  state.categories.forEach(cat => {
    const key  = labelToKey(cat.label);
    const val  = item.attrs[key] ?? "";
    const label = cat.label || key || "…";

    const field = document.createElement("div");
    field.className = "item-field";
    field.innerHTML = `
      <label class="item-field__label">${escHtml(label)} <span class="required">*</span></label>
      <input
        class="item-field__input"
        type="text"
        placeholder="${escHtml(label)}"
        value="${escHtml(val)}"
        aria-label="${escHtml(label)} for item ${index + 1}"
        data-cat="${escHtml(key)}"
      />
    `;
    field.querySelector("input").addEventListener("input", e =>
      updateItemAttr(item.id, key, e.target.value)
    );

    attrsGrid.appendChild(field);
  });

  body.appendChild(nameField);
  if (state.categories.length > 0) body.appendChild(attrsGrid);

  li.appendChild(header);
  li.appendChild(body);
  return li;
}

/* -- Item drag-and-drop --------------------------------------- */

let itemDragSrcIndex = null;

/**
 * Attaches drag events to every .item-card inside the list.
 */
function activateItemDrag() {
  const cards = dom.itemList.querySelectorAll(".item-card");

  cards.forEach(card => {
    // Only start drag from the handle to avoid conflicts with inputs
    const handle = card.querySelector(".drag-handle");

    handle.addEventListener("mousedown", () => {
      card.draggable = true;
    });

    card.addEventListener("dragstart", e => {
      itemDragSrcIndex = Number(card.dataset.index);
      card.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", itemDragSrcIndex);
    });

    card.addEventListener("dragend", () => {
      card.classList.remove("dragging");
      dom.itemList.querySelectorAll(".item-card").forEach(c =>
        c.classList.remove("drag-over")
      );
    });

    card.addEventListener("dragover", e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      dom.itemList.querySelectorAll(".item-card").forEach(c =>
        c.classList.remove("drag-over")
      );
      card.classList.add("drag-over");
    });

    card.addEventListener("drop", e => {
      e.preventDefault();
      const toIndex = Number(card.dataset.index);
      if (itemDragSrcIndex !== null && itemDragSrcIndex !== toIndex) {
        reorderItems(itemDragSrcIndex, toIndex);
      }
    });
  });
}

/* ============================================================
   PREVIEW — live JSON with syntax highlighting
   ============================================================ */

/**
 * Rebuilds the JSON preview from current state.
 * Called on every render().
 */
function renderPreview() {
  // builder-export.js builds the raw object; we just pretty-print it.
  try {
    const obj   = buildTopicObject(); // defined in builder-export.js
    const json  = JSON.stringify(obj, null, 2);
    dom.jsonCode.innerHTML = syntaxHighlight(json);
  } catch (err) {
    dom.jsonCode.textContent = `// Fill in the form to see a preview.\n// (${err.message})`;
  }
}

/**
 * Adds simple span-based syntax highlighting to a JSON string.
 * Returns an HTML string safe to set as innerHTML on a <code> element.
 * @param {string} json
 * @returns {string}
 */
function syntaxHighlight(json) {
  // Escape HTML first, then wrap token types in coloured spans
  return escHtml(json).replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(\.\d+)?([eE][+-]?\d+)?)/g,
    match => {
      let cls = "j-num";
      if (/^"/.test(match)) {
        cls = match.endsWith(":") ? "j-key" : "j-str";
      } else if (/true|false/.test(match)) {
        cls = "j-bool";
      } else if (/null/.test(match)) {
        cls = "j-null";
      }
      return `<span class="${cls}">${match}</span>`;
    }
  );
}

/* ============================================================
   VALIDATION UI
   ============================================================ */

/**
 * Shows a list of validation error messages in the validation box.
 * Pass an empty array to hide the box.
 * @param {string[]} errors
 */
function showValidationErrors(errors) {
  const box = dom.validationBox;
  if (errors.length === 0) {
    box.classList.add("hidden");
    box.innerHTML = "";
    return;
  }

  const items = errors.map(e => `<li>${escHtml(e)}</li>`).join("");
  box.innerHTML = `<strong>Please fix the following:</strong><ul>${items}</ul>`;
  box.classList.remove("hidden");
  box.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

/* ============================================================
   TOAST
   ============================================================ */

let _toastTimer = null;

/**
 * Briefly shows a toast notification at the bottom of the preview.
 * @param {string} message
 * @param {"success"|"error"} [type="success"]
 */
function showToast(message, type = "success") {
  const toast = dom.toast;
  toast.textContent = message;
  toast.className = `toast${type === "error" ? " error" : ""}`;
  toast.classList.remove("hidden");

  // Auto-hide after 2.5 s
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => {
    toast.classList.add("hidden");
  }, 2500);
}

/* ============================================================
   UTILITY
   ============================================================ */

/**
 * Escapes HTML special characters so strings can be safely injected
 * into innerHTML without XSS risk.
 * @param {string} str
 * @returns {string}
 */
function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* ============================================================
   API CONFIG SECTION (Section 5)
   ============================================================ */

/**
 * Syncs the API Config UI elements to match state.apiConfig.
 * Uses a "controlled input" pattern: only writes to the DOM when
 * the input is NOT focused, to avoid clobbering the user's typing.
 */
function renderApiConfig() {
  const cfg = state.apiConfig;

  // Toggle checkbox — always sync
  dom.apiEnabled.checked = cfg.enabled;

  // Show/hide the extra fields
  if (cfg.enabled) {
    dom.apiFields.classList.remove("hidden");
  } else {
    dom.apiFields.classList.add("hidden");
  }

  // Only update the text inputs when they're not being actively edited,
  // to avoid jumping the cursor while the user types.
  if (document.activeElement !== dom.apiProvider) {
    dom.apiProvider.value = cfg.provider;
  }
  if (document.activeElement !== dom.apiSeason) {
    dom.apiSeason.value = cfg.season;
  }
  if (document.activeElement !== dom.apiKey) {
    dom.apiKey.value = cfg.apiKey;
  }
  renderLeagueOptions(cfg.leagues);
}

/* -- API Config event listeners ------------------------------- */

dom.apiEnabled.addEventListener("change", e => {
  updateApiConfig("enabled", e.target.checked);
  if (e.target.checked && (!Array.isArray(state.apiConfig.leagues) || state.apiConfig.leagues.length === 0)) {
    updateApiConfig("leagues", getAllKnownLeagueIds());
  }
});

dom.apiProvider.addEventListener("change", e => {
  updateApiConfig("provider", e.target.value);
});

dom.apiSeason.addEventListener("input", e => {
  updateApiConfig("season", e.target.value);
});

// API Key — update state directly; renderApiConfig skips this field
// when focused so the password input is never force-overwritten.
dom.apiKey.addEventListener("input", e => {
  updateApiConfig("apiKey", e.target.value);
});

// Leagues checklist — persist selected IDs as numeric array
dom.apiLeagueList.addEventListener("change", () => {
  const ids = Array.from(dom.apiLeagueList.querySelectorAll(".league-option__checkbox:checked"))
    .map((el) => Number.parseInt(el.dataset.leagueId, 10))
    .filter((n) => Number.isInteger(n) && n > 0);
  updateApiConfig("leagues", ids);
});

if (dom.apiLeaguesSelectAll) {
  dom.apiLeaguesSelectAll.addEventListener("click", () => {
    updateApiConfig("leagues", getAllKnownLeagueIds());
  });
}

if (dom.apiLeaguesClearAll) {
  dom.apiLeaguesClearAll.addEventListener("click", () => {
    updateApiConfig("leagues", []);
  });
}

/* -- Initial render on page load ------------------------------ */
initCollapsibleSections();
initPreviewCollapse();
bootstrapFootballOnlyMode();
render();

