export const NUMBER_MAP: Record<string, string> = {
  zero: "0", one: "1", two: "2", three: "3", four: "4", five: "5",
  six: "6", seven: "7", eight: "8", nine: "9", ten: "10",
  eleven: "11", twelve: "12", thirteen: "13", fourteen: "14", fifteen: "15",
  sixteen: "16", seventeen: "17", eighteen: "18", nineteen: "19", twenty: "20",
  thirty: "30", forty: "40", fifty: "50", sixty: "60", seventy: "70",
  eighty: "80", ninety: "90", hundred: "100",
  first: "1", second: "2", third: "3", "1st": "1", "2nd": "2", "3rd": "3"
};

export const BIBLE_BOOKS = [
  "Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy", "Joshua", "Judges", "Ruth",
  "1 Samuel", "2 Samuel", "1 Kings", "2 Kings", "1 Chronicles", "2 Chronicles", "Ezra", "Nehemiah", "Esther",
  "Job", "Psalms", "Psalm", "Proverbs", "Ecclesiastes", "Song of Solomon", "Isaiah", "Jeremiah", "Lamentations",
  "Ezekiel", "Daniel", "Hosea", "Joel", "Amos", "Obadiah", "Jonah", "Micah", "Nahum", "Habakkuk", "Zephaniah",
  "Haggai", "Zechariah", "Malachi",
  "Matthew", "Mark", "Luke", "John", "Acts", "Romans", "1 Corinthians", "2 Corinthians", "Galatians", "Ephesians",
  "Philippians", "Colossians", "1 Thessalonians", "2 Thessalonians", "1 Timothy", "2 Timothy", "Titus", "Philemon",
  "Hebrews", "James", "1 Peter", "2 Peter", "1 John", "2 John", "3 John", "Jude", "Revelation"
];

export function normalizeTranscript(text: string): string {
  let cleaned = text.toLowerCase();
  
  // Replace spelled out numbers and ordinals with digits
  Object.entries(NUMBER_MAP).forEach(([word, digit]) => {
    const regex = new RegExp(`\\b${word}\\b`, 'g');
    cleaned = cleaned.replace(regex, digit);
  });
  
  // Strip filler words (e.g. "chapter 3 verse 16" -> "3 16")
  cleaned = cleaned.replace(/\b(chapter|verse|verses|and|the)\b/g, " ");
  
  // Clean multiple spaces
  return cleaned.replace(/\s+/g, " ").trim();
}

export function parseBibleReference(transcript: string) {
  const normalized = normalizeTranscript(transcript);
  
  // Sort books by length descending to match '1 Samuel' before 'Samuel'
  const sortedBooks = [...BIBLE_BOOKS].sort((a, b) => b.length - a.length);
  // Join all books into a single regex alternation group
  const booksPattern = sortedBooks.map(b => b.toLowerCase()).join('|');
  
  // Create a regex that looks for ANY book name, followed by spaces, then a number (chapter)
  // and optionally a colon or spaces and another number (verse).
  // g flag lets us find all matches from left to right.
  const regex = new RegExp(`\\b(${booksPattern})\\b\\s+(\\d+)(?:[:\\s]+(\\d+))?`, 'gi');
  
  let match;
  let lastMatch = null;
  
  // Find the LAST occurrence of any book sequence in the speech
  while ((match = regex.exec(normalized)) !== null) {
    lastMatch = match;
  }
  
  if (lastMatch) {
    const bookMatch = lastMatch[1];
    const chapter = parseInt(lastMatch[2], 10);
    const verseString = lastMatch[3];
    const verses = verseString ? [[parseInt(verseString, 10)]] : undefined;
    
    // Find original properly-cased book name
    let formattedBook = BIBLE_BOOKS.find(b => b.toLowerCase() === bookMatch.toLowerCase()) || bookMatch;
    // Fix Psalms singular/plural normalizations
    if (formattedBook === "Psalm") formattedBook = "Psalms";
    
    return {
      reference: {
        book: formattedBook,
        chapters: [chapter],
        verses: verses,
      },
      // To help debug where we matched
      debug: {
        confidence: "High",
        originalMatch: lastMatch[0]
      }
    };
  }
  
  return null;
}
