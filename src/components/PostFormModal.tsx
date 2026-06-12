import React, { useState, useEffect } from 'react';
import { X, Send, Loader2 } from 'lucide-react';

interface PostFormModalProps {
  onClose: () => void;
  onSaved: () => void;
}

interface Category {
  id: number;
  name: string;
}

export function PostFormModal({ onClose, onSaved }: PostFormModalProps) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [customCategory, setCustomCategory] = useState('');
  const [referenceUrl, setReferenceUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetch('/api/categories')
      .then(r => r.json())
      .then(d => setCategories(d));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !body) return;

    const finalCategory = selectedCategory === 'custom' ? customCategory : selectedCategory;

    setIsSubmitting(true);
    try {
      await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          body,
          category_name: finalCategory,
          reference_url: referenceUrl
        })
      });
      onSaved();
      onClose();
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl border border-slate-200 w-full max-w-2xl max-h-[90vh] flex flex-col font-sans overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-white">
          <h2 className="text-lg font-bold text-slate-800">새 독해 기사 추가</h2>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-xl transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6 bg-slate-50/50">
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">제목</label>
            <input 
              required
              className="w-full px-4 py-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-100 bg-white transition-all text-slate-800 font-serif font-medium text-lg"
              placeholder="예: 오늘의 일본 단신 뉴스"
              value={title}
              onChange={e => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">일본어 원문 텍스트</label>
            <textarea 
              required
              rows={8}
              className="w-full px-4 py-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-100 bg-white transition-all resize-none leading-relaxed text-slate-850 font-serif"
              placeholder="학습에 사용할 일본어 원본 텍스트를 붙여넣으세요"
              value={body}
              onChange={e => setBody(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">카테고리</label>
              <select 
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-100 bg-white transition-all text-sm font-medium text-slate-700"
                value={selectedCategory}
                onChange={e => setSelectedCategory(e.target.value)}
              >
                <option value="" disabled>분류 선택</option>
                {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                <option value="custom">+ 분류 직접 입력</option>
              </select>
              {selectedCategory === 'custom' && (
                <input 
                  autoFocus
                  required
                  className="w-full mt-2.5 px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-100 bg-white transition-all text-sm font-medium text-slate-700"
                  placeholder="새 분류 입력"
                  value={customCategory}
                  onChange={e => setCustomCategory(e.target.value)}
                />
              )}
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">출처 URL (선택사항)</label>
              <input 
                type="url"
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-100 bg-white transition-all text-sm font-medium text-slate-700"
                placeholder="https://..."
                value={referenceUrl}
                onChange={e => setReferenceUrl(e.target.value)}
              />
            </div>
          </div>

          <div className="pt-6 border-t border-slate-100 flex justify-end gap-3">
            <button 
              type="button"
              onClick={onClose}
              className="px-6 py-2.5 text-sm font-medium text-slate-500 hover:text-slate-800 rounded-xl hover:bg-slate-100 transition-colors"
            >
              취소
            </button>
            <button 
              type="submit" 
              disabled={isSubmitting}
              className="flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 text-sm font-semibold rounded-xl disabled:opacity-50 transition-colors border border-indigo-700/50"
            >
              {isSubmitting ? <><Loader2 className="w-4 h-4 animate-spin"/> 처리 중</> : <><Send className="w-4 h-4" /> 등록</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
