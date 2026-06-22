import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { User } from '../types';
import { useStore } from '../store';
import { Loader2, Trash2, Shield, UserCheck, Users, ArrowLeft } from 'lucide-react';
import { cn } from '../lib/utils';
import { APP_MODE } from '../lib/storage';

export function AdminUsers() {
  const navigate = useNavigate();
  const { user: currentUser } = useStore();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/admin/users');
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
      } else {
        console.error("Failed to load users");
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (APP_MODE === 'LOCAL') {
      setLoading(false);
      return;
    }
    fetchUsers();
  }, []);

  const handleRoleChange = async (targetId: number, newRole: string) => {
    setActionLoading(targetId);
    try {
      const res = await fetch(`/api/admin/users/${targetId}/role`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole })
      });
      if (res.ok) {
        alert("회원 권한이 성공적으로 수정되었습니다.");
        fetchUsers();
      } else {
        const err = await res.json();
        alert(err.error || "권한 수정에 실패했습니다.");
      }
    } catch (e) {
      console.error(e);
      alert("네트워크 오류가 발생했습니다.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteUser = async (targetId: number, targetUsername: string) => {
    if (!confirm(`정말로 회원 '${targetUsername}'을(를) 영구 삭제하시겠습니까?\n해당 회원의 모든 학습 데이터와 단어장 정보가 삭제됩니다.`)) return;

    setActionLoading(targetId);
    try {
      const res = await fetch(`/api/admin/users/${targetId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        alert("회원이 성공적으로 삭제되었습니다.");
        fetchUsers();
      } else {
        const err = await res.json();
        alert(err.error || "회원 삭제에 실패했습니다.");
      }
    } catch (e) {
      console.error(e);
      alert("네트워크 오류가 발생했습니다.");
    } finally {
      setActionLoading(null);
    }
  };

  if (APP_MODE === 'LOCAL') {
    return (
      <div className="flex-1 pb-24 mx-auto w-full max-w-xl font-sans text-center py-20">
        <header className="mb-6">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 mb-2 font-serif">회원 관리</h2>
        </header>
        <div className="bg-white/40 p-8 rounded-2xl border border-[#E5DFD5]">
          <p className="font-semibold text-slate-700 mb-1 font-serif">로컬 독립 실행 모드</p>
          <p className="text-sm text-slate-500 font-serif">로컬 오프라인 쉘에서는 개별 회원 관리 기능을 지원하지 않습니다.</p>
          <button onClick={() => navigate('/')} className="mt-6 bg-[#3A4E68] text-white px-5 py-2.5 rounded-xl text-xs font-bold hover:bg-[#2C3B4F] transition-colors">
            홈으로 이동
          </button>
        </div>
      </div>
    );
  }

  // Permission checks helper functions
  const canModifyRole = (target: User) => {
    if (!currentUser) return false;
    if (target.username === 'chris77467' || target.role === 'master') return false; // Master is locked
    if (target.id === currentUser.id) return false; // Self role modification locked

    if (currentUser.role === 'master') return true;
    if (currentUser.role === 'host') {
      // Host can modify target only if target's role is admin or user, and host can only set user -> admin or admin -> user
      return ['admin', 'user'].includes(target.role);
    }
    return false; // admin and user cannot modify anyone's role
  };

  const getAvailableRoles = (target: User) => {
    if (!currentUser) return [];
    if (currentUser.role === 'master') {
      return ['user', 'admin', 'host'];
    }
    if (currentUser.role === 'host') {
      return ['user', 'admin'];
    }
    return [];
  };

  const canDelete = (target: User) => {
    if (!currentUser) return false;
    if (target.username === 'chris77467' || target.role === 'master') return false; // Master cannot be deleted
    if (target.id === currentUser.id) return false; // Cannot delete self

    if (currentUser.role === 'master') return true; // Master can delete hosts, admins, users
    if (currentUser.role === 'host') {
      // Host can delete admins and users
      return ['admin', 'user'].includes(target.role);
    }
    if (currentUser.role === 'admin') {
      // Admin can delete users only
      return target.role === 'user';
    }
    return false;
  };

  return (
    <div className="flex-1 pb-24 w-full font-sans">
      <header className="pb-8 mb-6 border-b border-[#E5DFD5] flex justify-between items-end">
        <div>
          <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-[#3A4E68] hover:underline transition-colors text-xs font-bold mb-3">
            <ArrowLeft className="w-4 h-4" /> 이전으로 돌아가기
          </button>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 mb-2 font-serif flex items-center gap-2">
            <Users className="w-8 h-8 text-[#3A4E68]" /> 회원 관리
          </h2>
          <p className="text-sm font-medium text-slate-500 font-serif">스터디 플랫폼에 등록된 회원들의 권한 등급을 제어하고 계정을 관리합니다.</p>
        </div>
      </header>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="animate-spin text-[#3A4E68]" /></div>
      ) : users.length === 0 ? (
        <div className="text-center py-20 text-slate-400 bg-white/40 rounded-2xl border border-[#E5DFD5]">
          <p className="font-semibold text-slate-600 mb-1 font-serif">등록된 회원이 없습니다.</p>
        </div>
      ) : (
        <div className="bg-[#FAF6F0] rounded-2xl border border-[#E5DFD5] overflow-hidden shadow-sm p-6">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="text-xs font-bold text-slate-400 border-b border-[#E5DFD5] uppercase tracking-wider font-serif pb-3">
                  <th className="pb-3 pr-6 font-medium">사용자명</th>
                  <th className="pb-3 px-6 font-medium">현재 등급</th>
                  <th className="pb-3 px-6 font-medium">등급 변경</th>
                  <th className="pb-3 pl-6 font-medium w-24 text-right">계정 삭제</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5DFD5]/40 font-sans">
                {users.map((item) => {
                  const mRole = canModifyRole(item);
                  const mDel = canDelete(item);
                  const rolesList = getAvailableRoles(item);
                  const isSelf = item.id === currentUser?.id;
                  const isLocked = item.username === 'chris77467' || item.role === 'master';

                  return (
                    <tr key={item.id} className={cn("hover:bg-[#E5DFD5]/10 transition-colors", isSelf && "bg-[#3A4E68]/5")}>
                      <td className="py-4 pr-6 flex items-center gap-2">
                        <span className="font-bold text-base text-[#1F2226]">{item.username}</span>
                        {isSelf && (
                          <span className="bg-[#3A4E68] text-white text-[9px] font-bold px-1.5 py-0.5 rounded font-sans shrink-0">
                            나
                          </span>
                        )}
                        {isLocked && (
                          <span className="bg-amber-100 text-amber-800 border border-amber-200 text-[9px] font-bold px-1.5 py-0.5 rounded font-sans shrink-0">
                            Master
                          </span>
                        )}
                      </td>
                      <td className="py-4 px-6">
                        <span className={cn(
                          "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border",
                          item.role === 'master' && "bg-amber-50 border-amber-200 text-amber-700",
                          item.role === 'host' && "bg-blue-50 border-blue-200 text-blue-700",
                          item.role === 'admin' && "bg-emerald-50 border-emerald-200 text-emerald-700",
                          item.role === 'user' && "bg-slate-50 border-slate-200 text-slate-600"
                        )}>
                          {item.role === 'master' && <Shield className="w-3 h-3" />}
                          {item.role === 'host' && <UserCheck className="w-3 h-3" />}
                          {item.role === 'admin' && <Shield className="w-3 h-3" />}
                          {item.role === 'master' && '생성자'}
                          {item.role === 'host' && '방장'}
                          {item.role === 'admin' && '관리자'}
                          {item.role === 'user' && '일반 맴버'}
                        </span>
                      </td>
                      <td className="py-4 px-6">
                        {mRole ? (
                          <select
                            disabled={actionLoading === item.id}
                            value={item.role}
                            onChange={(e) => handleRoleChange(item.id, e.target.value)}
                            className="px-2 py-1.5 border border-[#E5DFD5] rounded-xl bg-white text-xs font-bold text-[#3A4E68] outline-none"
                          >
                            <option value={item.role} disabled>-- 권한 선택 --</option>
                            {rolesList.map(r => (
                              <option key={r} value={r}>
                                {r === 'host' && '방장'}
                                {r === 'admin' && '관리자'}
                                {r === 'user' && '일반 맴버'}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-xs text-slate-400 font-medium select-none">수정 불가</span>
                        )}
                      </td>
                      <td className="py-4 pl-6 text-right">
                        {mDel ? (
                          <button
                            disabled={actionLoading === item.id}
                            onClick={() => handleDeleteUser(item.id, item.username)}
                            className="text-red-500 hover:text-red-700 transition-colors p-2 rounded-lg hover:bg-red-50/50 flex items-center justify-center ml-auto"
                            title="회원 삭제"
                          >
                            {actionLoading === item.id ? (
                              <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                            ) : (
                              <Trash2 className="w-4 h-4" />
                            )}
                          </button>
                        ) : (
                          <span className="text-xs text-slate-300 font-medium select-none pr-2">삭제 제한</span>
                        )}
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
}
