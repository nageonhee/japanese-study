import { useEffect, useState } from 'react';
import { Post } from '../types';
import { Link, useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { PostFormModal } from '../components/PostFormModal';

export function Home() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const navigate = useNavigate();

  const fetchPosts = () => {
    fetch('/api/posts')
      .then(res => res.json())
      .then(data => setPosts(data))
      .catch(err => console.error("Could not load posts", err));
  };

  useEffect(() => {
    fetchPosts();
  }, []);

  return (
    <div className="flex-1 pb-24">
      <header className="pb-8 mb-6">
        <h2 className="text-3xl font-bold tracking-tight text-slate-900 mb-2 font-sans">오늘의 기사</h2>
        <p className="text-sm font-medium text-slate-500 font-sans">독해와 어휘 향상을 위해 엄선된 일본어 기사 목록입니다. ({new Date().toLocaleDateString('ko-KR')})</p>
      </header>

      {posts.length === 0 ? (
        <div className="text-center py-20 text-slate-400 font-medium bg-white rounded-2xl border border-slate-200 mx-auto">
          <p className="font-semibold text-slate-600 mb-1">등록된 콘텐츠가 없습니다.</p>
          <p className="text-sm text-slate-500">우측 하단의 작성기 버튼을 눌러 첫 일본어 기사를 추가해보세요.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {posts.map((post, idx) => (
            <article 
              key={post.id} 
              className={"bg-white rounded-2xl border border-slate-200 p-6 flex flex-col hover:border-indigo-300 transition-all cursor-pointer duration-300 " + (idx === 0 ? 'md:col-span-2 lg:col-span-3 lg:grid lg:grid-cols-2 lg:gap-8 lg:p-8' : '')}
              onClick={() => navigate('/posts/' + post.id)}
            >
              <div className="flex flex-col flex-1">
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded-md uppercase tracking-wider">
                    {post.category_name}
                  </span>
                  {idx === 0 && (
                    <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-md uppercase tracking-wider">
                      주요 기사
                    </span>
                  )}
                </div>
                <h3 className={"font-serif font-bold text-slate-900 mb-3 tracking-tight " + (idx === 0 ? 'text-2xl lg:text-3xl' : 'text-lg')}>
                  {post.title}
                </h3>
                <div className={"font-serif text-slate-600 leading-relaxed mb-6 flex-1 " + (idx === 0 ? 'text-base line-clamp-4' : 'text-sm line-clamp-3')}>
                  {post.body}
                </div>
                {post.reference_url && (
                  <a href={post.reference_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="mt-auto text-xs font-semibold text-slate-400 hover:text-indigo-600 hover:underline inline-flex items-center gap-1 transition-colors">
                    원문 링크 <span className="text-sm leading-none">↗</span>
                  </a>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Floating Action Button */}
      <button 
        onClick={() => setIsModalOpen(true)}
        className="fixed bottom-24 right-8 md:bottom-10 md:right-10 w-14 h-14 bg-indigo-600 text-white rounded-full flex items-center justify-center border border-indigo-700 hover:bg-indigo-700 hover:scale-105 active:scale-95 transition-all z-40"
      >
        <Plus className="w-6 h-6" />
      </button>

      {isModalOpen && (
        <PostFormModal onClose={() => setIsModalOpen(false)} onSaved={fetchPosts} />
      )}
    </div>
  );
}
