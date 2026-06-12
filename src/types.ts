export interface Post {
  id: number;
  title: string;
  body: string;
  category_id: number;
  category_name: string;
  reference_url: string;
  author_id: number;
  created_at: string;
}

export interface Category {
  id: number;
  name: string;
}

export interface Vocabulary {
  id: number;
  word: string;
  base_form: string;
  reading: string;
  meaning: string;
  difficulty: string;
  user_id: number;
  created_at: string;
  post_id?: number | null;
  post_title?: string;
}

export interface Token {
  surface: string;
  base_form: string;
  reading: string;
  pos: string;
}

export interface ProcessedSentence {
  original: string;
  translation?: string;
  tokens: Token[];
}
