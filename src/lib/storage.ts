import { localDb } from './dexie';
import { Post, PostVocabulary, Vocabulary, Category } from '../types';

export const APP_MODE = (import.meta.env.VITE_APP_MODE || 'SHARED') as 'SHARED' | 'LOCAL';

export interface StorageInterface {
  getPosts(isPersonal?: boolean): Promise<Post[]>;
  getPostById(id: number, isPersonal?: boolean, apiKey?: string): Promise<Post>;
  createPost(title: string, body: string, category_name: string, reference_url: string, isPersonal?: boolean): Promise<number>;
  updatePost(id: number, title: string, body: string, category_name: string, reference_url: string, isPersonal?: boolean): Promise<void>;
  deletePost(id: number, isPersonal?: boolean): Promise<void>;
  getCategories(isPersonal?: boolean): Promise<Category[]>;
  getVocabulary(): Promise<PostVocabulary[]>;
  addVocabulary(post_title: string, word: string, reading_accent: string, meaning: string, level: string): Promise<void>;
  deleteVocabulary(post_title: string, word: string): Promise<void>;
  deleteMultipleVocabulary(post_title: string, words: string[]): Promise<void>;
  extractDifficultWords(post_id: number, level: string, isPersonal?: boolean, apiKey?: string): Promise<number>;
  gradeTranslation(original_sentence: string, user_translation: string, ai_translation: string, difficulty: string, apiKey?: string): Promise<{ is_correct: boolean; feedback: string }>;
  updatePostProcessedJson(id: number, processedJson: string, isPersonal?: boolean): Promise<void>;
}

async function translateTextGoogleClient(text: string): Promise<string> {
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=ja&tl=ko&dt=t&q=${encodeURIComponent(text)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("Translation failed");
    const data = await res.json();
    if (data && data[0] && Array.isArray(data[0])) {
      return data[0].map((part: any) => part[0]).filter((val: any) => typeof val === 'string').join('').trim();
    }
  } catch (e) {
    console.error("Google client translation failed:", e);
  }
  return '번역을 가져올 수 없습니다.';
}

