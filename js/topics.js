/* ============================================================
   topics.js — Quiz Datasets
   Each topic defines the categories and items the engine uses.
   To add a new topic: copy a block, change the values, add to TOPICS.
   ============================================================ */

// ──────────────────────────────────────────────
// TOPIC SCHEMA
// ──────────────────────────────────────────────
//
// {
//   topicKey:    string  — unique identifier used with setTopic()
//   topicName:   string  — display name shown in the UI
//   icon:        string  — emoji shown next to the title
//   placeholder: string  — input placeholder text
//   usedLabel:   string  — heading for the "used answers" section
//   categories:  string[] — ordered list of modifier keys (max 4 recommended)
//   categoryLabels: object — human-readable label for each category key
//   categoryColors: object — CSS modifier class suffix for each category key
//                            ("position" → --position colour, etc.)
//   difficultyKey: string  — which category drives the difficulty multiplier
//   multipliers: object    — value → multiplier for difficulty scoring
//   data: Array<{
//     name:       string   — the answer the player must type
//     searchName: string   — lowercased name for fuzzy search
//     attributes: object   — must include a value for every category key
//   }>
// }

// ──────────────────────────────────────────────
// 1. FOOTBALL
// ──────────────────────────────────────────────

const TOPIC_FOOTBALL = {
  topicKey:    "Football",
  topicName:   "Football",
  icon:        "⚽",
  placeholder: "Type a player's name…",
  usedLabel:   "Players Used",

  // The 3 columns shown on every round card
  categories: ["position", "league", "country"],

  categoryLabels: {
    position: "Position",
    league:   "League",
    country:  "Country",
  },

  // These map to CSS class suffixes: .stack-row__cell--position, etc.
  categoryColors: {
    position: "position",   // → sky-blue
    league:   "league",     // → green
    country:  "country",    // → amber
  },

  // The category whose value is looked up in `multipliers` below
  difficultyKey: "league",

  // Less popular = higher multiplier = more points
  multipliers: {
    "premier league":     1,
    "la liga":            1.2,
    "serie a":            1.3,
    "bundesliga":         1.3,
    "ligue 1":            1.5,
    "mls":                2,
    "eredivisie":         1.8,
    "liga portugal":      1.8,
    "saudi pro league":   1.6,
    "scottish premiership": 2.2,
  },

  // Static fallback data intentionally empty — live data comes from API-Football.
  // Configure apiConfig in the Topic Builder to enable live fetching.
  data: [],
};

// ──────────────────────────────────────────────
// 2. MOVIES
// ──────────────────────────────────────────────

