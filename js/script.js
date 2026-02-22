/* ============================================================
   Football Quiz – Game Logic
   API-Football integration with offline fallback
   Modular · beginner-friendly · ES6+ · async/await
   ============================================================ */

// ──────────────────────────────────────────────
// 0. DEVELOPER TESTING MODE
// ──────────────────────────────────────────────

/**
 * Set to `true` to enable dev helpers:
 *  • Logs all valid answers for the current round to the console.
 *  • Shows a hidden debug panel beneath the modifier cards.
 * Set to `false` before shipping / sharing.
 */
const DEV_MODE = false;

// ──────────────────────────────────────────────
// 1. CONFIGURATION
// ──────────────────────────────────────────────

const CONFIG = {
  /** Base URL for the API-Football v3 endpoint */
  API_BASE: "https://v3.football.api-sports.io",

  /**
   * Leagues to fetch from the API.
   * id = API-Football league id, season = year to query.
   * name = friendly label used in the game.
   */
  LEAGUES_TO_FETCH: [
    { id: 39,  season: 2024, name: "Premier League" },
    { id: 140, season: 2024, name: "La Liga" },
    { id: 135, season: 2024, name: "Serie A" },
    { id: 78,  season: 2024, name: "Bundesliga" },
    { id: 61,  season: 2024, name: "Ligue 1" },
    { id: 253, season: 2024, name: "MLS" },
  ],

  /** Max pages to fetch per league (each page ≈ 20 players) */
  MAX_PAGES_PER_LEAGUE: 3,

  /** Seconds per round */
  ROUND_TIME: 30,

  /** localStorage keys */
  LS_HIGH_SCORE: "footballQuizHighScore",
  LS_PLAYERS:    "footballQuizPlayers",
  LS_API_KEY:    "footballQuizApiKey",
  LS_FETCH_TS:   "footballQuizFetchTimestamp",

  /** Re-fetch from API if cached data is older than this (ms) */
  CACHE_TTL: 24 * 60 * 60 * 1000, // 24 hours

  /** Maximum number of stacked rounds visible at once */
  MAX_ACTIVE_ROUNDS: 5,

  /** Delay (ms) before auto-generating next round after correct answer */
  AUTO_NEXT_DELAY: 1000,
};

/**
 * Depth bonus multipliers — deeper rows award more points.
 * rowIndex 0 (top / newest) = 1×, rowIndex 4 (bottom / oldest) = 3×.
 */
const DEPTH_BONUS = [1, 1.5, 2, 2.5, 3];

/**
 * League difficulty multipliers — less popular = higher multiplier.
 * Used to scale the base points for each round.
 */
const LEAGUE_MULTIPLIERS = {
  "premier league": 1,
  "la liga":        1.2,
  "serie a":       1.3,
  "bundesliga":    1.3,
  "ligue 1":       1.5,
  "mls":           2,
  // Fallback-only leagues (offline data)
  "eredivisie":         1.8,
  "liga portugal":      1.8,
  "saudi pro league":   1.6,
  "scottish premiership": 2.2,
};

// ──────────────────────────────────────────────
// 2. API POSITION MAPPING
// ──────────────────────────────────────────────

/**
 * The API returns generic positions like "Attacker", "Midfielder",
 * "Defender", "Goalkeeper". We map them to our game's positions.
 */
const POSITION_MAP = {
  "attacker":   ["Striker", "Winger"],
  "midfielder": ["Attacking Midfielder", "Central Midfielder", "Defensive Midfielder"],
  "defender":   ["Centre-Back", "Full-Back", "Wing-Back"],
  "goalkeeper": ["Goalkeeper"],
};

/**
 * Pick one of our game positions for a given API position.
 */
function mapApiPosition(apiPos) {
  const options = POSITION_MAP[apiPos.toLowerCase()];
  if (!options) return apiPos; // fallback: use raw value
  return options[Math.floor(Math.random() * options.length)];
}

// ──────────────────────────────────────────────
// 3. FALLBACK PLAYER DATABASE (offline mode)
// ──────────────────────────────────────────────

/**
 * Built-in sample data so the game works without an API key.
 * Each entry: { id, firstName, lastName, fullName, searchName, position, league, country }
 * For single-name players, lastName is null and fullName equals firstName.
 */
