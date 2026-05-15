import { BibleVersion, Book, Chapter, Verse } from './bibleDb';

function parseLines(node: Element): string[] {
  const lines: string[] = [];
  let currentLine = '';

  const walk = (n: Node) => {
    if (n.nodeType === Node.TEXT_NODE) {
      currentLine += n.textContent || '';
    } else if (n.nodeType === Node.ELEMENT_NODE) {
      const el = n as Element;
      const tag = el.tagName.toLowerCase();
      if (tag === 'br') {
        lines.push(currentLine);
        currentLine = '';
      } else if (tag === 'p') {
        if (currentLine.trim()) {
          lines.push(currentLine);
          currentLine = '';
        }
        Array.from(el.childNodes).forEach(walk);
        if (currentLine.trim()) {
          lines.push(currentLine);
          currentLine = '';
        }
      } else {
        Array.from(el.childNodes).forEach(walk);
      }
    }
  };

  Array.from(node.childNodes).forEach(walk);
  if (currentLine.trim()) {
    lines.push(currentLine);
  }

  const result = lines.map(l => l.trim()).filter(l => l.length > 0);
  if (result.length === 0 && node.textContent?.trim()) {
      return [node.textContent.trim()];
  }
  return result;
}

// Dictionary to convert XML book numbers into proper readable names
const STANDARD_BOOK_NAMES = [
  "Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy", "Joshua", "Judges", "Ruth", "1 Samuel", "2 Samuel", "1 Kings", "2 Kings", "1 Chronicles", "2 Chronicles", "Ezra", "Nehemiah", "Esther", "Job", "Psalms", "Proverbs", "Ecclesiastes", "Song of Solomon", "Isaiah", "Jeremiah", "Lamentations", "Ezekiel", "Daniel", "Hosea", "Joel", "Amos", "Obadiah", "Jonah", "Micah", "Nahum", "Habakkuk", "Zephaniah", "Haggai", "Zechariah", "Malachi",
  "Matthew", "Mark", "Luke", "John", "Acts", "Romans", "1 Corinthians", "2 Corinthians", "Galatians", "Ephesians", "Philippians", "Colossians", "1 Thessalonians", "2 Thessalonians", "1 Timothy", "2 Timothy", "Titus", "Philemon", "Hebrews", "James", "1 Peter", "2 Peter", "1 John", "2 John", "3 John", "Jude", "Revelation"
];

function normalizeXmlToZefania(xmlText: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'text/xml');
  
  const getElements = (node: Element | Document, names: string[]) => {
      const lowerNames = names.map(n => n.toLowerCase());
      return Array.from(node.querySelectorAll('*')).filter(el => lowerNames.includes(el.tagName.toLowerCase()));
  };

  const getAttr = (el: Element, names: string[]) => {
      const lowerNames = names.map(n => n.toLowerCase());
      const attr = Array.from(el.attributes).find(a => lowerNames.includes(a.name.toLowerCase()));
      return attr ? attr.value : null;
  };

  // Generic processing for all known book, chapter, and verse tags
  const bookElements = getElements(doc, ['book', 'b', 'biblebook']).concat(
      getElements(doc, ['div']).filter(el => (getAttr(el, ['type']) || '').toLowerCase() === 'book')
  );
  
  if (bookElements.length > 0) {
    let resultXml = '<?xml version="1.0" encoding="UTF-8"?>\n<XMLBIBLE>\n';
    
    for (const book of bookElements) {
       let bname = getAttr(book, ['n', 'name', 'bname', 'id', 'osisid']) || '';
       
       if (!bname && getAttr(book, ['number'])) {
          const bookNum = parseInt(getAttr(book, ['number']) || '0', 10);
          bname = STANDARD_BOOK_NAMES[bookNum - 1] || `Book ${bookNum}`;
       }
       
       resultXml += `  <BIBLEBOOK bname="${bname}">\n`;
       
       const chapters = getElements(book, ['chapter', 'c']).concat(
           getElements(book, ['div']).filter(el => (getAttr(el, ['type']) || '').toLowerCase() === 'chapter')
       );
       for (const chapter of chapters) {
          const chapNum = getAttr(chapter, ['n', 'number', 'cnumber', 'id', 'osisid']) || '0';
          resultXml += `    <CHAPTER cnumber="${chapNum}">\n`;
          
          const verses = getElements(chapter, ['verse', 'v', 'vers']);
          for (const verse of verses) {
             const verseNum = getAttr(verse, ['n', 'number', 'vnumber', 'id', 'osisid']) || '0';
             let inner = '';
             for (const child of Array.from(verse.childNodes)) {
                inner += new XMLSerializer().serializeToString(child);
             }
             resultXml += `      <VERS vnumber="${verseNum}">${inner}</VERS>\n`;
          }
          resultXml += `    </CHAPTER>\n`;
       }
       resultXml += `  </BIBLEBOOK>\n`;
    }
    
    resultXml += '</XMLBIBLE>';
    return resultXml;
  }
  
  return xmlText;
}

export async function parseBibleXml(file: File): Promise<BibleVersion> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      let text = e.target?.result as string;
      try {
        text = normalizeXmlToZefania(text);
        
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(text, 'text/xml');
        
        // 1. Detect standard Zefania format (possibly our preprocessed output)
        if (!xmlDoc.querySelector('XMLBIBLE') && !xmlDoc.querySelector('xmlbible')) {
          throw new Error("Unknown XML Bible format. We support Zefania, OpenSong, and Standard Numbered XML formats.");
        }

        const bible: BibleVersion = {
          id: file.name.replace(/\.[^/.]+$/, "").replace(/\s+/g, '_'),
          name: file.name.replace(/\.[^/.]+$/, ""),
          books: []
        };

        const getElements = (node: Element | Document, names: string[]) => {
            const lowerNames = names.map(n => n.toLowerCase());
            return Array.from(node.querySelectorAll('*')).filter(el => lowerNames.includes(el.tagName.toLowerCase()));
        };

        // --- Zefania Format Parser ---
        const bookNodes = getElements(xmlDoc, ['BIBLEBOOK']);
        bookNodes.forEach(bNode => {
          const bname = bNode.getAttribute('bname') || bNode.getAttribute('BNAME') || bNode.getAttribute('bName') || '';
          const book: Book = { name: bname, chapters: [] };
          
          const chapterNodes = getElements(bNode, ['CHAPTER']);
          chapterNodes.forEach(cNode => {
            const cnumber = parseInt(cNode.getAttribute('cnumber') || cNode.getAttribute('CNUMBER') || cNode.getAttribute('cNumber') || '0', 10);
            const chapter: Chapter = { c: cnumber, verses: [] };
            
            const verseNodes = getElements(cNode, ['VERS', 'V']);
            verseNodes.forEach(vNode => {
              const vnumber = parseInt(vNode.getAttribute('vnumber') || vNode.getAttribute('VNUMBER') || vNode.getAttribute('vNumber') || vNode.getAttribute('n') || '0', 10);
              chapter.verses.push({ v: vnumber, lines: parseLines(vNode) });
            });
            
            if (chapter.verses.length > 0) book.chapters.push(chapter);
          });
          if (book.chapters.length > 0) bible.books.push(book);
        });
        
        resolve(bible);

      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = (e) => reject(e);
    reader.readAsText(file);
  });
}