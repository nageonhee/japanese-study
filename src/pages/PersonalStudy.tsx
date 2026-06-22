import { useEffect, useState } from 'react';
import { Post } from '../types';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { PostFormModal } from '../components/PostFormModal';
import { storage } from '../lib/storage';

export function PersonalStudy() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const navigate = useNavigate();

  const fetchPosts = () => {
    storage.getPosts(true)
      .then(data => setPosts(data))
      .catch(err => console.error("Could not load personal posts", err));
  };

  useEffect(() => {
    fetchPosts();
  }, []);

  return (
    <div className="flex-1 pb-24 font-sans">
      <header className="pb-8 mb-6 border-b border-[#E5DFD5]">
        <h2 className="text-3xl font-bold tracking-tight text-slate-900 mb-2 font-serif">개인 학습방</h2>
        <p className="text-sm font-medium text-slate-500 font-serif">사용자의 기기(IndexedDB)에 저장되는 개인 독해 자료실입니다. 본인만 보고 관리할 수 있습니다.</p>
      </header>

      {posts.length === 0 ? (
        <div className="text-center py-20 text-slate-400 font-medium bg-white/40 rounded-2xl border border-[#E5DFD5] mx-auto max-w-xl">
          <p className="font-semibold text-slate-600 mb-1 font-serif">개인 자료가 없습니다.</p>
          <p className="text-sm text-slate-500 font-serif">우측 하단의 + 버튼을 눌러 개인 학습을 위한 일본어 원문을 추가해보세요.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {posts.map((post, idx) => (
            <article 
              key={post.id} 
              className={"newspaper-paper rounded-2xl p-6 flex flex-col hover:border-[#3A4E68] transition-all cursor-pointer duration-300 " + (idx === 0 ? 'md:col-span-2 lg:col-span-3 lg:grid lg:grid-cols-2 lg:gap-8 lg:p-8' : '')}
              onClick={() => navigate('/posts/' + post.id + '?personal=true')}
            >
              <div className="flex flex-col flex-1">
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-[9px] font-bold text-[#3A4E68] border border-[#3A4E68] px-2 py-0.5 rounded-md uppercase tracking-wider">
                    {post.category_name}
                  </span>
                  {idx === 0 && (
                    <span className="text-[9px] font-bold text-slate-500 bg-[#E5DFD5]/40 px-2 py-0.5 rounded-md uppercase tracking-wider">
                      주요 원문
                    </span>
                  )}
                </div>
                <h3 className={"font-serif font-bold text-[#1F2226] mb-3 tracking-tight leading-snug " + (idx === 0 ? 'text-2xl lg:text-3xl' : 'text-lg')}>
                  {post.title}
                </h3>
                <div className={"font-serif text-[#2C3B4F]/90 leading-relaxed mb-6 flex-1 text-justify " + (idx === 0 ? 'text-base line-clamp-4' : 'text-sm line-clamp-3')}>
                  {post.body}
                </div>
                {post.reference_url && (
                  <a href={post.reference_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="mt-auto text-xs font-semibold text-slate-400 hover:text-[#3A4E68] hover:underline inline-flex items-center gap-1 transition-colors font-serif">
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
        className="fixed bottom-24 right-8 md:bottom-10 md:right-10 w-14 h-14 bg-[#3A4E68] text-[#FAF6F0] rounded-full flex items-center justify-center border border-[#2C3B4F] hover:bg-[#2C3B4F] hover:scale-105 active:scale-95 transition-all z-40 shadow-lg"
      >
        <Plus className="w-6 h-6" />
      </button>

      {isModalOpen && (
        <PostFormModal isPersonal={true} onClose={() => setIsModalOpen(false)} onSaved={fetchPosts} />
      )}
    </div>
  );
}
