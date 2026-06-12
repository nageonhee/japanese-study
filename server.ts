import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import Database from 'better-sqlite3';
import { GoogleGenAI, Type } from '@google/genai';

const db = new Database('data.db', { verbose: console.log });
db.pragma('journal_mode = WAL');

// Initialize DB schema
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    role TEXT DEFAULT 'user'
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
    FOREIGN KEY(category_id) REFERENCES categories(id),
    FOREIGN KEY(author_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS vocabulary (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    word TEXT,
    base_form TEXT,
    reading TEXT,
    meaning TEXT,
    difficulty TEXT,
    user_id INTEGER,
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
  INSERT OR IGNORE INTO users (username, role) VALUES ('admin', 'admin');
`);

// Mock user for simplicity
const getAdminId = () => {
  const row = db.prepare('SELECT id FROM users WHERE username = ?').get('admin') as { id: number };
  return row?.id || 1;
};

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // --- API Routes --- //

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // Posts
  app.get('/api/posts', (req, res) => {
    const posts = db.prepare(`
      SELECT p.*, c.name as category_name 
      FROM posts p 
      LEFT JOIN categories c ON p.category_id = c.id
      ORDER BY p.created_at DESC
    `).all();
    res.json(posts);
  });

  app.get('/api/posts/:id', (req, res) => {
    const post = db.prepare(`
      SELECT p.*, c.name as category_name 
      FROM posts p 
      LEFT JOIN categories c ON p.category_id = c.id 
      WHERE p.id = ?
    `).get(req.params.id);
    if (!post) {
      res.status(404).json({ error: 'Post not found' });
      return;
    }
    res.json(post);
  });

  app.post('/api/posts', (req, res) => {
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
      'INSERT INTO posts (title, body, category_id, reference_url, author_id) VALUES (?, ?, ?, ?, ?)'
    ).run(title, body, category_id, reference_url, getAdminId());
    
    res.json({ id: info.lastInsertRowid });
  });

  // Categories
  app.get('/api/categories', (req, res) => {
    const categories = db.prepare('SELECT * FROM categories').all();
    res.json(categories);
  });

  // Process text using Gemini to get tokens
  app.post('/api/process-text', async (req, res) => {
    try {
      const { text } = req.body;
      const key = process.env.GEMINI_API_KEY;
      if (!key) {
        res.status(500).json({ error: 'GEMINI_API_KEY environment variable is missing.' });
        return;
      }

      const ai = new GoogleGenAI({ apiKey: key });
      const prompt = "You are a Japanese text processor. Analyze the following Japanese text.\n" +
"Split the text into sentences (using 。！？).\n" +
"For each sentence, tokenize the text into individual words or morphological units.\n" +
"Also, provide a natural Korean 'translation' for the entire sentence.\n" +
"For each word, provide:\n" +
"1. 'surface': the exact surface string in the text.\n" +
"2. 'base_form': the dictionary form (if it's a conjugated verb/adjective).\n" +
"3. 'reading': the furigana (hiragana reading) for the word. If the word is written in hiragana/katakana or is punctuation, the reading can just be the word itself.\n" +
"4. 'pos': part of speech (e.g. 명사, 동사, 조사, 등).\n" +
"\n" +
"IMPORTANT: Make sure the concatenation of all 'surface' strings exactly reproduces the original sentence!\n" +
"\n" +
"Text: " + text;

      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              sentences: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    original: { type: Type.STRING },
                    translation: { type: Type.STRING },
                    tokens: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          surface: { type: Type.STRING },
                          base_form: { type: Type.STRING },
                          reading: { type: Type.STRING },
                          pos: { type: Type.STRING }
                        },
                        required: ["surface", "base_form", "reading", "pos"]
                      }
                    }
                  },
                  required: ["original", "tokens"]
                }
              }
            },
            required: ["sentences"]
          }
        }
      });
      
      const resultObj = JSON.parse(response.text || '{}');
      res.json(resultObj);
    } catch (error) {
      console.error("Error processing text with Gemini:", error);
      res.status(500).json({ error: 'Failed to process text' });
    }
  });

  // Grade translation using Gemini
  app.post('/api/grade-translation', async (req, res) => {
    try {
      const { original_sentence, user_translation } = req.body;
      const key = process.env.GEMINI_API_KEY;
      if (!key) {
        res.status(500).json({ error: 'GEMINI_API_KEY missing' });
        return;
      }

      const ai = new GoogleGenAI({ apiKey: key });
      const prompt = "Evaluate the following Korean translation of a Japanese sentence.\n" +
"Original Japanese: '" + original_sentence + "'\n" +
"User's Korean Translation: '" + user_translation + "'\n" +
"\n" +
"Grade the translation taking into account context and nuance. It doesn't have to be a rigid literal translation, but the core meaning must be correct.\n" +
"Provide a boolean 'is_correct' and a short string 'feedback' explaining any errors or giving praise.";

      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              is_correct: { type: Type.BOOLEAN },
              feedback: { type: Type.STRING },
              proper_translation: { type: Type.STRING }
            },
            required: ["is_correct", "feedback", "proper_translation"]
          }
        }
      });

      const resultObj = JSON.parse(response.text || '{}');
      res.json(resultObj);
    } catch (e) {
      console.error("Translation grading error", e);
      res.status(500).json({ error: 'Grading failed' });
    }
  });

  app.get('/api/vocabulary', (req, res) => {
    try {
      if (!fs.existsSync('vocabulary.csv')) {
        return res.json([]);
      }
      const content = fs.readFileSync('vocabulary.csv', 'utf-8');
      const lines = content.split('\n').filter(l => l.trim().length > 0);
      
      const vocab = lines.slice(1).map((line, idx) => {
        const [id, word, base_form, reading, meaning, difficulty, user_id, created_at, post_id, post_title] = line.split('\t');
        return {
          id: parseInt(id),
          word,
          base_form,
          reading,
          meaning,
          difficulty,
          user_id,
          created_at,
          post_id: post_id ? parseInt(post_id) : null,
          post_title: post_title || 'Unknown Post'
        };
      });
      // Return sorted by reverse chronological using 'id' implicitly
      res.json(vocab.reverse());
    } catch (e) {
      res.json([]);
    }
  });

  app.post('/api/vocabulary', (req, res) => {
    const { word, base_form, reading, meaning, difficulty, post_id, post_title } = req.body;
    let msg = 'Added';
    try {
      let nextId = 1;
      if (!fs.existsSync('vocabulary.csv')) {
        fs.writeFileSync('vocabulary.csv', 'id\tword\tbase_form\treading\tmeaning\tdifficulty\tuser_id\tcreated_at\tpost_id\tpost_title\n', 'utf-8');
      } else {
        const content = fs.readFileSync('vocabulary.csv', 'utf-8');
        const lines = content.split('\n').filter(l => l.trim().length > 0);
        if (lines.length > 1) {
          const lastLine = lines[lines.length - 1];
          const lastId = parseInt(lastLine.split('\t')[0]);
          if (!isNaN(lastId)) nextId = lastId + 1;
        }
      }
      const safeTitle = (post_title || '').replace(/\t/g, ' ').replace(/\n/g, ' ');
      const safeWord = (word || '').replace(/\t/g, ' ');
      const safeBase = (base_form || '').replace(/\t/g, ' ');
      const safeRead = (reading || '').replace(/\t/g, ' ');
      const safeMean = (meaning || '').replace(/\t/g, ' ').replace(/\n/g, ' ');
      
      const line = `${nextId}\t${safeWord}\t${safeBase}\t${safeRead}\t${safeMean}\t${difficulty || 'unknown'}\t${getAdminId()}\t${new Date().toISOString()}\t${post_id || ''}\t${safeTitle}\n`;
      fs.appendFileSync('vocabulary.csv', line, 'utf-8');
    } catch(e) {
      msg = 'Error adding vocab';
    }
    res.json({ success: true, message: msg });
  });

  app.delete('/api/vocabulary/:id', (req, res) => {
    if (!fs.existsSync('vocabulary.csv')) return res.json({ success: true });
    try {
      const content = fs.readFileSync('vocabulary.csv', 'utf-8');
      const lines = content.split('\n').filter(l => l.trim().length > 0);
      const header = lines[0];
      const dataLines = lines.slice(1);
      
      const targetId = req.params.id;
      const newLines = dataLines.filter(line => line.split('\t')[0] !== targetId);
      
      fs.writeFileSync('vocabulary.csv', [header, ...newLines].join('\n') + '\n', 'utf-8');
    } catch (e) {}
    res.json({ success: true });
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
