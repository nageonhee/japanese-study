import { useEffect, useState } from 'react';
import { Category, Post } from '../types';
import { Link } from 'react-router-dom';

export function Categories() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [activeCategoryId, setActiveCategoryId] = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/categories').then(r => r.json()).then(setCategories);
    fetch('/api/posts').then(r => r.json()).then(setPosts);
  }, []);

  const filteredPosts = activeCategoryId 
    ? posts.filter(p => p.category_id === activeCategoryId)
    : posts;

  return (
    <div className="flex-1 pb-24 w-full">
      <header className="pb-8 mb-6">
        <h2 className="text-3xl font-bold tracking-tight text-slate-900 mb-2 font-sans">분류 탐색</h2>
        <p className="text-sm font-medium text-slate-500 font-sans">카테고리별로 원하는 주제의 기사를 찾거나 모아볼 수 있습니다.</p>
      </header>

      <div className="flex flex-wrap gap-2 mb-8 font-sans">
        <button
          onClick={() => setActiveCategoryId(null)}
          className={"px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 " + (
            activeCategoryId === null ? 'bg-indigo-600 text-white border border-indigo-600' : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
          )}
        >
          전체 보기
        </button>
        {categories.map(c => (
          <button
            key={c.id}
            onClick={() => setActiveCategoryId(c.id)}
            className={"px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 " + (
              activeCategoryId === c.id ? 'bg-indigo-600 text-white border border-indigo-600' : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
            )}
          >
            {c.name}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {filteredPosts.map(post => (
          <Link key={post.id} to={'/posts/' + post.id} className="group block focus:outline-none bg-white rounded-2xl border border-slate-200 p-6 hover:border-indigo-300 transition-all duration-300">
            <article className="h-full flex flex-col">
              <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded-md uppercase tracking-wider w-fit mb-4">
                {post.category_name}
              </span>
              <h3 className="font-serif font-bold text-lg text-slate-900 mb-2 group-hover:text-indigo-600 transition-colors tracking-tight">
                {post.title}
              </h3>
              <p className="font-serif text-slate-500 text-sm line-clamp-3 leading-relaxed">
                {post.body}
              </p>
            </article>
          </Link>
        ))}
      </div>
    </div>
  );
}
