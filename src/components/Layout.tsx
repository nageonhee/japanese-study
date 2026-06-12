import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, ListTree, BookOpenText, User } from 'lucide-react';
import { cn } from '../lib/utils';
import { useStore } from '../store';

export function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();

  const navItems = [
    { path: '/', label: '홈 피드', icon: Home, en: 'Home' },
    { path: '/categories', label: '분류 탐색', icon: ListTree, en: 'Category' },
    { path: '/wordbook', label: '단어장', icon: BookOpenText, en: 'Wordbook' },
    { path: '/mypage', label: '마이페이지', icon: User, en: 'My Page' },
  ];

  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)] flex flex-col font-sans pb-16 md:pb-0 md:pt-20">
      {/* Desktop Header */}
      <header className="hidden md:flex fixed inset-x-0 top-0 h-16 border-b border-slate-200 bg-white/80 backdrop-blur-md z-50 items-center justify-between px-8">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight text-indigo-900 font-sans">Shinbun Learn</h1>
          <div className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-600 text-[10px] font-bold tracking-wider uppercase">日本語</div>
        </div>
        
        <nav className="flex items-center space-x-1 text-sm font-medium">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-xl transition-all duration-200",
                location.pathname === item.path 
                  ? "bg-indigo-50/80 text-indigo-600 font-semibold" 
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
              )}
            >
              <item.icon className="w-4 h-4" />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-5xl mx-auto flex flex-col relative px-4 py-8 md:px-8">
        {children}
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 border-t border-slate-200 bg-white/95 backdrop-blur-md flex z-50 h-16 safe-area-bottom px-2">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "flex-1 flex flex-col justify-center items-center py-2 transition-colors",
                isActive ? "text-indigo-600 font-medium" : "text-slate-400 hover:text-slate-600"
              )}
            >
              <item.icon className={cn("w-5 h-5 mb-1 transition-transform", isActive ? "scale-115" : "")} />
              <span className="text-[10px] tracking-tight">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