// Local Analysis Helper (Google GenAI // Local Analysis Helper (Google GenAI directly in frontend)
async function analyzeTextLocalOffline(text: string, apiKey?: string): Promise<any> {
  const isKanjiChar = (ch: string) => /[\u4e00-\u9faf\u3400-\u4dbf\uf900-\ufaff々]/.test(ch);
  
  const toHira = (ch: string) => {
    if (!ch) return '';
    const code = ch.charCodeAt(0);
    if (code >= 0x30a1 && code <= 0x30f6) {
      return String.fromCharCode(code - 0x60);
    }
    return ch;
  };

  // DP alignment function for browser
  function alignOriginalAndHiragana(original: string, hiragana: string): string[] {
    const N = original.length;
    const M = hiragana.length;

    const dp: number[][] = Array.from({ length: N + 1 }, () => Array(M + 1).fill(Infinity));
    const choice: { type: string; len?: number }[][] = Array.from({ length: N + 1 }, () => Array(M + 1));

    dp[N][M] = 0;

    for (let i = N; i >= 0; i--) {
      for (let j = M; j >= 0; j--) {
        if (i === N && j === M) continue;

        const oChar = i < N ? original[i] : null;
        const hChar = j < M ? hiragana[j] : null;

        if (i < N) {
          const cost = 15;
          if (dp[i + 1][j] + cost < dp[i][j]) {
            dp[i][j] = dp[i + 1][j] + cost;
            choice[i][j] = { type: 'skip_original' };
          }
        }

        if (j < M) {
          const cost = 15;
          if (dp[i][j + 1] + cost < dp[i][j]) {
            dp[i][j] = dp[i][j + 1] + cost;
            choice[i][j] = { type: 'skip_hiragana' };
          }
        }

        if (i < N && j < M && oChar && hChar) {
          if (!isKanjiChar(oChar)) {
            const isMatch = toHira(oChar) === toHira(hChar);
            const cost = isMatch ? 0 : 10;
            if (dp[i + 1][j + 1] + cost < dp[i][j]) {
              dp[i][j] = dp[i + 1][j + 1] + cost;
              choice[i][j] = { type: 'match_non_kanji' };
            }
          } else {
            for (let len = 0; len <= 6; len++) {
              if (j + len <= M) {
                let cost = 5;
                if (len === 0) cost = 12;
                else if (len === 1) cost = 2;
                else if (len === 2) cost = 2;
                else if (len === 3) cost = 2;
                else cost = len;

                if (dp[i + 1][j + len] + cost < dp[i][j]) {
                  dp[i][j] = dp[i + 1][j + len] + cost;
                  choice[i][j] = { type: 'match_kanji', len };
                }
              }
            }
          }
        }
      }
    }

    const alignment: string[] = Array(N).fill('');
    let i = 0;
    let j = 0;
    while (i < N || j < M) {
      const ch = choice[i][j];
      if (!ch) break;
      if (ch.type === 'skip_original') {
        alignment[i] = '';
        i++;
      } else if (ch.type === 'skip_hiragana') {
        j++;
      } else if (ch.type === 'match_non_kanji') {
        alignment[i] = hiragana[j];
        i++;
        j++;
      } else if (ch.type === 'match_kanji') {
        const len = ch.len || 0;
        alignment[i] = hiragana.substring(j, j + len);
        i++;
        j += len;
      }
    }

    return alignment;
  }

  function fillMissingWhitespace(original: string, tokens: any[]): any[] {
    const result: any[] = [];
    let origIdx = 0;

    for (const token of tokens) {
      const surface = token.surface;
      const startIdx = original.indexOf(surface, origIdx);
      
      if (startIdx !== -1) {
        if (startIdx > origIdx) {
          const whitespace = original.substring(origIdx, startIdx);
          result.push({
            surface: whitespace,
            base_form: whitespace,
            reading: whitespace,
            reading_accent: '',
            pos: '기호',
            meaning: ''
          });
        }
        result.push(token);
        origIdx = startIdx + surface.length;
      } else {
        result.push(token);
      }
    }
    
    if (origIdx < original.length) {
      const whitespace = original.substring(origIdx);
      result.push({
        surface: whitespace,
        base_form: whitespace,
        reading: whitespace,
        reading_accent: '',
        pos: '기호',
        meaning: ''
      });
    }

    return result;
  }

  function splitTextIntoSentences(t: string): string[] {
    const parts = t.split(/([。！？\n]+)/);
    const result: string[] = [];
    for (let i = 0; i < parts.length; i += 2) {
      const mainText = parts[i];
      const delim = parts[i + 1] || '';
      const sentence = mainText + delim;
      if (sentence) {
        result.push(sentence);
      }
    }
    return result;
  }

  if (!apiKey) {
    // 1. Call server process-text endpoint
    try {
      const res = await fetch('/api/process-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });
      if (res.ok) {
        return res.json();
      }
    } catch (err) {
      console.warn("Offline analysis: local server tokenize failed, using fallback:", err);
    }

    // Basic split fallback (offline)
    const rawSentences = splitTextIntoSentences(text);
    const sentences = [];
    const hasSegmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl;
    const segmenter = hasSegmenter ? new Intl.Segmenter('ja-JP', { granularity: 'word' }) : null;
    const isJapaneseOrAlphanumeric = (str: string) => {
      return /[\u4e00-\u9faf\u3040-\u309f\u30a0-\u30ff\uff66-\uff9fA-Za-z0-9]/.test(str);
    };

    for (const originalSentence of rawSentences) {
      let translation = '번역을 가져올 수 없습니다.';
      if (originalSentence.trim()) {
        translation = await translateTextGoogleClient(originalSentence);
      } else {
        translation = originalSentence;
      }

      const tokens: any[] = [];
      if (originalSentence.trim()) {
        if (segmenter) {
          try {
            const segments = segmenter.segment(originalSentence);
            for (const segment of segments) {
              const surface = segment.segment;
              const isWord = isJapaneseOrAlphanumeric(surface);
              tokens.push({
                surface,
                base_form: surface,
                reading: '',
                reading_accent: '',
                pos: isWord ? '단어' : '기호',
                meaning: ''
              });
            }
          } catch (e) {
            console.error("Failed to segment local offline sentence:", e);
            tokens.push({
              surface: originalSentence,
              base_form: originalSentence,
              reading: '',
              reading_accent: '',
              pos: '문장',
              meaning: ''
            });
          }
        } else {
          tokens.push({
            surface: originalSentence,
            base_form: originalSentence,
            reading: '',
            reading_accent: '',
            pos: '문장',
            meaning: ''
          });
        }
      }

      const finalTokens = fillMissingWhitespace(originalSentence, tokens);
      sentences.push({
        original: originalSentence,
        translation,
        tokens: finalTokens
      });
    }
    return { sentences };
  }

  // 2. Client-side Gemini optimized analysis call using user apiKey
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  const prompt = "You are a professional Japanese-Korean translator and linguist.\n" +
    "Analyze the following Japanese text.\n" +
    "To minimize API usage, you must process the entire text in a single response.\n\n" +
    "Return a JSON object with the following fields:\n" +
    "1. \"hiragana\": The entire original Japanese text rewritten completely in Hiragana.\n" +
    "   - Replace all Kanji characters with their correct Hiragana pronunciation based on the context.\n" +
    "   - Keep Katakana, Hiragana, punctuation (。！？, etc.), English/alphanumeric characters, spaces, and newlines (\\n) EXACTLY as they are in the original text.\n" +
    "   - Do not add, remove, or modify any non-Kanji characters, spaces, or newlines. The length and structure must correspond exactly to the original text.\n\n" +
    "2. \"sentences\": An array of sentences split from the original text (split by punctuation like 。！？ or newlines).\n" +
    "   For each sentence, provide:\n" +
    "   - \"original\": The exact Japanese text of the sentence.\n" +
    "   - \"translation\": The Korean translation of the sentence.\n\n" +
    "Original Japanese text:\n" + text;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            hiragana: { type: 'STRING' },
            sentences: {
              type: 'ARRAY',
              items: {
                type: 'OBJECT',
                properties: {
                  original: { type: 'STRING' },
                  translation: { type: 'STRING' }
                },
                required: ["original", "translation"]
              }
            }
          },
          required: ["hiragana", "sentences"]
        }
      }
    })
  });

  const data = await response.json();
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  const resultObj = JSON.parse(rawText || '{}');
  
  const fullHiragana = resultObj.hiragana || '';
  const geminiSentences = resultObj.sentences || [];

  const fullAlignment = alignOriginalAndHiragana(text, fullHiragana);

  const sentences: any[] = [];
  const segmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl 
    ? new Intl.Segmenter('ja-JP', { granularity: 'word' }) 
    : null;
  const isJapaneseOrAlphanumeric = (str: string) => {
    return /[\u4e00-\u9faf\u3040-\u309f\u30a0-\u30ff\uff66-\uff9fA-Za-z0-9]/.test(str);
  };
  
  let lastFoundIndex = 0;

  for (const s of geminiSentences) {
    const sentText = s.original;
    let startIdx = text.indexOf(sentText, lastFoundIndex);
    if (startIdx === -1) {
      startIdx = text.indexOf(sentText);
    }
    if (startIdx !== -1) {
      lastFoundIndex = startIdx + sentText.length;
    } else {
      startIdx = lastFoundIndex;
    }

    const tokens: any[] = [];
    if (sentText.trim()) {
      if (segmenter) {
        try {
          const segments = segmenter.segment(sentText);
          let currentOffset = 0;
          for (const segment of segments) {
            const surface = segment.segment;
            const isWord = isJapaneseOrAlphanumeric(surface);
            
            let tokStart = sentText.indexOf(surface, currentOffset);
            if (tokStart === -1) tokStart = currentOffset;
            const tokEnd = tokStart + surface.length;
            currentOffset = tokEnd;
            
            const absStart = startIdx + tokStart;
            const absEnd = startIdx + tokEnd;
            
            let tokenReading = '';
            if (absStart >= 0 && absEnd <= fullAlignment.length) {
              tokenReading = fullAlignment.slice(absStart, absEnd).join('');
            }
            
            tokens.push({
              surface,
              base_form: surface,
              reading: tokenReading,
              reading_accent: '',
              pos: isWord ? '단어' : '기호',
              meaning: ''
            });
          }
        } catch (e) {
          console.error("Intl.Segmenter client analysis failed:", e);
          tokens.push({
            surface: sentText,
            base_form: sentText,
            reading: '',
            reading_accent: '',
            pos: '문장',
            meaning: ''
          });
        }
      } else {
        tokens.push({
          surface: sentText,
          base_form: sentText,
          reading: '',
          reading_accent: '',
          pos: '문장',
          meaning: ''
        });
      }
    }

    const finalTokens = fillMissingWhitespace(sentText, tokens);
    sentences.push({
      original: sentText,
      translation: s.translation,
      tokens: finalTokens
    });
  }

  return { sentences };
}

