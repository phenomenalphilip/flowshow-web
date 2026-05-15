import { GoogleGenAI, Type } from "@google/genai";

let aiClient: GoogleGenAI | null = null;

function getAiClient(): GoogleGenAI {
  if (!aiClient) {
    aiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "empty_key_to_prevent_crash_if_not_set" });
  }
  return aiClient;
}

export async function detectVerseFromContext(transcriptSegment: string) {
  // If the segment is too short, don't bother the AI
  if (!transcriptSegment || transcriptSegment.trim().split(/\s+/).length < 5) return null;

  try {
    const ai = getAiClient();
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `You are a real-time speech parser for a church presentation software. 
Your job is to identify if the speaker is paraphrasing or implicitly quoting a Bible verse.

Transcript segment:
"${transcriptSegment}"

Instructions:
1. If the text contains a clear quotation, paraphrase, or strong allusion to a SPECIFIC Bible verse, return the book, chapter, verse, and your confidence score (0 to 100).
2. If the text is just general preaching, a story, or too vague to pinpoint a specific verse, return empty/nothing (i.e. omit properties).
3. The book name must be a standard capitalized Bible book name (e.g. '1 John', 'Genesis', 'Romans'). If it is Psalms, use 'Psalms'.
4. WARNING: Do not guess based on single common religious words (like "love", "son", "shepherd"). Only return high confidence (>= 75) if they quote a significant, uniquely identifiable portion of the verse.
5. If it's a weak allusion or you are uncertain which verse they mean, give it a low confidence score (10 to 50).`,
      config: {
        temperature: 0.1,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          description: "Details of the implicitly quoted verse, if present.",
          properties: {
            book: { type: Type.STRING },
            chapter: { type: Type.INTEGER },
            verse: { type: Type.INTEGER },
            confidence: { type: Type.INTEGER, description: "Your confidence score from 0 to 100" }
          },
          required: []
        }
      }
    });

    if (!response.text) return null;
    
    let result;
    try {
      result = JSON.parse(response.text);
    } catch {
      return null;
    }

    if (result.book && result.chapter && result.verse && typeof result.confidence === 'number') {
      let formattedBook = result.book;
      if (formattedBook === "Psalm") formattedBook = "Psalms";
      return {
        reference: {
          book: formattedBook,
          chapters: [result.chapter],
          verses: [[result.verse]]
        },
        confidence: result.confidence,
        debug: {
          confidence: `AI Semantic Match (${result.confidence}%)`,
          originalMatch: transcriptSegment
        }
      };
    }
    
    return null; 
  } catch (e) {
    console.error("AI semantic parsing error:", e);
    return null;
  }
}