const FALLBACK_PLAYERS = [
  // ── Premier League ──
  { id: 1,  firstName: "Richarlison",     lastName: null,              fullName: "Richarlison",            searchName: "richarlison",            position: "Striker",              league: "Premier League", country: "Brazil" },
  { id: 2,  firstName: "Gabriel",         lastName: "Jesus",           fullName: "Gabriel Jesus",           searchName: "gabriel jesus",           position: "Striker",              league: "Premier League", country: "Brazil" },
  { id: 3,  firstName: "Harry",           lastName: "Kane",            fullName: "Harry Kane",              searchName: "harry kane",              position: "Striker",              league: "Premier League", country: "England" },
  { id: 4,  firstName: "Ivan",            lastName: "Toney",           fullName: "Ivan Toney",              searchName: "ivan toney",              position: "Striker",              league: "Premier League", country: "England" },
  { id: 5,  firstName: "Ollie",           lastName: "Watkins",         fullName: "Ollie Watkins",           searchName: "ollie watkins",           position: "Striker",              league: "Premier League", country: "England" },
  { id: 6,  firstName: "Tammy",           lastName: "Abraham",         fullName: "Tammy Abraham",           searchName: "tammy abraham",           position: "Striker",              league: "Premier League", country: "England" },
  { id: 7,  firstName: "Julian",          lastName: "Alvarez",         fullName: "Julian Alvarez",          searchName: "julian alvarez",          position: "Striker",              league: "Premier League", country: "Argentina" },
  { id: 8,  firstName: "Alexandre",       lastName: "Lacazette",       fullName: "Alexandre Lacazette",     searchName: "alexandre lacazette",     position: "Striker",              league: "Premier League", country: "France" },
  { id: 9,  firstName: "Antony",          lastName: null,              fullName: "Antony",                  searchName: "antony",                  position: "Winger",               league: "Premier League", country: "Brazil" },
  { id: 10, firstName: "Raphinha",        lastName: null,              fullName: "Raphinha",                searchName: "raphinha",                position: "Winger",               league: "Premier League", country: "Brazil" },
  { id: 11, firstName: "Bukayo",          lastName: "Saka",            fullName: "Bukayo Saka",             searchName: "bukayo saka",             position: "Winger",               league: "Premier League", country: "England" },
  { id: 12, firstName: "Jack",            lastName: "Grealish",        fullName: "Jack Grealish",           searchName: "jack grealish",           position: "Winger",               league: "Premier League", country: "England" },
  { id: 13, firstName: "Raheem",          lastName: "Sterling",        fullName: "Raheem Sterling",         searchName: "raheem sterling",         position: "Winger",               league: "Premier League", country: "England" },
  { id: 14, firstName: "Jarrod",          lastName: "Bowen",           fullName: "Jarrod Bowen",            searchName: "jarrod bowen",            position: "Winger",               league: "Premier League", country: "England" },
  { id: 15, firstName: "Son",             lastName: "Heung-min",       fullName: "Son Heung-min",           searchName: "son heung-min",           position: "Winger",               league: "Premier League", country: "South Korea" },
  { id: 16, firstName: "Hwang",           lastName: "Hee-chan",        fullName: "Hwang Hee-chan",          searchName: "hwang hee-chan",          position: "Winger",               league: "Premier League", country: "South Korea" },
  { id: 17, firstName: "James",           lastName: "Maddison",        fullName: "James Maddison",          searchName: "james maddison",          position: "Attacking Midfielder", league: "Premier League", country: "England" },
  { id: 18, firstName: "Phil",            lastName: "Foden",           fullName: "Phil Foden",              searchName: "phil foden",              position: "Attacking Midfielder", league: "Premier League", country: "England" },
  { id: 19, firstName: "Mason",           lastName: "Mount",           fullName: "Mason Mount",             searchName: "mason mount",             position: "Attacking Midfielder", league: "Premier League", country: "England" },
  { id: 20, firstName: "Lucas",           lastName: "Paqueta",         fullName: "Lucas Paqueta",           searchName: "lucas paqueta",           position: "Attacking Midfielder", league: "Premier League", country: "Brazil" },
  { id: 21, firstName: "Philippe",        lastName: "Coutinho",        fullName: "Philippe Coutinho",       searchName: "philippe coutinho",       position: "Attacking Midfielder", league: "Premier League", country: "Brazil" },
  { id: 22, firstName: "Declan",          lastName: "Rice",            fullName: "Declan Rice",             searchName: "declan rice",             position: "Central Midfielder",   league: "Premier League", country: "England" },
  { id: 23, firstName: "Jordan",          lastName: "Henderson",       fullName: "Jordan Henderson",        searchName: "jordan henderson",        position: "Central Midfielder",   league: "Premier League", country: "England" },
  { id: 24, firstName: "Ryan",            lastName: "Gravenberch",     fullName: "Ryan Gravenberch",        searchName: "ryan gravenberch",        position: "Central Midfielder",   league: "Premier League", country: "Netherlands" },
  { id: 25, firstName: "Casemiro",        lastName: null,              fullName: "Casemiro",                searchName: "casemiro",                position: "Defensive Midfielder", league: "Premier League", country: "Brazil" },
  { id: 26, firstName: "Douglas",         lastName: "Luiz",            fullName: "Douglas Luiz",            searchName: "douglas luiz",            position: "Defensive Midfielder", league: "Premier League", country: "Brazil" },
  { id: 27, firstName: "N'Golo",          lastName: "Kante",           fullName: "N'Golo Kante",            searchName: "n'golo kante",            position: "Defensive Midfielder", league: "Premier League", country: "France" },
  { id: 28, firstName: "Harry",           lastName: "Maguire",         fullName: "Harry Maguire",           searchName: "harry maguire",           position: "Centre-Back",          league: "Premier League", country: "England" },
  { id: 29, firstName: "John",            lastName: "Stones",          fullName: "John Stones",             searchName: "john stones",             position: "Centre-Back",          league: "Premier League", country: "England" },
  { id: 30, firstName: "Marc",            lastName: "Guehi",           fullName: "Marc Guehi",              searchName: "marc guehi",              position: "Centre-Back",          league: "Premier League", country: "England" },
  { id: 31, firstName: "Virgil",          lastName: "van Dijk",        fullName: "Virgil van Dijk",         searchName: "virgil van dijk",         position: "Centre-Back",          league: "Premier League", country: "Netherlands" },
  { id: 32, firstName: "Lisandro",        lastName: "Martinez",        fullName: "Lisandro Martinez",       searchName: "lisandro martinez",       position: "Centre-Back",          league: "Premier League", country: "Argentina" },
  { id: 33, firstName: "Cristian",        lastName: "Romero",          fullName: "Cristian Romero",         searchName: "cristian romero",         position: "Centre-Back",          league: "Premier League", country: "Argentina" },
  { id: 34, firstName: "Trent",           lastName: "Alexander-Arnold", fullName: "Trent Alexander-Arnold", searchName: "trent alexander-arnold",  position: "Full-Back",            league: "Premier League", country: "England" },
  { id: 35, firstName: "Kyle",            lastName: "Walker",          fullName: "Kyle Walker",             searchName: "kyle walker",             position: "Full-Back",            league: "Premier League", country: "England" },
  { id: 36, firstName: "Reece",           lastName: "James",           fullName: "Reece James",             searchName: "reece james",             position: "Full-Back",            league: "Premier League", country: "England" },
  { id: 37, firstName: "Ben",             lastName: "Chilwell",        fullName: "Ben Chilwell",            searchName: "ben chilwell",            position: "Full-Back",            league: "Premier League", country: "England" },
  { id: 38, firstName: "Diogo",           lastName: "Dalot",           fullName: "Diogo Dalot",             searchName: "diogo dalot",             position: "Full-Back",            league: "Premier League", country: "Portugal" },
  { id: 39, firstName: "Marc",            lastName: "Cucurella",       fullName: "Marc Cucurella",          searchName: "marc cucurella",          position: "Full-Back",            league: "Premier League", country: "Spain" },
  { id: 40, firstName: "Alisson",         lastName: null,              fullName: "Alisson",                 searchName: "alisson",                 position: "Goalkeeper",           league: "Premier League", country: "Brazil" },
  { id: 41, firstName: "Ederson",         lastName: null,              fullName: "Ederson",                 searchName: "ederson",                 position: "Goalkeeper",           league: "Premier League", country: "Brazil" },
  { id: 42, firstName: "Jordan",          lastName: "Pickford",        fullName: "Jordan Pickford",         searchName: "jordan pickford",         position: "Goalkeeper",           league: "Premier League", country: "England" },
  { id: 43, firstName: "Aaron",           lastName: "Ramsdale",        fullName: "Aaron Ramsdale",          searchName: "aaron ramsdale",          position: "Goalkeeper",           league: "Premier League", country: "England" },
  { id: 44, firstName: "Dean",            lastName: "Henderson",       fullName: "Dean Henderson",          searchName: "dean henderson",          position: "Goalkeeper",           league: "Premier League", country: "England" },
  { id: 45, firstName: "David",           lastName: "Raya",            fullName: "David Raya",              searchName: "david raya",              position: "Goalkeeper",           league: "Premier League", country: "Spain" },
  { id: 46, firstName: "Robert",          lastName: "Sanchez",         fullName: "Robert Sanchez",          searchName: "robert sanchez",          position: "Goalkeeper",           league: "Premier League", country: "Spain" },

  // ── La Liga ──
  { id: 47, firstName: "Antoine",         lastName: "Griezmann",       fullName: "Antoine Griezmann",       searchName: "antoine griezmann",       position: "Striker",              league: "La Liga", country: "France" },
  { id: 48, firstName: "Alvaro",          lastName: "Morata",          fullName: "Alvaro Morata",           searchName: "alvaro morata",           position: "Striker",              league: "La Liga", country: "Spain" },
  { id: 49, firstName: "Luis",            lastName: "Suarez",          fullName: "Luis Suarez",             searchName: "luis suarez",             position: "Striker",              league: "La Liga", country: "Uruguay" },
  { id: 50, firstName: "Vinicius",        lastName: "Jr",              fullName: "Vinicius Jr",             searchName: "vinicius jr",             position: "Winger",               league: "La Liga", country: "Brazil" },
  { id: 51, firstName: "Rodrygo",         lastName: null,              fullName: "Rodrygo",                 searchName: "rodrygo",                 position: "Winger",               league: "La Liga", country: "Brazil" },
  { id: 52, firstName: "Ferran",          lastName: "Torres",          fullName: "Ferran Torres",           searchName: "ferran torres",           position: "Winger",               league: "La Liga", country: "Spain" },
  { id: 53, firstName: "Lamine",          lastName: "Yamal",           fullName: "Lamine Yamal",            searchName: "lamine yamal",            position: "Winger",               league: "La Liga", country: "Spain" },
  { id: 54, firstName: "Pedri",           lastName: null,              fullName: "Pedri",                   searchName: "pedri",                   position: "Attacking Midfielder", league: "La Liga", country: "Spain" },
  { id: 55, firstName: "Gavi",            lastName: null,              fullName: "Gavi",                    searchName: "gavi",                    position: "Attacking Midfielder", league: "La Liga", country: "Spain" },
  { id: 56, firstName: "Toni",            lastName: "Kroos",           fullName: "Toni Kroos",              searchName: "toni kroos",              position: "Central Midfielder",   league: "La Liga", country: "Germany" },
  { id: 57, firstName: "Dani",            lastName: "Olmo",            fullName: "Dani Olmo",               searchName: "dani olmo",               position: "Central Midfielder",   league: "La Liga", country: "Spain" },
  { id: 58, firstName: "Jules",           lastName: "Kounde",          fullName: "Jules Kounde",            searchName: "jules kounde",            position: "Centre-Back",          league: "La Liga", country: "France" },
  { id: 59, firstName: "Ronald",          lastName: "Araujo",          fullName: "Ronald Araujo",           searchName: "ronald araujo",           position: "Centre-Back",          league: "La Liga", country: "Uruguay" },
  { id: 60, firstName: "Thibaut",         lastName: "Courtois",        fullName: "Thibaut Courtois",        searchName: "thibaut courtois",        position: "Goalkeeper",           league: "La Liga", country: "Belgium" },
  { id: 61, firstName: "Marc-Andre",      lastName: "ter Stegen",      fullName: "Marc-Andre ter Stegen",   searchName: "marc-andre ter stegen",   position: "Goalkeeper",           league: "La Liga", country: "Germany" },

  // ── Serie A ──
  { id: 62, firstName: "Lautaro",         lastName: "Martinez",        fullName: "Lautaro Martinez",        searchName: "lautaro martinez",        position: "Striker",              league: "Serie A", country: "Argentina" },
  { id: 63, firstName: "Victor",          lastName: "Osimhen",         fullName: "Victor Osimhen",          searchName: "victor osimhen",          position: "Striker",              league: "Serie A", country: "Nigeria" },
  { id: 64, firstName: "Romelu",          lastName: "Lukaku",          fullName: "Romelu Lukaku",           searchName: "romelu lukaku",           position: "Striker",              league: "Serie A", country: "Belgium" },
  { id: 65, firstName: "Rafael",          lastName: "Leao",            fullName: "Rafael Leao",             searchName: "rafael leao",             position: "Winger",               league: "Serie A", country: "Portugal" },
  { id: 66, firstName: "Juan",            lastName: "Cuadrado",        fullName: "Juan Cuadrado",           searchName: "juan cuadrado",           position: "Central Midfielder",   league: "Serie A", country: "Colombia" },
  { id: 67, firstName: "Mike",            lastName: "Maignan",         fullName: "Mike Maignan",            searchName: "mike maignan",            position: "Goalkeeper",           league: "Serie A", country: "France" },

  // ── Bundesliga ──
  { id: 68, firstName: "Niclas",          lastName: "Fullkrug",        fullName: "Niclas Fullkrug",         searchName: "niclas fullkrug",         position: "Striker",              league: "Bundesliga", country: "Germany" },
  { id: 69, firstName: "Randal",          lastName: "Kolo Muani",      fullName: "Randal Kolo Muani",       searchName: "randal kolo muani",       position: "Striker",              league: "Bundesliga", country: "France" },
  { id: 70, firstName: "Kingsley",        lastName: "Coman",           fullName: "Kingsley Coman",          searchName: "kingsley coman",          position: "Winger",               league: "Bundesliga", country: "France" },
  { id: 71, firstName: "Jadon",           lastName: "Sancho",          fullName: "Jadon Sancho",            searchName: "jadon sancho",            position: "Winger",               league: "Bundesliga", country: "England" },
  { id: 72, firstName: "Joshua",          lastName: "Kimmich",         fullName: "Joshua Kimmich",          searchName: "joshua kimmich",          position: "Central Midfielder",   league: "Bundesliga", country: "Germany" },
  { id: 73, firstName: "Leon",            lastName: "Goretzka",        fullName: "Leon Goretzka",           searchName: "leon goretzka",           position: "Central Midfielder",   league: "Bundesliga", country: "Germany" },
  { id: 74, firstName: "Ilkay",           lastName: "Gundogan",        fullName: "Ilkay Gundogan",          searchName: "ilkay gundogan",          position: "Central Midfielder",   league: "Bundesliga", country: "Germany" },
  { id: 75, firstName: "Manuel",          lastName: "Neuer",           fullName: "Manuel Neuer",            searchName: "manuel neuer",            position: "Goalkeeper",           league: "Bundesliga", country: "Germany" },

  // ── Ligue 1 ──
  { id: 76, firstName: "Marcus",          lastName: "Thuram",          fullName: "Marcus Thuram",           searchName: "marcus thuram",           position: "Striker",              league: "Ligue 1", country: "France" },
  { id: 77, firstName: "Ousmane",         lastName: "Dembele",         fullName: "Ousmane Dembele",         searchName: "ousmane dembele",         position: "Winger",               league: "Ligue 1", country: "France" },
  { id: 78, firstName: "Lionel",          lastName: "Messi",           fullName: "Lionel Messi",            searchName: "lionel messi",            position: "Attacking Midfielder", league: "Ligue 1", country: "Argentina" },
  { id: 79, firstName: "Idrissa",         lastName: "Gueye",           fullName: "Idrissa Gueye",           searchName: "idrissa gueye",           position: "Central Midfielder",   league: "Ligue 1", country: "Senegal" },
  { id: 80, firstName: "Hugo",            lastName: "Lloris",          fullName: "Hugo Lloris",             searchName: "hugo lloris",             position: "Goalkeeper",           league: "Ligue 1", country: "France" },

  // ── MLS ──
  { id: 81, firstName: "Chicharito",      lastName: null,              fullName: "Chicharito",              searchName: "chicharito",              position: "Striker",              league: "MLS", country: "Mexico" },
  { id: 82, firstName: "Javier",          lastName: "Hernandez",       fullName: "Javier Hernandez",        searchName: "javier hernandez",        position: "Striker",              league: "MLS", country: "Mexico" },
  { id: 83, firstName: "Brenden",         lastName: "Aaronson",        fullName: "Brenden Aaronson",        searchName: "brenden aaronson",        position: "Attacking Midfielder", league: "MLS", country: "USA" },
  { id: 84, firstName: "Weston",          lastName: "McKennie",        fullName: "Weston McKennie",         searchName: "weston mckennie",         position: "Central Midfielder",   league: "MLS", country: "USA" },
  { id: 85, firstName: "Matt",            lastName: "Turner",          fullName: "Matt Turner",             searchName: "matt turner",             position: "Goalkeeper",           league: "MLS", country: "USA" },

  // ── Saudi Pro League ──
  { id: 86, firstName: "Cristiano",       lastName: "Ronaldo",         fullName: "Cristiano Ronaldo",       searchName: "cristiano ronaldo",       position: "Striker",              league: "Saudi Pro League", country: "Portugal" },
  { id: 87, firstName: "Karim",           lastName: "Benzema",         fullName: "Karim Benzema",           searchName: "karim benzema",           position: "Striker",              league: "Saudi Pro League", country: "France" },
  { id: 88, firstName: "Sadio",           lastName: "Mane",            fullName: "Sadio Mane",              searchName: "sadio mane",              position: "Striker",              league: "Saudi Pro League", country: "Senegal" },
  { id: 89, firstName: "Neymar",          lastName: null,              fullName: "Neymar",                  searchName: "neymar",                  position: "Attacking Midfielder", league: "Saudi Pro League", country: "Brazil" },
  { id: 90, firstName: "Luka",            lastName: "Modric",          fullName: "Luka Modric",             searchName: "luka modric",             position: "Central Midfielder",   league: "Saudi Pro League", country: "Croatia" },
  { id: 91, firstName: "Edouard",         lastName: "Mendy",           fullName: "Edouard Mendy",           searchName: "edouard mendy",           position: "Goalkeeper",           league: "Saudi Pro League", country: "Senegal" },

  // ── Eredivisie ──
  { id: 92, firstName: "Brian",           lastName: "Brobbey",         fullName: "Brian Brobbey",           searchName: "brian brobbey",           position: "Striker",              league: "Eredivisie", country: "Netherlands" },

  // ── Liga Portugal ──
  { id: 93, firstName: "Evanilson",       lastName: null,              fullName: "Evanilson",               searchName: "evanilson",               position: "Striker",              league: "Liga Portugal", country: "Brazil" },

  // ── Scottish Premiership ──
  { id: 94, firstName: "Kyogo",           lastName: "Furuhashi",       fullName: "Kyogo Furuhashi",         searchName: "kyogo furuhashi",         position: "Striker",              league: "Scottish Premiership", country: "Japan" },
];

