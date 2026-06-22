import { useStore } from '../store';
import { BookOpen, HelpCircle, LogOut } from 'lucide-react';
import { cn } from '../lib/utils';

export function MyPage() {
  const { textSizeLevel, setTextSizeLevel, isFuriganaEnabled, toggleFurigana, user, logout, geminiApiKey, setGeminiApiKey } = useStore();
  const isLocalMode = import.meta.env.VITE_APP_MODE === 'LOCAL';

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (e) {
      // ignore
    }
    logout();
  };

  const sizeLabels = ['매우 작게', '작게', '보통', '크게', '매우 크게'];

  return (
    <div className="flex-1 pb-24 mx-auto w-full font-sans">
      <header className="pb-8 mb-6 border-b border-[#E5DFD5]">
        <h2 className="text-3xl font-bold tracking-tight text-slate-900 mb-2 font-serif">설정</h2>
        <p className="text-sm font-medium text-slate-500 font-serif">앱 전반의 일본어 기사 독해 및 학습 환경을 개인 맞춤형으로 설정합니다.</p>
      </header>

      <div className="flex flex-col gap-6 max-w-2xl mx-auto">
        <section className="newspaper-paper rounded-2xl p-6 md:p-8 space-y-8">
          <h3 className="text-sm font-bold text-[#3A4E68] border-b border-[#E5DFD5] mb-6 pb-4 uppercase tracking-wider font-serif">학습 환경 설정</h3>

          {/* 1. Furigana Global Switch */}
          <div className="flex justify-between items-center pb-6 border-b border-[#E5DFD5]/40">
            <div className="flex flex-col pr-4">
              <span className="font-bold text-base text-slate-800 mb-1 font-serif">요미가나(후리가나) 기본 표시</span>
              <span className="text-xs text-slate-500 font-serif">기사 상세 페이지 진입 시 한자 위의 발음(요미가나)을 기본으로 노출할지 결정합니다.</span>
            </div>
            <button
              onClick={toggleFurigana}
              className={cn(
                "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out outline-none",
                isFuriganaEnabled ? "bg-[#3A4E68]" : "bg-slate-200"
              )}
            >
              <span
                className={cn(
                  "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                  isFuriganaEnabled ? "translate-x-5" : "translate-x-0"
                )}
              />
            </button>
          </div>

          {/* 2. Text Size Slider */}
          <div className="flex flex-col gap-6">
            <div className="flex justify-between items-end">
              <div className="flex flex-col">
                <span className="font-bold text-base text-slate-800 mb-1 font-serif">본문 텍스트 크기</span>
                <span className="text-xs text-slate-500 font-serif">일본어 기사 본문의 글자 크기와 줄 간격 비율을 조절합니다.</span>
              </div>
              <span className="text-xs font-bold text-[#3A4E68] bg-[#E5DFD5]/40 px-2.5 py-1 rounded-lg">
                {sizeLabels[textSizeLevel - 1]}
              </span>
            </div>
            
            <div className="flex items-center gap-4 px-2">
              <input 
                type="range" 
                min="1" 
                max="5" 
                step="1" 
                value={textSizeLevel}
                onChange={(e) => setTextSizeLevel(parseInt(e.target.value, 10))}
                className="w-full h-1.5 bg-[#E5DFD5] rounded-lg appearance-none cursor-pointer accent-[#3A4E68]"
              />
            </div>
            
            <div className="flex justify-between text-[10px] font-bold text-slate-400 px-1 font-serif">
              <span>매우 작게</span>
              <span>작게</span>
              <span>보통</span>
              <span>크게</span>
              <span>매우 크게</span>
            </div>
          </div>
          
          {/* Preview Card */}
          <div className="mt-6 p-6 rounded-xl border border-[#E5DFD5] bg-[#E5DFD5]/10">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4 font-serif flex items-center gap-1"><BookOpen className="w-3.5 h-3.5"/> 본문 서체 미리보기</p>
            <div className="text-slate-800 font-serif border-t border-[#E5DFD5]/40 pt-4">
              <div className="flex flex-wrap gap-x-1 gap-y-2 items-end">
                {[
                  { kanji: '吾輩', read: 'わがはい' },
                  { kanji: 'は' },
                  { kanji: '猫', read: 'ねこ' },
                  { kanji: 'である。' }
                ].map((item, idx) => (
                  <span key={idx} className="relative inline-flex flex-col items-center leading-none">
                    {isFuriganaEnabled && item.read ? (
                      <span className="text-[0.55em] text-[#3A4E68] mb-1 font-sans font-semibold tracking-tight h-4 flex items-end">{item.read}</span>
                    ) : <span className="h-4"></span>}
                    <span className={cn(
                      "text-[#1F2226]",
                      textSizeLevel === 1 && 'text-sm',
                      textSizeLevel === 2 && 'text-base',
                      textSizeLevel === 3 && 'text-lg',
                      textSizeLevel === 4 && 'text-2xl',
                      textSizeLevel === 5 && 'text-3xl',
                    )}>
                      {item.kanji}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        {isLocalMode ? (
          <section className="newspaper-paper rounded-2xl p-6 md:p-8 space-y-4">
            <h3 className="text-sm font-bold text-[#3A4E68] border-b border-[#E5DFD5] mb-4 pb-4 uppercase tracking-wider font-serif flex items-center gap-2">
              Gemini API 설정 (로컬 개인 환경)
            </h3>
            <div className="flex flex-col gap-2">
              <span className="font-bold text-base text-slate-800 font-serif">Gemini API 키 입력</span>
              <span className="text-xs text-slate-500 font-serif">
                로컬 모드에서는 본문 텍스트 분석 및 단어 자동 추출이 사용자의 브라우저에서 직접 수행됩니다.
                입력하신 API 키는 서버로 전송되지 않고 안전하게 브라우저 로컬 스토리지에만 보관됩니다.
              </span>
              <input
                type="password"
                placeholder="AI 분석용 Gemini API 키를 입력하세요..."
                className="w-full mt-2 px-4 py-3 border border-[#E5DFD5] rounded-xl bg-white outline-none focus:ring-2 focus:ring-[#3A4E68]/15 text-sm font-medium text-slate-800"
                value={geminiApiKey}
                onChange={(e) => setGeminiApiKey(e.target.value)}
              />
              <p className="text-[10px] text-slate-400 font-medium leading-normal mt-1 font-serif">
                ※ API 키가 등록되지 않은 상태에서도 기본 어휘 독해 공부 기능은 작동되지만, 상세 품사 분류 및 오프라인 단어 자동 추출 기능을 이용하기 위해서는 Gemini API 키 등록이 필수적입니다.
              </p>
            </div>
          </section>
        ) : (
          <section className="newspaper-paper rounded-2xl p-6 md:p-8 space-y-4">
            <h3 className="text-sm font-bold text-[#3A4E68] border-b border-[#E5DFD5] mb-4 pb-4 uppercase tracking-wider font-serif flex items-center gap-2">
              <LogOut className="w-4 h-4"/> 사용자 계정 정보
            </h3>
            <div className="flex justify-between items-center">
              <div className="flex flex-col">
                <span className="font-bold text-base text-slate-800 font-serif">로그인 계정</span>
                <span className="text-xs text-slate-500 font-serif mt-1">현재 {user?.username || '사용자'} 님으로 로그인되어 있습니다.</span>
              </div>
              <button
                onClick={handleLogout}
                className="px-4 py-2 border border-red-200 hover:border-red-300 bg-red-50/50 hover:bg-red-50 text-red-600 rounded-xl transition-all font-bold text-xs cursor-pointer flex items-center gap-1.5 active:scale-[0.98] shadow-sm"
              >
                로그아웃
              </button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
