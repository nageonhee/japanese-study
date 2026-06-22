import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Post, ProcessedSentence, Token } from '../types';
import { useStore } from '../store';
import { ArrowLeft, BookOpen, Loader2, Play, CheckCircle2, BookmarkPlus, Copy, Search, BrainCircuit, Trash2 } from 'lucide-react';
import { cn } from '../lib/utils';
import * as Popover from '@radix-ui/react-popover';
import { storage, APP_MODE } from '../lib/storage';
import { PostFormModal } from '../components/PostFormModal';
import { YomiganaEditModal } from '../components/YomiganaEditModal';

type ViewMode = 'original' | 'learning' | 'answer';

interface TranslationSubmission {
  userTranslation: string;
  isCorrect?: boolean;
  feedback?: string;
  properTranslation?: string;
}

const isKanji = (ch: string) => /[\u4e00-\u9faf\u3400-\u4dbf\uf900-\ufaff々]/.test(ch);

function toHiragana(str: string): string {
  return str.replace(/[\u30a1-\u30f6]/g, (match) => {
    return String.fromCharCode(match.charCodeAt(0) - 0x60);
  });
}

function alignFurigana(surface: string, reading: string): { text: string, ruby?: string }[] {
  if (!reading || surface === reading || toHiragana(surface) === toHiragana(reading)) {
    return [{ text: surface }];
  }
  const hasKanji = /[\u4e00-\u9faf\u3400-\u4dbf\uf900-\ufaff々]/.test(surface);
  if (!hasKanji) {
    return [{ text: surface }];
  }

  function match(s: number, r: number): { text: string, ruby?: string }[] | null {
    if (s === surface.length && r === reading.length) return [];
    if (s === surface.length || r === reading.length) return null;
    
    const sChar = surface[s];
    const sHira = toHiragana(sChar);
    
    if (!isKanji(sChar)) {
      if (sHira === reading[r]) {
        const sub = match(s + 1, r + 1);
        if (sub !== null) return [{ text: sChar }, ...sub];
      }
      return null;
    } else {
      for (let len = 1; len <= reading.length - r; len++) {
        const sub = match(s + 1, r + len);
        if (sub !== null) {
          const rubyText = reading.substring(r, r + len);
          return [{ text: sChar, ruby: rubyText }, ...sub];
        }
      }
      return null;
    }
  }

  const path = match(0, 0);
  if (path) {
    const merged: { text: string, ruby?: string }[] = [];
    for (const item of path) {
      const prev = merged[merged.length - 1];
      if (prev && prev.ruby && item.ruby) {
        prev.text += item.text;
        prev.ruby += item.ruby;
      } else if (prev && !prev.ruby && !item.ruby) {
        prev.text += item.text;
      } else {
        merged.push({ ...item });
      }
    }
    return merged;
  }
  return [{ text: surface, ruby: reading }];
}

function FuriganaText({ surface, reading, showFurigana }: { surface: string, reading: string, showFurigana: boolean }) {
  if (!showFurigana) {
    return <span className="text-[#1F2226]">{surface}</span>;
  }
  const aligned = alignFurigana(surface, reading);
  return (
    <>
      {aligned.map((seg, idx) => (
        seg.ruby ? (
          <ruby key={idx} className="select-none">
            <span className="text-[#1F2226]">{seg.text}</span>
            <rt className="text-[0.55em] text-[#3A4E68] font-sans font-semibold tracking-tight pb-0.5 select-none">{seg.ruby}</rt>
          </ruby>
        ) : (
          <span key={idx} className="text-[#1F2226]">{seg.text}</span>
        )
      ))}
    </>
  );
}

const splitTrailingTokens = (tokens: Token[]) => {
  const contentTokens: Token[] = [];
  const trailingTokens: Token[] = [];
  let lastContentIdx = -1;
  for (let i = tokens.length - 1; i >= 0; i--) {
    const isWhitespace = /^\s+$/.test(tokens[i].surface);
    if (!isWhitespace) {
      lastContentIdx = i;
      break;
    }
  }
  for (let i = 0; i < tokens.length; i++) {
    if (i <= lastContentIdx) {
      contentTokens.push(tokens[i]);
    } else {
      trailingTokens.push(tokens[i]);
    }
  }
  return { contentTokens, trailingTokens };
};