// ──────────────────────────────────────────────
// 4. STATE
// ──────────────────────────────────────────────

const state = {
  /** The active player list (API data or fallback) */
  players: [],

  /** Whether the data came from the live API */
  isLiveData: false,

  /** Game score tracking */
  score: 0,
  highScore: 0,

  /**
   * Stacked rounds — array of round objects:
   * { id, position, league, country, basePoints, rowIndex, createdAt }
   * rowIndex 0 = top (newest), higher = deeper.
   */
  activeRounds: [],

  /** Auto-incrementing id for each round */
  nextRoundId: 1,

  /** The round id the player is currently answering */
  selectedRoundId: null,

  /** Round state */
  answered: false,
  usedNames: new Set(),
  timerInterval: null,
  timeLeft: CONFIG.ROUND_TIME,
};

// ──────────────────────────────────────────────
// 5. DOM REFERENCES
// ──────────────────────────────────────────────

const dom = {
  // Loading & config
  loadingOverlay: document.getElementById("loading-overlay"),
  loadingText:    document.getElementById("loading-text"),
  apiConfig:      document.getElementById("api-config"),
  apiKeyInput:    document.getElementById("api-key-input"),
  apiKeySave:     document.getElementById("api-key-save"),
  apiKeySkip:     document.getElementById("api-key-skip"),

  // Data status
  statusDot:     document.getElementById("status-dot"),
  statusText:    document.getElementById("status-text"),
  playerCount:   document.getElementById("player-count"),

  // Autocomplete
  autocompleteList: document.getElementById("autocomplete-list"),

  // Dev mode
  devPanel: document.getElementById("dev-answers"),

  // Game UI — stacked rounds
  roundStack:      document.getElementById("round-stack"),
  pointsAvailable: document.getElementById("points-available"),
  scoreDisplay:    document.getElementById("score"),
  highScoreDisplay: document.getElementById("high-score"),
  answerForm:      document.getElementById("answer-form"),
  answerInput:     document.getElementById("answer-input"),
  submitBtn:       document.getElementById("submit-btn"),
  feedbackEl:      document.getElementById("feedback"),
  newRoundBtn:     document.getElementById("new-round-btn"),
  timerText:       document.getElementById("timer-text"),
  timerFill:       document.getElementById("timer-fill"),
  timerLabel:      document.querySelector(".timer__label"),
  usedList:        document.getElementById("used-list"),
  usedEmpty:       document.getElementById("used-empty"),
};

