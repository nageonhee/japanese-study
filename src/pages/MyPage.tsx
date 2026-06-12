import { useStore } from '../store';

export function MyPage() {
  const { textSizeLevel, setTextSizeLevel } = useStore();

  return (
    <div className="flex-1 pb-24 mx-auto w-full">
      <header className="pb-8 mb-6">
        <h2 className="text-3xl font-bold tracking-tight text-slate-900 mb-2 font-sans">설정</h2>
        <p className="text-sm font-medium text-slate-500 font-sans">앱 전반의 일본어 기사 읽기 훈련 환경을 설정하세요.</p>
      </header>

      <div className="flex flex-col gap-6 font-sans">
        <section className="bg-white rounded-2xl border border-slate-100 p-6 md:p-8">
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider border-b border-slate-100 mb-6 pb-4">화면 설정</h3>

          {/* Text Size Slider */}
          <div className="flex flex-col gap-6">
            <div className="flex justify-between items-end">
              <div className="flex flex-col">
                <span className="font-bold text-lg text-slate-800 mb-1">본문 텍스트 크기</span>
                <span className="text-sm text-slate-500">일본어 기사 본문의 글자 크기를 조절합니다.</span>
              </div>
              <div className="flex gap-4 text-sm font-bold text-slate-400">
                <span className={textSizeLevel === 1 ? "text-slate-800" : ""}>작게</span>
                <span className={textSizeLevel === 3 ? "text-slate-800" : ""}>기본</span>
                <span className={textSizeLevel === 5 ? "text-slate-800" : ""}>크게</span>
              </div>
            </div>
            
            <div className="flex items-center gap-4 px-2">
              <input 
                type="range" 
                min="1" 
                max="5" 
                step="1" 
                value={textSizeLevel}
                onChange={(e) => setTextSizeLevel(parseInt(e.target.value, 10))}
                className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-indigo-600"
              />
            </div>
          </div>
          
          {/* Preview */}
          <div className="mt-10 p-6 rounded-2xl border border-slate-100 bg-slate-50/50">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">본문 적용 미리보기</p>
            <div className="text-slate-800 font-serif">
               <span className={
                 (textSizeLevel === 1 ? 'text-sm leading-relaxed ' : '') +
                 (textSizeLevel === 2 ? 'text-base leading-relaxed ' : '') +
                 (textSizeLevel === 3 ? 'text-xl leading-loose ' : '') +
                 (textSizeLevel === 4 ? 'text-3xl leading-[2.5] ' : '') +
                 (textSizeLevel === 5 ? 'text-4xl leading-[3] ' : '')
               }>
                 吾輩は猫である。名前はまだ無い。どこで生れたかとんと見当がつかぬ。
               </span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