const TOPIC_MOVIES = {
  topicKey:    "Movies",
  topicName:   "Movies",
  icon:        "🎬",
  placeholder: "Type an actor's name…",
  usedLabel:   "Actors Used",

  categories: ["role", "genre", "decade"],

  categoryLabels: {
    role:   "Role",
    genre:  "Genre",
    decade: "Decade",
  },

  categoryColors: {
    role:   "position",  // reuses sky-blue colour slot
    genre:  "league",    // reuses green colour slot
    decade: "country",   // reuses amber colour slot
  },

  difficultyKey: "decade",

  // Older decades are harder (less well-known)
  multipliers: {
    "2020s": 1,
    "2010s": 1.2,
    "2000s": 1.5,
    "1990s": 1.8,
    "1980s": 2.2,
    "1970s": 2.5,
  },

  data: [
    { name: "Leonardo DiCaprio",  searchName: "leonardo dicaprio",  attributes: { role: "Lead Actor",       genre: "Drama",    decade: "2010s" } },
    { name: "Tom Hanks",          searchName: "tom hanks",          attributes: { role: "Lead Actor",       genre: "Drama",    decade: "1990s" } },
    { name: "Meryl Streep",       searchName: "meryl streep",       attributes: { role: "Lead Actress",     genre: "Drama",    decade: "2000s" } },
    { name: "Scarlett Johansson", searchName: "scarlett johansson", attributes: { role: "Lead Actress",     genre: "Action",   decade: "2010s" } },
    { name: "Robert Downey Jr",   searchName: "robert downey jr",   attributes: { role: "Lead Actor",       genre: "Action",   decade: "2010s" } },
    { name: "Cate Blanchett",     searchName: "cate blanchett",     attributes: { role: "Lead Actress",     genre: "Fantasy",  decade: "2000s" } },
    { name: "Brad Pitt",          searchName: "brad pitt",          attributes: { role: "Lead Actor",       genre: "Thriller", decade: "1990s" } },
    { name: "Natalie Portman",    searchName: "natalie portman",    attributes: { role: "Lead Actress",     genre: "Sci-Fi",   decade: "2010s" } },
    { name: "Morgan Freeman",     searchName: "morgan freeman",     attributes: { role: "Supporting Actor", genre: "Thriller", decade: "1990s" } },
    { name: "Jodie Foster",       searchName: "jodie foster",       attributes: { role: "Lead Actress",     genre: "Thriller", decade: "1990s" } },
    { name: "Denzel Washington",  searchName: "denzel washington",  attributes: { role: "Lead Actor",       genre: "Action",   decade: "2000s" } },
    { name: "Chris Hemsworth",    searchName: "chris hemsworth",    attributes: { role: "Lead Actor",       genre: "Action",   decade: "2010s" } },
    { name: "Emma Stone",         searchName: "emma stone",         attributes: { role: "Lead Actress",     genre: "Comedy",   decade: "2010s" } },
    { name: "Ryan Reynolds",      searchName: "ryan reynolds",      attributes: { role: "Lead Actor",       genre: "Comedy",   decade: "2010s" } },
    { name: "Margot Robbie",      searchName: "margot robbie",      attributes: { role: "Lead Actress",     genre: "Comedy",   decade: "2020s" } },
    { name: "Timothee Chalamet",  searchName: "timothee chalamet",  attributes: { role: "Lead Actor",       genre: "Sci-Fi",   decade: "2020s" } },
    { name: "Zendaya",            searchName: "zendaya",            attributes: { role: "Lead Actress",     genre: "Sci-Fi",   decade: "2020s" } },
    { name: "Tom Cruise",         searchName: "tom cruise",         attributes: { role: "Lead Actor",       genre: "Action",   decade: "1990s" } },
    { name: "Samuel L Jackson",   searchName: "samuel l jackson",   attributes: { role: "Supporting Actor", genre: "Action",   decade: "2000s" } },
    { name: "Viola Davis",        searchName: "viola davis",        attributes: { role: "Lead Actress",     genre: "Drama",    decade: "2010s" } },
  ],
};

// ──────────────────────────────────────────────
// 3. GEOGRAPHY
// ──────────────────────────────────────────────