// ──────────────────────────────────────────────
// 6. UTILITY HELPERS
// ──────────────────────────────────────────────

/** Pick a random item from an array. */
const randomFrom = (arr) => arr[Math.floor(Math.random() * arr.length)];

/** Normalize a string for comparison (trim + lowercase). */
const normalize = (str) => str.trim().toLowerCase();

/** Safe localStorage get */
function lsGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

/** Safe localStorage set */
function lsSet(key, value) {
  try { localStorage.setItem(key, value); } catch { /* blocked */ }
}

// ──────────────────────────────────────────────
// 6b. AUTOCOMPLETE SYSTEM (fuzzy search)
// ──────────────────────────────────────────────

/**
 * Tracks the currently keyboard-highlighted suggestion index.
 * -1 means no item is highlighted.
 */
let acHighlightIndex = -1;

/** Debounce timer id — prevents filtering on every keystroke. */
let acDebounceTimer = null;

/** The debounce delay in milliseconds. */
const AC_DEBOUNCE_MS = 200;

/** Maximum suggestions to show at once. */
const AC_MAX_RESULTS = 8;

// ── Fuzzy-scoring engine ──────────────────────

/**
 * Calculate a fuzzy-match score between a query and a target string.
 * Returns an object { score, indices } or null if there is no match.
 *
 * Scoring rules (higher = better):
 *   +10  per matched character
 *   +15  bonus if the match starts at position 0 (prefix match)
 *   +8   bonus for each pair of consecutive matched characters
 *   -1   penalty per gap between matched characters
 *   +5   bonus when a matched char is at a word boundary (after space/hyphen)
 *
 * The algorithm walks through the query left-to-right, scanning the target
 * for each character. It tolerates missing characters in the target
 * (basic typo tolerance) by allowing up to 2 consecutive misses.
 *
 * Performance: O(n × m) where n = query length, m = target length.
 * Fast enough for 3 000+ players because both strings are short names.
 *
 * @param {string} query  — normalised user input
 * @param {string} target — normalised player name
 * @returns {{ score: number, indices: number[] } | null}
 */