export function PostView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const isPersonal = new URLSearchParams(location.search).get('personal') === 'true';
  const [post, setPost] = useState<Post | null>(null);
  const [mode, setMode] = useState<ViewMode>('original');
  const [processedData, setProcessedData] = useState<ProcessedSentence[]>([]);
  const [isLoadingProcessing, setIsLoadingProcessing] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isYomiganaModalOpen, setIsYomiganaModalOpen] = useState(false);
  
  const { isFuriganaEnabled, textSizeLevel, user, geminiApiKey } = useStore();

  // Local choices, initialize with global settings
  const [localShowFurigana, setLocalShowFurigana] = useState(false);
  const [showTranslation, setShowTranslation] = useState(false);
  
  // Difficulty levels for translation grading
  const [difficulty, setDifficulty] = useState<'high' | 'medium' | 'low'>('medium');
  const [submissions, setSubmissions] = useState<Record<number, TranslationSubmission>>({});
  const [currentSentenceIdx, setCurrentSentenceIdx] = useState(0);
  const [isGrading, setIsGrading] = useState<Record<number, boolean>>({});

  // Level selector for vocabulary extraction
  const [extractLevel, setExtractLevel] = useState<'N1' | 'N2' | 'N3' | 'N4'>('N3');
  const [isExtracting, setIsExtracting] = useState(false);

  // Naver Dictionary lookup states
  const [dictMeaning, setDictMeaning] = useState<string>('');
  const [dictAccent, setDictAccent] = useState<string>('');
  const [dictLoading, setDictLoading] = useState<boolean>(false);

  const isClickableToken = (token: Token) => {
    const pos = token.pos || '';
    const excluded = ['조사', '기호', '부호', '조동사', '助詞', '助動詞', '記号', '補助記号'];
    return !excluded.some(ex => pos.includes(ex));
  };

  const handleLookupDict = async (word: string) => {
    setDictLoading(true);
    setDictMeaning('');
    setDictAccent('');
    try {
      const res = await fetch(`/api/lookup-dictionary?word=${encodeURIComponent(word)}`);
      if (res.ok) {
        const data = await res.json();
        setDictMeaning(data.meaning);
        if (data.accent) {
          setDictAccent(data.accent);
        }
      } else {
        setDictMeaning('사전 뜻을 찾을 수 없습니다.');
      }
    } catch (e) {
      setDictMeaning('사전 검색 중 오류가 발생했습니다.');
    } finally {
      setDictLoading(false);
    }
  };

  const initializeFallbackSentences = (bodyText: string) => {
    if (!bodyText) return;
    // Split by 。 ！？ or newline but keep the delimiters
    const parts = bodyText.split(/([。！？\n])/);
    const fallbackList: ProcessedSentence[] = [];
    const hasSegmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl;
    const segmenter = hasSegmenter ? new Intl.Segmenter('ja-JP', { granularity: 'word' }) : null;
    const isJapaneseOrAlphanumeric = (str: string) => {
      return /[\u4e00-\u9faf\u3040-\u309f\u30a0-\u30ff\uff66-\uff9fA-Za-z0-9]/.test(str);
    };
    
    for (let i = 0; i < parts.length; i += 2) {
      const text = parts[i];
      const delim = parts[i + 1] || '';
      const sentenceText = (text + delim).trim();
      
      if (sentenceText) {
        const tokens: Token[] = [];
        if (segmenter) {
          try {
            const segments = segmenter.segment(sentenceText);
            for (const segment of segments) {
              const surface = segment.segment;
              const isWord = isJapaneseOrAlphanumeric(surface);
              tokens.push({
                surface,
                base_form: surface,
                reading: '',
                reading_accent: '',
                pos: isWord ? '단어' : '기호',
                meaning: ''
              });
            }
          } catch (e) {
            console.error("Failed to segment fallback sentence:", e);
            tokens.push({
              surface: sentenceText,
              base_form: sentenceText,
              reading: '',
              reading_accent: '',
              pos: '문장',
              meaning: ''
            });
          }
        } else {
          tokens.push({
            surface: sentenceText,
            base_form: sentenceText,
            reading: '',
            reading_accent: '',
            pos: '문장',
            meaning: ''
          });
        }

        fallbackList.push({
          original: sentenceText,
          translation: '기본 직역을 제공할 수 없습니다 (AI 분석 필요)',
          tokens
        });
      }
    }
    setProcessedData(fallbackList);
  };

  const fetchPost = async () => {
    try {
      const data = await storage.getPostById(Number(id), isPersonal, geminiApiKey);
      setPost(data);
      if (data.processed_json) {
        try {
          const parsed = JSON.parse(data.processed_json);
          setProcessedData(parsed.sentences || []);
        } catch (e) {
          console.error("Failed to parse processed_json, falling back to local split", e);
          initializeFallbackSentences(data.body);
        }
      } else {
        // Fallback split by punctuation immediately so user can train translation without API key
        initializeFallbackSentences(data.body);
      }
    } catch (err) {
      console.error("Failed to fetch post", err);
    }
  };

  useEffect(() => {
    fetchPost();
  }, [id, isPersonal, geminiApiKey]);

  useEffect(() => {
    setLocalShowFurigana(isFuriganaEnabled);
  }, [isFuriganaEnabled]);

  const triggerProcessText = async () => {
    const isFallback = processedData.length === 0 || processedData.some(s => s.tokens.some(t => t.pos === '문장' || (t.pos === '단어' && !t.reading)));
    if (!isFallback) return;
    
    setIsLoadingProcessing(true);
    try {
      const data = await storage.getPostById(Number(id), isPersonal, geminiApiKey);
      setPost(data);
      if (data.processed_json) {
        const parsed = JSON.parse(data.processed_json);
        setProcessedData(parsed.sentences || []);
      }
    } catch (e) {
      console.error(e);
      alert("텍스트 분석에 실패했습니다.");
    } finally {
      setIsLoadingProcessing(false);
    }
  };

  const handleTranslationSubmit = async (e: React.FormEvent, sentenceIdx: number) => {
    e.preventDefault();
    const submission = submissions[sentenceIdx];
    if (!submission?.userTranslation || submission.isCorrect !== undefined) return;

    setIsGrading(prev => ({ ...prev, [sentenceIdx]: true }));
    try {
      const sentence = processedData[sentenceIdx];
      const data = await storage.gradeTranslation(
        sentence.original,
        submission.userTranslation,
        sentence.translation,
        difficulty,
        geminiApiKey
      );
      
      setSubmissions(prev => ({
        ...prev,
        [sentenceIdx]: {
          ...prev[sentenceIdx],
          isCorrect: data.is_correct,
          feedback: data.feedback,
          properTranslation: sentence.translation // Show the original AI translation from DB
        }
      }));

    } catch (err) {
      console.error(err);
    } finally {
      setIsGrading(prev => ({ ...prev, [sentenceIdx]: false }));
    }
  };

  const handleUserTranslationChange = (sentenceIdx: number, val: string) => {
    setSubmissions(prev => ({
      ...prev,
      [sentenceIdx]: { ...prev[sentenceIdx], userTranslation: val }
    }));
  };

  const saveToWordbook = async (token: Token, customMeaning?: string) => {
    try {
      await storage.addVocabulary(
        post?.title || '',
        token.surface,
        dictAccent || token.reading_accent || token.reading || '',
        customMeaning || token.meaning || '',
        ''
      );
      alert(`단어장에 '${token.surface}'이(가) 추가되었습니다.`);
    } catch (e) {
      console.error(e);
      alert("단어 추가에 실패했습니다.");
    }
  };

  const handleExtractWords = async () => {
    if (!post) return;
    setIsExtracting(true);
    try {
      const count = await storage.extractDifficultWords(post.id, extractLevel, isPersonal, geminiApiKey);
      alert(`JLPT ${extractLevel} 이상 수준의 단어 ${count}개가 단어장에 추가되었습니다.`);
    } catch (e) {
      console.error(e);
      alert("단어 추출 과정에 오류가 발생했습니다.");
    } finally {
      setIsExtracting(false);
    }
  };

  const handleDeletePost = async () => {
    if (!post) return;
    if (!confirm("정말로 이 원문을 삭제하시겠습니까? (이 원문과 연결된 단어장도 함께 삭제됩니다)")) return;
    try {
      await storage.deletePost(post.id, isPersonal);
      alert("원문이 정상적으로 삭제되었습니다.");
      navigate(isPersonal ? '/personal' : '/');
    } catch (err) {
      console.error(err);
      alert("삭제 중 에러가 발생했습니다.");
    }
  };

  if (!post) return <div className="p-8 text-center animate-pulse font-sans text-xs tracking-widest">Loading...</div>;

  const textSizeClass = [
    'text-sm leading-relaxed',
    'text-base leading-relaxed',
    'text-lg leading-relaxed',
    'text-2xl leading-relaxed',
    'text-3xl leading-relaxed'
  ][textSizeLevel - 1] || 'text-lg leading-relaxed';

  return (
    <div className="flex-1 pb-24 mx-auto w-full max-w-4xl font-serif">
      <header className="mb-8 border-b border-[#E5DFD5] pb-6 font-sans">
        <div className="flex justify-between items-center mb-4">
          <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-[#3A4E68] hover:underline transition-colors text-xs font-bold">
            <ArrowLeft className="w-4 h-4" /> 목록으로 돌아가기
          </button>
          
          {/* Conditional Modify/Delete Buttons */}
          {(isPersonal || (user && (user.role === 'master' || user.role === 'host' || user.role === 'admin' || user.id === post?.author_id))) && (
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setIsEditModalOpen(true)}
                className="text-xs font-bold text-[#3A4E68] hover:bg-[#E5DFD5]/40 transition-colors flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#E5DFD5]"
              >
                원문 수정
              </button>
              <button 
                onClick={() => setIsYomiganaModalOpen(true)}
                className="text-xs font-bold text-[#3A4E68] hover:bg-[#E5DFD5]/40 transition-colors flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#E5DFD5]"
              >
                요미가나 수정
              </button>
              <button 
                onClick={handleDeletePost}
                className="text-xs font-bold text-red-500 hover:text-red-700 transition-colors flex items-center gap-1.5 bg-red-50/20 hover:bg-red-50 px-3 py-1.5 rounded-lg border border-red-200/40"
              >
                <Trash2 className="w-3.5 h-3.5" /> 원문 삭제
              </button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs font-semibold text-slate-500 mb-3">
          <span className="text-[#3A4E68] border border-[#3A4E68] px-2 py-0.5 rounded-md font-bold text-[10px]">{post.category_name}</span>
          <span>{new Date(post.created_at).toLocaleDateString()}</span>
        </div>
        <h1 className="text-3xl lg:text-4xl font-bold text-slate-900 leading-tight tracking-tight font-serif">{post.title}</h1>
      </header>

      {/* Mode and Toggle Controls */}
      <nav className="mb-8 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between border-b border-[#E5DFD5] pb-4 font-sans text-sm">
        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          {mode === 'original' && (
            <div className="flex gap-1.5 bg-[#E5DFD5]/40 p-1 rounded-xl border border-[#E5DFD5]/60">
              <button 
                onClick={() => setLocalShowFurigana(!localShowFurigana)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200", 
                  localShowFurigana 
                    ? "bg-[#3A4E68] text-white" 
                    : "text-[#3A4E68] hover:bg-[#E5DFD5]/80"
                )}
              >
                요미가나 보기
              </button>
              <button 
                onClick={() => {
                  setShowTranslation(!showTranslation);
                  triggerProcessText();
                }}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200", 
                  showTranslation 
                    ? "bg-[#3A4E68] text-white" 
                    : "text-[#3A4E68] hover:bg-[#E5DFD5]/80"
                )}
              >
                번역 보기
              </button>
            </div>
          )}

          {mode === 'learning' && (
            <div className="flex items-center gap-2 bg-[#E5DFD5]/40 p-1 rounded-xl border border-[#E5DFD5]/60">
              <span className="text-xs font-bold text-[#3A4E68] pl-2">채점 난이도:</span>
              {(['low', 'medium', 'high'] as const).map((lvl) => (
                <button
                  key={lvl}
                  onClick={() => setDifficulty(lvl)}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-xs font-bold transition-all duration-200",
                    difficulty === lvl
                      ? "bg-[#3A4E68] text-white"
                      : "text-slate-600 hover:text-slate-900"
                  )}
                >
                  {lvl === 'low' && '하'}
                  {lvl === 'medium' && '중'}
                  {lvl === 'high' && '상'}
                </button>
              ))}
            </div>
          )}
          
          <div className="flex bg-[#E5DFD5]/40 p-1 rounded-xl ml-auto sm:ml-0 border border-[#E5DFD5]/60">
            <button 
              onClick={() => setMode('original')}
              className={cn(
                "px-4 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200", 
                mode === 'original' 
                  ? "bg-[#3A4E68] text-white" 
                  : "text-[#3A4E68] hover:bg-[#E5DFD5]/80"
              )}
            >
              1. 원문 읽기
            </button>
            <button 
              onClick={() => {
                setMode('learning');
                triggerProcessText();
              }}
              disabled={isLoadingProcessing}
              className={cn(
                "px-4 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all duration-200", 
                mode === 'learning' 
                  ? "bg-[#3A4E68] text-white" 
                  : "text-[#3A4E68] hover:bg-[#E5DFD5]/80"
              )}
            >
              {isLoadingProcessing && <Loader2 className="w-3 h-3 animate-spin text-slate-700"/>}
              2. 번역 모드
            </button>
          </div>
        </div>
      </nav>

      {/* 1단계 (원문 읽기) */}
      {mode === 'original' && (
        <article className="newspaper-paper p-6 md:p-8 rounded-2xl">
          {processedData.length === 0 ? (
            <div className={cn("text-[#1F2226] whitespace-pre-wrap text-justify leading-relaxed", textSizeClass)}>
              {post.body}
            </div>
          ) : (
            <div>
              {!showTranslation ? (
                /* 번역이 꺼져 있을 때: 단락 띄어쓰기 없이 신문 사설처럼 쭉 이어 쓰기 */
                <div className={cn("text-[#1F2226] text-justify leading-relaxed whitespace-pre-wrap break-all", textSizeClass)}>
                  {processedData.map((sentence, sIdx) => (
                    <React.Fragment key={sIdx}>
                      {sentence.tokens.map((token, tIdx) => {
                        const clickable = isClickableToken(token);

                        const innerSpan = (
                          <span className={cn(
                            "inline relative select-none",
                            clickable ? "cursor-pointer hover:bg-[#E5DFD5]/70 hover:underline decoration-[#3A4E68] rounded px-0.5 transition-all" : "cursor-default"
                          )}>
                            <FuriganaText surface={token.surface} reading={token.reading} showFurigana={localShowFurigana} />
                          </span>
                        );

                        if (clickable) {
                          return (
                            <Popover.Root key={tIdx} onOpenChange={(open) => { if (open) handleLookupDict(token.base_form || token.surface); }}>
                              <Popover.Trigger asChild>
                                {innerSpan}
                              </Popover.Trigger>
                              <Popover.Portal>
                                <Popover.Content sideOffset={5} className="bg-[#1F2226] text-white p-4 font-sans text-sm w-64 rounded-xl border border-slate-800 z-50 shadow-xl flex flex-col gap-2">
                                  <div className="font-bold text-base mb-1 border-b border-slate-700 pb-1 flex justify-between items-center">
                                    <span>{token.surface}</span>
                                    <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded font-mono font-medium">{token.pos}</span>
                                  </div>
                                  <div className="text-slate-400 mb-1 text-xs font-semibold">
                                    {dictAccent || token.reading_accent || token.reading} {token.base_form !== token.surface ? '(' + token.base_form + ')' : ''}
                                  </div>
                                  <div className="text-xs rounded border border-slate-700/60 bg-slate-800/80 p-2.5 flex flex-col gap-1">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">네이버 사전 뜻</span>
                                    {dictLoading ? (
                                      <span className="text-[10px] text-slate-500 animate-pulse">사전 로딩 중...</span>
                                    ) : (
                                      <span className="text-slate-200 font-medium leading-relaxed">{dictMeaning || '뜻을 찾을 수 없습니다.'}</span>
                                    )}
                                  </div>
                                  <button onClick={() => saveToWordbook(token, dictMeaning)} className="flex items-center justify-center gap-1.5 bg-[#3A4E68] hover:bg-[#2C3B4F] rounded-lg py-2 transition-colors text-xs font-bold text-white shadow mt-1">
                                    <BookmarkPlus className="w-3.5 h-3.5"/> 단어장에 추가
                                  </button>
                                </Popover.Content>
                              </Popover.Portal>
                            </Popover.Root>
                          );
                        } else {
                          return <React.Fragment key={tIdx}>{innerSpan}</React.Fragment>;
                        }
                      })}
                    </React.Fragment>
                  ))}
                </div>
              ) : (
                /* 번역이 켜져 있을 때: 문장별로 줄바꿈하여 아래에 직역 문장 노출 (여백 최소화) */
                <div className="space-y-4">
                  {processedData.map((sentence, sIdx) => {
                    const { contentTokens, trailingTokens } = splitTrailingTokens(sentence.tokens);
                    return (
                      <div key={sIdx} className="mb-2">
                        <div className={cn("text-[#1F2226] text-justify leading-relaxed whitespace-pre-wrap break-all", textSizeClass)}>
                          {contentTokens.map((token, tIdx) => {
                            const clickable = isClickableToken(token);

                            const innerSpan = (
                              <span className={cn(
                                "inline relative select-none",
                                clickable ? "cursor-pointer hover:bg-[#E5DFD5]/70 hover:underline decoration-[#3A4E68] rounded px-0.5 transition-all" : "cursor-default"
                              )}>
                                <FuriganaText surface={token.surface} reading={token.reading} showFurigana={localShowFurigana} />
                              </span>
                            );

                            if (clickable) {
                              return (
                                <Popover.Root key={tIdx} onOpenChange={(open) => { if (open) handleLookupDict(token.base_form || token.surface); }}>
                                  <Popover.Trigger asChild>
                                    {innerSpan}
                                  </Popover.Trigger>
                                  <Popover.Portal>
                                    <Popover.Content sideOffset={5} className="bg-[#1F2226] text-white p-4 font-sans text-sm w-64 rounded-xl border border-slate-800 z-50 shadow-xl flex flex-col gap-2">
                                      <div className="font-bold text-base mb-1 border-b border-slate-700 pb-1 flex justify-between items-center">
                                        <span>{token.surface}</span>
                                        <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded font-mono font-medium">{token.pos}</span>
                                      </div>
                                      <div className="text-slate-400 mb-1 text-xs font-semibold">
                                        {dictAccent || token.reading_accent || token.reading} {token.base_form !== token.surface ? '(' + token.base_form + ')' : ''}
                                      </div>
                                      <div className="text-xs rounded border border-slate-700/60 bg-slate-800/80 p-2.5 flex flex-col gap-1">
                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">네이버 사전 뜻</span>
                                        {dictLoading ? (
                                          <span className="text-[10px] text-slate-500 animate-pulse">사전 로딩 중...</span>
                                        ) : (
                                          <span className="text-slate-200 font-medium leading-relaxed">{dictMeaning || '뜻을 찾을 수 없습니다.'}</span>
                                        )}
                                      </div>
                                      <button onClick={() => saveToWordbook(token, dictMeaning)} className="flex items-center justify-center gap-1.5 bg-[#3A4E68] hover:bg-[#2C3B4F] rounded-lg py-2 transition-colors text-xs font-bold text-white shadow mt-1">
                                        <BookmarkPlus className="w-3.5 h-3.5"/> 단어장에 추가
                                      </button>
                                    </Popover.Content>
                                  </Popover.Portal>
                                </Popover.Root>
                              );
                            } else {
                              return <React.Fragment key={tIdx}>{innerSpan}</React.Fragment>;
                            }
                          })}
                        </div>
                        {sentence.original.trim() && (
                          <div className="mt-1 text-xs text-slate-600 pl-3 border-l-2 border-[#3A4E68] bg-[#E5DFD5]/10 py-1 rounded-r font-sans leading-normal">
                            {sentence.translation}
                          </div>
                        )}
                        {trailingTokens.length > 0 && (
                          <div className="whitespace-pre-wrap select-none leading-none">
                            {trailingTokens.map((t, idx) => (
                              <span key={idx}>{t.surface}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </article>
      )}

      {/* 2단계 (번역 모드) */}
      {mode === 'learning' && (
        <div className="space-y-6">
          {processedData.map((sentence, sIdx) => {
            const hasSubmitted = submissions[sIdx] && submissions[sIdx].isCorrect !== undefined;
            const isActive = currentSentenceIdx === sIdx;
            
            return (
              <div 
                key={sIdx} 
                className={cn(
                  "p-6 rounded-2xl border transition-all duration-300 cursor-pointer",
                  isActive 
                    ? "bg-[#FAF6F0] border-[#3A4E68] ring-2 ring-[#3A4E68]/10" 
                    : "bg-[#FAF6F0]/60 border-[#E5DFD5] hover:border-[#3A4E68]/60",
                )}
                onClick={() => setCurrentSentenceIdx(sIdx)}
              >
                <div className="text-[#1F2226] mb-4 leading-relaxed whitespace-normal break-all">
                  {sentence.tokens.map((token, tIdx) => {
                    const hasFurigana = localShowFurigana && token.reading && token.reading !== token.surface;
                    const clickable = isClickableToken(token);

                    const innerSpan = (
                      <span className={cn(
                        "inline relative select-none",
                        clickable ? "cursor-pointer hover:bg-[#E5DFD5]/70 hover:underline decoration-[#3A4E68] rounded px-0.5 transition-all" : "cursor-default"
                      )}>
                        <FuriganaText surface={token.surface} reading={token.reading} showFurigana={localShowFurigana} />
                      </span>
                    );

                    if (clickable) {
                      return (
                        <Popover.Root key={tIdx} onOpenChange={(open) => { if (open) handleLookupDict(token.base_form || token.surface); }}>
                          <Popover.Trigger asChild>
                            {innerSpan}
                          </Popover.Trigger>
                          <Popover.Portal>
                            <Popover.Content sideOffset={5} className="bg-[#1F2226] text-white p-4 font-sans text-sm w-64 rounded-xl border border-slate-800 z-50 shadow-xl flex flex-col gap-2">
                              <div className="font-bold text-base mb-1 border-b border-slate-700 pb-1 flex justify-between items-center">
                                <span>{token.surface}</span>
                                <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded font-mono">{token.pos}</span>
                              </div>
                              <div className="text-slate-400 mb-1 text-xs font-semibold">
                                {dictAccent || token.reading_accent || token.reading} {token.base_form !== token.surface ? '(' + token.base_form + ')' : ''}
                              </div>
                              <div className="text-xs rounded border border-slate-700/60 bg-slate-800/80 p-2.5 flex flex-col gap-1">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">네이버 사전 뜻</span>
                                {dictLoading ? (
                                  <span className="text-[10px] text-slate-500 animate-pulse">사전 로딩 중...</span>
                                ) : (
                                  <span className="text-slate-200 font-medium leading-relaxed">{dictMeaning || '뜻을 찾을 수 없습니다.'}</span>
                                )}
                              </div>
                              <button onClick={() => saveToWordbook(token, dictMeaning)} className="flex items-center justify-center gap-1.5 bg-[#3A4E68] hover:bg-[#2C3B4F] rounded-lg py-2 transition-colors text-xs font-bold text-white shadow mt-1">
                                <BookmarkPlus className="w-3.5 h-3.5"/> 단어장에 추가
                              </button>
                            </Popover.Content>
                          </Popover.Portal>
                        </Popover.Root>
                      );
                    } else {
                      return <React.Fragment key={tIdx}>{innerSpan}</React.Fragment>;
                    }
                  })}
                </div>

                <form onSubmit={(e) => handleTranslationSubmit(e, sIdx)} className="mt-4 font-sans" onClick={(e) => e.stopPropagation()}>
                  {!hasSubmitted ? (
                    <div className="flex flex-col gap-3">
                      <textarea
                        placeholder="이 문장의 한국어 번역을 적어보세요..."
                        className="w-full border border-[#E5DFD5] rounded-xl bg-white/70 p-4 outline-none focus:ring-2 focus:ring-[#3A4E68]/15 focus:bg-white resize-none transition-all text-slate-800 text-sm"
                        rows={2}
                        value={submissions[sIdx]?.userTranslation || ''}
                        onChange={(e) => handleUserTranslationChange(sIdx, e.target.value)}
                      />
                      {isActive && (
                        <div className="flex justify-end">
                          <button 
                            type="submit"
                            disabled={!submissions[sIdx]?.userTranslation || isGrading[sIdx]}
                            className="bg-[#3A4E68] text-white px-5 py-2.5 rounded-xl text-xs font-bold hover:bg-[#2C3B4F] disabled:opacity-50 transition-colors border border-slate-900/10 flex items-center gap-1.5 shadow-sm"
                          >
                            {isGrading[sIdx] ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> : null}
                            AI 채점 요청
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="bg-[#FAF6F0] rounded-xl p-4 md:p-5 space-y-4 border border-[#E5DFD5] text-sm">
                      <div className="flex items-start gap-4">
                        <div className={cn("mt-0.5 px-2.5 py-1 text-[10px] font-bold rounded-lg uppercase tracking-wider", submissions[sIdx].isCorrect ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-orange-50 text-orange-700 border border-orange-200")}>
                          {submissions[sIdx].isCorrect ? "정답" : "오답"}
                        </div>
                        <div className="flex-1">
                          <p className="font-bold text-slate-400 mb-0.5 text-[10px] uppercase tracking-wider">나의 번역</p>
                          <p className="text-slate-800 font-medium">{submissions[sIdx].userTranslation}</p>
                        </div>
                      </div>

                      {/* AI Translation display (per user feedback requirement) */}
                      <div className="pt-3 border-t border-[#E5DFD5]">
                        <p className="font-bold text-slate-400 mb-0.5 text-[10px] uppercase tracking-wider">AI 모범 번역</p>
                        <p className="text-[#3A4E68] font-semibold">{submissions[sIdx].properTranslation}</p>
                      </div>

                      {/* Explanation of why they were wrong or feedback */}
                      <div className="pt-3 border-t border-[#E5DFD5]">
                        <p className="font-bold text-slate-400 mb-1 text-[10px] uppercase tracking-wider flex items-center gap-1">
                          <BrainCircuit className="w-3.5 h-3.5 text-[#3A4E68]"/> AI 오답 분석 & 피드백
                        </p>
                        <p className="text-slate-600 leading-relaxed font-sans font-medium text-xs bg-white/40 p-2.5 rounded border border-[#E5DFD5]/40">{submissions[sIdx].feedback}</p>
                      </div>
                    </div>
                  )}
                </form>
              </div>
            );
          })}
        </div>
      )}

      {/* 스마트 단어 추출 섹션 */}
      {post && (
        <section className="mt-12 border-t border-[#E5DFD5] pt-8 font-sans">
          <div className="newspaper-paper p-6 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h4 className="font-bold text-base text-slate-800 mb-1 flex items-center gap-1.5"><BrainCircuit className="w-4 h-4 text-[#3A4E68]"/> 스마트 단어장 자동 추출</h4>
              <p className="text-xs text-slate-500 font-medium">Gemini AI가 이 원문에서 지정한 등급 이상의 어려운 단어들을 추출하여 단어장에 자동으로 추가합니다.</p>
            </div>
            
            <div className="flex items-center gap-2">
              <select 
                value={extractLevel}
                onChange={(e) => setExtractLevel(e.target.value as any)}
                className="px-3 py-2 border border-[#E5DFD5] rounded-xl bg-white text-xs font-bold text-[#3A4E68] outline-none"
              >
                <option value="N4">JLPT N4 이상</option>
                <option value="N3">JLPT N3 이상</option>
                <option value="N2">JLPT N2 이상</option>
                <option value="N1">JLPT N1 이상</option>
              </select>
              
              <button
                onClick={handleExtractWords}
                disabled={isExtracting}
                className="bg-[#3A4E68] text-white px-5 py-2.5 rounded-xl text-xs font-bold hover:bg-[#2C3B4F] disabled:opacity-50 transition-colors border border-slate-900/10 flex items-center gap-1.5 shadow-sm"
              >
                {isExtracting ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> : null}
                단어 추출
              </button>
            </div>
          </div>
        </section>
      )}

      {isEditModalOpen && post && (
        <PostFormModal
          postToEdit={post}
          isPersonal={isPersonal}
          onClose={() => setIsEditModalOpen(false)}
          onSaved={() => {
            fetchPost();
            setIsEditModalOpen(false);
          }}
        />
      )}

      {isYomiganaModalOpen && post && (
        <YomiganaEditModal
          post={post}
          processedData={processedData}
          isPersonal={isPersonal}
          onClose={() => setIsYomiganaModalOpen(false)}
          onSaved={() => {
            fetchPost();
            setIsYomiganaModalOpen(false);
          }}
        />
      )}
    </div>
  );
}