const TOPIC_GEOGRAPHY = {
  topicKey:    "Geography",
  topicName:   "Geography",
  icon:        "🌍",
  placeholder: "Type a country name…",
  usedLabel:   "Countries Used",

  categories: ["continent", "language", "population"],

  categoryLabels: {
    continent:  "Continent",
    language:   "Language",
    population: "Population",
  },

  categoryColors: {
    continent:  "position",
    language:   "league",
    population: "country",
  },

  difficultyKey: "population",

  // Smaller = harder
  multipliers: {
    "1B+":    1,
    "100M+":  1.3,
    "10M+":   1.6,
    "1M+":    2,
    "Under 1M": 2.5,
  },

  data: [
    { name: "China",          searchName: "china",          attributes: { continent: "Asia",          language: "Mandarin",   population: "1B+" } },
    { name: "India",          searchName: "india",          attributes: { continent: "Asia",          language: "Hindi",      population: "1B+" } },
    { name: "USA",            searchName: "usa",            attributes: { continent: "North America", language: "English",    population: "100M+" } },
    { name: "Indonesia",      searchName: "indonesia",      attributes: { continent: "Asia",          language: "Indonesian", population: "100M+" } },
    { name: "Brazil",         searchName: "brazil",         attributes: { continent: "South America", language: "Portuguese", population: "100M+" } },
    { name: "Pakistan",       searchName: "pakistan",       attributes: { continent: "Asia",          language: "Urdu",       population: "100M+" } },
    { name: "Nigeria",        searchName: "nigeria",        attributes: { continent: "Africa",        language: "English",    population: "100M+" } },
    { name: "Bangladesh",     searchName: "bangladesh",     attributes: { continent: "Asia",          language: "Bengali",    population: "100M+" } },
    { name: "Russia",         searchName: "russia",         attributes: { continent: "Europe",        language: "Russian",    population: "100M+" } },
    { name: "Mexico",         searchName: "mexico",         attributes: { continent: "North America", language: "Spanish",    population: "100M+" } },
    { name: "Germany",        searchName: "germany",        attributes: { continent: "Europe",        language: "German",     population: "10M+" } },
    { name: "France",         searchName: "france",         attributes: { continent: "Europe",        language: "French",     population: "10M+" } },
    { name: "UK",             searchName: "uk",             attributes: { continent: "Europe",        language: "English",    population: "10M+" } },
    { name: "Spain",          searchName: "spain",          attributes: { continent: "Europe",        language: "Spanish",    population: "10M+" } },
    { name: "Italy",          searchName: "italy",          attributes: { continent: "Europe",        language: "Italian",    population: "10M+" } },
    { name: "Argentina",      searchName: "argentina",      attributes: { continent: "South America", language: "Spanish",    population: "10M+" } },
    { name: "South Korea",    searchName: "south korea",    attributes: { continent: "Asia",          language: "Korean",     population: "10M+" } },
    { name: "Colombia",       searchName: "colombia",       attributes: { continent: "South America", language: "Spanish",    population: "10M+" } },
    { name: "Kenya",          searchName: "kenya",          attributes: { continent: "Africa",        language: "Swahili",    population: "10M+" } },
    { name: "Australia",      searchName: "australia",      attributes: { continent: "Oceania",       language: "English",    population: "10M+" } },
    { name: "Netherlands",    searchName: "netherlands",    attributes: { continent: "Europe",        language: "Dutch",      population: "10M+" } },
    { name: "Portugal",       searchName: "portugal",       attributes: { continent: "Europe",        language: "Portuguese", population: "10M+" } },
    { name: "Sweden",         searchName: "sweden",         attributes: { continent: "Europe",        language: "Swedish",    population: "10M+" } },
    { name: "Belgium",        searchName: "belgium",        attributes: { continent: "Europe",        language: "French",     population: "10M+" } },
    { name: "New Zealand",    searchName: "new zealand",    attributes: { continent: "Oceania",       language: "English",    population: "1M+" } },
    { name: "Ireland",        searchName: "ireland",        attributes: { continent: "Europe",        language: "English",    population: "1M+" } },
    { name: "Norway",         searchName: "norway",         attributes: { continent: "Europe",        language: "Norwegian",  population: "1M+" } },
    { name: "Denmark",        searchName: "denmark",        attributes: { continent: "Europe",        language: "Danish",     population: "1M+" } },
    { name: "Luxembourg",     searchName: "luxembourg",     attributes: { continent: "Europe",        language: "French",     population: "Under 1M" } },
    { name: "Iceland",        searchName: "iceland",        attributes: { continent: "Europe",        language: "Icelandic",  population: "Under 1M" } },
  ],
};

// ──────────────────────────────────────────────
// 4. GENERAL KNOWLEDGE
// ──────────────────────────────────────────────