function fuzzyScore(query, target) {
  const qLen = query.length;
  const tLen = target.length;
  if (qLen === 0) return null;
  if (qLen > tLen) return null; // query can't be longer than target

  const indices = []; // positions in `target` that matched
  let score = 0;
  let tIdx = 0;       // cursor in target
  let consecutiveMisses = 0;
  const MAX_MISSES = 2; // typo tolerance

  for (let qIdx = 0; qIdx < qLen; qIdx++) {
    const qChar = query[qIdx];
    let found = false;

    while (tIdx < tLen) {
      if (target[tIdx] === qChar) {
        // ── Match found ──
        score += 10;

        // Prefix bonus
        if (indices.length === 0 && tIdx === 0) score += 15;

        // Consecutive bonus — previous match was the character right before
        if (indices.length > 0 && tIdx === indices[indices.length - 1] + 1) {
          score += 8;
        }

        // Word-boundary bonus (char after space or hyphen)
        if (tIdx > 0 && (target[tIdx - 1] === " " || target[tIdx - 1] === "-")) {
          score += 5;
        }

        // Gap penalty — distance from last match
        if (indices.length > 0) {
          const gap = tIdx - indices[indices.length - 1] - 1;
          score -= gap;
        }

        indices.push(tIdx);
        tIdx++;
        found = true;
        consecutiveMisses = 0;
        break;
      }
      tIdx++;
    }

    if (!found) {
      // Allow a limited number of unmatched query characters (typo tolerance)
      consecutiveMisses++;
      if (consecutiveMisses > MAX_MISSES) return null; // too many misses
      score -= 5; // small penalty per skipped query char
    }
  }

  // Must have matched at least half the query characters
  if (indices.length < Math.ceil(qLen / 2)) return null;

  return { score, indices };
}

/**
 * Filter the active players list using fuzzy search.
 * Returns up to AC_MAX_RESULTS players, sorted best-score-first.
 * Pure function — no side effects.
 *
 * @param {string} query — the text the user typed
 * @returns {Array<{ player: object, score: number, indices: number[] }>}
 */
function filterPlayers(query) {
  const q = normalize(query);
  if (q.length === 0) return [];

  const scored = [];

  for (let i = 0; i < state.players.length; i++) {
    const name = state.players[i].searchName;
    const result = fuzzyScore(q, name);
    if (result) {
      scored.push({
        player:  state.players[i],
        score:   result.score,
        indices: result.indices,
      });
    }
  }

  // Sort descending by score
  scored.sort((a, b) => b.score - a.score);

  // Return only the top results
  return scored.slice(0, AC_MAX_RESULTS);
}

// ── Rendering ─────────────────────────────────

/**
 * Render suggestion items into the autocomplete dropdown.
 * Uses document.createElement — no innerHTML for safety & performance.
 * Highlights the exact matched characters (not just a prefix).
 *
 * @param {Array} matches — objects from filterPlayers(): { player, score, indices }
 * @param {string} query  — original query (for fallback)
 */