// Levenshtein Similarity calculation helpers
function getLevenshteinDistance(a: string, b: string): number {
  const tmp: number[][] = [];
  for (let i = 0; i <= a.length; i++) {
    tmp[i] = [i];
  }
  for (let j = 0; j <= b.length; j++) {
    tmp[0][j] = j;
  }
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      tmp[i][j] = Math.min(
        tmp[i - 1][j] + 1,
        tmp[i][j - 1] + 1,
        tmp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return tmp[a.length][b.length];
}

function normalizeSynonyms(text: string): string {
  let normalized = text;
  const synonymMap: Record<string, string> = {
    '현지': '지역',
    '로컬': '지역',
    '국회의원': '의원',
    '중원선': '중의원선거',
    '총선': '중의원선거',
    '두명': '2명',
    '두 명': '2명',
    '2인': '2명',
    '요번': '이번',
    '금번': '이번',
    '되었다': '됐다',
    '또다시': '또',
    '다시': '또',
    '또도': '또',
    '나의': '우리',
    '내': '우리',
    '우리들': '우리'
  };
  for (const [key, value] of Object.entries(synonymMap)) {
    normalized = normalized.split(key).join(value);
  }
  return normalized;
}

function getSimilarity(a: string, b: string): number {
  const cleanA = a.replace(/[^\w\sㄱ-ㅎㅏ-ㅣ가-힣]/g, '').replace(/\s+/g, '');
  const cleanB = b.replace(/[^\w\sㄱ-ㅎㅏ-ㅣ가-힣]/g, '').replace(/\s+/g, '');
  if (cleanA.length === 0 && cleanB.length === 0) return 1;
  
  const maxLengthRaw = Math.max(cleanA.length, cleanB.length);
  const distRaw = getLevenshteinDistance(cleanA, cleanB);
  const simRaw = 1 - distRaw / maxLengthRaw;

  const normA = normalizeSynonyms(cleanA);
  const normB = normalizeSynonyms(cleanB);
  const maxLengthNorm = Math.max(normA.length, normB.length);
  const distNorm = getLevenshteinDistance(normA, normB);
  const simNorm = 1 - distNorm / maxLengthNorm;

  return Math.max(simRaw, simNorm);
}

// Local Storage Implementation
class LocalStorage implements StorageInterface {
  async getPosts(): Promise<Post[]> {
    const localPosts = await localDb.posts.toArray();
    return localPosts.map(p => ({
      id: p.id!,
      title: p.title,
      body: p.body,
      category_id: 0,
      category_name: p.category_name,
      reference_url: p.reference_url,
      author_id: 0,
      created_at: p.created_at,
      processed_json: p.processed_json
    }));
  }

  async getPostById(id: number, isPersonal?: boolean, apiKey?: string): Promise<Post> {
    const post = await localDb.posts.get(id);
    if (!post) throw new Error("Post not found");

    let needsAnalysis = !post.processed_json;
    if (post.processed_json) {
      try {
        const parsed = JSON.parse(post.processed_json);
        const sentences = parsed.sentences || [];
        const isSentenceFallback = sentences.length === 0 || sentences.some((s: any) => s.tokens && s.tokens.some((t: any) => t.pos === '문장'));
        const isWordFallback = sentences.some((s: any) => s.tokens && s.tokens.some((t: any) => t.pos === '단어' && !t.reading));
        const hasFailedTranslation = sentences.some((s: any) => s.translation === '번역을 가져올 수 없습니다.');
        
        if (isSentenceFallback || hasFailedTranslation) {
          needsAnalysis = true;
        } else if (isWordFallback && apiKey) {
          needsAnalysis = true;
        }
      } catch (e) {
        needsAnalysis = true;
      }
    }

    if (needsAnalysis) {
      try {
        const analysis = await analyzeTextLocalOffline(post.body, apiKey);
        const processed_json = JSON.stringify(analysis);
        await localDb.posts.update(id, { processed_json });
        post.processed_json = processed_json;
      } catch (err) {
        console.error("Local offline analysis failed:", err);
      }
    }

    return {
      id: post.id!,
      title: post.title,
      body: post.body,
      category_id: 0,
      category_name: post.category_name,
      reference_url: post.reference_url,
      author_id: 0,
      created_at: post.created_at,
      processed_json: post.processed_json
    };
  }

  async createPost(title: string, body: string, category_name: string, reference_url: string, isPersonal?: boolean): Promise<number> {
    const id = await localDb.posts.add({
      title,
      body,
      category_name,
      reference_url,
      created_at: new Date().toISOString()
    });
    // Add category if new
    const exists = await localDb.categories.where('name').equals(category_name).first();
    if (!exists) {
      await localDb.categories.add({ name: category_name });
    }
    return id;
  }

  async updatePost(id: number, title: string, body: string, category_name: string, reference_url: string, isPersonal?: boolean): Promise<void> {
    const post = await localDb.posts.get(id);
    if (!post) return;
    const bodyChanged = post.body !== body;
    await localDb.posts.update(id, {
      title,
      body,
      category_name,
      reference_url,
      processed_json: bodyChanged ? undefined : post.processed_json
    });
    // If title changed, update related vocabulary post titles
    if (post.title !== title) {
      await localDb.vocabulary.where('post_title').equals(post.title).modify({ post_title: title });
    }
  }

  async deletePost(id: number, isPersonal?: boolean): Promise<void> {
    const post = await localDb.posts.get(id);
    if (!post) return;
    await localDb.posts.delete(id);
    await localDb.vocabulary.where('post_title').equals(post.title).delete();
  }

  async getCategories(isPersonal?: boolean): Promise<Category[]> {
    const items = await localDb.categories.toArray();
    return items.map(c => ({ id: c.id!, name: c.name }));
  }

  async getVocabulary(): Promise<PostVocabulary[]> {
    const vocabList = await localDb.vocabulary.toArray();
    const groups: Record<string, Vocabulary[]> = {};
    for (const v of vocabList) {
      if (!groups[v.post_title]) {
        groups[v.post_title] = [];
      }
      groups[v.post_title].push({
        word: v.word,
        reading_accent: v.reading_accent,
        meaning: v.meaning,
        level: v.level
      });
    }
    return Object.keys(groups).map(post_title => ({
      post_title,
      words: groups[post_title]
    }));
  }

  async addVocabulary(post_title: string, word: string, reading_accent: string, meaning: string, level: string): Promise<void> {
    const exists = await localDb.vocabulary
      .where('[post_title+word]')
      .equals([post_title, word])
      .first();
    if (!exists) {
      await localDb.vocabulary.add({
        post_title,
        word,
        reading_accent,
        meaning,
        level,
        created_at: new Date().toISOString()
      });
    }
  }

  async deleteVocabulary(post_title: string, word: string): Promise<void> {
    await localDb.vocabulary
      .where('[post_title+word]')
      .equals([post_title, word])
      .delete();
  }

  async deleteMultipleVocabulary(post_title: string, words: string[]): Promise<void> {
    for (const w of words) {
      await localDb.vocabulary
        .where('[post_title+word]')
        .equals([post_title, w])
        .delete();
    }
  }

  async extractDifficultWords(post_id: number, level: string, isPersonal?: boolean, apiKey?: string): Promise<number> {
    const post = await localDb.posts.get(post_id);
    if (!post) return 0;

    let extracted: { word: string; reading_accent: string; meaning: string; level?: string }[] = [];

    if (apiKey) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
        const prompt = `You are a Japanese vocabulary extractor. Analyze the following Japanese text and extract difficult words that are of JLPT level ${level} or higher (e.g. if level is N3, extract N3, N2, N1 level words).
Select about 8 to 15 key vocabulary items. For each extracted word, provide:
1. 'word': the word itself (base/dictionary form).
2. 'reading_accent': the pronunciation and accent in NHK Accent Dictionary format, like 'たべる[2]' or 'はな[2]'.
3. 'meaning': the Korean definition in the context of this text.
4. 'level': the estimated JLPT level of this word, which must be one of: 'N1', 'N2', 'N3', 'N4', 'N5'.

Text to analyze:
${post.body}`;

        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              responseMimeType: 'application/json',
              responseSchema: {
                type: 'OBJECT',
                properties: {
                  words: {
                    type: 'ARRAY',
                    items: {
                      type: 'OBJECT',
                      properties: {
                        word: { type: 'STRING' },
                        reading_accent: { type: 'STRING' },
                        meaning: { type: 'STRING' },
                        level: { type: 'STRING' }
                      },
                      required: ["word", "reading_accent", "meaning", "level"]
                    }
                  }
                },
                required: ["words"]
              }
            }
          })
        });

        const data = await response.json();
        const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        const resultObj = JSON.parse(rawText || '{}');
        extracted = resultObj.words || [];
      } catch (err) {
        console.warn("Client Gemini word extraction failed, falling back to local dictionary lookup:", err);
      }
    }

    // Local fallback using Morphological filter + Live Naver Dictionary lookups via proxy
    if (extracted.length === 0 && post.processed_json) {
      try {
        const parsed = JSON.parse(post.processed_json);
        const sentences = parsed.sentences || [];
        const candidates = new Set<string>();
        const wordInfoMap = new Map<string, { reading: string; reading_accent: string; pos: string }>();

        for (const s of sentences) {
          if (s.tokens) {
            for (const t of s.tokens) {
              const pos = t.pos || '';
              const base = t.base_form || t.surface;
              const isContentWord = ['명사', '동사', '형용사', '부사', '名詞', '動詞', '形容詞', '副詞'].some(x => pos.includes(x));
              if (isContentWord && base.length > 1) {
                candidates.add(base);
                wordInfoMap.set(base, { 
                  reading: t.reading || t.surface,
                  reading_accent: t.reading_accent || t.reading || t.surface,
                  pos 
                });
              }
            }
          }
        }

        const selectedCandidates = Array.from(candidates).slice(0, 25);
        const targetLevelNum = parseInt(level.replace('N', '')) || 3;

        const lookupPromises = selectedCandidates.map(async (word) => {
          const info = wordInfoMap.get(word);
          let meaning = '';
          let reading = info ? info.reading_accent : word;
          let wordLevel = '';

          try {
            const res = await fetch(`/api/lookup-dictionary?word=${encodeURIComponent(word)}`);
            if (res.ok) {
              const dictData = await res.json();
              meaning = dictData.meaning || '';
              if (dictData.accent) {
                reading = dictData.accent;
              }
              if (dictData.level) {
                wordLevel = dictData.level; // e.g. N3
              }
            }
          } catch (err) {
            console.error(`Failed to lookup dictionary for extracted word: ${word}`, err);
          }

          return {
            word,
            reading_accent: reading,
            meaning: meaning || '사전 뜻을 찾을 수 없습니다.',
            level: wordLevel
          };
        });

        const lookupResults = await Promise.all(lookupPromises);

        const matchedWords: typeof lookupResults = [];
        const otherWords: typeof lookupResults = [];

        for (const res of lookupResults) {
          if (res.level) {
            const levelNum = parseInt(res.level.replace('N', ''));
            if (!isNaN(levelNum) && levelNum <= targetLevelNum) {
              matchedWords.push(res);
            } else {
              otherWords.push(res);
            }
          } else {
            otherWords.push(res);
          }
        }

        // Fill up to 12 words (matched first, then fallback to others)
        extracted = [...matchedWords];
        if (extracted.length < 8) {
          extracted = [...extracted, ...otherWords.slice(0, 12 - extracted.length)];
        }
      } catch (err) {
        console.error("Local offline word extraction failed:", err);
      }
    }

    let addedCount = 0;
    for (const w of extracted) {
      const exists = await localDb.vocabulary
        .where('[post_title+word]')
        .equals([post.title, w.word])
        .first();
      if (!exists) {
        await localDb.vocabulary.add({
          post_title: post.title,
          word: w.word,
          reading_accent: w.reading_accent,
          meaning: w.meaning,
          level: w.level || '',
          created_at: new Date().toISOString()
        });
        addedCount++;
      }
    }
    return addedCount;
  }

  async gradeTranslation(original_sentence: string, user_translation: string, ai_translation: string, difficulty: string, apiKey?: string): Promise<{ is_correct: boolean; feedback: string }> {
    const cleanUser = (user_translation || '').trim();
    const cleanAI = (ai_translation || '').trim();

    if (apiKey) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
        const prompt = `You are a professional Japanese-Korean language teacher. Evaluate the user's Korean translation of a Japanese sentence.
Original Japanese: "${original_sentence}"
Reference AI Translation: "${cleanAI}"
User's Translation: "${cleanUser}"
Grading Standard (Difficulty Level): "${difficulty || 'medium'}"

Grading Criteria for Difficulty Levels:
- "high" (상): The translation must be highly accurate, with precise vocabulary and correct grammar/particles. Even small errors in particles or nuance should make it incorrect.
- "medium" (중): The core meaning and main sentence structure must be correct. Minor details or natural phrasing variations are accepted as correct.
- "low" (하): The general context and approximate meaning just need to be aligned. As long as the basic message is understood, it is accepted as correct.

Based on the criteria, determine if the user's translation is correct.
Provide 'is_correct' (boolean) and 'feedback' (Korean string).
The feedback must explain why it is correct or what was wrong/missing compared to the AI translation and the original sentence.
Keep the feedback extremely concise, direct, and constructive (no more than 2 sentences).`;

        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              responseMimeType: 'application/json',
              responseSchema: {
                type: 'OBJECT',
                properties: {
                  is_correct: { type: 'BOOLEAN' },
                  feedback: { type: 'STRING' }
                },
                required: ["is_correct", "feedback"]
              }
            }
          })
        });

        const data = await response.json();
        const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        return JSON.parse(rawText || '{}');
      } catch (err) {
        console.warn("Client Gemini grading failed, falling back to local Levenshtein:", err);
      }
    }

    // Fallback: Local Levenshtein Similarity
    const similarity = getSimilarity(cleanUser, cleanAI);
    const simPercent = Math.round(similarity * 100);
    
    let threshold = 0.65; // 'medium'
    if (difficulty === 'low') threshold = 0.40;
    if (difficulty === 'high') threshold = 0.85;

    const isCorrect = similarity >= threshold;
    let feedback = '';

    if (isCorrect) {
      feedback = `로컬 채점 완료 (유사도 ${simPercent}%): 모범 번역과 높은 일치율을 보입니다. 훌륭합니다!`;
    } else {
      feedback = `로컬 채점 완료 (유사도 ${simPercent}%): 모범 번역과 차이가 다소 큽니다. 핵심 단어와 어순을 확인해 보세요.`;
    }

    return {
      is_correct: isCorrect,
      feedback: feedback
    };
  }

  async updatePostProcessedJson(id: number, processedJson: string, isPersonal?: boolean): Promise<void> {
    await localDb.posts.update(id, { processed_json: processedJson });
  }
}

