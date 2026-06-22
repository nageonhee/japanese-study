export interface Post {
  id: number;
  title: string;
  body: string;
  category_id: number;
  category_name: string;
  reference_url: string;
  author_id: number;
  created_at: string;
  processed_json?: string;
}

export interface Category {
  id: number;
  name: string;
}

export interface Vocabulary {
  word: string;
  reading_accent: string;
  meaning: string;
  level?: string;
}

export interface PostVocabulary {
  post_title: string;
  words: Vocabulary[];
}

export interface Token {
  surface: string;
  base_form: string;
  reading: string;
  reading_accent?: string;
  pos: string;
  meaning: string;
}

export interface ProcessedSentence {
  original: string;
  translation: string;
  tokens: Token[];
}

export interface User {
  id: number;
  username: string;
  role: 'master' | 'host' | 'admin' | 'user';
  token: string;
}