function renderSuggestions(matches, query) {
  // 1. Clear previous suggestions
  dom.autocompleteList.innerHTML = "";
  acHighlightIndex = -1;

  // 2. Nothing to show?
  if (matches.length === 0) {
    dom.autocompleteList.classList.remove("open");
    return;
  }

  // 3. Build each <li> with per-character highlighting
  matches.forEach((match, idx) => {
    const li = document.createElement("li");
    li.classList.add("autocomplete-item");
    li.setAttribute("role", "option");
    li.dataset.index = idx;

    const name = match.player.fullName;
    // Build a Set of matched indices (on the lowercase name) mapped to original
    const highlightSet = new Set(match.indices);

    // Walk through the original-cased name character by character
    const lowerName = name.toLowerCase();
    let i = 0;
    while (i < name.length) {
      // Collect a run of highlighted or non-highlighted chars
      const isHL = highlightSet.has(i);
      let run = name[i];
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

    // Click handler — fill input and close dropdown
    li.addEventListener("click", () => selectSuggestion(match.player.fullName));

    dom.autocompleteList.appendChild(li);
  });

  // 4. Show the dropdown
  dom.autocompleteList.classList.add("open");
}

/**
 * Called when the user picks a suggestion (click or Enter).
 * Fills the input and closes the dropdown.
 *
 * @param {string} playerName
 */
function selectSuggestion(playerName) {
  dom.answerInput.value = playerName;
  clearSuggestions();
  dom.answerInput.focus();
}

/** Hide and empty the suggestions dropdown. */
function clearSuggestions() {
  dom.autocompleteList.innerHTML = "";
  dom.autocompleteList.classList.remove("open");
  acHighlightIndex = -1;
}

/**
 * Update which item has the .highlighted class.
 * Scrolls the highlighted item into view on mobile.
 */
function updateHighlight() {
  const items = dom.autocompleteList.querySelectorAll(".autocomplete-item");
  items.forEach((li, i) => {
    li.classList.toggle("highlighted", i === acHighlightIndex);
  });
  // Scroll the highlighted item into view (smooth, nearest)
  if (acHighlightIndex >= 0 && items[acHighlightIndex]) {
    items[acHighlightIndex].scrollIntoView({ block: "nearest" });
  }
}

/**
 * Input event handler (debounced).
 * Fires filterPlayers → renderSuggestions after AC_DEBOUNCE_MS.
 */
function handleAutocompleteInput() {
  // Clear any pending debounce
  if (acDebounceTimer) clearTimeout(acDebounceTimer);

  acDebounceTimer = setTimeout(() => {
    const query = dom.answerInput.value.trim();
    if (query.length === 0) {
      clearSuggestions();
      return;
    }
    const matches = filterPlayers(query);
    renderSuggestions(matches, query);
  }, AC_DEBOUNCE_MS);
}

/**
 * Keyboard navigation inside the autocomplete dropdown.
 * ArrowDown / ArrowUp cycle through items.
 * Enter selects the highlighted item (or the first one if none highlighted).
 * Escape closes the dropdown.
 */
function handleAutocompleteKeydown(e) {
  const items = dom.autocompleteList.querySelectorAll(".autocomplete-item");
  if (items.length === 0) return; // dropdown not open

  switch (e.key) {
    case "ArrowDown":
      e.preventDefault(); // prevent cursor jumping in input
      acHighlightIndex = (acHighlightIndex + 1) % items.length;
      updateHighlight();
      break;

    case "ArrowUp":
      e.preventDefault();
      acHighlightIndex =
        acHighlightIndex <= 0 ? items.length - 1 : acHighlightIndex - 1;
      updateHighlight();
      break;

    case "Enter":
      // If the dropdown is open, select highlighted (or first) and prevent form submit
      if (dom.autocompleteList.classList.contains("open")) {
        e.preventDefault();
        const idx = acHighlightIndex >= 0 ? acHighlightIndex : 0;
        const name = items[idx]?.textContent;
        if (name) selectSuggestion(name);
      }
      break;

    case "Escape":
      clearSuggestions();
      break;
  }
}

/**
 * Close the dropdown when clicking anywhere outside the input + dropdown.
 */
function handleClickOutside(e) {
  if (
    !dom.answerInput.contains(e.target) &&
    !dom.autocompleteList.contains(e.target)
  ) {
    clearSuggestions();
  }
}

// ──────────────────────────────────────────────
// 7. STEP 1 — API FETCH (fetchPlayers)
// ──────────────────────────────────────────────

/**
 * Fetch players from the API-Football endpoint for a single league+season.
 * Returns an array of normalized player objects.
 *
 * @param {string} apiKey  – x-apisports-key header value
 * @param {number} leagueId – API league id
 * @param {number} season   – e.g. 2024
 * @param {string} leagueName – friendly name for our game
 * @returns {Promise<Array>}
 */
async function fetchLeaguePlayers(apiKey, leagueId, season, leagueName) {
  const players = [];
  let page = 1;

  while (page <= CONFIG.MAX_PAGES_PER_LEAGUE) {
    const url =
      `${CONFIG.API_BASE}/players?league=${leagueId}&season=${season}&page=${page}`;

    const res = await fetch(url, {
      method: "GET",
      headers: { "x-apisports-key": apiKey },
    });

    if (!res.ok) {
      console.warn(`API error (league ${leagueId}, page ${page}): ${res.status}`);
      break;
    }

    const json = await res.json();
    const results = json.response || [];

    if (results.length === 0) break; // no more pages

    // STEP 2 — Normalize each player
    for (const entry of results) {
      const p = entry.player;
      const stats = entry.statistics?.[0];
      if (!p || !stats) continue;

      const rawPosition = stats.games?.position || p.position || "";
      if (!rawPosition) continue;

      // Build proper display name from firstname + lastname
      const first = p.firstname || null;
      const last  = p.lastname  || null;
      const full  = last ? `${first} ${last}` : (first || p.name);

      players.push({
        id:         p.id,
        firstName:  first,
        lastName:   last,
        fullName:   full,
        searchName: full.toLowerCase(),
        position:   mapApiPosition(rawPosition),
        league:     leagueName,
        country:    p.nationality || "Unknown",
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
 * Fetch players from ALL configured leagues.
 * Shows progress in the loading overlay.
 *
 * @param {string} apiKey
 * @returns {Promise<Array>} merged, de-duped player list
 */
async function fetchPlayers(apiKey) {
  const allPlayers = [];
  const leagues = CONFIG.LEAGUES_TO_FETCH;

  for (let i = 0; i < leagues.length; i++) {
    const lg = leagues[i];
    dom.loadingText.textContent =
      `Fetching ${lg.name}… (${i + 1}/${leagues.length})`;

    try {
      const players = await fetchLeaguePlayers(apiKey, lg.id, lg.season, lg.name);
      allPlayers.push(...players);
    } catch (err) {
      console.error(`Failed to fetch ${lg.name}:`, err);
    }
  }

  // De-duplicate by player id
  const seen = new Set();
  const unique = allPlayers.filter((p) => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });

  return unique;
}

// ──────────────────────────────────────────────
// 8. STEP 2 — CACHING (localStorage)
// ──────────────────────────────────────────────

/** Save fetched players to localStorage. */
function cachePlayers(players) {
  lsSet(CONFIG.LS_PLAYERS, JSON.stringify(players));
  lsSet(CONFIG.LS_FETCH_TS, Date.now().toString());
}

/**
 * Load cached players if they exist and aren't expired.
 * @returns {Array|null}
 */
function loadCachedPlayers() {
  const raw = lsGet(CONFIG.LS_PLAYERS);
  const ts  = lsGet(CONFIG.LS_FETCH_TS);
  if (!raw || !ts) return null;

  const age = Date.now() - parseInt(ts, 10);
  if (age > CONFIG.CACHE_TTL) return null; // expired

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;

    // Reject old-format cache that lacks the fullName/searchName fields
    if (!parsed[0].fullName) return null;

    return parsed;
  } catch {
    return null;
  }
}

// ──────────────────────────────────────────────
// 9. LOCAL STORAGE — High Score
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
    dom.highScoreDisplay.textContent = state.highScore;
    saveHighScore(state.highScore);
    dom.highScoreDisplay.parentElement.classList.add("pop");
    setTimeout(
      () => dom.highScoreDisplay.parentElement.classList.remove("pop"),
      400
    );
  }
}

// ──────────────────────────────────────────────
// 10. STEP 4 — PLAYER DATABASE LOOKUP
// ──────────────────────────────────────────────

/**
 * Search the active players list for a match on all 3 modifiers.
 * Case-insensitive on the name.
 */
function findPlayer(name, position, league, country) {
  const n = normalize(name);
  return (
    state.players.find(
      (p) =>
        p.searchName === n &&
        normalize(p.position) === normalize(position) &&
        normalize(p.league) === normalize(league) &&
        normalize(p.country) === normalize(country)
    ) || null
  );
}

// ──────────────────────────────────────────────
// 11. COUNTDOWN TIMER
// ──────────────────────────────────────────────

function startTimer() {
  stopTimer();
  state.timeLeft = CONFIG.ROUND_TIME;
  updateTimerUI();

  state.timerInterval = setInterval(() => {
    state.timeLeft--;
    updateTimerUI();
    if (state.timeLeft <= 0) {
      stopTimer();
      handleTimeUp();
    }
  }, 1000);
}

function stopTimer() {
  if (state.timerInterval) {
    clearInterval(state.timerInterval);
    state.timerInterval = null;
  }
}

function updateTimerUI() {
  const pct = (state.timeLeft / CONFIG.ROUND_TIME) * 100;
  dom.timerFill.style.width = `${pct}%`;
  dom.timerText.textContent = state.timeLeft;

  const danger = state.timeLeft <= 10;
  dom.timerFill.classList.toggle("timer--danger", danger);
  dom.timerLabel.classList.toggle("timer--danger", danger);
}

function handleTimeUp() {
  clearSuggestions();
  showFeedback("⏰ Time's up! A new round has been added.", "incorrect");
  dom.answerInput.classList.add("shake");
  setTimeout(() => dom.answerInput.classList.remove("shake"), 400);
  updateHighScore();

  // Treat as incorrect — push a new round onto the stack
  pushNewRound();
}

// ──────────────────────────────────────────────
// 12. USED-NAMES TRACKER (duplicate prevention)
// ──────────────────────────────────────────────

function markNameUsed(displayName) {
  state.usedNames.add(normalize(displayName));
  renderUsedNames();
}

function renderUsedNames() {
  dom.usedList.innerHTML = "";
  if (state.usedNames.size === 0) {
    dom.usedEmpty.style.display = "";
    return;
  }
  dom.usedEmpty.style.display = "none";
  state.usedNames.forEach((name) => {
    const li = document.createElement("li");
    li.textContent = name.replace(/\b\w/g, (c) => c.toUpperCase());
    dom.usedList.appendChild(li);
  });
}

// ──────────────────────────────────────────────
// 12b. DEV MODE HELPERS
// ──────────────────────────────────────────────

/**
 * Find every player that matches a given position + league + country.
 * Used by dev mode to show all valid answers for the current round.
 *
 * @param {string} position
 * @param {string} league
 * @param {string} country
 * @returns {string[]} array of player names
 */
function getValidAnswers(position, league, country) {
  return state.players
    .filter(
      (p) =>
        normalize(p.position) === normalize(position) &&
        normalize(p.league)   === normalize(league) &&
        normalize(p.country)  === normalize(country)
    )
    .map((p) => p.fullName);
}

/**
 * If DEV_MODE is on:
 *   1. Logs all valid answers to the console.
 *   2. Renders them inside the #dev-answers panel.
 * If DEV_MODE is off, hides the panel.
 */
function showDevAnswers() {
  if (!dom.devPanel) return;

  if (!DEV_MODE) {
    dom.devPanel.classList.add("hidden");
    return;
  }

  const round = getSelectedRound();
  if (!round) {
    dom.devPanel.classList.add("hidden");
    return;
  }

  const answers = getValidAnswers(
    round.position,
    round.league,
    round.country
  );

  // Panel output
  dom.devPanel.classList.remove("hidden");
  const list = dom.devPanel.querySelector(".dev-answers__list");
  if (list) {
    list.innerHTML = "";
    answers.forEach((name) => {
      const li = document.createElement("li");
      li.textContent = name;
      list.appendChild(li);
    });
    if (answers.length === 0) {
      const li = document.createElement("li");
      li.textContent = "(none found)";
      li.style.fontStyle = "italic";
      list.appendChild(li);
    }
  }
}

// ──────────────────────────────────────────────
// 13. STACKED ROUND SYSTEM
// ──────────────────────────────────────────────

/**
 * Get the currently selected round object.
 * @returns {object|null}
 */
function getSelectedRound() {
  return (
    state.activeRounds.find((r) => r.id === state.selectedRoundId) || null
  );
}

/**
 * Calculate the final points for a round at a given depth.
 * basePoints × leagueMultiplier already baked in at creation.
 * Depth bonus is applied when the answer is scored.
 *
 * @param {object} round
 * @returns {number}
 */
function calcRoundPoints(round) {
  const depthMultiplier = DEPTH_BONUS[round.rowIndex] || 1;
  return Math.round(round.basePoints * depthMultiplier);
}

/**
 * Create a new round object from a random player.
 * @returns {object}
 */
function createRound() {
  const pivot = randomFrom(state.players);
  const leagueMultiplier =
    LEAGUE_MULTIPLIERS[normalize(pivot.league)] || 1;

  return {
    id:         state.nextRoundId++,
    position:   pivot.position,
    league:     pivot.league,
    country:    pivot.country,
    basePoints: Math.round(10 * leagueMultiplier),
    rowIndex:   0,
    createdAt:  Date.now(),
  };
}

/**
 * Push a new round onto the top of the stack.
 * Shifts existing rounds downward. If the stack exceeds
 * MAX_ACTIVE_ROUNDS, the oldest (deepest) round is removed.
 */
function pushNewRound() {
  if (state.players.length === 0) {
    showFeedback("⚠ No players loaded. Add an API key or reload.", "incorrect");
    return;
  }

  // Shift existing rounds down by 1
  state.activeRounds.forEach((r) => r.rowIndex++);

  // Remove rounds that exceed the max depth
  state.activeRounds = state.activeRounds.filter(
    (r) => r.rowIndex < CONFIG.MAX_ACTIVE_ROUNDS
  );

  // Insert the new round at rowIndex 0
  const newRound = createRound();
  state.activeRounds.unshift(newRound);

  // Auto-select the newest round
  state.selectedRoundId = newRound.id;
  state.answered = false;

  // Re-render the board & reset input
  renderStack();
  updatePointsDisplay();
  dom.answerInput.value    = "";
  dom.answerInput.disabled = false;
  dom.submitBtn.disabled   = false;
  clearSuggestions();
  clearFeedback();

  // Restart the timer
  startTimer();

  // Dev mode: show valid answers for selected round
  showDevAnswers();

  dom.answerInput.focus();
}

/**
 * Remove a specific round from the stack by id.
 * Re-indexes remaining rounds so rowIndex stays contiguous.
 */
function removeRound(roundId) {
  state.activeRounds = state.activeRounds.filter((r) => r.id !== roundId);
  // Re-index from 0
  state.activeRounds.forEach((r, i) => (r.rowIndex = i));
}

/**
 * Render all active rounds as stacked rows inside #round-stack.
 * Each row shows: position | league | country.
 * The selected row gets a highlighted border.
 */
function renderStack() {
  dom.roundStack.innerHTML = "";

  state.activeRounds.forEach((round) => {
    const row = document.createElement("div");
    row.classList.add("stack-row");
    row.dataset.roundId = round.id;
    row.dataset.depth = round.rowIndex;

    if (round.id === state.selectedRoundId) {
      row.classList.add("stack-row--selected");
    }

    // Depth bonus badge (top-right)
    const depthBadge = document.createElement("span");
    depthBadge.classList.add("stack-row__depth");
    depthBadge.textContent = `${DEPTH_BONUS[round.rowIndex] || 1}×`;

    // Three modifier cells — each with a label + value like the old cards
    const cells = document.createElement("div");
    cells.classList.add("stack-row__cells");

    const makeCell = (label, value, mod) => {
      const cell = document.createElement("div");
      cell.classList.add("stack-row__cell", `stack-row__cell--${mod}`);

      const lbl = document.createElement("span");
      lbl.classList.add("stack-row__label");
      lbl.textContent = label;

      const val = document.createElement("span");
      val.classList.add("stack-row__value");
      val.textContent = value;

      cell.appendChild(lbl);
      cell.appendChild(val);
      return cell;
    };

    cells.appendChild(makeCell("Position", round.position, "position"));
    cells.appendChild(makeCell("League",   round.league,   "league"));
    cells.appendChild(makeCell("Country",  round.country,  "country"));

    row.appendChild(depthBadge);
    row.appendChild(cells);

    row.addEventListener("click", () => selectRound(round.id));

    row.style.animationDelay = `${round.rowIndex * 0.06}s`;
    row.classList.add("slide-up");

    dom.roundStack.appendChild(row);
  });
}

/**
 * Select a round from the stack to answer.
 * Updates the points display and dev panel.
 */
function selectRound(roundId) {
  state.selectedRoundId = roundId;
  // Update visual selection
  dom.roundStack.querySelectorAll(".stack-row").forEach((row) => {
    row.classList.toggle(
      "stack-row--selected",
      Number(row.dataset.roundId) === roundId
    );
  });
  updatePointsDisplay();
  showDevAnswers();
}

/**
 * Update the points-available badge to reflect the selected round.
 */
function updatePointsDisplay() {
  const round = getSelectedRound();
  if (round) {
    dom.pointsAvailable.textContent = calcRoundPoints(round);
  } else {
    dom.pointsAvailable.textContent = "0";
  }
}

/** Legacy wrapper — called from init flows that used the old name. */
function generateRound() {
  pushNewRound();
}

// ──────────────────────────────────────────────
// 14. ANSWER VALIDATION (stacked)
// ──────────────────────────────────────────────

/**
 * Validate the user's answer against the SELECTED round.
 * @param {string} userInput
 * @param {object} round — the round to validate against
 * @returns {"correct"|"duplicate"|"wrong"}
 */
function validateAnswer(userInput, round) {
  // Check if player matches all three modifiers of this round
  const player = findPlayer(
    userInput,
    round.position,
    round.league,
    round.country
  );
  if (!player) return "wrong";

  // Duplicate check
  if (state.usedNames.has(normalize(userInput))) return "duplicate";

  return "correct";
}

/** Handle form submission. */
function handleSubmit(e) {
  e.preventDefault();

  const answer = dom.answerInput.value;
  if (!answer.trim()) return;

  // Close autocomplete before processing
  clearSuggestions();

  // Get the selected round
  const round = getSelectedRound();
  if (!round) {
    showFeedback("⚠ Select a round to answer.", "incorrect");
    return;
  }

  const result = validateAnswer(answer, round);

  switch (result) {
    case "correct": {
      // ✅ Award points (base × depth bonus)
      const pts = calcRoundPoints(round);
      state.score += pts;
      dom.scoreDisplay.textContent = state.score;
      showFeedback(`✅ Correct! +${pts} points (${DEPTH_BONUS[round.rowIndex]}× depth)`, "correct");
      dom.scoreDisplay.parentElement.classList.add("pop");
      setTimeout(
        () => dom.scoreDisplay.parentElement.classList.remove("pop"),
        400
      );

      stopTimer();
      markNameUsed(answer);
      updateHighScore();

      // Remove this round from the stack
      removeRound(round.id);
      renderStack();

      // Auto-select the top round if any remain
      if (state.activeRounds.length > 0) {
        selectRound(state.activeRounds[0].id);
      }

      // Auto-generate a new round after a short delay
      dom.answerInput.disabled = true;
      dom.submitBtn.disabled   = true;
      setTimeout(() => {
        pushNewRound();
      }, CONFIG.AUTO_NEXT_DELAY);
      break;
    }

    case "duplicate":
      showFeedback(
        "🔁 You already used that player! Try someone else.",
        "incorrect"
      );
      dom.answerInput.classList.add("shake");
      setTimeout(() => dom.answerInput.classList.remove("shake"), 400);
      break;

    case "wrong":
      showFeedback(
        "❌ Incorrect — a new round has been added!",
        "incorrect"
      );
      dom.answerInput.classList.add("shake");
      setTimeout(() => dom.answerInput.classList.remove("shake"), 400);

      // Wrong answer → push a new round, shifting the stack
      setTimeout(() => {
        pushNewRound();
      }, CONFIG.AUTO_NEXT_DELAY);
      break;
  }
}

// ──────────────────────────────────────────────
// 15. UI FEEDBACK HELPERS
// ──────────────────────────────────────────────

function showFeedback(message, type) {
  dom.feedbackEl.textContent = message;
  dom.feedbackEl.className = "feedback";
  dom.feedbackEl.classList.add(`feedback--${type}`);
}

function clearFeedback() {
  dom.feedbackEl.textContent = "";
  dom.feedbackEl.className = "feedback";
}

/** Update the data-source status bar. */
function updateStatusBar() {
  dom.playerCount.textContent = state.players.length;
  if (state.isLiveData) {
    dom.statusDot.className  = "data-status__dot live";
    dom.statusText.textContent = "Live API data";
  } else {
    dom.statusDot.className  = "data-status__dot offline";
    dom.statusText.textContent = "Offline data";
  }
}

/** Show / hide the loading overlay. */
function showLoading(show, text) {
  if (text) dom.loadingText.textContent = text;
  dom.loadingOverlay.classList.toggle("hidden", !show);
}

// ──────────────────────────────────────────────
// 16. API KEY MANAGEMENT & INIT FLOW
// ──────────────────────────────────────────────

/**
 * Attempt to load players from:
 *   1. localStorage cache (if fresh)
 *   2. API fetch (if key provided)
 *   3. Fallback data
 */
async function initPlayers(apiKey) {
  // 1. Try the cache first
  const cached = loadCachedPlayers();
  if (cached) {
    state.players = cached;
    state.isLiveData = true;
    return;
  }

  // 2. If we have an API key, fetch live data
  if (apiKey) {
    showLoading(true, "Connecting to API-Football…");
    try {
      const players = await fetchPlayers(apiKey);
      if (players.length > 0) {
        state.players = players;
        state.isLiveData = true;
        cachePlayers(players);
        return;
      }
      console.warn("API returned 0 players, falling back to offline data.");
    } catch (err) {
      console.error("API fetch failed:", err);
    }
  }

  // 3. Fallback to built-in data
  state.players = [...FALLBACK_PLAYERS];
  state.isLiveData = false;
}

/** Called when the user clicks "Save & Fetch". */
async function handleApiKeySave() {
  const key = dom.apiKeyInput.value.trim();
  if (!key) {
    dom.apiKeyInput.focus();
    return;
  }

  // Persist the key
  lsSet(CONFIG.LS_API_KEY, key);

  // Hide config, show loading
  dom.apiConfig.classList.add("hidden");
  showLoading(true);

  // Fetch from API
  await initPlayers(key);

  // Start the game
  showLoading(false);
  updateStatusBar();
  generateRound();
}

/** Called when the user clicks "Skip — use offline data". */
function handleApiKeySkip() {
  dom.apiConfig.classList.add("hidden");
  state.players = [...FALLBACK_PLAYERS];
  state.isLiveData = false;
  updateStatusBar();
  generateRound();
}

// ──────────────────────────────────────────────
// 17. EVENT LISTENERS
// ──────────────────────────────────────────────

dom.answerForm.addEventListener("submit", handleSubmit);
dom.newRoundBtn.addEventListener("click", generateRound);
dom.apiKeySave.addEventListener("click", handleApiKeySave);
dom.apiKeySkip.addEventListener("click", handleApiKeySkip);

// Autocomplete listeners
dom.answerInput.addEventListener("input", handleAutocompleteInput);
dom.answerInput.addEventListener("keydown", handleAutocompleteKeydown);
document.addEventListener("click", handleClickOutside);

// ──────────────────────────────────────────────
// 18. INITIALISE
// ──────────────────────────────────────────────

(async function init() {
  // Load high score
  state.highScore = loadHighScore();
  dom.highScoreDisplay.textContent = state.highScore;
  renderUsedNames();

  // Check for a saved API key
  const savedKey = lsGet(CONFIG.LS_API_KEY);

  if (savedKey) {
    // We have a saved key — try to load cached or re-fetch
    dom.apiConfig.classList.add("hidden");
    showLoading(true, "Loading players…");
    await initPlayers(savedKey);
    showLoading(false);
    updateStatusBar();
    generateRound();
  } else {
    // No saved key — show the config panel, hide loading
    showLoading(false);
    // The API config panel is already visible by default
  }
})();
