import { get, set, keys, del } from 'idb-keyval';

export type Verse = {
  v: number;
  lines: string[];
};

export type Chapter = {
  c: number;
  verses: Verse[];
};

export type Book = {
  name: string;
  chapters: Chapter[];
};

export type BibleVersion = {
  id: string; // e.g., "kjv"
  name: string;
  books: Book[];
};

// Fallback in-memory storage for iframes/sandboxes that block IndexedDB
const memoryBibles: Record<string, BibleVersion> = {};

export async function initDatabase() {
  try {
    const existingKjv = await get('bible_kjv') as BibleVersion | undefined;
    if (!existingKjv || existingKjv.books?.length < 66) {
      // First time loading the KJV
      const response = await fetch('/kjv-formatted.json');
      if (response.ok) {
        const kjvBibleRaw = await response.json();
        const kjvBible = {
          ...kjvBibleRaw,
          books: kjvBibleRaw.books.map((b: any) => ({
            ...b,
            chapters: b.chapters.map((c: any) => ({
              ...c,
              verses: c.verses.map((v: any) => ({
                ...v,
                lines: v.text ? [v.text] : (v.lines || [])
              }))
            }))
          }))
        };
        await saveBible(kjvBible);
      }
    }
  } catch (e) {
    // IDB blocked, use memory
    if (!memoryBibles['bible_kjv']) {
      const response = await fetch('/kjv-formatted.json');
      if (response.ok) {
        const kjvBibleRaw = await response.json();
        const kjvBible = {
          ...kjvBibleRaw,
          books: kjvBibleRaw.books.map((b: any) => ({
            ...b,
            chapters: b.chapters.map((c: any) => ({
              ...c,
              verses: c.verses.map((v: any) => ({
                ...v,
                lines: v.text ? [v.text] : (v.lines || [])
              }))
            }))
          }))
        };
        memoryBibles['bible_kjv'] = kjvBible;
      }
    }
  }
}

export async function saveBible(bible: BibleVersion) {
  try {
    await set(`bible_${bible.id}`, bible);
  } catch (e) {
    console.warn("IndexedDB blocked, using memory storage", e);
  }
  memoryBibles[`bible_${bible.id}`] = bible;
}

export async function getBible(id: string): Promise<BibleVersion | undefined> {
  try {
    const b = await get(`bible_${id}`);
    if (b) {
      // Compatibility migration for old 'text' format
      if (b.books?.[0]?.chapters?.[0]?.verses?.[0] && !('lines' in b.books[0].chapters[0].verses[0])) {
         b.books = b.books.map((bk: any) => ({
           ...bk,
           chapters: bk.chapters.map((c: any) => ({
             ...c,
             verses: c.verses.map((v: any) => ({
               ...v,
               lines: v.text ? [v.text] : (v.lines || [])
             }))
           }))
         }));
         await saveBible(b as BibleVersion);
      }
      return b as BibleVersion;
    }
  } catch (e) {}
  return memoryBibles[`bible_${id}`];
}

export async function deleteBible(id: string): Promise<void> {
  try {
    await del(`bible_${id}`);
  } catch (e) {}
  delete memoryBibles[`bible_${id}`];
  
  if (id === 'kjv') {
    localStorage.setItem('deleted_bible_kjv', 'true');
  }
}

export async function getAllBibleIds(): Promise<string[]> {
  try {
    const allKeys = await keys();
    const idbKeys = allKeys.filter(k => typeof k === 'string' && k.startsWith('bible_')).map(k => (k as string).replace('bible_', ''));
    const memKeys = Object.keys(memoryBibles).map(k => k.replace('bible_', ''));
    return Array.from(new Set([...idbKeys, ...memKeys]));
  } catch (e) {
    return Object.keys(memoryBibles).map(k => k.replace('bible_', ''));
  }
}

export async function getBibleList(): Promise<{id: string, name: string}[]> {
  const ids = await getAllBibleIds();
  const list = [];
  for (const id of ids) {
    const b = await getBible(id);
    if (b) {
      list.push({ id: b.id, name: b.name });
    }
  }
  return list;
}
