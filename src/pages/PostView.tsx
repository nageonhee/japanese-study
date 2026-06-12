import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Post, ProcessedSentence, Token } from '../types';
import { useStore } from '../store';
import { ArrowLeft, BookOpen, Loader2, Play, CheckCircle2, BookmarkPlus, Copy, Search, BrainCircuit } from 'lucide-react';
import { cn } from '../lib/utils';
import * as Popover from '@radix-ui/react-popover';

type ViewMode = 'original' | 'learning' | 'answer';

interface TranslationSubmission {
  userTranslation: string;
  isCorrect?: boolean;
  feedback?: string;
  properTranslation?: string;
}

export function PostView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [post, setPost] = useState<Post | null>(null);
  const [mode, setMode] = useState<ViewMode>('original');
  const [processedData, setProcessedData] = useState<ProcessedSentence[]>([]);
  const [isLoadingProcessing, setIsLoadingProcessing] = useState(false);
  
  // Local toggles for reading mode, persists per-user choice locally
  const [showFurigana, setShowFurigana] = useState<boolean>(() => {
    return JSON.parse(localStorage.getItem('post_view_showFurigana') ?? 'true');
  });
  const [showTranslation, setShowTranslation] = useState(false);
  
  // State for learning mode
  const [submissions, setSubmissions] = useState<Record<number, TranslationSubmission>>({});
  const [currentSentenceIdx, setCurrentSentenceIdx] = useState(0);

  const { textSizeLevel } = useStore();

  const fetchPost = async () => {
    const res = await fetch('/api/posts/' + id);
    if (res.ok) {
      setPost(await res.json());
    }
  };

  useEffect(() => {
    fetchPost();
  }, [id]);

  const toggleFurigana = async () => {
    const nextVal = !showFurigana;
    if (nextVal && processedData.length === 0) {
      await processTextForLearning();
    }
    setShowFurigana(nextVal);
    localStorage.setItem('post_view_showFurigana', JSON.stringify(nextVal));
  };

  const toggleTranslation = async () => {
    if (!showTranslation && processedData.length === 0) {
      await processTextForLearning();
    }
    setShowTranslation(!showTranslation);
  };

  const processTextForLearning = async () => {
    if (processedData.length > 0) {
      if (mode !== 'original') setMode('learning');
      return;
    }
    setIsLoadingProcessing(true);
    try {
      const res = await fetch('/api/process-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: post?.body })
      });
      const data = await res.json();
      setProcessedData(data.sentences || []);
      setMode('learning');
    } catch (e) {
      console.error(e);
      alert("Failed to process text.");
    } finally {
      setIsLoadingProcessing(false);
    }
  };

  const handleTranslationSubmit = async (e: React.FormEvent, sentenceIdx: number) => {
    e.preventDefault();
    const submission = submissions[sentenceIdx];
    if (!submission?.userTranslation || submission.isCorrect !== undefined) return;

    try {
      const sentence = processedData[sentenceIdx].original;
      const res = await fetch('/api/grade-translation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          original_sentence: sentence,
          user_translation: submission.userTranslation
        })
      });
      const data = await res.json();
      
      setSubmissions(prev => ({
        ...prev,
        [sentenceIdx]: {
          ...prev[sentenceIdx],
          isCorrect: data.is_correct,
          feedback: data.feedback,
          properTranslation: data.proper_translation
        }
      }));

    } catch (err) {
      console.error(err);
    }
  };

  const handleUserTranslationChange = (sentenceIdx: number, val: string) => {
    setSubmissions(prev => ({
      ...prev,
      [sentenceIdx]: { ...prev[sentenceIdx], userTranslation: val }
    }));
  };

  const handleFinishLearning = () => {
    setMode('answer');
  };

  const saveToWordbook = async (token: Token) => {
    try {
      await fetch('/api/vocabulary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          word: token.surface,
          base_form: token.base_form,
          reading: token.reading,
          meaning: '', // Left blank for user to review later
          difficulty: 'unknown',
          post_id: post?.id,
          post_title: post?.title
        })
      });
      // Optionally show a toast
    } catch (e) {
      console.error(e);
    }
  };

  if (!post) return <div className="p-8 text-center animate-pulse uppercase tracking-widest font-sans text-xs">Loading...</div>;

  const textSizeClass = [
    'text-sm leading-relaxed',
    'text-base leading-relaxed',
    'text-xl leading-loose',
    'text-3xl leading-[2.5]',
    'text-4xl leading-[3]'
  ][textSizeLevel - 1] || 'text-xl leading-loose';

  return (
    <div className="flex-1 pb-24 mx-auto w-full max-w-4xl">
      <header className="mb-8 border-b border-slate-150 pb-6 font-sans">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-slate-400 hover:text-slate-900 transition-colors mb-4 text-xs font-semibold">
          <ArrowLeft className="w-4 h-4" /> 목록으로 돌아가기
        </button>
        <div className="flex items-center gap-3 text-xs font-semibold text-slate-400 mb-3">
          <span className="text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md font-bold">{post.category_name}</span>
          <span>{new Date(post.created_at).toLocaleDateString()}</span>
        </div>
        <h1 className="text-3xl lg:text-4xl font-bold text-slate-900 leading-tight tracking-tight font-serif">{post.title}</h1>
      </header>

      <nav className="mb-6 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between border-b border-slate-100 pb-4 font-sans text-sm">
        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          <div className="flex gap-1.5 bg-slate-100/80 p-1 rounded-xl border border-slate-200/40">
            <button 
              onClick={toggleFurigana}
              disabled={isLoadingProcessing}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200", 
                showFurigana 
                  ? "bg-white text-slate-900 border border-slate-200/60" 
                  : "text-slate-500 hover:text-slate-900"
              )}
            >
              요미가나 {showFurigana ? 'ON' : 'OFF'}
            </button>
            {mode === 'original' && (
              <button 
                onClick={toggleTranslation}
                disabled={isLoadingProcessing}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200", 
                  showTranslation 
                    ? "bg-white text-slate-900 border border-slate-200/60" 
                    : "text-slate-500 hover:text-slate-900"
                )}
              >
                번역 보기 {showTranslation ? 'ON' : 'OFF'}
              </button>
            )}
          </div>
          <div className="flex bg-slate-100/80 p-1 rounded-xl ml-auto sm:ml-0 border border-slate-200/40">
            <button 
              onClick={() => setMode('original')}
              className={cn(
                "px-4 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200", 
                mode === 'original' 
                  ? "bg-white text-slate-900 border border-slate-200/60" 
                  : "text-slate-500 hover:text-slate-900"
              )}
            >
              1. 원문 정독
            </button>
            <button 
              onClick={() => {
                setMode('learning');
                processTextForLearning();
              }}
              disabled={isLoadingProcessing}
              className={cn(
                "px-4 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all duration-200", 
                mode === 'learning' || mode === 'answer' 
                  ? "bg-white text-slate-900 border border-slate-200/60" 
                  : "text-slate-500 hover:text-slate-900"
              )}
            >
              {isLoadingProcessing && mode !== 'original' && <Loader2 className="w-3 h-3 animate-spin text-slate-700"/>}
              2. 번역 훈련
            </button>
          </div>
        </div>
      </nav>

      {mode === 'original' && (
        <article className={cn("text-slate-900 whitespace-pre-wrap text-justify bg-white p-6 md:p-8 rounded-2xl border border-slate-200/65 font-serif", textSizeClass)}>
          {(!showFurigana && !showTranslation) || processedData.length === 0 ? (
            <div>
              {post.body}
            </div>
          ) : (
            <div className="space-y-6">
              {processedData.map((sentence, sIdx) => (
                <div key={sIdx} className="mb-4">
                  <div className="flex flex-wrap gap-x-1 gap-y-2 items-end">
                    {sentence.tokens.map((token, tIdx) => (
                      <Popover.Root key={tIdx}>
                        <Popover.Trigger asChild>
                          <span className="relative inline-flex flex-col items-center cursor-pointer hover:bg-indigo-50/50 rounded-lg px-1 group leading-none transition-colors duration-150">
                            {showFurigana && token.reading && token.reading !== token.surface ? (
                              <span className="text-[0.45em] text-slate-400 mb-1 font-sans font-medium tracking-tight h-4 flex items-end">{token.reading}</span>
                            ) : <span className="h-4"></span>}
                            <span className="text-slate-900 hover:text-indigo-600 transition-colors">{token.surface}</span>
                          </span>
                        </Popover.Trigger>
                        <Popover.Portal>
                          <Popover.Content sideOffset={5} className="bg-slate-900 text-white p-4 font-sans text-sm w-60 rounded-xl border border-slate-800 z-50">
                            <div className="font-bold text-base mb-1 border-b border-slate-800 pb-2">{token.surface}</div>
                            <div className="text-slate-400 mb-4 text-xs font-medium">{token.reading} {token.base_form !== token.surface ? '(' + token.base_form + ')' : ''}</div>
                            <div className="flex flex-col gap-2">
                              <button onClick={() => saveToWordbook(token)} className="flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 rounded-lg py-2 transition-colors text-xs font-semibold text-white">
                                <BookmarkPlus className="w-3.5 h-3.5"/> 단어장 저장
                              </button>
                            </div>
                          </Popover.Content>
                        </Popover.Portal>
                      </Popover.Root>
                    ))}
                  </div>
                  {showTranslation && sentence.translation && (
                    <div className="mt-2 text-sm text-slate-500 pl-4 border-l-2 border-indigo-500 bg-indigo-50/30 py-2 rounded-r-lg font-sans">
                      {sentence.translation}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </article>
      )}

      {(mode === 'learning' || mode === 'answer') && (
        <div className="space-y-6 font-serif">
          {processedData.map((sentence, sIdx) => {
            const hasSubmitted = submissions[sIdx] && submissions[sIdx].isCorrect !== undefined;
            const isActive = currentSentenceIdx === sIdx;
            
            return (
              <div 
                key={sIdx} 
                className={cn(
                  "p-6 rounded-2xl border transition-all duration-300 cursor-pointer",
                  isActive 
                    ? "bg-white border-indigo-300 ring-2 ring-indigo-50/50" 
                    : "bg-white/80 border-slate-200 hover:bg-white hover:border-slate-350",
                  mode === 'answer' ? "bg-slate-50/50" : ""
                )}
                onClick={() => { if(mode === 'learning') setCurrentSentenceIdx(sIdx); }}
              >
                <div className={cn("text-slate-900 mb-6 flex flex-wrap gap-x-1 gap-y-2 items-end", textSizeClass)}>
                  {sentence.tokens.map((token, tIdx) => (
                    <Popover.Root key={tIdx}>
                      <Popover.Trigger asChild>
                        <span className="relative inline-flex flex-col items-center cursor-pointer hover:bg-indigo-50/50 rounded-lg px-1 group leading-none transition-colors duration-150">
                          {(showFurigana || mode === 'answer') && token.reading && token.reading !== token.surface ? (
                            <span className="text-[0.45em] text-slate-400 mb-1 font-sans font-medium tracking-tight h-4 flex items-end">{token.reading}</span>
                          ) : <span className="h-4"></span>}
                          <span>{token.surface}</span>
                        </span>
                      </Popover.Trigger>
                      <Popover.Portal>
                        <Popover.Content sideOffset={5} className="bg-slate-900 text-white p-4 font-sans text-sm w-60 rounded-xl border border-slate-800 z-50">
                          <div className="font-bold text-base mb-1 border-b border-slate-800 pb-2">{token.surface}</div>
                          <div className="text-slate-400 mb-4 text-xs font-medium">{token.reading} {token.base_form !== token.surface ? '(' + token.base_form + ')' : ''}</div>
                          <div className="flex flex-col gap-2">
                            <button onClick={() => saveToWordbook(token)} className="flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 rounded-lg py-2 transition-colors text-xs font-semibold text-white">
                              <BookmarkPlus className="w-3.5 h-3.5"/> 단어장 저장
                            </button>
                            <button onClick={() => navigator.clipboard.writeText(token.surface)} className="flex items-center justify-center gap-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg py-2 transition-colors text-xs font-semibold text-white">
                              <Copy className="w-3.5 h-3.5"/> 복사하기
                            </button>
                          </div>
                        </Popover.Content>
                      </Popover.Portal>
                    </Popover.Root>
                  ))}
                </div>

                {mode === 'learning' && (
                  <form onSubmit={(e) => handleTranslationSubmit(e, sIdx)} className="mt-6 font-sans animate-in fade-in duration-200" onClick={(e) => e.stopPropagation()}>
                    {!hasSubmitted ? (
                      <div className="flex flex-col gap-3">
                        <textarea
                          placeholder="이 문장의 한국어 뜻을 적고 AI 피드백을 받아보세요..."
                          className="w-full border border-slate-200 rounded-xl bg-slate-50 p-4 outline-none focus:ring-2 focus:ring-indigo-100 focus:bg-white resize-none transition-all text-slate-800"
                          rows={2}
                          value={submissions[sIdx]?.userTranslation || ''}
                          onChange={(e) => handleUserTranslationChange(sIdx, e.target.value)}
                        />
                        {isActive && (
                          <div className="flex justify-end mt-1">
                            <button 
                              type="submit"
                              disabled={!submissions[sIdx]?.userTranslation}
                              className="bg-indigo-600 text-white px-5 py-2 rounded-xl text-xs font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors border border-indigo-700/50"
                            >
                              피드백 제출
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="bg-slate-50/60 rounded-xl p-4 md:p-5 space-y-4 border border-slate-100">
                        <div className="flex items-start gap-4">
                          <div className={cn("mt-1 px-2.5 py-1 text-[10px] font-bold rounded-lg uppercase tracking-wider", submissions[sIdx].isCorrect ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-orange-50 text-orange-700 border border-orange-200")}>
                            {submissions[sIdx].isCorrect ? "매우 양호" : "복습 추천"}
                          </div>
                          <div>
                            <p className="font-semibold text-slate-400 mb-0.5 text-[10px] uppercase tracking-wider">나의 번역</p>
                            <p className="text-slate-800 text-sm font-medium">{submissions[sIdx].userTranslation}</p>
                          </div>
                        </div>
                        <div className="pt-3 border-t border-slate-100">
                          <p className="font-semibold text-slate-400 mb-1.5 text-[10px] uppercase tracking-wider flex items-center gap-1"><BrainCircuit className="w-3.5 h-3.5 text-indigo-500 animate-pulse"/> AI 분석 & 피드백</p>
                          <p className="text-slate-600 text-sm leading-relaxed font-sans">{submissions[sIdx].feedback}</p>
                        </div>
                      </div>
                    )}
                  </form>
                )}

                {mode === 'answer' && (
                  <div className="mt-6 pt-4 border-t border-slate-100 font-sans">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-emerald-500"/> 의미 번역 예시</p>
                    <p className="text-slate-800 text-sm font-medium bg-slate-50 p-4 rounded-xl border border-slate-100">{submissions[sIdx]?.properTranslation || "작성된 정답이 없습니다."}</p>
                  </div>
                )}
              </div>
            );
          })}

          {mode === 'learning' && (
            <div className="flex justify-center pt-8 pb-12 font-sans">
              <button 
                onClick={handleFinishLearning}
                className="bg-indigo-600 text-white px-8 py-3.5 rounded-xl font-semibold hover:bg-indigo-700 transition-all text-sm flex items-center gap-2 border border-indigo-700/50 hover:-translate-y-0.5 active:translate-y-0"
              >
                피드백 종료 및 모범답안 보기
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