const TOPIC_GENERAL = {
  topicKey:    "GeneralKnowledge",
  topicName:   "General Knowledge",
  icon:        "🧠",
  placeholder: "Type your answer…",
  usedLabel:   "Answers Used",

  categories: ["category", "difficulty", "era"],

  categoryLabels: {
    category:   "Category",
    difficulty: "Difficulty",
    era:        "Era",
  },

  categoryColors: {
    category:   "position",
    difficulty: "league",
    era:        "country",
  },

  difficultyKey: "difficulty",

  multipliers: {
    "Easy":   1,
    "Medium": 1.5,
    "Hard":   2.5,
  },

  data: [
    { name: "Albert Einstein",    searchName: "albert einstein",    attributes: { category: "Science",    difficulty: "Easy",   era: "Modern" } },
    { name: "Isaac Newton",       searchName: "isaac newton",       attributes: { category: "Science",    difficulty: "Easy",   era: "Historical" } },
    { name: "Marie Curie",        searchName: "marie curie",        attributes: { category: "Science",    difficulty: "Medium", era: "Historical" } },
    { name: "Charles Darwin",     searchName: "charles darwin",     attributes: { category: "Science",    difficulty: "Easy",   era: "Historical" } },
    { name: "Stephen Hawking",    searchName: "stephen hawking",    attributes: { category: "Science",    difficulty: "Medium", era: "Modern" } },
    { name: "Nikola Tesla",       searchName: "nikola tesla",       attributes: { category: "Science",    difficulty: "Medium", era: "Historical" } },
    { name: "William Shakespeare",searchName: "william shakespeare",attributes: { category: "Literature", difficulty: "Easy",   era: "Historical" } },
    { name: "Jane Austen",        searchName: "jane austen",        attributes: { category: "Literature", difficulty: "Easy",   era: "Historical" } },
    { name: "George Orwell",      searchName: "george orwell",      attributes: { category: "Literature", difficulty: "Medium", era: "Modern" } },
    { name: "Ernest Hemingway",   searchName: "ernest hemingway",   attributes: { category: "Literature", difficulty: "Medium", era: "Modern" } },
    { name: "Napoleon Bonaparte", searchName: "napoleon bonaparte", attributes: { category: "History",    difficulty: "Easy",   era: "Historical" } },
    { name: "Cleopatra",          searchName: "cleopatra",          attributes: { category: "History",    difficulty: "Easy",   era: "Ancient" } },
    { name: "Julius Caesar",      searchName: "julius caesar",      attributes: { category: "History",    difficulty: "Easy",   era: "Ancient" } },
    { name: "Genghis Khan",       searchName: "genghis khan",       attributes: { category: "History",    difficulty: "Medium", era: "Historical" } },
    { name: "Leonardo da Vinci",  searchName: "leonardo da vinci",  attributes: { category: "Art",        difficulty: "Easy",   era: "Historical" } },
    { name: "Pablo Picasso",      searchName: "pablo picasso",      attributes: { category: "Art",        difficulty: "Easy",   era: "Modern" } },
    { name: "Vincent van Gogh",   searchName: "vincent van gogh",   attributes: { category: "Art",        difficulty: "Easy",   era: "Historical" } },
    { name: "Michelangelo",       searchName: "michelangelo",       attributes: { category: "Art",        difficulty: "Medium", era: "Historical" } },
    { name: "Ludwig van Beethoven",searchName: "ludwig van beethoven",attributes: { category: "Music",   difficulty: "Medium", era: "Historical" } },
    { name: "Wolfgang Amadeus Mozart",searchName: "wolfgang amadeus mozart",attributes: { category: "Music", difficulty: "Easy",  era: "Historical" } },
    { name: "Johann Sebastian Bach",  searchName: "johann sebastian bach",  attributes: { category: "Music", difficulty: "Hard",  era: "Historical" } },
    { name: "Plato",              searchName: "plato",              attributes: { category: "Philosophy", difficulty: "Medium", era: "Ancient" } },
    { name: "Aristotle",          searchName: "aristotle",          attributes: { category: "Philosophy", difficulty: "Easy",   era: "Ancient" } },
    { name: "Socrates",           searchName: "socrates",           attributes: { category: "Philosophy", difficulty: "Easy",   era: "Ancient" } },
    { name: "Immanuel Kant",      searchName: "immanuel kant",      attributes: { category: "Philosophy", difficulty: "Hard",   era: "Historical" } },
  ],
};

// ──────────────────────────────────────────────
// TOPIC REGISTRY
// ──────────────────────────────────────────────

/**
 * All available topics indexed by their topicKey.
 * Add new topics here to make them available to setTopic().
 */
const TOPICS = {
  Football:       TOPIC_FOOTBALL,
  Movies:         TOPIC_MOVIES,
  Geography:      TOPIC_GEOGRAPHY,
  GeneralKnowledge: TOPIC_GENERAL,
};
