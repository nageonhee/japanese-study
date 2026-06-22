import React, { useState } from 'react';
import { useStore } from '../store';
import { User, Lock, LogIn, UserPlus, AlertCircle, BookOpenText } from 'lucide-react';
import { cn } from '../lib/utils';

export function LoginSignup() {
  const setUser = useStore((state) => state.setUser);
  const [isLogin, setIsLogin] = useState(true);
  
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!username.trim() || !password.trim()) {
      setError('사용자명과 비밀번호를 입력해주세요.');
      return;
    }

    if (username.length < 2) {
      setError('사용자명은 최소 2글자 이상이어야 합니다.');
      return;
    }

    if (password.length < 4) {
      setError('비밀번호는 최소 4글자 이상이어야 합니다.');
      return;
    }

    if (!isLogin && password !== confirmPassword) {
      setError('비밀번호가 일치하지 않습니다.');
      return;
    }

    setLoading(true);
    try {
      const endpoint = isLogin ? '/api/auth/login' : '/api/auth/signup';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });
      
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || '처리 중 오류가 발생했습니다.');
      }
      
      setUser(data);
    } catch (err: any) {
      setError(err.message || '인증에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FAF6F0] px-4 py-12 font-sans">
      <div className="w-full max-w-md space-y-8 animate-[fadeIn_0.5s_ease-out]">
        {/* Brand / Logo */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#3A4E68] text-[#FAF6F0] shadow-lg mb-2">
            <BookOpenText className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-extrabold tracking-tight text-[#3A4E68] font-serif">
            일본어 원문 독해 & 공부
          </h2>
          <p className="text-[10px] text-slate-500 font-serif tracking-widest uppercase">
            기사 분석 및 맞춤형 어휘 학습
          </p>
        </div>

        {/* Auth Card */}
        <div className="newspaper-paper bg-[#FAF6F0] border border-[#E5DFD5] rounded-3xl shadow-xl overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-[#E5DFD5]">
            <button
              type="button"
              onClick={() => {
                setIsLogin(true);
                setError('');
              }}
              className={cn(
                "flex-1 py-4 text-sm font-bold transition-all duration-200 font-serif border-b-2 flex items-center justify-center gap-2 cursor-pointer",
                isLogin
                  ? "border-[#3A4E68] text-[#3A4E68] bg-[#E5DFD5]/20 font-bold"
                  : "border-transparent text-slate-400 hover:text-slate-600 bg-transparent"
              )}
            >
              <LogIn className="w-4 h-4" />
              로그인
            </button>
            <button
              type="button"
              onClick={() => {
                setIsLogin(false);
                setError('');
              }}
              className={cn(
                "flex-1 py-4 text-sm font-bold transition-all duration-200 font-serif border-b-2 flex items-center justify-center gap-2 cursor-pointer",
                !isLogin
                  ? "border-[#3A4E68] text-[#3A4E68] bg-[#E5DFD5]/20 font-bold"
                  : "border-transparent text-slate-400 hover:text-slate-600 bg-transparent"
              )}
            >
              <UserPlus className="w-4 h-4" />
              회원가입
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 md:p-8 space-y-6">
            {/* Error Message */}
            {error && (
              <div className="flex items-start gap-2.5 p-3.5 rounded-xl border border-red-200 bg-red-50 text-red-700 text-xs font-semibold">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {/* Inputs */}
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-600 font-serif uppercase tracking-wider">
                  사용자명
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <User className="w-4 h-4" />
                  </span>
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="사용하실 이름을 입력하세요"
                    className="block w-full pl-10 pr-4 py-2.5 bg-[#E5DFD5]/10 border border-[#E5DFD5] rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#3A4E68]/20 focus:border-[#3A4E68] transition-all text-sm"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-600 font-serif uppercase tracking-wider">
                  비밀번호
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Lock className="w-4 h-4" />
                  </span>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="비밀번호를 입력하세요"
                    className="block w-full pl-10 pr-4 py-2.5 bg-[#E5DFD5]/10 border border-[#E5DFD5] rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#3A4E68]/20 focus:border-[#3A4E68] transition-all text-sm"
                  />
                </div>
              </div>

              {!isLogin && (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600 font-serif uppercase tracking-wider">
                    비밀번호 확인
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                      <Lock className="w-4 h-4" />
                    </span>
                    <input
                      type="password"
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="비밀번호를 다시 한번 입력하세요"
                      className="block w-full pl-10 pr-4 py-2.5 bg-[#E5DFD5]/10 border border-[#E5DFD5] rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#3A4E68]/20 focus:border-[#3A4E68] transition-all text-sm"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className={cn(
                "w-full py-3 px-4 rounded-xl text-sm font-bold text-white shadow-md transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer",
                loading
                  ? "bg-[#3A4E68]/70 cursor-not-allowed"
                  : "bg-[#3A4E68] hover:bg-[#2C3B4F] active:scale-[0.98] hover:shadow-lg"
              )}
            >
              {loading ? (
                <span className="inline-block border-2 border-t-transparent border-white rounded-full w-4 h-4 animate-spin"></span>
              ) : isLogin ? (
                <>
                  <LogIn className="w-4 h-4" />
                  로그인하기
                </>
              ) : (
                <>
                  <UserPlus className="w-4 h-4" />
                  회원가입 완료
                </>
              )}
            </button>
          </form>
        </div>

        {/* Footer info */}
        <p className="text-center text-[10px] text-slate-400 font-serif leading-relaxed">
          독해 학습의 첫걸음, 일본어 원문 독해 & 공부와 함께 하세요.<br />
          기본 관리자 계정은 <span className="font-semibold text-slate-500">admin / admin123</span> 입니다.
        </p>
      </div>
    </div>
  );
}
