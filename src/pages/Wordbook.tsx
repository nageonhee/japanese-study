import React, { useEffect, useState } from 'react';
import { PostVocabulary, Vocabulary } from '../types';
import { Trash2, Loader2, BrainCircuit, Play, X, Check, AlertCircle, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '../lib/utils';

interface QuizItem extends Vocabulary {
  post_title: string;
}

export function Wordbook() {
  const [vocabData, setVocabData] = useState<PostVocabulary[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Accordion states
  const [expandedPosts, setExpandedPosts] = useState<Record<string, boolean>>({});
  // Checkbox selection states per post title
  const [selectedWords, setSelectedWords] = useState<Record<string, string[]>>({});

  // Quiz states
  const [isQuizMode, setIsQuizMode] = useState(false);
  const [quizList, setQuizList] = useState<QuizItem[]>([]);
  const [currentQuizIdx, setCurrentQuizIdx] = useState(0);
  const [userMeaning, setUserMeaning] = useState('');
  const [userReading, setUserReading] = useState('');
  
  // Grading results
  const [isGrading, setIsGrading] = useState(false);
  const [graded, setGraded] = useState(false);
  const [meaningResult, setMeaningResult] = useState<{ isCorrect: boolean; feedback: string } | null>(null);
  const [readingResult, setReadingResult] = useState<{ isCorrect: boolean; feedback: string } | null>(null);
  const [score, setScore] = useState({ correctMeaning: 0, correctReading: 0 });

  const fetchWords = () => {
    fetch('/api/vocabulary')
      .then(r => r.json())
      .then(d => { setVocabData(d); setLoading(false); })
      .catch(e => { console.error(e); setLoading(false); });
  };

  useEffect(() => {
    fetchWords();
  }, []);

  const handleDelete = async (post_title: string, word: string) => {
    if (!confirm(`단어장에서 '${word}'을(를) 삭제하시겠습니까?`)) return;
    try {
      await fetch('/api/vocabulary/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_title, word })
      });
      fetchWords();
    } catch (e) {
      console.error(e);
    }
  };

  const toggleExpand = (title: string) => {
    setExpandedPosts(prev => ({
      ...prev,
      [title]: !prev[title]
    }));
  };

  const handleSelectWord = (postTitle: string, word: string) => {
    setSelectedWords(prev => {
      const current = prev[postTitle] || [];
      const updated = current.includes(word)
        ? current.filter(w => w !== word)
        : [...current, word];
      return { ...prev, [postTitle]: updated };
    });
  };

  const handleSelectAll = (postTitle: string, allWords: string[]) => {
    setSelectedWords(prev => {
      const current = prev[postTitle] || [];
      const isAllSelected = current.length === allWords.length;
      const updated = isAllSelected ? [] : [...allWords];
      return { ...prev, [postTitle]: updated };
    });
  };

  const handleDeleteSelected = async (postTitle: string) => {
    const wordsToDelete = selectedWords[postTitle] || [];
    if (wordsToDelete.length === 0) return;
    if (!confirm(`선택한 ${wordsToDelete.length}개의 단어를 일괄 삭제하시겠습니까?`)) return;

    try {
      const res = await fetch('/api/vocabulary/delete-multiple', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_title: postTitle, words: wordsToDelete })
      });
      if (res.ok) {
        setSelectedWords(prev => ({ ...prev, [postTitle]: [] }));
        fetchWords();
      } else {
        alert("일괄 삭제에 실패했습니다.");
      }
    } catch (e) {
      console.error(e);
      alert("삭제 처리 중 오류가 발생했습니다.");
    }
  };

  const startQuiz = () => {
    // Flatten all post vocabulary lists to a single array
    const allItems: QuizItem[] = vocabData.flatMap(post => 
      post.words.map(w => ({ ...w, post_title: post.post_title }))
    );
    
    if (allItems.length === 0) return;
    
    // Shuffle the array
    const shuffled = [...allItems].sort(() => Math.random() - 0.5);
    setQuizList(shuffled);
    setCurrentQuizIdx(0);
    setUserMeaning('');
    setUserReading('');
    setGraded(false);
    setMeaningResult(null);
    setReadingResult(null);
    setScore({ correctMeaning: 0, correctReading: 0 });
    setIsQuizMode(true);
  };

  const handleGradeQuiz = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userMeaning || !userReading || isGrading || graded) return;

    setIsGrading(true);
    const item = quizList[currentQuizIdx];

    try {
      // Parallel grading requests
      const [meanRes, readRes] = await Promise.all([
        fetch('/api/grade-word-meaning', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            word: item.word,
            correct_meaning: item.meaning,
            user_meaning: userMeaning
          })
        }).then(r => r.json()),
        fetch('/api/grade-word-reading', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            word: item.word,
            correct_reading_accent: item.reading_accent,
            user_reading: userReading
          })
        }).then(r => r.json())
      ]);

      setMeaningResult({ isCorrect: meanRes.is_correct, feedback: meanRes.feedback });
      setReadingResult({ isCorrect: readRes.is_correct, feedback: readRes.feedback });
      
      setScore(prev => ({
        correctMeaning: prev.correctMeaning + (meanRes.is_correct ? 1 : 0),
        correctReading: prev.correctReading + (readRes.is_correct ? 1 : 0)
      }));
      setGraded(true);
    } catch (err) {
      console.error(err);
      alert("채점 중 에러가 발생했습니다.");
    } finally {
      setIsGrading(false);
    }
  };

  const handleNextQuiz = () => {
    if (currentQuizIdx + 1 < quizList.length) {
      setCurrentQuizIdx(prev => prev + 1);
      setUserMeaning('');
      setUserReading('');
      setGraded(false);
      setMeaningResult(null);
      setReadingResult(null);
    } else {
      // Quiz finished
      alert(`퀴즈가 완료되었습니다!\n뜻 점수: ${score.correctMeaning}/${quizList.length}\n발음 점수: ${score.correctReading}/${quizList.length}`);
      setIsQuizMode(false);
      fetchWords();
    }
  };

  const totalWordsCount = vocabData.reduce((acc, curr) => acc + curr.words.length, 0);

  return (
    <div className="flex-1 pb-24 w-full font-sans">
      <header className="pb-8 mb-6 border-b border-[#E5DFD5] flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 mb-2 font-serif">단어장</h2>
          <p className="text-sm font-medium text-slate-500 font-serif">기사 독해 중 저장한 어휘와 발음, 악센트를 기사별로 모아 학습합니다.</p>
        </div>
        {totalWordsCount > 0 && (
          <button 
            onClick={startQuiz}
            className="flex items-center gap-1.5 bg-[#3A4E68] text-white px-5 py-3 rounded-xl text-xs font-bold hover:bg-[#2C3B4F] transition-all shadow-sm active:scale-95 animate-in fade-in zoom-in duration-300"
          >
            <Play className="w-3.5 h-3.5" /> 단어 복습하기
          </button>
        )}
      </header>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="animate-spin text-[#3A4E68]" /></div>
      ) : totalWordsCount === 0 ? (
        <div className="text-center py-20 text-slate-400 font-medium bg-white/40 rounded-2xl border border-[#E5DFD5] mx-auto max-w-xl">
          <p className="font-semibold text-slate-600 mb-1 font-serif">저장된 어휘가 없습니다.</p>
          <p className="text-sm text-slate-500 font-serif">기사 본문 속 단어를 클릭하거나 스마트 추출을 통해 단어장을 채워보세요.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {vocabData.map((postGroup) => {
            const isExpanded = !!expandedPosts[postGroup.post_title];
            const groupWords = postGroup.words.map(w => w.word);
            const selected = selectedWords[postGroup.post_title] || [];
            const allChecked = groupWords.length > 0 && selected.length === groupWords.length;
            const someChecked = selected.length > 0 && selected.length < groupWords.length;
            
            return (
              <div key={postGroup.post_title} className="bg-[#FAF6F0] rounded-2xl border border-[#E5DFD5] overflow-hidden transition-all duration-300 shadow-sm">
                {/* Accordion Header */}
                <button
                  onClick={() => toggleExpand(postGroup.post_title)}
                  className="w-full flex items-center justify-between p-5 hover:bg-[#E5DFD5]/20 transition-colors text-left font-serif"
                >
                  <div className="flex items-center gap-3 min-w-0 pr-4">
                    {isExpanded ? (
                      <ChevronDown className="w-5 h-5 text-[#3A4E68] shrink-0" />
                    ) : (
                      <ChevronRight className="w-5 h-5 text-[#3A4E68] shrink-0" />
                    )}
                    <h3 className="text-base font-bold text-slate-800 truncate">{postGroup.post_title}</h3>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 font-sans text-xs">
                    <span className="bg-[#3A4E68]/10 text-[#3A4E68] px-2.5 py-1 rounded-full font-bold">
                      단어 {postGroup.words.length}개
                    </span>
                  </div>
                </button>

                {/* Accordion Content */}
                {isExpanded && (
                  <div className="border-t border-[#E5DFD5] bg-white p-6 font-sans">
                    {/* Batch Deletion and Group Actions */}
                    <div className="flex justify-between items-center mb-4 pb-3 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={allChecked}
                          ref={el => {
                            if (el) {
                              el.indeterminate = someChecked;
                            }
                          }}
                          onChange={() => handleSelectAll(postGroup.post_title, groupWords)}
                          className="w-4 h-4 rounded text-[#3A4E68] focus:ring-[#3A4E68]/15 border-slate-300 cursor-pointer"
                          id={`select-all-${postGroup.post_title}`}
                        />
                        <label htmlFor={`select-all-${postGroup.post_title}`} className="text-xs font-bold text-slate-500 cursor-pointer select-none">
                          전체 선택 ({selected.length} / {groupWords.length})
                        </label>
                      </div>
                      
                      {selected.length > 0 && (
                        <button
                          onClick={() => handleDeleteSelected(postGroup.post_title)}
                          className="flex items-center gap-1.5 bg-red-50 text-red-600 border border-red-200 px-3.5 py-1.5 rounded-xl text-xs font-bold hover:bg-red-100 transition-colors shadow-sm"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          선택 삭제 ({selected.length})
                        </button>
                      )}
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[500px] text-sm text-left">
                        <thead>
                          <tr className="text-xs font-bold text-slate-400 border-b border-slate-100 uppercase tracking-wider font-sans">
                            <th className="pb-3 pr-4 font-medium w-8">선택</th>
                            <th className="pb-3 pr-6 font-medium">단어</th>
                            <th className="pb-3 px-6 font-medium">발음과 악센트</th>
                            <th className="pb-3 px-6 font-medium">뜻</th>
                            <th className="pb-3 pl-6 font-medium w-20 text-right">삭제</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-serif">
                          {postGroup.words.map((w, idx) => {
                            const isChecked = selected.includes(w.word);
                            return (
                              <tr key={idx} className={cn("hover:bg-slate-50/50 transition-colors", isChecked && "bg-slate-50")}>
                                <td className="py-4 pr-4">
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => handleSelectWord(postGroup.post_title, w.word)}
                                    className="w-4 h-4 rounded text-[#3A4E68] focus:ring-[#3A4E68]/15 border-slate-300 cursor-pointer"
                                  />
                                </td>
                                <td className="py-4 pr-6 font-bold text-lg text-[#1F2226] flex items-center gap-2">
                                  {w.level && (
                                    <span className="inline-block text-[10px] font-bold bg-[#F4EFE6] text-amber-800 border border-amber-900/10 px-1.5 py-0.5 rounded font-sans shrink-0">
                                      {w.level}
                                    </span>
                                  )}
                                  <span>{w.word}</span>
                                </td>
                                <td className="py-4 px-6 text-[#3A4E68] font-mono text-sm">{w.reading_accent}</td>
                                <td className="py-4 px-6 text-[#1F2226] text-sm font-sans font-medium">{w.meaning}</td>
                                <td className="py-4 pl-6 text-right">
                                  <button 
                                    onClick={() => handleDelete(postGroup.post_title, w.word)}
                                    className="text-slate-300 hover:text-red-500 transition-colors p-2 rounded-lg hover:bg-red-50/50"
                                    title="단어 삭제"
                                  >
                                    <Trash2 className="w-4 h-4 ml-auto" />
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Quiz Modal Overlay */}
      {isQuizMode && quizList.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#FAF6F0] rounded-2xl border border-[#E5DFD5] w-full max-w-xl shadow-2xl flex flex-col overflow-hidden max-h-[90vh]">
            <div className="flex items-center justify-between p-5 border-b border-[#E5DFD5] bg-[#FAF6F0]">
              <h3 className="text-base font-bold text-[#3A4E68] font-serif">단어 복습 퀴즈 ({currentQuizIdx + 1} / {quizList.length})</h3>
              <button 
                onClick={() => setIsQuizMode(false)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100/50 rounded-xl transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6">
              {/* Target Word */}
              <div className="text-center py-8 bg-[#E5DFD5]/25 rounded-2xl border border-[#E5DFD5]/40 font-serif">
                <span className="text-xs text-slate-400 font-sans block mb-1 font-bold uppercase tracking-widest">{quizList[currentQuizIdx].post_title}</span>
                <span className="text-5xl font-bold text-[#1F2226]">{quizList[currentQuizIdx].word}</span>
              </div>

              <form onSubmit={handleGradeQuiz} className="space-y-4 font-sans">
                {/* 1. 뜻 적기 */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">뜻 적기</label>
                  <input
                    required
                    disabled={graded}
                    placeholder="단어의 한국어 뜻을 적으세요..."
                    className="w-full px-4 py-3 border border-[#E5DFD5] rounded-xl outline-none focus:ring-2 focus:ring-[#3A4E68]/15 bg-white transition-all text-slate-800 text-sm font-medium"
                    value={userMeaning}
                    onChange={e => setUserMeaning(e.target.value)}
                  />
                  {graded && meaningResult && (
                    <div className={cn(
                      "flex items-start gap-2 p-3 rounded-xl border text-xs font-medium mt-1 leading-relaxed",
                      meaningResult.isCorrect ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-orange-50 border-orange-200 text-orange-800"
                    )}>
                      {meaningResult.isCorrect ? <Check className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0"/> : <AlertCircle className="w-4 h-4 text-orange-600 mt-0.5 shrink-0"/>}
                      <div>
                        <span className="font-bold">{meaningResult.isCorrect ? "뜻 정답!" : "뜻 검토 필요"}</span> (사전 뜻: <span className="underline">{quizList[currentQuizIdx].meaning}</span>)
                        <p className="mt-1 text-[11px] text-slate-500 font-normal">{meaningResult.feedback}</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* 2. 발음 적기 */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">발음 적기 (한글, 로마자, 가나 등 모두 가능)</label>
                  <input
                    required
                    disabled={graded}
                    placeholder="예: 네코, neko, ねこ..."
                    className="w-full px-4 py-3 border border-[#E5DFD5] rounded-xl outline-none focus:ring-2 focus:ring-[#3A4E68]/15 bg-white transition-all text-slate-800 text-sm font-medium"
                    value={userReading}
                    onChange={e => setUserReading(e.target.value)}
                  />
                  {graded && readingResult && (
                    <div className={cn(
                      "flex items-start gap-2 p-3 rounded-xl border text-xs font-medium mt-1 leading-relaxed",
                      readingResult.isCorrect ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-orange-50 border-orange-200 text-orange-800"
                    )}>
                      {readingResult.isCorrect ? <Check className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0"/> : <AlertCircle className="w-4 h-4 text-orange-600 mt-0.5 shrink-0"/>}
                      <div>
                        <span className="font-bold">{readingResult.isCorrect ? "발음 정답!" : "발음 검토 필요"}</span> (정확한 발음/악센트: <span className="underline">{quizList[currentQuizIdx].reading_accent}</span>)
                        <p className="mt-1 text-[11px] text-slate-500 font-normal">{readingResult.feedback}</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Submit button */}
                {!graded ? (
                  <button
                    type="submit"
                    disabled={!userMeaning || !userReading || isGrading}
                    className="w-full bg-[#3A4E68] text-white py-3.5 rounded-xl font-bold text-sm hover:bg-[#2C3B4F] disabled:opacity-50 transition-colors border border-slate-900/10 flex items-center justify-center gap-1.5 shadow"
                  >
                    {isGrading ? <Loader2 className="w-4 h-4 animate-spin"/> : <BrainCircuit className="w-4 h-4"/>}
                    제출 및 AI 채점
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleNextQuiz}
                    className="w-full bg-[#3A4E68] text-white py-3.5 rounded-xl font-bold text-sm hover:bg-[#2C3B4F] transition-colors border border-slate-900/10 flex items-center justify-center gap-1.5 shadow"
                  >
                    {currentQuizIdx + 1 < quizList.length ? "다음 단어로" : "결과 확인 및 종료"}
                  </button>
                )}
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
