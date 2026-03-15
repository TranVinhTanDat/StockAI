'use client'

import { useState, useEffect, useCallback } from 'react'
import { Users, Shield, User, RefreshCw, AlertCircle } from 'lucide-react'
import { useAuthContext } from '@/components/auth/AuthContext'

interface UserRow {
  id: string
  username: string
  role: 'admin' | 'user'
  created_at: string
}

export default function UserManagement() {
  const { user, token } = useAuthContext()
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [updating, setUpdating] = useState<string | null>(null)

  const fetchUsers = useCallback(async () => {
    if (!token) return
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/admin/users', {
        headers: { 'Authorization': `Bearer ${token}` },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Không tải được danh sách')
      setUsers(data.users)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lỗi không xác định')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  const toggleRole = async (userId: string, current: string) => {
    if (!token) return
    const newRole = current === 'admin' ? 'user' : 'admin'
    if (!confirm(`Đổi role thành "${newRole}"?`)) return
    setUpdating(userId)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ userId, role: newRole }),
      })
      if (!res.ok) throw new Error('Cập nhật thất bại')
      await fetchUsers()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Lỗi')
    } finally {
      setUpdating(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-100 flex items-center gap-2">
          <Users className="w-4 h-4 text-accent" />
          Quản lý người dùng
          <span className="text-xs text-muted font-normal">({users.length} tài khoản)</span>
        </h3>
        <button
          onClick={fetchUsers}
          className="p-1.5 rounded-lg text-muted hover:text-accent transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-400 text-xs bg-red-400/10 rounded-lg px-3 py-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {!loading && !error && users.length === 0 && (
        <p className="text-center text-muted text-sm py-8">Chưa có người dùng nào</p>
      )}

      {users.length > 0 && (
        <div className="rounded-xl border border-border/40 overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-surface2">
              <tr>
                <th className="px-4 py-2.5 text-left text-muted font-semibold">Tên đăng nhập</th>
                <th className="px-4 py-2.5 text-center text-muted font-semibold">Role</th>
                <th className="px-4 py-2.5 text-center text-muted font-semibold">Ngày tạo</th>
                <th className="px-4 py-2.5 text-center text-muted font-semibold">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20">
              {users.map(u => (
                <tr key={u.id} className="hover:bg-surface2/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-accent/15 flex items-center justify-center flex-shrink-0">
                        <span className="text-accent text-[10px] font-bold">
                          {u.username.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <p className="text-gray-200 font-medium">{u.username}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {u.role === 'admin' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent/15 text-accent text-[10px] font-semibold border border-accent/30">
                        <Shield className="w-2.5 h-2.5" /> ADMIN
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface2 text-muted text-[10px] border border-border/30">
                        <User className="w-2.5 h-2.5" /> USER
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center text-muted">
                    {new Date(u.created_at).toLocaleDateString('vi-VN')}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {u.id !== user?.id ? (
                      <button
                        onClick={() => toggleRole(u.id, u.role)}
                        disabled={updating === u.id}
                        className="px-2.5 py-1 rounded-lg bg-surface2 hover:bg-border text-muted hover:text-gray-200 text-[10px] transition-colors disabled:opacity-50"
                      >
                        {updating === u.id ? '...' : u.role === 'admin' ? 'Hạ xuống User' : 'Nâng lên Admin'}
                      </button>
                    ) : (
                      <span className="text-[10px] text-muted/50">Bạn</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