// Remote API Storage Implementation (SHARED Mode)
class RemoteStorage implements StorageInterface {
  async getPosts(isPersonal?: boolean): Promise<Post[]> {
    const res = await fetch('/api/posts');
    if (!res.ok) throw new Error("Failed to load posts");
    return res.json();
  }

  async getPostById(id: number, isPersonal?: boolean, apiKey?: string): Promise<Post> {
    const res = await fetch(`/api/posts/${id}`);
    if (!res.ok) throw new Error("Failed to load post");
    return res.json();
  }

  async createPost(title: string, body: string, category_name: string, reference_url: string, isPersonal?: boolean): Promise<number> {
    const res = await fetch('/api/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, body, category_name, reference_url })
    });
    if (!res.ok) throw new Error("Failed to create post");
    const data = await res.json();
    return data.id;
  }

  async updatePost(id: number, title: string, body: string, category_name: string, reference_url: string, isPersonal?: boolean): Promise<void> {
    const res = await fetch(`/api/posts/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, body, category_name, reference_url })
    });
    if (!res.ok) throw new Error("Failed to update post");
  }

  async deletePost(id: number, isPersonal?: boolean): Promise<void> {
    const res = await fetch(`/api/posts/${id}`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error("Failed to delete post");
  }

  async getCategories(isPersonal?: boolean): Promise<Category[]> {
    const res = await fetch('/api/categories');
    if (!res.ok) throw new Error("Failed to load categories");
    return res.json();
  }

  async getVocabulary(): Promise<PostVocabulary[]> {
    const res = await fetch('/api/vocabulary');
    if (!res.ok) throw new Error("Failed to load vocabulary");
    return res.json();
  }

  async addVocabulary(post_title: string, word: string, reading_accent: string, meaning: string, level: string): Promise<void> {
    const res = await fetch('/api/vocabulary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ post_title, word, reading_accent, meaning, level })
    });
    if (!res.ok) throw new Error("Failed to add word");
  }

  async deleteVocabulary(post_title: string, word: string): Promise<void> {
    const res = await fetch('/api/vocabulary/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ post_title, word })
    });
    if (!res.ok) throw new Error("Failed to delete word");
  }

  async deleteMultipleVocabulary(post_title: string, words: string[]): Promise<void> {
    const res = await fetch('/api/vocabulary/delete-multiple', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ post_title, words })
    });
    if (!res.ok) throw new Error("Failed to delete multiple words");
  }

  async extractDifficultWords(post_id: number, level: string, isPersonal?: boolean, apiKey?: string): Promise<number> {
    const res = await fetch('/api/extract-difficult-words', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ post_id, level })
    });
    if (!res.ok) throw new Error("Failed to extract words");
    const data = await res.json();
    return data.count;
  }

  async gradeTranslation(original_sentence: string, user_translation: string, ai_translation: string, difficulty: string, apiKey?: string): Promise<{ is_correct: boolean; feedback: string }> {
    const res = await fetch('/api/grade-translation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ original_sentence, user_translation, ai_translation, difficulty })
    });
    if (!res.ok) throw new Error("Failed to grade translation");
    return res.json();
  }

  async updatePostProcessedJson(id: number, processedJson: string, isPersonal?: boolean): Promise<void> {
    const res = await fetch(`/api/posts/${id}/processed-json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ processed_json: processedJson })
    });
    if (!res.ok) throw new Error("Failed to update post processed JSON");
  }
}

