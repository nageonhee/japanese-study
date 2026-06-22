import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import Database from 'better-sqlite3';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';
import kuromoji from 'kuromoji';
import crypto from 'crypto';

const envSharedPath = path.join(process.cwd(), '.env.shared');
const envPath = path.join(process.cwd(), '.env');
if (fs.existsSync(envSharedPath)) {
  dotenv.config({ path: envSharedPath });
}
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

// Initialize Kuromoji
let tokenizer: kuromoji.Tokenizer<kuromoji.IpadicFeatures> | null = null;
kuromoji.builder({ dicPath: path.join(process.cwd(), 'node_modules/kuromoji/dict') }).build((err, _tokenizer) => {
  if (err) {
    console.error("Failed to build kuromoji tokenizer:", err);
  } else {
    tokenizer = _tokenizer;
    console.log("Kuromoji tokenizer successfully initialized.");
  }
});

// ========== Accent Dictionary (Kanjium accents.txt) ==========
// Map: word -> [{ reading: string, accent: string }]
const accentDict = new Map<string, { reading: string; accent: string }[]>();
const accentByReading = new Map<string, { word: string; accent: string }[]>();

function loadAccentDictionary() {
  const accentPath = path.join(process.cwd(), 'assets', 'accents.txt');
  if (!fs.existsSync(accentPath)) {
    console.warn('Accent dictionary not found at', accentPath);
    return;
  }
  const content = fs.readFileSync(accentPath, 'utf-8');
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim()) continue;
    const parts = line.split('\t');
    if (parts.length < 3) continue;
    const [word, reading, accent] = parts;
    const cleanWord = word.trim();
    const cleanReading = reading.trim();
    const cleanAccent = accent.trim().split(',')[0]; // Take first accent if multiple
    
    // Index by word (kanji/surface)
    if (!accentDict.has(cleanWord)) {
      accentDict.set(cleanWord, []);
    }
    accentDict.get(cleanWord)!.push({ reading: cleanReading, accent: cleanAccent });
    
    // Index by reading (hiragana) for fallback lookup
    if (cleanReading) {
      if (!accentByReading.has(cleanReading)) {
        accentByReading.set(cleanReading, []);
      }
      accentByReading.get(cleanReading)!.push({ word: cleanWord, accent: cleanAccent });
    }
  }
  console.log(`Accent dictionary loaded: ${accentDict.size} words`);
}
loadAccentDictionary();

// Lookup accent for a word, optionally with reading hint
function lookupAccent(word: string, readingHint?: string): { reading: string; accent: string; formatted: string } | null {
  const entries = accentDict.get(word);
  if (entries && entries.length > 0) {
    // If reading hint provided, find best match
    let best = entries[0];
    if (readingHint) {
      const match = entries.find(e => e.reading === readingHint);
      if (match) best = match;
    }
    return {
      reading: best.reading || readingHint || '',
      accent: best.accent,
      formatted: formatAccentNotation(best.reading || readingHint || '', best.accent)
    };
  }
  // Fallback: lookup by reading
  if (readingHint) {
    const byReading = accentByReading.get(readingHint);
    if (byReading && byReading.length > 0) {
      return {
        reading: readingHint,
        accent: byReading[0].accent,
        formatted: formatAccentNotation(readingHint, byReading[0].accent)
      };
    }
  }
  return null;
}

// Format accent in NHK-style notation:
// Accent 0 (平板型): よみがな￣[0]
// Accent N (起伏型): (よみ＼がな)[N] - with ＼ after the Nth mora
function formatAccentNotation(reading: string, accentStr: string): string {
  if (!reading) return '';
  const accentNum = parseInt(accentStr, 10);
  if (isNaN(accentNum)) return reading;
  
  // Split reading into morae
  const morae = splitIntoMorae(reading);
  
  if (accentNum === 0) {
    // 平板型: reading￣ [0]
    return `${reading}￣ [0]`;
  } else {
    // 起伏型: insert ＼ after the accent mora
    // mora1mora2＼mora3... [N]
    let result = '';
    for (let i = 0; i < morae.length; i++) {
      result += morae[i];
      if (i === accentNum - 1) {
        result += '＼';
      }
    }
    return `${result} [${accentNum}]`;
  }
}

// Split Japanese reading into morae (拗音 like きゃ count as 1 mora)
function splitIntoMorae(text: string): string[] {
  const morae: string[] = [];
  const smallKana = 'ぁぃぅぇぉゃゅょゎァィゥェォャュョヮ';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    // Check if next char is small kana (part of compound mora)
    if (i + 1 < text.length && smallKana.includes(text[i + 1])) {
      morae.push(ch + text[i + 1]);
      i++; // skip next
    } else {
      morae.push(ch);
    }
  }
  return morae;
}

// Katakana to Hiragana utility
function katakanaToHiragana(src: string): string {
  return src.replace(/[\u30a1-\u30f6]/g, (match) => {
    const chr = match.charCodeAt(0) - 0x60;
    return String.fromCharCode(chr);
  });
}

// Japanese POS to Korean POS map
const posMap: Record<string, string> = {
  '名詞': '명사',
  '動詞': '동사',
  '形容詞': '형용사',
  '副詞': '부사',
  '助詞': '조사',
  '助動詞': '조동사',
  '接続詞': '접속사',
  '代名詞': '대명사',
  '連体詞': '연체사',
  '感動詞': '감탄사',
  '記号': '기호',
  'その他': '기타'
};

const db = new Database('data.db', { verbose: console.log });
db.pragma('journal_mode = WAL');

// Migrate vocabulary table if it doesn't have the new schema
try {
  const info = db.prepare("PRAGMA table_info(vocabulary)").all() as any[];
  if (info.length > 0) {
    const hasPostTitle = info.some(col => col.name === 'post_title');
    if (!hasPostTitle) {
      console.log("Dropping old vocabulary table to recreate with new schema...");
      db.exec("DROP TABLE vocabulary");
    }
  }
} catch (e) {
  console.error("Migration check failed:", e);
}

