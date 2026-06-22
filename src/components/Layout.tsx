import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, ListTree, BookOpenText, User, Users } from 'lucide-react';
import { cn } from '../lib/utils';
import { useStore } from '../store';

export function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { user } = useStore();

  const isAdminOrAbove = user && ['admin', 'host', 'master'].includes(user.role);

  const navItems = [
    { path: '/', label: '공용 학습방', icon: Home, en: 'Public' },
    { path: '/personal', label: '개인 학습방', icon: BookOpenText, en: 'Personal' },
    { path: '/wordbook', label: '단어장', icon: ListTree, en: 'Wordbook' },
    { path: '/mypage', label: '마이페이지', icon: User, en: 'My Page' },
  ];

  if (isAdminOrAbove) {
    navItems.push({ path: '/admin/users', label: '회원 관리', icon: Users, en: 'Members' });
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)] flex flex-col font-sans pb-16 md:pb-0 md:pt-20">
      {/* Mobile Top Bar */}
      <div className="md:hidden sticky top-0 bg-[#FAF6F0]/90 backdrop-blur-md border-b border-[#E5DFD5] z-40 px-4 py-3 flex items-center justify-between">
        <h1 className="text-sm font-bold text-[#3A4E68] font-serif">일본어 학습방</h1>
        <div className="px-2 py-0.5 rounded border border-[#3A4E68] text-[#3A4E68] text-[9px] font-bold tracking-wider uppercase">日本語</div>
      </div>

      {/* Desktop Header */}
      <header className="hidden md:flex fixed inset-x-0 top-0 h-16 border-b border-[#E5DFD5] bg-[#FAF6F0]/90 backdrop-blur-md z-50 items-center justify-between px-8">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold tracking-tight text-[#3A4E68] font-serif">일본어 원문 독해 & 공부</h1>
          <div className="px-2 py-0.5 rounded border border-[#3A4E68] text-[#3A4E68] text-[9px] font-bold tracking-wider uppercase">日本語</div>
        </div>
        
        <div className="flex items-center gap-6">
          <nav className="flex items-center space-x-1 text-sm font-medium font-serif">
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-xl transition-all duration-200",
                  location.pathname === item.path 
                    ? "bg-[#3A4E68] text-[#FAF6F0] font-semibold" 
                    : "text-slate-500 hover:bg-[#E5DFD5]/40 hover:text-slate-900"
                )}
              >
                <item.icon className="w-4 h-4" />
                <span>{item.label}</span>
              </Link>
            ))}
          </nav>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-5xl mx-auto flex flex-col relative px-4 py-8 md:px-8">
        {children}
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 border-t border-[#E5DFD5] bg-[#FAF6F0]/95 backdrop-blur-md flex z-50 h-16 safe-area-bottom px-2">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "flex-1 flex flex-col justify-center items-center py-2 transition-colors",
                isActive ? "text-[#3A4E68] font-semibold" : "text-slate-400 hover:text-slate-600"
              )}
            >
              <item.icon className={cn("w-5 h-5 mb-1 transition-transform", isActive ? "scale-110" : "")} />
              <span className="text-[10px] tracking-tight font-serif">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
