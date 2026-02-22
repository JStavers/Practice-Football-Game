/* ============================================================
   topics.js - Quiz Datasets (Football-only)
   ============================================================ */

const TOPIC_FOOTBALL = {
  topicKey: "Football",
  topicName: "Football",
  icon: "?",
  placeholder: "Type a player's name...",
  usedLabel: "Players Used",

  categories: ["position", "league", "country"],

  categoryLabels: {
    position: "Position",
    league: "League",
    country: "Country",
  },

  categoryColors: {
    position: "position",
    league: "league",
    country: "country",
  },

  difficultyKey: "league",

  multipliers: {
    "premier league": 1,
    "la liga": 1.2,
    "serie a": 1.3,
    "bundesliga": 1.3,
    "ligue 1": 1.5,
    "mls": 2,
    "eredivisie": 1.8,
    "liga portugal": 1.8,
    "saudi pro league": 1.6,
    "scottish premiership": 2.2,
  },

  // Live data comes from API-Football when enabled.
  data: [],
};

const TOPICS = {
  Football: TOPIC_FOOTBALL,
};