// Helper to hash password
function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// Initialize DB schema
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password_hash TEXT,
    role TEXT DEFAULT 'user',
    session_token TEXT
  );

  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE
  );

  CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    body TEXT,
    category_id INTEGER,
    reference_url TEXT,
    author_id INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed_json TEXT,
    FOREIGN KEY(category_id) REFERENCES categories(id),
    FOREIGN KEY(author_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS vocabulary (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    post_title TEXT,
    word TEXT,
    reading_accent TEXT,
    meaning TEXT,
    level TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS learning_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    post_id INTEGER,
    sentence_index INTEGER,
    user_translation TEXT,
    is_correct BOOLEAN,
    feedback TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(post_id) REFERENCES posts(id)
  );
  
  INSERT OR IGNORE INTO categories (name) VALUES ('News'), ('Column'), ('Editorial');
`);

// Migration for existing database
try {
  db.exec("ALTER TABLE posts ADD COLUMN processed_json TEXT;");
} catch (e) {
  // Column already exists, safe to ignore
}

try {
  db.exec("ALTER TABLE users ADD COLUMN password_hash TEXT;");
} catch (e) {
  // Column already exists, safe to ignore
}

try {
  db.exec("ALTER TABLE users ADD COLUMN session_token TEXT;");
} catch (e) {
  // Column already exists, safe to ignore
}

// Seed admin user with default credentials
const adminPasswordHash = hashPassword('admin123');
const adminRow = db.prepare('SELECT id, password_hash FROM users WHERE username = ?').get('admin') as { id: number; password_hash: string } | undefined;
if (!adminRow) {
  db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)')
    .run('admin', adminPasswordHash, 'admin');
} else if (!adminRow.password_hash) {
  db.prepare('UPDATE users SET password_hash = ? WHERE username = ?').run(adminPasswordHash, 'admin');
}

// Seed master user (chris77467 / hitler77*)
const masterPasswordHash = hashPassword('hitler77*');
const masterRow = db.prepare('SELECT id, password_hash FROM users WHERE username = ?').get('chris77467') as { id: number; password_hash: string } | undefined;
if (!masterRow) {
  db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)')
    .run('chris77467', masterPasswordHash, 'master');
} else {
  db.prepare('UPDATE users SET password_hash = ?, role = ? WHERE username = ?')
    .run(masterPasswordHash, 'master', 'chris77467');
}

// Mock user for simplicity
const getAdminId = () => {
  const row = db.prepare('SELECT id FROM users WHERE username = ?').get('admin') as { id: number };
  return row?.id || 1;
};

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // --- Authentication Middleware ---
  const authenticate = (req: any, res: any, next: any) => {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
    if (!token) {
      res.status(401).json({ error: '인증이 필요합니다.' });
      return;
    }
    try {
      const user = db.prepare('SELECT id, username, role FROM users WHERE session_token = ?').get(token) as any;
      if (!user) {
        res.status(401).json({ error: '유효하지 않거나 만료된 세션입니다.' });
        return;
      }
      req.user = user;
      next();
    } catch (err) {
      res.status(500).json({ error: '인증 처리 중 오류가 발생했습니다.' });
    }
  };

  // --- Auth Endpoints ---
  app.post('/api/auth/signup', (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        res.status(400).json({ error: '사용자명과 비밀번호를 입력해주세요.' });
        return;
      }
      if (username.length < 2) {
        res.status(400).json({ error: '사용자명은 최소 2글자 이상이어야 합니다.' });
        return;
      }
      if (password.length < 4) {
        res.status(400).json({ error: '비밀번호는 최소 4글자 이상이어야 합니다.' });
        return;
      }

      // Check if user already exists
      const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
      if (existing) {
        res.status(400).json({ error: '이미 사용 중인 사용자명입니다.' });
        return;
      }

      const pHash = hashPassword(password);
      const token = crypto.randomUUID();
      const info = db.prepare('INSERT INTO users (username, password_hash, role, session_token) VALUES (?, ?, ?, ?)')
        .run(username, pHash, 'user', token);

      res.json({
        id: info.lastInsertRowid,
        username,
        role: 'user',
        token
      });
    } catch (e) {
      console.error('Signup error:', e);
      res.status(500).json({ error: '회원가입 실패' });
    }
  });

  app.post('/api/auth/login', (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        res.status(400).json({ error: '사용자명과 비밀번호를 입력해주세요.' });
        return;
      }

      const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as any;
      if (!user) {
        res.status(400).json({ error: '가입되지 않은 사용자명이거나 비밀번호가 틀렸습니다.' });
        return;
      }

      const pHash = hashPassword(password);
      if (user.password_hash !== pHash) {
        res.status(400).json({ error: '가입되지 않은 사용자명이거나 비밀번호가 틀렸습니다.' });
        return;
      }

      const token = crypto.randomUUID();
      db.prepare('UPDATE users SET session_token = ? WHERE id = ?').run(token, user.id);

      res.json({
        id: user.id,
        username: user.username,
        role: user.role,
        token
      });
    } catch (e) {
      console.error('Login error:', e);
      res.status(500).json({ error: '로그인 실패' });
    }
  });

  app.post('/api/auth/logout', authenticate, (req: any, res) => {
    try {
      db.prepare('UPDATE users SET session_token = NULL WHERE id = ?').run(req.user.id);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: '로그아웃 실패' });
    }
  });

  app.get('/api/auth/me', authenticate, (req: any, res) => {
    res.json(req.user);
  });

  // Helper function to translate text using Google Translate Free API
  async function translateTextUsingGoogle(text: string): Promise<string> {
    try {
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=ja&tl=ko&dt=t&q=${encodeURIComponent(text)}`;
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        }
      });
      if (!res.ok) throw new Error(`Google Translate API returned status ${res.status}`);
      const data = await res.json() as any;
      if (data && data[0] && Array.isArray(data[0])) {
        const translatedParts = data[0]
          .map((part: any) => part[0])
          .filter((val: any) => typeof val === 'string');
        return translatedParts.join('').trim();
      }
      return '';
    } catch (err) {
      console.error("Google Translation failed:", err);
      return '번역을 가져올 수 없습니다.';
    }
  }

  interface MergedToken {
    surface: string;
    base_form: string;
    reading: string;
    pos: string;
  }

  function mergeKuromojiTokens(rawTokens: kuromoji.IpadicFeatures[]): MergedToken[] {
    if (rawTokens.length === 0) return [];
    
    const merged: MergedToken[] = [];
    
    let i = 0;
    while (i < rawTokens.length) {
      const current = rawTokens[i];
      let surface = current.surface_form;
      let base = current.basic_form === '*' ? current.surface_form : current.basic_form;
      let reading = current.reading ? katakanaToHiragana(current.reading) : current.surface_form;
      let pos = current.pos;
      
      i++;
      
      while (i < rawTokens.length) {
        const next = rawTokens[i];
        
        const isConsecutiveNouns = pos.startsWith('名詞') && next.pos.startsWith('名詞');
        const isVerbAux = (pos.startsWith('動詞') || pos.startsWith('形容詞') || pos.startsWith('助動詞')) && next.pos.startsWith('助動詞');
        const isSuffix = next.pos.includes('接尾');
        const isPrefix = pos.includes('接頭');
        
        if (isConsecutiveNouns || isVerbAux || isSuffix || isPrefix) {
          surface += next.surface_form;
          base += (next.basic_form === '*' ? next.surface_form : next.basic_form);
          reading += (next.reading ? katakanaToHiragana(next.reading) : next.surface_form);
          if (pos.startsWith('接頭')) {
            pos = next.pos;
          }
          i++;
        } else {
          break;
        }
      }
      
      merged.push({
        surface,
        base_form: base,
        reading,
        pos: posMap[pos] || pos || '기타'
      });
    }
    
    return merged;
  }

  function tokenizeWithIntlSegmenter(sentence: string, tokensList: any[]) {
    const hasSegmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl;
    if (hasSegmenter) {
      try {
        const segmenter = new Intl.Segmenter('ja-JP', { granularity: 'word' });
        const segments = segmenter.segment(sentence);
        const isJapaneseOrAlphanumeric = (str: string) => {
          return /[\u4e00-\u9faf\u3040-\u309f\u30a0-\u30ff\uff66-\uff9fA-Za-z0-9]/.test(str);
        };
        for (const segment of segments) {
          const surface = segment.segment;
          const isWord = isJapaneseOrAlphanumeric(surface);
          tokensList.push({
            surface,
            base_form: surface,
            reading: '',
            reading_accent: '',
            pos: isWord ? '단어' : '기호',
            meaning: ''
          });
        }
        return;
      } catch (err) {
        console.error("Intl.Segmenter fallback failed in server:", err);
      }
    }
    // Deep fallback if Intl.Segmenter is not available
    tokensList.push({
      surface: sentence,
      base_form: sentence,
      reading: '',
      reading_accent: '',
      pos: '문장',
      meaning: ''
    });
  }

  // Character-level DP alignment between original text and Gemini's Hiragana output
  function alignOriginalAndHiragana(original: string, hiragana: string): string[] {
    const N = original.length;
    const M = hiragana.length;

    const dp: number[][] = Array.from({ length: N + 1 }, () => Array(M + 1).fill(Infinity));
    const choice: { type: string; len?: number }[][] = Array.from({ length: N + 1 }, () => Array(M + 1));

    const isKanjiChar = (ch: string) => /[\u4e00-\u9faf\u3400-\u4dbf\uf900-\ufaff々]/.test(ch);
    
    const toHira = (ch: string) => {
      if (!ch) return '';
      const code = ch.charCodeAt(0);
      if (code >= 0x30a1 && code <= 0x30f6) {
        return String.fromCharCode(code - 0x60);
      }
      return ch;
    };

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

  // Re-inserts the original whitespaces and newlines back into token list as 기호 tokens
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

  // Fallback segmenter with alignment mapping
  function tokenizeWithIntlSegmenterAndAlignment(sentence: string, tokensList: any[], startIdx: number, fullAlignment: string[]) {
    const hasSegmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl;
    if (hasSegmenter) {
      try {
        const segmenter = new Intl.Segmenter('ja-JP', { granularity: 'word' });
        const segments = segmenter.segment(sentence);
        const isJapaneseOrAlphanumeric = (str: string) => {
          return /[\u4e00-\u9faf\u3040-\u309f\u30a0-\u30ff\uff66-\uff9fA-Za-z0-9]/.test(str);
        };
        let currentOffset = 0;
        for (const segment of segments) {
          const surface = segment.segment;
          const isWord = isJapaneseOrAlphanumeric(surface);
          
          let tokStart = sentence.indexOf(surface, currentOffset);
          if (tokStart === -1) tokStart = currentOffset;
          const tokEnd = tokStart + surface.length;
          currentOffset = tokEnd;
          
          const absStart = startIdx + tokStart;
          const absEnd = startIdx + tokEnd;
          
          let tokenReading = '';
          if (absStart >= 0 && absEnd <= fullAlignment.length) {
            tokenReading = fullAlignment.slice(absStart, absEnd).join('');
          }
          
          tokensList.push({
            surface,
            base_form: surface,
            reading: tokenReading,
            reading_accent: '',
            pos: isWord ? '단어' : '기호',
            meaning: ''
          });
        }
        return;
      } catch (err) {
        console.error("Intl.Segmenter alignment failed:", err);
      }
    }
    tokensList.push({
      surface: sentence,
      base_form: sentence,
      reading: '',
      reading_accent: '',
      pos: '문장',
      meaning: ''
    });
  }

  // Split text into sentences preserving original characters/newlines
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

  // Gemini single-payload translation & hiragana conversion function
  async function analyzeTextWithGeminiCombined(text: string): Promise<any> {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error('GEMINI_API_KEY environment variable is missing.');
    }

    const ai = new GoogleGenAI({ apiKey: key });
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

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            hiragana: { type: Type.STRING },
            sentences: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  original: { type: Type.STRING },
                  translation: { type: Type.STRING }
                },
                required: ["original", "translation"]
              }
            }
          },
          required: ["hiragana", "sentences"]
        }
      }
    });

    return JSON.parse(response.text || '{}');
  }

  // Text analyzer combining Gemini optimized API calls and local alignment
  async function analyzeTextLocally(text: string): Promise<any> {
    const key = process.env.GEMINI_API_KEY;

    // 1. Gemini hybrid mode
    if (key && key !== "YOUR_GEMINI_API_KEY") {
      try {
        console.log("Analyzing text using Gemini combined optimized mode...");
        const result = await analyzeTextWithGeminiCombined(text);
        const fullHiragana = result.hiragana || '';
        const geminiSentences = result.sentences || [];

        const fullAlignment = alignOriginalAndHiragana(text, fullHiragana);

        const sentences: any[] = [];
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
            if (tokenizer) {
              try {
                const parsedTokens = tokenizer.tokenize(sentText);
                const mergedTokens = mergeKuromojiTokens(parsedTokens);

                let currentOffset = 0;
                for (const t of mergedTokens) {
                  let tokStart = sentText.indexOf(t.surface, currentOffset);
                  if (tokStart === -1) tokStart = currentOffset;
                  const tokEnd = tokStart + t.surface.length;
                  currentOffset = tokEnd;

                  const absStart = startIdx + tokStart;
                  const absEnd = startIdx + tokEnd;

                  let tokenReading = '';
                  if (absStart >= 0 && absEnd <= fullAlignment.length) {
                    tokenReading = fullAlignment.slice(absStart, absEnd).join('');
                  } else {
                    tokenReading = t.reading;
                  }

                  const accentInfo = lookupAccent(t.base_form || t.surface, tokenReading || undefined);

                  tokens.push({
                    surface: t.surface,
                    base_form: t.base_form,
                    reading: tokenReading,
                    reading_accent: accentInfo ? accentInfo.formatted : '',
                    pos: t.pos,
                    meaning: ''
                  });
                }
              } catch (tokErr) {
                console.error("Kuromoji tokenization failed for sentence:", sentText, tokErr);
                tokenizeWithIntlSegmenterAndAlignment(sentText, tokens, startIdx, fullAlignment);
              }
            } else {
              tokenizeWithIntlSegmenterAndAlignment(sentText, tokens, startIdx, fullAlignment);
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
      } catch (geminiErr) {
        console.warn("Gemini hybrid analysis failed, falling back to local analysis:", geminiErr);
      }
    }

    // 2. Offline / Local fallback using Kuromoji (0 cost)
    console.log("Analyzing text using local offline mode (Kuromoji)...");
    const rawSentences = splitTextIntoSentences(text);
    const sentences: any[] = [];

    for (const originalSentence of rawSentences) {
      let translation = '번역을 가져올 수 없습니다.';
      if (originalSentence.trim()) {
        try {
          translation = await translateTextUsingGoogle(originalSentence);
        } catch (err) {
          translation = '번역을 가져올 수 없습니다.';
        }
      } else {
        translation = originalSentence; // newlines/spaces translate to themselves
      }

      const tokens: any[] = [];
      if (originalSentence.trim()) {
        if (tokenizer) {
          try {
            const parsedTokens = tokenizer.tokenize(originalSentence);
            const mergedTokens = mergeKuromojiTokens(parsedTokens);

            for (const t of mergedTokens) {
              const hiraReading = t.reading;
              const accentInfo = lookupAccent(t.base_form || t.surface, hiraReading || undefined);

              tokens.push({
                surface: t.surface,
                base_form: t.base_form,
                reading: hiraReading,
                reading_accent: accentInfo ? accentInfo.formatted : '',
                pos: t.pos,
                meaning: ''
              });
            }
          } catch (tokErr) {
            console.error("Kuromoji tokenization failed for sentence:", originalSentence, tokErr);
            tokenizeWithIntlSegmenter(originalSentence, tokens);
          }
        } else {
          tokenizeWithIntlSegmenter(originalSentence, tokens);
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

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // Posts
  app.get('/api/posts', authenticate, (req: any, res) => {
    const posts = db.prepare(`
      SELECT p.*, c.name as category_name 
      FROM posts p 
      LEFT JOIN categories c ON p.category_id = c.id
      ORDER BY p.created_at DESC
    `).all();
    res.json(posts);
  });

  app.get('/api/posts/:id', authenticate, async (req: any, res) => {
    try {
      const post = db.prepare(`
        SELECT p.*, c.name as category_name 
        FROM posts p 
        LEFT JOIN categories c ON p.category_id = c.id 
        WHERE p.id = ?
      `).get(req.params.id) as any;

      if (!post) {
        res.status(404).json({ error: 'Post not found' });
        return;
      }

      // If processed_json is missing or a fallback, analyze it on the fly and save to DB
      let needsAnalysis = !post.processed_json;
      if (post.processed_json) {
        try {
          const parsed = JSON.parse(post.processed_json);
          const sentences = parsed.sentences || [];
          const hasSentenceFallback = sentences.length === 0 || sentences.some((s: any) => s.tokens && s.tokens.some((t: any) => t.pos === '문장'));
          const hasWordFallback = sentences.some((s: any) => s.tokens && s.tokens.some((t: any) => t.pos === '단어' && !t.reading));
          const hasFailedTranslation = sentences.some((s: any) => s.translation === '번역을 가져올 수 없습니다.');
          
          if (hasSentenceFallback || hasFailedTranslation) {
            needsAnalysis = true;
          } else if (hasWordFallback) {
            // Re-analyze if we now have either a Gemini key or the Kuromoji tokenizer is ready
            const key = process.env.GEMINI_API_KEY;
            const hasGemini = key && key !== "YOUR_GEMINI_API_KEY";
            if (hasGemini || tokenizer !== null) {
              needsAnalysis = true;
            }
          }
        } catch (e) {
          needsAnalysis = true;
        }
      }

      if (needsAnalysis) {
        try {
          const analysis = await analyzeTextLocally(post.body);
          const analysisStr = JSON.stringify(analysis);
          db.prepare('UPDATE posts SET processed_json = ? WHERE id = ?').run(analysisStr, post.id);
          post.processed_json = analysisStr;
        } catch (err) {
          console.error("Failed to analyze post on GET:", err);
        }
      }

      res.json(post);
    } catch (e) {
      res.status(500).json({ error: 'Failed to retrieve post' });
    }
  });

  app.post('/api/posts', authenticate, async (req: any, res) => {
    try {
      const { title, body, category_name, reference_url } = req.body;
      let category_id;
      
      if (category_name) {
        const existingParams = db.prepare('SELECT id FROM categories WHERE name = ?').get(category_name) as { id: number } | undefined;
        
        if (existingParams) {
          category_id = existingParams.id;
        } else {
          const info = db.prepare('INSERT INTO categories (name) VALUES (?)').run(category_name);
          category_id = info.lastInsertRowid;
        }
      }

      const info = db.prepare(
        'INSERT INTO posts (title, body, category_id, reference_url, author_id, processed_json) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(title, body, category_id, reference_url, req.user.id, null);
      
      res.json({ id: info.lastInsertRowid });
    } catch (e) {
      res.status(500).json({ error: 'Failed to create post' });
    }
  });

  app.put('/api/posts/:id', authenticate, async (req: any, res) => {
    try {
      const id = req.params.id;
      const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(id) as any;
      if (!post) {
        return res.status(404).json({ error: 'Post not found' });
      }

      const isAuthor = req.user.id === post.author_id;
      const isAdminOrAbove = ['admin', 'host', 'master'].includes(req.user.role);
      if (!isAdminOrAbove && !isAuthor) {
        return res.status(403).json({ error: '권한이 없습니다.' });
      }

      const { title, body, category_name, reference_url } = req.body;
      let category_id = post.category_id;
      
      if (category_name) {
        const existing = db.prepare('SELECT id FROM categories WHERE name = ?').get(category_name) as { id: number } | undefined;
        if (existing) {
          category_id = existing.id;
        } else {
          const info = db.prepare('INSERT INTO categories (name) VALUES (?)').run(category_name);
          category_id = info.lastInsertRowid;
        }
      }

      // If the body changed, clear processed_json to force re-analysis on next view
      let processed_json = post.processed_json;
      if (body !== post.body) {
        processed_json = null;
      }

      // Update posts table
      db.prepare(
        'UPDATE posts SET title = ?, body = ?, category_id = ?, reference_url = ?, processed_json = ? WHERE id = ?'
      ).run(title, body, category_id, reference_url, processed_json, id);

      // If title changed, update corresponding vocabulary entries' post_title
      if (title !== post.title) {
        db.prepare('UPDATE vocabulary SET post_title = ? WHERE post_title = ?').run(title, post.title);
      }

      res.json({ success: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Failed to update post' });
    }
  });

  app.put('/api/posts/:id/processed-json', authenticate, async (req: any, res) => {
    try {
      const id = req.params.id;
      const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(id) as any;
      if (!post) {
        return res.status(404).json({ error: 'Post not found' });
      }

      const isAuthor = req.user.id === post.author_id;
      const isAdminOrAbove = ['admin', 'host', 'master'].includes(req.user.role);
      if (!isAdminOrAbove && !isAuthor) {
        return res.status(403).json({ error: '권한이 없습니다.' });
      }

      const { processed_json } = req.body;
      db.prepare('UPDATE posts SET processed_json = ? WHERE id = ?').run(processed_json, id);
      res.json({ success: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Failed to update post processed JSON' });
    }
  });

  // Delete a post and its vocabulary file
  app.delete('/api/posts/:id', authenticate, (req: any, res) => {
    try {
      const id = req.params.id;
      const post = db.prepare('SELECT title, author_id FROM posts WHERE id = ?').get(id) as { title: string; author_id: number } | undefined;
      if (!post) {
        res.status(404).json({ error: 'Post not found' });
        return;
      }

      const isAuthor = req.user.id === post.author_id;
      const isAdminOrAbove = ['admin', 'host', 'master'].includes(req.user.role);
      if (!isAdminOrAbove && !isAuthor) {
        res.status(403).json({ error: '권한이 없습니다.' });
        return;
      }
      
      // Delete from posts table
      db.prepare('DELETE FROM posts WHERE id = ?').run(id);

      // Delete corresponding vocabulary database records for this post
      db.prepare('DELETE FROM vocabulary WHERE post_title = ?').run(post.title);

      res.json({ success: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Failed to delete post' });
    }
  });

  // --- Admin/Member Management Endpoints ---

  // Get all users (ID, Username, Role)
  app.get('/api/admin/users', authenticate, (req: any, res) => {
    try {
      const isAdminOrAbove = ['admin', 'host', 'master'].includes(req.user.role);
      if (!isAdminOrAbove) {
        return res.status(403).json({ error: '권한이 없습니다.' });
      }
      
      const users = db.prepare('SELECT id, username, role FROM users ORDER BY id ASC').all();
      res.json(users);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: '회원 목록을 불러오는 중 오류가 발생했습니다.' });
    }
  });

  // Modify user role
  app.put('/api/admin/users/:id/role', authenticate, (req: any, res) => {
    try {
      const targetId = parseInt(req.params.id, 10);
      const { role: newRole } = req.body;
      
      const allowedRoles = ['master', 'host', 'admin', 'user'];
      if (!allowedRoles.includes(newRole)) {
        return res.status(400).json({ error: '유효하지 않은 역할입니다.' });
      }

      // Check current user permission
      const isAdminOrAbove = ['admin', 'host', 'master'].includes(req.user.role);
      if (!isAdminOrAbove) {
        return res.status(403).json({ error: '권한이 없습니다.' });
      }

      // Retrieve target user
      const target = db.prepare('SELECT * FROM users WHERE id = ?').get(targetId) as any;
      if (!target) {
        return res.status(404).json({ error: '존재하지 않는 회원입니다.' });
      }

      // Lock Master Account (chris77467)
      if (target.username === 'chris77467' || target.role === 'master') {
        return res.status(403).json({ error: '생성자 계정의 역할은 수정할 수 없습니다.' });
      }

      if (targetId === req.user.id) {
        return res.status(403).json({ error: '본인 계정의 역할은 수정할 수 없습니다.' });
      }

      // Role permission hierarchy check
      if (req.user.role === 'admin') {
        // admin cannot modify roles
        return res.status(403).json({ error: '관리자는 등급 변경 권한이 없습니다.' });
      }

      if (req.user.role === 'host') {
        // host can only change role of users who are currently admins or users, and can only promote/demote between admin and user
        if (!['admin', 'user'].includes(target.role) || !['admin', 'user'].includes(newRole)) {
          return res.status(403).json({ error: '방장은 관리자와 일반 회원 간의 등급 변경만 가능합니다.' });
        }
      }

      // Update in DB
      db.prepare('UPDATE users SET role = ? WHERE id = ?').run(newRole, targetId);
      res.json({ success: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: '역할 수정 중 오류가 발생했습니다.' });
    }
  });

  // Delete user
  app.delete('/api/admin/users/:id', authenticate, (req: any, res) => {
    try {
      const targetId = parseInt(req.params.id, 10);

      // Check current user permission
      const isAdminOrAbove = ['admin', 'host', 'master'].includes(req.user.role);
      if (!isAdminOrAbove) {
        return res.status(403).json({ error: '권한이 없습니다.' });
      }

      // Retrieve target user
      const target = db.prepare('SELECT * FROM users WHERE id = ?').get(targetId) as any;
      if (!target) {
        return res.status(404).json({ error: '존재하지 않는 회원입니다.' });
      }

      // Lock Master Account (chris77467)
      if (target.username === 'chris77467' || target.role === 'master') {
        return res.status(403).json({ error: '생성자 계정은 삭제할 수 없습니다.' });
      }

      if (targetId === req.user.id) {
        return res.status(403).json({ error: '본인 계정은 삭제할 수 없습니다.' });
      }

      // Role permission hierarchy check
      if (req.user.role === 'admin') {
        // admin can only delete user
        if (target.role !== 'user') {
          return res.status(403).json({ error: '관리자는 일반 회원만 삭제할 수 있습니다.' });
        }
      }

      if (req.user.role === 'host') {
        // host can delete admin and user, but not other hosts or master
        if (!['admin', 'user'].includes(target.role)) {
          return res.status(403).json({ error: '방장은 관리자와 일반 회원만 삭제할 수 있습니다.' });
        }
      }

      // Delete user
      db.prepare('DELETE FROM users WHERE id = ?').run(targetId);
      // Delete user's vocabulary
      db.prepare('DELETE FROM vocabulary WHERE user_id = ?').run(targetId);

      res.json({ success: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: '회원 삭제 중 오류가 발생했습니다.' });
    }
  });

  // Categories
  app.get('/api/categories', authenticate, (req: any, res) => {
    const categories = db.prepare('SELECT * FROM categories').all();
    res.json(categories);
  });

  // Process text using local tokenization and free translation to get tokens
  app.post('/api/process-text', async (req: any, res) => {
    try {
      const { text } = req.body;
      const resultObj = await analyzeTextLocally(text);
      res.json(resultObj);
    } catch (error) {
      console.error("Error processing text locally:", error);
      res.status(500).json({ error: 'Failed to process text' });
    }
  });

  // Free Japanese-Korean dictionary lookup using Naver Dictionary internal API
  app.get('/api/lookup-dictionary', async (req: any, res) => {
    try {
      const word = req.query.word as string;
      if (!word) return res.status(400).json({ error: 'Word parameter is required' });

      const url = `https://ja.dict.naver.com/api3/jako/search?query=${encodeURIComponent(word)}`;
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Referer': 'https://ja.dict.naver.com/',
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7'
        }
      });
      const text = await response.text();
      let data: any = {};
      try {
        data = JSON.parse(text);
      } catch (jsonErr) {
        console.error("Failed to parse Naver API response as JSON. Raw text:", text);
        throw jsonErr;
      }
      
      let meaning = '';
      let reading = '';
      let jlptLevel = '';

      const items = data?.searchResultMap?.searchResultListMap?.WORD?.items;
      if (items && items.length > 0) {
        // filter out items that don't have meansCollector to get the best match
        const bestItem = items.find((item: any) => item.meansCollector && item.meansCollector.length > 0) || items[0];
        jlptLevel = parseJlptLevel(bestItem.frequencyAdd);
        
        if (bestItem.meansCollector) {
          meaning = bestItem.meansCollector
            .map((m: any) => {
              if (m.means && Array.isArray(m.means)) {
                return m.means.map((sub: any) => sub.value).join(', ');
              }
              return m.value || '';
            })
            .filter(Boolean)
            .join(', ')
            .replace(/<[^>]*>/g, ''); // strip HTML tags
        }
        if (bestItem.expEntry) {
          reading = bestItem.expEntry;
        } else if (bestItem.show_hira) {
          reading = bestItem.show_hira;
        }
      }

      // Also include accent info if available - prefer the reading hint from frontend (Kuromoji-based)
      const readingHint = (req.query.reading as string) || reading || undefined;
      const accentInfo = lookupAccent(word, readingHint);
      res.json({ 
        meaning: meaning || '사전 뜻을 찾을 수 없습니다.', 
        reading,
        accent: accentInfo ? accentInfo.formatted : '',
        accent_number: accentInfo ? accentInfo.accent : '',
        level: jlptLevel
      });
    } catch (e) {
      console.error("Dictionary lookup error:", e);
      res.status(500).json({ error: 'Failed to look up dictionary' });
    }
  });

  // Accent dictionary lookup endpoint
  app.get('/api/lookup-accent', (req: any, res) => {
    try {
      const word = req.query.word as string;
      const reading = req.query.reading as string;
      if (!word) return res.status(400).json({ error: 'Word parameter is required' });
      
      const accentInfo = lookupAccent(word, reading || undefined);
      if (accentInfo) {
        res.json({
          word,
          reading: accentInfo.reading,
          accent_number: accentInfo.accent,
          formatted: accentInfo.formatted
        });
      } else {
        res.json({ word, reading: reading || '', accent_number: '', formatted: '' });
      }
    } catch (e) {
      res.status(500).json({ error: 'Accent lookup failed' });
    }
  });

  // CSV Helper functions
  function getSafeFilename(title: string): string {
    return title.replace(/[\\/:*?"<>|]/g, '_').trim();
  }

  function getUserVocabPath(username: string, title: string): string {
    const dir = path.join('vocabulary', username);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const safeTitle = getSafeFilename(title);
    return path.join(dir, `${safeTitle}.csv`);
  }

  function parseJlptLevel(frequencyAdd: string | undefined): string {
    if (!frequencyAdd) return '';
    const parts = frequencyAdd.split('^');
    const jlptPart = parts.find((p: string) => p.startsWith('JLPT '));
    if (jlptPart) {
      const num = jlptPart.replace('JLPT ', '').trim();
      if (['1', '2', '3', '4', '5'].includes(num)) {
        return 'N' + num;
      }
    }
    return '';
  }

  function parseCSV(content: string): { word: string; reading_accent: string; meaning: string; level?: string }[] {
    const lines = content.split(/\r?\n/).filter(l => l.trim().length > 0);
    if (lines.length <= 1) return [];
    return lines.slice(1).map(line => {
      const result: string[] = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      result.push(current.trim());
      const clean = result.map(val => val.replace(/^"|"$/g, '').replace(/""/g, '"'));
      return {
        word: clean[0] || '',
        reading_accent: clean[1] || '',
        meaning: clean[2] || '',
        level: clean[3] || ''
      };
    });
  }

  function toCSVRow(word: string, reading_accent: string, meaning: string, level?: string): string {
    const escape = (val: string) => `"${(val || '').replace(/'/g, '').replace(/"/g, '""')}"`;
    return `${escape(word)},${escape(reading_accent)},${escape(meaning)},${escape(level || '')}\n`;
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
    // Map of common contextual synonyms to normalize variations before Levenshtein match
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
    
    // 1. Calculate similarity for raw cleaned text
    const maxLengthRaw = Math.max(cleanA.length, cleanB.length);
    const distRaw = getLevenshteinDistance(cleanA, cleanB);
    const simRaw = 1 - distRaw / maxLengthRaw;

    // 2. Calculate similarity for synonym-normalized text
    const normA = normalizeSynonyms(cleanA);
    const normB = normalizeSynonyms(cleanB);
    const maxLengthNorm = Math.max(normA.length, normB.length);
    const distNorm = getLevenshteinDistance(normA, normB);
    const simNorm = 1 - distNorm / maxLengthNorm;

    // Return the best matching score
    return Math.max(simRaw, simNorm);
  }

  // Grade translation using Hybrid mode (Gemini fallback to Local Levenshtein)
  app.post('/api/grade-translation', async (req, res) => {
    try {
      const { original_sentence, user_translation, ai_translation, difficulty } = req.body;
      const cleanUser = (user_translation || '').trim();
      const cleanAI = (ai_translation || '').trim();

      // 1. Try Gemini AI if API Key is available
      const key = process.env.GEMINI_API_KEY;
      if (key && key !== "YOUR_GEMINI_API_KEY") {
        try {
          const ai = new GoogleGenAI({ apiKey: key });
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

          const response = await ai.models.generateContent({
            model: 'gemini-3.5-flash',
            contents: prompt,
            config: {
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  is_correct: { type: Type.BOOLEAN },
                  feedback: { type: Type.STRING }
                },
                required: ["is_correct", "feedback"]
              }
            }
          });

          const resultObj = JSON.parse(response.text || '{}');
          res.json(resultObj);
          return;
        } catch (geminiErr) {
          console.warn("Gemini grading failed, falling back to local rule-based grading:", geminiErr);
        }
      }

      // 2. Local Rule-Based Levenshtein Grading (Fallback)
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

      res.json({
        is_correct: isCorrect,
        feedback: feedback
      });
    } catch (e) {
      console.error("Translation grading error", e);
      res.status(500).json({ error: 'Grading failed' });
    }
  });

  // Get all vocabulary categorized by post title
  app.get('/api/vocabulary', authenticate, (req: any, res) => {
    try {
      const rows = db.prepare('SELECT * FROM vocabulary WHERE user_id = ? ORDER BY created_at ASC').all(req.user.id) as any[];
      const groups: Record<string, any[]> = {};
      for (const row of rows) {
        const title = row.post_title || '기타';
        if (!groups[title]) {
          groups[title] = [];
        }
        groups[title].push({
          word: row.word,
          reading_accent: row.reading_accent,
          meaning: row.meaning,
          level: row.level
        });
      }
      const list = Object.keys(groups).map(post_title => ({
        post_title,
        words: groups[post_title]
      }));
      res.json(list);
    } catch (e) {
      console.error(e);
      res.json([]);
    }
  });

  // Add a vocabulary word to a specific post's CSV file (re-routed to database table)
  app.post('/api/vocabulary', authenticate, (req: any, res) => {
    const { post_title, word, reading_accent, meaning, level } = req.body;
    if (!post_title || !word) {
      return res.status(400).json({ error: 'Missing post_title or word' });
    }
    try {
      const existing = db.prepare('SELECT id FROM vocabulary WHERE user_id = ? AND post_title = ? AND word = ?')
        .get(req.user.id, post_title, word);
      if (!existing) {
        db.prepare('INSERT INTO vocabulary (user_id, post_title, word, reading_accent, meaning, level) VALUES (?, ?, ?, ?, ?, ?)')
          .run(req.user.id, post_title, word, reading_accent || word, meaning || '', level || '');
      }
      res.json({ success: true, message: 'Added' });
    } catch(e) {
      console.error(e);
      res.status(500).json({ error: 'Error adding vocab' });
    }
  });

  // Delete a word from a specific post's vocabulary database records
  app.post('/api/vocabulary/delete', authenticate, (req: any, res) => {
    try {
      const { post_title, word } = req.body;
      if (!post_title || !word) {
        return res.status(400).json({ error: 'Missing parameters' });
      }
      db.prepare('DELETE FROM vocabulary WHERE user_id = ? AND post_title = ? AND word = ?')
        .run(req.user.id, post_title, word);
      res.json({ success: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Failed to delete vocab' });
    }
  });

  // Delete multiple words from a specific post's vocabulary database records
  app.post('/api/vocabulary/delete-multiple', authenticate, (req: any, res) => {
    try {
      const { post_title, words } = req.body;
      if (!post_title || !Array.isArray(words) || words.length === 0) {
        return res.status(400).json({ error: 'Missing parameters' });
      }
      
      const stmt = db.prepare('DELETE FROM vocabulary WHERE user_id = ? AND post_title = ? AND word = ?');
      const deleteMany = db.transaction((userId: number, postTitle: string, wordsList: string[]) => {
        for (const w of wordsList) {
          stmt.run(userId, postTitle, w);
        }
      });
      
      deleteMany(req.user.id, post_title, words);
      res.json({ success: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Failed to delete multiple vocab' });
    }
  });

  // Extract difficult words using Hybrid mode (Gemini fallback to Local morph filters + Naver Dict Lookup)
  app.post('/api/extract-difficult-words', authenticate, async (req: any, res) => {
    try {
      const { post_id, level } = req.body; // level: 'N1' | 'N2' | 'N3' | 'N4'
      const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(post_id) as any;
      if (!post) {
        return res.status(404).json({ error: 'Post not found' });
      }

      let extracted: { word: string; reading_accent: string; meaning: string; level?: string }[] = [];

      // 1. Try Gemini AI if API Key is available
      const key = process.env.GEMINI_API_KEY;
      if (key && key !== "YOUR_GEMINI_API_KEY") {
        try {
          console.log("Extracting words using Gemini hybrid...");
          const ai = new GoogleGenAI({ apiKey: key });
          const prompt = `You are a Japanese vocabulary extractor. Analyze the following Japanese text and extract difficult words that are of JLPT level ${level} or higher (e.g. if level is N3, extract N3, N2, N1 level words).
Select about 8 to 15 key vocabulary items. For each extracted word, provide:
1. 'word': the word itself (base/dictionary form).
2. 'reading_accent': the pronunciation and accent in NHK Accent Dictionary format, like 'たべる[2]' or 'はな[2]'. Make sure it reflects standard accent kernels.
3. 'meaning': the Korean definition in the context of this text.
4. 'level': the estimated JLPT level of this word, which must be one of: 'N1', 'N2', 'N3', 'N4', 'N5'.

Text to analyze:
${post.body}`;

          const response = await ai.models.generateContent({
            model: 'gemini-3.5-flash',
            contents: prompt,
            config: {
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  words: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        word: { type: Type.STRING },
                        reading_accent: { type: Type.STRING },
                        meaning: { type: Type.STRING },
                        level: { type: Type.STRING }
                      },
                      required: ["word", "reading_accent", "meaning", "level"]
                    }
                  }
                },
                required: ["words"]
              }
            }
          });

          const resultObj = JSON.parse(response.text || '{}');
          extracted = resultObj.words || [];
        } catch (geminiErr) {
          console.warn("Gemini word extraction failed, falling back to local rule-based extraction:", geminiErr);
        }
      }

      // 2. Local fallback using Morphological filter + Live Naver Dictionary lookups
      if (extracted.length === 0 && post.processed_json) {
        console.log("Extracting words using local fallback...");
        try {
          const parsed = JSON.parse(post.processed_json);
          const sentences = parsed.sentences || [];
          const candidates = new Set<string>();
          const wordInfoMap = new Map<string, { reading: string, pos: string }>();

          for (const s of sentences) {
            if (s.tokens) {
              for (const t of s.tokens) {
                // Filter out non-content words (particles, punctuation, etc.)
                const pos = t.pos || '';
                const base = t.base_form || t.surface;
                const isContentWord = ['명사', '동사', '형용사', '부사'].includes(pos);
                if (isContentWord && base.length > 1) {
                  candidates.add(base);
                  wordInfoMap.set(base, { reading: t.reading || t.surface, pos });
                }
              }
            }
          }

          // Select top 25 candidates to perform lookups in parallel
          const selectedCandidates = Array.from(candidates).slice(0, 25);
          
          // Define target level mapping (N1=1, N2=2, N3=3, N4=4, N5=5)
          const targetLevelNum = parseInt(level.replace('N', '')) || 3;

          // Perform parallel lookups
          const lookupPromises = selectedCandidates.map(async (word) => {
            const info = wordInfoMap.get(word);
            let meaning = '';
            let reading = info ? info.reading : word;
            let wordLevel = '';

            try {
              const url = `https://ja.dict.naver.com/api3/jako/search?query=${encodeURIComponent(word)}`;
              const dictRes = await fetch(url, {
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                  'Referer': 'https://ja.dict.naver.com/',
                  'Accept': 'application/json, text/plain, */*',
                  'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7'
                }
              });
              const dictText = await dictRes.text();
              const dictData = JSON.parse(dictText);
              const items = dictData?.searchResultMap?.searchResultListMap?.WORD?.items;
              if (items && items.length > 0) {
                const bestItem = items.find((item: any) => item.meansCollector && item.meansCollector.length > 0) || items[0];
                wordLevel = parseJlptLevel(bestItem.frequencyAdd);

                if (bestItem.meansCollector) {
                  meaning = bestItem.meansCollector
                    .map((m: any) => {
                      if (m.means && Array.isArray(m.means)) {
                        return m.means.map((sub: any) => sub.value).join(', ');
                      }
                      return m.value || '';
                    })
                    .filter(Boolean)
                    .join(', ')
                    .replace(/<[^>]*>/g, '');
                }
                if (bestItem.expEntry) {
                  reading = bestItem.expEntry;
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

          // Group by level match
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

          // Build final list of up to 12 words prioritizing matched ones
          const finalWords = [...matchedWords];
          if (finalWords.length < 12) {
            const needed = 12 - finalWords.length;
            finalWords.push(...otherWords.slice(0, needed));
          }

          extracted = finalWords.slice(0, 12);
        } catch (localExtractErr) {
          console.error("Local word extraction process failed:", localExtractErr);
        }
      }

      // Save to post's vocabulary database records
      let addedCount = 0;
      extracted.forEach((w: any) => {
        const existing = db.prepare('SELECT id FROM vocabulary WHERE user_id = ? AND post_title = ? AND word = ?')
          .get(req.user.id, post.title, w.word);
        if (!existing) {
          db.prepare('INSERT INTO vocabulary (user_id, post_title, word, reading_accent, meaning, level) VALUES (?, ?, ?, ?, ?, ?)')
            .run(req.user.id, post.title, w.word, w.reading_accent, w.meaning, w.level || '');
          addedCount++;
        }
      });

      res.json({ success: true, count: addedCount });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to extract words' });
    }
  });

  // Grade word meaning (semantic comparison)
  app.post('/api/grade-word-meaning', async (req, res) => {
    try {
      const { word, correct_meaning, user_meaning } = req.body;
      const key = process.env.GEMINI_API_KEY;
      if (!key) {
        return res.status(500).json({ error: 'GEMINI_API_KEY is missing' });
      }

      const ai = new GoogleGenAI({ apiKey: key });
      const prompt = `Evaluate if the user's Korean answer for the meaning of the Japanese word "${word}" is semantically equivalent to the correct dictionary meaning.
Correct dictionary meaning: "${correct_meaning}"
User's answer: "${user_meaning}"

Determine if the user's answer means essentially the same thing, even if the wording is slightly different.
Provide 'is_correct' (boolean) and a very short 'feedback' (Korean string, 1 sentence) explaining the judgment.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              is_correct: { type: Type.BOOLEAN },
              feedback: { type: Type.STRING }
            },
            required: ["is_correct", "feedback"]
          }
        }
      });

      res.json(JSON.parse(response.text || '{}'));
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to grade meaning' });
    }
  });

  // Grade word reading (flexible pronunciation matching including Romaji/Hangul)
  app.post('/api/grade-word-reading', async (req, res) => {
    try {
      const { word, correct_reading_accent, user_reading } = req.body;
      const key = process.env.GEMINI_API_KEY;
      if (!key) {
        return res.status(500).json({ error: 'GEMINI_API_KEY is missing' });
      }

      const ai = new GoogleGenAI({ apiKey: key });
      const prompt = `Evaluate if the user's input pronunciation for the Japanese word "${word}" is correct.
The correct pronunciation (hiragana/accent): "${correct_reading_accent}" (e.g. "たべる[2]" means target hiragana is "たべる").
User's input: "${user_reading}"

The user is allowed to write the pronunciation in Korean transliteration (e.g., "타베루"), Romaji (e.g., "taberu"), Katakana (e.g., "タベル"), or Hiragana (e.g., "たべる").
Determine if the user's input represents the correct pronunciation of the target word.
Provide 'is_correct' (boolean) and a short 'feedback' (Korean string, 1 sentence).`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              is_correct: { type: Type.BOOLEAN },
              feedback: { type: Type.STRING }
            },
            required: ["is_correct", "feedback"]
          }
        }
      });

      res.json(JSON.parse(response.text || '{}'));
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to grade reading' });
    }
  });


  // --- Vite Middleware --- //
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log('Server running on http://localhost:' + PORT);
  });
}

startServer();