const localInstance = new LocalStorage();
const remoteInstance = new RemoteStorage();

export const storage: StorageInterface = {
  getPosts: (isPersonal) => isPersonal ? localInstance.getPosts() : remoteInstance.getPosts(),
  getPostById: (id, isPersonal, apiKey) => isPersonal ? localInstance.getPostById(id, isPersonal, apiKey) : remoteInstance.getPostById(id, isPersonal),
  createPost: (title, body, category_name, reference_url, isPersonal) => isPersonal ? localInstance.createPost(title, body, category_name, reference_url, isPersonal) : remoteInstance.createPost(title, body, category_name, reference_url, isPersonal),
  updatePost: (id, title, body, category_name, reference_url, isPersonal) => isPersonal ? localInstance.updatePost(id, title, body, category_name, reference_url, isPersonal) : remoteInstance.updatePost(id, title, body, category_name, reference_url, isPersonal),
  deletePost: (id, isPersonal) => isPersonal ? localInstance.deletePost(id, isPersonal) : remoteInstance.deletePost(id, isPersonal),
  getCategories: (isPersonal) => isPersonal ? localInstance.getCategories(isPersonal) : remoteInstance.getCategories(isPersonal),
  
  // Vocabulary ALWAYS goes to LocalStorage (IndexedDB)
  getVocabulary: () => localInstance.getVocabulary(),
  addVocabulary: (post_title, word, reading_accent, meaning, level) => localInstance.addVocabulary(post_title, word, reading_accent, meaning, level),
  deleteVocabulary: (post_title, word) => localInstance.deleteVocabulary(post_title, word),
  deleteMultipleVocabulary: (post_title, words) => localInstance.deleteMultipleVocabulary(post_title, words),
  
  extractDifficultWords: (post_id, level, isPersonal, apiKey) => isPersonal 
    ? localInstance.extractDifficultWords(post_id, level, isPersonal, apiKey) 
    : remoteInstance.extractDifficultWords(post_id, level, isPersonal),
  gradeTranslation: (original_sentence, user_translation, ai_translation, difficulty, apiKey) => {
    // Grade translation can use remoteInstance (calls express server Gemini or Levenshtein fallback)
    return remoteInstance.gradeTranslation(original_sentence, user_translation, ai_translation, difficulty, apiKey);
  },
  updatePostProcessedJson: (id, processedJson, isPersonal) => 
    isPersonal 
      ? localInstance.updatePostProcessedJson(id, processedJson, isPersonal) 
      : remoteInstance.updatePostProcessedJson(id, processedJson, isPersonal)
};
