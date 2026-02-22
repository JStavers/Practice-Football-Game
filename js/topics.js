/* ============================================================
   topics.js - Quiz Datasets (Football-only)
   ============================================================ */

const TOPIC_FOOTBALL = {
  topicKey: "Football",
  topicName: "The Lineup: Football Edition",
  icon: "⚽",
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

  // Extra scoring control for Football-only dynamic round difficulty.
  categoryDifficulty: {
    league: {
      // Chance to show specific team instead of league name.
      teamChance: 0.4,
      leagueFactor: 1.0,
      teamFactor: 1.55,
    },
    position: {
      // Chance to show specific position instead of broad role.
      specificChance: 0.5,
      groupFactor: 0.9,
      specificFactor: 1.25,
    },
  },

  // Optional value-level multipliers for football position/role values.
  positionMultipliers: {
    goalkeeper: 1.0,
    "centre-back": 1.15,
    "full-back": 1.1,
    "wing-back": 1.15,
    "defensive midfielder": 1.2,
    "central midfielder": 1.2,
    "attacking midfielder": 1.3,
    winger: 1.3,
    striker: 1.35,
    defender: 1.05,
    midfielder: 1.1,
    attacker: 1.2,
  },

  // Live data comes from API-Football when enabled.
  data: [],
};

const TOPICS = {
  Football: TOPIC_FOOTBALL,
};
