/**
 * The movies to guess. `items` are the puzzle: three or more small pictures that
 * together point to the movie, either things from the film or plays on the
 * words of its title. `clue` is the player's hint.
 */
export interface Movie {
  id: string;
  title: string;
  /** The title in the language's own script. */
  local: string;
  year: number;
  items: string[];
  clue: string;
}

export type LanguageId = 'telugu' | 'hindi' | 'tamil' | 'english';

export interface Language {
  id: LanguageId;
  name: string;
  /** The language's name in its own script. */
  local: string;
  ready: boolean;
}

export const LANGUAGES: Language[] = [
  { id: 'telugu', name: 'Telugu', local: 'తెలుగు', ready: true },
  { id: 'hindi', name: 'Hindi', local: 'हिन्दी', ready: false },
  { id: 'tamil', name: 'Tamil', local: 'தமிழ்', ready: false },
  { id: 'english', name: 'English', local: 'English', ready: false },
];

export const TELUGU_MOVIES: Movie[] = [
  {
    id: 'baahubali',
    title: 'Baahubali: The Beginning',
    local: 'బాహుబలి',
    year: 2015,
    items: ['🏔️', '💦', '🗡️', '👑'],
    clue: 'A giant waterfall, and a man who has to know what lies above it.',
  },
  {
    id: 'rrr',
    title: 'RRR',
    local: 'ఆర్ఆర్ఆర్',
    year: 2022,
    items: ['🔥', '🤝', '💧', '🏍️'],
    clue: 'Fire meets water: two friends in British-ruled India.',
  },
  {
    id: 'magadheera',
    title: 'Magadheera',
    local: 'మగధీర',
    year: 2009,
    items: ['🐎', '🗡️', '👸', '🔁'],
    clue: 'A warrior takes on a hundred soldiers, then returns 400 years later.',
  },
  {
    id: 'eega',
    title: 'Eega',
    local: 'ఈగ',
    year: 2012,
    items: ['🪰', '🔪', '💔'],
    clue: 'A murdered man comes back as something very small.',
  },
  {
    id: 'pushpa',
    title: 'Pushpa: The Rise',
    local: 'పుష్ప',
    year: 2021,
    items: ['🌸', '🪵', '🚛', '🔥'],
    clue: 'A coolie rises through the red sandalwood smuggling trade.',
  },
  {
    id: 'arjun-reddy',
    title: 'Arjun Reddy',
    local: 'అర్జున్ రెడ్డి',
    year: 2017,
    items: ['🩺', '🏍️', '🍺', '💔'],
    clue: 'A brilliant surgeon with a temper and a broken heart.',
  },
  {
    id: 'arundhati',
    title: 'Arundhati',
    local: 'అరుంధతి',
    year: 2009,
    items: ['👸', '👻', '🏰', '🥁'],
    clue: 'A queen, a sealed tomb and a spirit that waits for her return.',
  },
  {
    id: 'rangasthalam',
    title: 'Rangasthalam',
    local: 'రంగస్థలం',
    year: 2018,
    items: ['🎭', '🌾', '🦻', '🗳️'],
    clue: 'A 1980s village, a water-pump man who can’t hear well, and a corrupt president.',
  },
  {
    id: 'sita-ramam',
    title: 'Sita Ramam',
    local: 'సీతా రామం',
    year: 2022,
    items: ['✉️', '🪖', '❄️', '❤️'],
    clue: 'A soldier, his letters, and a love story from the 1960s.',
  },
  {
    id: 'jersey',
    title: 'Jersey',
    local: 'జెర్సీ',
    year: 2019,
    items: ['👕', '🏏', '👦', '🏟️'],
    clue: 'A failed cricketer returns to the game at 36 for his son.',
  },
  {
    id: 'mahanati',
    title: 'Mahanati',
    local: 'మహానటి',
    year: 2018,
    items: ['🎥', '💃', '⭐', '👑'],
    clue: 'The life story of a legendary actress of Telugu cinema.',
  },
  {
    id: 'okkadu',
    title: 'Okkadu',
    local: 'ఒక్కడు',
    year: 2003,
    items: ['1️⃣', '🤼', '🕌', '👧'],
    clue: 'A kabaddi player saves a girl from a Kurnool faction leader.',
  },
  {
    id: 'bommarillu',
    title: 'Bommarillu',
    local: 'బొమ్మరిల్లు',
    year: 2006,
    items: ['🧸', '🏠', '👨', '👦'],
    clue: 'A father who chooses everything for his son.',
  },
  {
    id: 'aditya-369',
    title: 'Aditya 369',
    local: 'ఆదిత్య 369',
    year: 1991,
    items: ['☀️', '⏰', '👑', '🚀'],
    clue: 'A time machine, a medieval emperor and a broken future.',
  },
  {
    id: 'mayabazar',
    title: 'Mayabazar',
    local: 'మాయాబజార్',
    year: 1957,
    items: ['🪄', '🛒', '🍛', '👹'],
    clue: 'A giant, a magic feast and a wedding plot from the Mahabharata.',
  },
  {
    id: 'sankarabharanam',
    title: 'Sankarabharanam',
    local: 'శంకరాభరణం',
    year: 1980,
    items: ['🔱', '📿', '🎶', '👴'],
    clue: 'A classical music master in a world that has stopped listening.',
  },
  {
    id: 'shiva',
    title: 'Shiva',
    local: 'శివ',
    year: 1989,
    items: ['🚲', '⛓️', '👊', '🎓'],
    clue: 'A college student, a bicycle chain and a local gangster.',
  },
  {
    id: 'srimanthudu',
    title: 'Srimanthudu',
    local: 'శ్రీమంతుడు',
    year: 2015,
    items: ['💰', '🚲', '🏘️', '❤️'],
    clue: 'A billionaire’s son adopts a village.',
  },
  {
    id: 'hanu-man',
    title: 'Hanu-Man',
    local: 'హను-మాన్',
    year: 2024,
    items: ['🐒', '💎', '🦸', '🏘️'],
    clue: 'A small-town boy gains superpowers from a gem.',
  },
  {
    id: 'kalki',
    title: 'Kalki 2898 AD',
    local: 'కల్కి 2898 ఏడీ',
    year: 2024,
    items: ['🤰', '🏜️', '🔻', '🏹'],
    clue: 'The last city on Earth, thousands of years from now.',
  },
  {
    id: 'sye',
    title: 'Sye',
    local: 'సై',
    year: 2004,
    items: ['🏉', '🎓', '🥊'],
    clue: 'Two college gangs settle it with a game of rugby.',
  },
  {
    id: 'maryada-ramanna',
    title: 'Maryada Ramanna',
    local: 'మర్యాద రామన్న',
    year: 2010,
    items: ['🙏', '🚲', '🏠', '🔪'],
    clue: 'He’s safe only while he stays inside the house of the people who want him dead.',
  },
  {
    id: 'yamadonga',
    title: 'Yamadonga',
    local: 'యమదొంగ',
    year: 2007,
    items: ['🐃', '💀', '🦹', '🔥'],
    clue: 'A petty thief takes on the god of death in his own kingdom.',
  },
  {
    id: 'balagam',
    title: 'Balagam',
    local: 'బలగం',
    year: 2023,
    items: ['🐦', '🍚', '👨‍👩‍👧‍👦', '🌾'],
    clue: 'A Telangana family waits for a crow to accept an offering.',
  },
  {
    id: 'athadu',
    title: 'Athadu',
    local: 'అతడు',
    year: 2005,
    items: ['🎯', '🚂', '👵', '🏡'],
    clue: 'A hired assassin hides in a village under another man’s name.',
  },
];
