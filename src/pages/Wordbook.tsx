import { useEffect, useState } from 'react';
import { Vocabulary } from '../types';
import { Trash2, Loader2, BrainCircuit } from 'lucide-react';

export function Wordbook() {
  const [words, setWords] = useState<Vocabulary[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchWords = () => {
    fetch('/api/vocabulary')
      .then(r => r.json())
      .then(d => { setWords(d); setLoading(false); })
      .catch(e => { console.error(e); setLoading(false); });
  };

  useEffect(() => {
    fetchWords();
  }, []);

  const handleDelete = async (id: number) => {
    await fetch('/api/vocabulary/' + id, { method: 'DELETE' });
    fetchWords();
  };

  // Group by post_title
  const groupedWords = words.reduce((acc, word) => {
    const title = word.post_title || '기타';
    if (!acc[title]) acc[title] = [];
    acc[title].push(word);
    return acc;
  }, {} as Record<string, Vocabulary[]>);

  return (
    <div className="flex-1 pb-24 w-full">
      <header className="pb-8 mb-6">
        <h2 className="text-3xl font-bold tracking-tight text-slate-900 mb-2 font-sans">단어장</h2>
        <p className="text-sm font-medium text-slate-500 font-sans">독해 중 저장한 어휘와 의미를 분류별로 확인하고 복습합니다.</p>
      </header>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="animate-spin text-indigo-600" /></div>
      ) : words.length === 0 ? (
        <div className="text-center py-20 text-slate-400 font-medium bg-white rounded-2xl border border-slate-200 mx-auto">
          <p className="font-semibold text-slate-600 mb-1">저장된 어휘가 없습니다.</p>
          <p className="text-sm text-slate-500">학습 과정이나 기사 본문 속 단어를 클릭해 고유 단어장에 담아보세요.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {Object.entries(groupedWords).map(([title, postWords]) => (
            <div key={title} className="flex flex-col space-y-4 bg-white rounded-2xl border border-slate-200/60 overflow-hidden p-6">
              <h3 className="text-lg font-bold text-slate-800 border-b border-slate-100 pb-3">{title}</h3>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[600px] text-sm text-left">
                  <thead>
                    <tr className="text-xs font-semibold text-slate-400 border-b border-slate-100 uppercase tracking-wider">
                      <th className="pb-3 pr-6 font-medium">단어</th>
                      <th className="pb-3 px-6 font-medium">요미가나</th>
                      <th className="pb-3 px-6 font-medium">기본형</th>
                      <th className="pb-3 px-6 font-medium">의미</th>
                      <th className="pb-3 pl-6 font-medium w-20 text-right">관리</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {(postWords as Vocabulary[]).map((w) => (
                      <tr key={w.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-4 pr-6 font-serif font-bold text-lg text-slate-900">{w.word}</td>
                        <td className="py-4 px-6 text-slate-600 font-serif">{w.reading && w.reading !== w.word ? w.reading : '-'}</td>
                        <td className="py-4 px-6 text-slate-400 font-serif">{w.base_form !== w.word ? w.base_form : '-'}</td>
                        <td className="py-4 px-6 text-slate-700 font-sans font-medium">{w.meaning || '-'}</td>
                        <td className="py-4 pl-6 text-right">
                          <button 
                            onClick={() => handleDelete(w.id)}
                            className="text-slate-300 hover:text-red-500 transition-colors p-2 rounded-lg hover:bg-red-50/50"
                            title="단어 삭제"
                          >
                            <Trash2 className="w-4 h-4 ml-auto" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
