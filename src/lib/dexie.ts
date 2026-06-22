import Dexie, { Table } from 'dexie';

export interface LocalPost {
  id?: number;
  title: string;
  body: string;
  category_name: string;
  reference_url: string;
  created_at: string;
  processed_json?: string;
}

export interface LocalVocabulary {
  id?: number;
  post_title: string;
  word: string;
  reading_accent: string;
  meaning: string;
  level: string;
  created_at: string;
}

export interface LocalCategory {
  id?: number;
  name: string;
}

class LocalDatabase extends Dexie {
  posts!: Table<LocalPost, number>;
  vocabulary!: Table<LocalVocabulary, number>;
  categories!: Table<LocalCategory, number>;

  constructor() {
    super('LocalJapaneseStudyDB');
    this.version(1).stores({
      posts: '++id, title, category_name, created_at',
      vocabulary: '++id, post_title, word, level, created_at',
      categories: '++id, &name'
    });
  }
}

export const localDb = new LocalDatabase();

// Seed default categories for offline mode
localDb.on('populate', () => {
  localDb.categories.bulkAdd([
    { name: 'News' },
    { name: 'Column' },
    { name: 'Editorial' }
  ]).catch(err => console.error("Failed to seed offline categories:", err));
});
