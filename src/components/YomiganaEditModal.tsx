import React, { useState } from 'react';
import { X, Save, Loader2 } from 'lucide-react';
import { Post, ProcessedSentence } from '../types';
import { storage } from '../lib/storage';

interface YomiganaEditModalProps {
  post: Post;
  processedData: ProcessedSentence[];
  isPersonal: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function YomiganaEditModal({ post, processedData, isPersonal, onClose, onSaved }: YomiganaEditModalProps) {
  const [sentences, setSentences] = useState<ProcessedSentence[]>(() => 
    JSON.parse(JSON.stringify(processedData)) // Deep copy
  );
  const [isSaving, setIsSaving] = useState(false);

  const isKanji = (str: string) => /[\u4e00-\u9faf\u3400-\u4dbf\uf900-\ufaff々]/.test(str);

  const handleReadingChange = (sIdx: number, tIdx: number, newReading: string) => {
    setSentences(prev => {
      const copy = [...prev];
      copy[sIdx].tokens[tIdx].reading = newReading;
      return copy;
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const updatedJson = JSON.stringify({ sentences });
      await storage.updatePostProcessedJson(post.id, updatedJson, isPersonal);
      onSaved();
      onClose();
    } catch (e) {
      console.error(e);
      alert("요미가나 수정 저장에 실패했습니다.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#FAF6F0] rounded-2xl border border-[#E5DFD5] w-full max-w-3xl max-h-[90vh] flex flex-col font-sans overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-[#E5DFD5] bg-[#FAF6F0]">
          <div>
            <h2 className="text-lg font-bold text-slate-800 font-serif">요미가나(한자 읽기) 수정</h2>
            <p className="text-xs text-slate-500 font-medium mt-0.5">본문의 한자 단어들의 발음을 직접 편집할 수 있습니다.</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-650 hover:bg-[#E5DFD5]/40 rounded-xl transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-6 md:p-8 space-y-8 bg-[#FAF6F0]">
          {sentences.map((sentence, sIdx) => {
            // Find tokens that contain Kanji
            const kanjiTokens = sentence.tokens
              .map((token, tIdx) => ({ token, tIdx }))
              .filter(item => isKanji(item.token.surface));

            if (kanjiTokens.length === 0) return null;

            return (
              <div key={sIdx} className="bg-white/60 p-5 rounded-2xl border border-[#E5DFD5]/60 space-y-4">
                <div className="text-xs font-semibold text-slate-400 border-b border-[#E5DFD5]/40 pb-2 font-mono whitespace-pre-wrap">
                  {sentence.original}
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {kanjiTokens.map(({ token, tIdx }) => (
                    <div key={tIdx} className="flex items-center gap-3 bg-white p-3 rounded-xl border border-[#E5DFD5]/40 shadow-sm">
                      <span className="text-sm font-bold text-slate-800 font-serif min-w-[4rem] text-center border-r border-[#E5DFD5] pr-2">
                        {token.surface}
                      </span>
                      <input
                        type="text"
                        className="flex-1 px-3 py-1.5 border border-[#E5DFD5] rounded-lg outline-none focus:ring-2 focus:ring-[#3A4E68]/15 bg-[#FAF6F0]/20 text-xs font-semibold text-slate-700"
                        value={token.reading || ''}
                        onChange={(e) => handleReadingChange(sIdx, tIdx, e.target.value)}
                        placeholder="히라가나 발음 입력"
                      />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {sentences.every(s => s.tokens.every(t => !isKanji(t.surface))) && (
            <div className="text-center py-12 text-slate-400 font-serif">
              본문에 수정할 수 있는 한자 단어가 존재하지 않습니다.
            </div>
          )}

          <div className="pt-6 border-t border-[#E5DFD5] flex justify-end gap-3 bg-[#FAF6F0]">
            <button 
              type="button"
              onClick={onClose}
              className="px-6 py-2.5 text-sm font-semibold text-slate-500 hover:text-slate-800 rounded-xl hover:bg-[#E5DFD5]/40 transition-colors"
            >
              취소
            </button>
            <button 
              type="submit" 
              disabled={isSaving}
              className="flex items-center justify-center gap-1.5 bg-[#3A4E68] hover:bg-[#2C3B4F] text-white px-6 py-2.5 text-sm font-bold rounded-xl disabled:opacity-50 transition-colors border border-slate-900/10 shadow-sm"
            >
              {isSaving ? <><Loader2 className="w-4 h-4 animate-spin"/> 저장 중</> : <><Save className="w-4 h-4" /> 저장 완료</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
