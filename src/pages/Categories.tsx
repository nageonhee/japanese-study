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
    <div className="flex-1 pb-24 w-full font-sans">
      <header className="pb-8 mb-6 border-b border-[#E5DFD5]">
        <h2 className="text-3xl font-bold tracking-tight text-[#1F2226] mb-2 font-serif">카테고리</h2>
        <p className="text-sm font-medium text-slate-500 font-serif">카테고리별로 원하는 주제의 기사를 찾거나 모아볼 수 있습니다.</p>
      </header>

      <div className="flex flex-wrap gap-2 mb-8 font-serif">
        <button
          onClick={() => setActiveCategoryId(null)}
          className={"px-4 py-2 rounded-xl text-sm font-bold transition-all duration-200 " + (
            activeCategoryId === null ? 'bg-[#3A4E68] text-white border border-[#3A4E68]' : 'bg-white/40 text-[#3A4E68] hover:bg-[#E5DFD5]/40 border border-[#E5DFD5]'
          )}
        >
          전체 보기
        </button>
        {categories.map(c => (
          <button
            key={c.id}
            onClick={() => setActiveCategoryId(c.id)}
            className={"px-4 py-2 rounded-xl text-sm font-bold transition-all duration-200 " + (
              activeCategoryId === c.id ? 'bg-[#3A4E68] text-white border border-[#3A4E68]' : 'bg-white/40 text-[#3A4E68] hover:bg-[#E5DFD5]/40 border border-[#E5DFD5]'
            )}
          >
            {c.name}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {filteredPosts.map(post => (
          <Link key={post.id} to={'/posts/' + post.id} className="group block focus:outline-none newspaper-paper rounded-2xl p-6 hover:border-[#3A4E68] transition-all duration-300">
            <article className="h-full flex flex-col">
              <span className="text-[9px] font-bold text-[#3A4E68] border border-[#3A4E68] px-2 py-0.5 rounded-md uppercase tracking-wider w-fit mb-4">
                {post.category_name}
              </span>
              <h3 className="font-serif font-bold text-lg text-[#1F2226] mb-2 group-hover:text-[#3A4E68] transition-colors tracking-tight leading-snug">
                {post.title}
              </h3>
              <p className="font-serif text-[#2C3B4F]/90 text-sm line-clamp-3 leading-relaxed text-justify">
                {post.body}
              </p>
            </article>
          </Link>
        ))}
      </div>
    </div>
  );
}
