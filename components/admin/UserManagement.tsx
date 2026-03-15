'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Users, Shield, User, RefreshCw, AlertCircle,
  Plus, Pencil, Trash2, Search, Download,
  Key, ToggleLeft, ToggleRight, CheckSquare, Square,
  ChevronUp, ChevronDown, X, Eye, EyeOff,
} from 'lucide-react'
import { useAuthContext } from '@/components/auth/AuthContext'

// ── Types ──────────────────────────────────────────────────────────────────────

interface UserRow {
  id: string
  username: string
  email: string
  role: 'admin' | 'user'
  is_active: boolean
  created_at: string
  analysisCount: number
}

type SortField = 'username' | 'email' | 'role' | 'created_at' | 'analysisCount'
type SortDir   = 'asc' | 'desc'

// ── Helpers ────────────────────────────────────────────────────────────────────

function generatePassword(len = 12): string {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789!@#$'
  return Array.from(crypto.getRandomValues(new Uint8Array(len)))
    .map(b => chars[b % chars.length])
    .join('')
}

function exportCSV(users: UserRow[]) {
  const header = 'ID,Username,Email,Role,Active,Created,Analyses'
  const rows   = users.map(u =>
    [u.id, u.username, u.email, u.role, u.is_active ? 'Yes' : 'No',
     new Date(u.created_at).toLocaleDateString('vi-VN'), u.analysisCount].join(',')
  )
  const blob = new Blob([header + '\n' + rows.join('\n')], { type: 'text/csv' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = `users-${Date.now()}.csv`
  a.click(); URL.revokeObjectURL(url)
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function PasswordInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder || 'Mật khẩu'}
        className="w-full bg-surface2 border border-border/60 rounded-lg px-3 py-2 text-sm pr-9 outline-none focus:border-accent/50 transition-colors placeholder:text-muted/50"
      />
      <button type="button" onClick={() => setShow(s => !s)}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-gray-300 transition-colors">
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  )
}

// ── Modal: Add / Edit user ─────────────────────────────────────────────────────

interface UserModalProps {
  mode: 'add' | 'edit'
  user?: UserRow
  token: string
  onClose: () => void
  onSuccess: () => void
}

function UserModal({ mode, user, token, onClose, onSuccess }: UserModalProps) {
  const [username,    setUsername]    = useState(user?.username || '')
  const [email,       setEmail]       = useState(user?.email || '')
  const [password,    setPassword]    = useState('')
  const [role,        setRole]        = useState<'admin' | 'user'>(user?.role || 'user')
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState('')

  const handleSubmit = async () => {
    setError('')
    if (mode === 'add' && (!username || !email || !password)) {
      return setError('Vui lòng điền đủ thông tin')
    }
    setLoading(true)
    try {
      const body: Record<string, unknown> = { username, email, role }
      if (mode === 'add') {
        body.password = password
      } else {
        body.userId = user!.id
        if (password) body.newPassword = password
      }

      const res = await fetch('/api/admin/users', {
        method: mode === 'add' ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) return setError(data.error || 'Thất bại')
      onSuccess()
      onClose()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-surface border border-border/60 rounded-2xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/40">
          <h3 className="font-semibold flex items-center gap-2 text-sm">
            <Users className="w-4 h-4 text-accent" />
            {mode === 'add' ? 'Thêm người dùng mới' : `Chỉnh sửa: ${user?.username}`}
          </h3>
          <button onClick={onClose} className="text-muted hover:text-gray-300 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <div className="p-5 space-y-3.5">
          {error && (
            <div className="flex items-center gap-2 text-red-400 text-xs bg-red-400/10 rounded-lg px-3 py-2">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />{error}
            </div>
          )}

          <div>
            <label className="block text-xs text-muted mb-1.5">Tên đăng nhập *</label>
            <input
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="username (3–20 ký tự)"
              className="w-full bg-surface2 border border-border/60 rounded-lg px-3 py-2 text-sm outline-none focus:border-accent/50 transition-colors placeholder:text-muted/50"
            />
          </div>

          <div>
            <label className="block text-xs text-muted mb-1.5">Email *</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="email@example.com"
              className="w-full bg-surface2 border border-border/60 rounded-lg px-3 py-2 text-sm outline-none focus:border-accent/50 transition-colors placeholder:text-muted/50"
            />
          </div>

          <div>
            <label className="block text-xs text-muted mb-1.5">
              {mode === 'add' ? 'Mật khẩu *' : 'Mật khẩu mới (để trống = giữ nguyên)'}
            </label>
            <div className="flex gap-2">
              <div className="flex-1">
                <PasswordInput value={password} onChange={setPassword} placeholder={mode === 'edit' ? 'Không đổi' : 'Mật khẩu tối thiểu 6 ký tự'} />
              </div>
              <button
                type="button"
                onClick={() => setPassword(generatePassword())}
                className="px-3 py-2 bg-surface2 border border-border/60 rounded-lg text-xs text-muted hover:text-accent transition-colors whitespace-nowrap"
                title="Tự tạo mật khẩu"
              >
                <Key className="w-3.5 h-3.5" />
              </button>
            </div>
            {password && (
              <p className="text-[10px] text-muted/70 mt-1">
                Mật khẩu: <span className="text-accent font-mono">{password}</span>
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(password)}
                  className="ml-2 text-accent/60 hover:text-accent transition-colors text-[10px]"
                >
                  Sao chép
                </button>
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs text-muted mb-1.5">Quyền</label>
            <div className="flex gap-2">
              {(['user', 'admin'] as const).map(r => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors border ${
                    role === r
                      ? r === 'admin'
                        ? 'bg-accent/15 text-accent border-accent/30'
                        : 'bg-surface2 text-gray-200 border-border/60'
                      : 'bg-transparent text-muted border-border/30 hover:border-border/60'
                  }`}
                >
                  {r === 'admin' ? '🛡 Admin' : '👤 User'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border/40">
          <button onClick={onClose} className="px-4 py-2 text-sm text-muted hover:text-gray-300 transition-colors">
            Huỷ
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="px-4 py-2 bg-accent/15 border border-accent/30 text-accent rounded-lg text-sm font-medium hover:bg-accent/25 transition-colors disabled:opacity-50"
          >
            {loading ? 'Đang lưu...' : mode === 'add' ? 'Tạo tài khoản' : 'Lưu thay đổi'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Confirm delete modal ───────────────────────────────────────────────────────

function ConfirmDeleteModal({ count, onConfirm, onClose }: { count: number; onConfirm: () => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-surface border border-border/60 rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center">
        <div className="w-12 h-12 rounded-full bg-red-400/15 border border-red-400/20 flex items-center justify-center mx-auto mb-4">
          <Trash2 className="w-5 h-5 text-red-400" />
        </div>
        <h3 className="font-semibold text-gray-100 mb-2">Xác nhận xoá</h3>
        <p className="text-sm text-muted mb-6">
          Bạn sắp xoá <span className="text-red-400 font-semibold">{count} tài khoản</span>.
          Hành động này không thể hoàn tác.
        </p>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 text-sm text-muted bg-surface2 rounded-lg hover:bg-border transition-colors">
            Huỷ
          </button>
          <button onClick={onConfirm} className="flex-1 py-2.5 text-sm font-semibold text-white bg-red-500/80 hover:bg-red-500 rounded-lg transition-colors">
            Xoá ngay
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function UserManagement() {
  const { user, token } = useAuthContext()

  const [users,      setUsers]      = useState<UserRow[]>([])
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState('')
  const [search,     setSearch]     = useState('')
  const [filterRole, setFilterRole] = useState<'all' | 'admin' | 'user'>('all')
  const [sortField,  setSortField]  = useState<SortField>('created_at')
  const [sortDir,    setSortDir]    = useState<SortDir>('desc')
  const [selected,   setSelected]   = useState<Set<string>>(new Set())
  const [modal,      setModal]      = useState<null | { mode: 'add' | 'edit'; user?: UserRow }>(null)
  const [deleteTarget, setDeleteTarget] = useState<string[] | null>(null)
  const [toggling,   setToggling]   = useState<string | null>(null)
  const toastRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null)

  const showToast = useCallback((msg: string, type: 'ok' | 'err' = 'ok') => {
    setToast({ msg, type })
    if (toastRef.current) clearTimeout(toastRef.current)
    toastRef.current = setTimeout(() => setToast(null), 3000)
  }, [])

  const fetchUsers = useCallback(async () => {
    if (!token) return
    setLoading(true); setError('')
    try {
      const res  = await fetch('/api/admin/users', { headers: { 'Authorization': `Bearer ${token}` } })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Không tải được')
      setUsers(data.users)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lỗi không xác định')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  // ── Derived list ──
  const displayed = users
    .filter(u => {
      const q = search.toLowerCase()
      const matchSearch = !q || u.username.toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q)
      const matchRole   = filterRole === 'all' || u.role === filterRole
      return matchSearch && matchRole
    })
    .sort((a, b) => {
      let av: string | number = a[sortField] ?? ''
      let bv: string | number = b[sortField] ?? ''
      if (typeof av === 'string') av = av.toLowerCase()
      if (typeof bv === 'string') bv = bv.toLowerCase()
      return sortDir === 'asc' ? (av < bv ? -1 : 1) : (av > bv ? -1 : 1)
    })

  const allSelected = displayed.length > 0 && displayed.every(u => selected.has(u.id))

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    if (allSelected) {
      setSelected(prev => {
        const next = new Set(prev)
        displayed.forEach(u => next.delete(u.id))
        return next
      })
    } else {
      setSelected(prev => {
        const next = new Set(prev)
        displayed.forEach(u => next.add(u.id))
        return next
      })
    }
  }

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('asc') }
  }

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ChevronDown className="w-3 h-3 opacity-30" />
    return sortDir === 'asc'
      ? <ChevronUp className="w-3 h-3 text-accent" />
      : <ChevronDown className="w-3 h-3 text-accent" />
  }

  // ── Actions ──
  const handleToggleStatus = async (u: UserRow) => {
    if (!token) return
    setToggling(u.id)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ userId: u.id, is_active: !u.is_active }),
      })
      if (!res.ok) throw new Error('Cập nhật thất bại')
      await fetchUsers()
      showToast(`${u.username} ${!u.is_active ? 'đã kích hoạt' : 'đã khoá'}`)
    } catch {
      showToast('Cập nhật thất bại', 'err')
    } finally {
      setToggling(null)
    }
  }

  const handleChangeRole = async (u: UserRow) => {
    if (!token || u.id === user?.id) return
    const newRole = u.role === 'admin' ? 'user' : 'admin'
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ userId: u.id, role: newRole }),
      })
      if (!res.ok) throw new Error('Thất bại')
      await fetchUsers()
      showToast(`Đã đổi role: ${u.username} → ${newRole}`)
    } catch {
      showToast('Đổi role thất bại', 'err')
    }
  }

  const handleDelete = async (ids: string[]) => {
    if (!token) return
    try {
      const res = await fetch('/api/admin/users', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ userIds: ids }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Xoá thất bại')
      setSelected(prev => { const n = new Set(prev); ids.forEach(id => n.delete(id)); return n })
      await fetchUsers()
      showToast(`Đã xoá ${data.deleted} tài khoản`)
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Lỗi', 'err')
    } finally {
      setDeleteTarget(null)
    }
  }

  const selectedNotSelf = Array.from(selected).filter(id => id !== user?.id)

  // ── Stats ──
  const adminCount  = users.filter(u => u.role === 'admin').length
  const activeCount = users.filter(u => u.is_active !== false).length
  const totalAnalyses = users.reduce((s, u) => s + (u.analysisCount || 0), 0)

  return (
    <div className="space-y-4">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-5 right-5 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-xl text-sm font-medium border ${
          toast.type === 'ok'
            ? 'bg-green-400/10 border-green-400/20 text-green-400'
            : 'bg-red-400/10 border-red-400/20 text-red-400'
        }`}>
          {toast.msg}
        </div>
      )}

      {/* Modals */}
      {modal && token && (
        <UserModal
          mode={modal.mode}
          user={modal.user}
          token={token}
          onClose={() => setModal(null)}
          onSuccess={() => { fetchUsers(); showToast(modal.mode === 'add' ? 'Tạo tài khoản thành công' : 'Cập nhật thành công') }}
        />
      )}

      {deleteTarget && (
        <ConfirmDeleteModal
          count={deleteTarget.length}
          onConfirm={() => handleDelete(deleteTarget)}
          onClose={() => setDeleteTarget(null)}
        />
      )}

      {/* Header + stats */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-100 flex items-center gap-2">
            <Users className="w-4 h-4 text-accent" />
            Quản lý người dùng
          </h3>
          <p className="text-xs text-muted mt-0.5">
            {users.length} tổng · {adminCount} admin · {activeCount} hoạt động · {totalAnalyses} phân tích
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchUsers}
            className="p-1.5 rounded-lg text-muted hover:text-accent transition-colors"
            title="Làm mới"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => exportCSV(displayed)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-surface2 border border-border/40 text-muted hover:text-accent rounded-lg transition-colors"
            title="Xuất CSV"
          >
            <Download className="w-3.5 h-3.5" />
            CSV
          </button>
          <button
            onClick={() => setModal({ mode: 'add' })}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-accent/10 border border-accent/20 text-accent rounded-lg hover:bg-accent/20 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Thêm user
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-400 text-xs bg-red-400/10 rounded-lg px-3 py-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
        </div>
      )}

      {/* Filters + search */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 bg-surface2 border border-border/40 rounded-lg px-2.5 py-1.5 flex-1 min-w-[180px]">
          <Search className="w-3.5 h-3.5 text-muted flex-shrink-0" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Tìm tên hoặc email..."
            className="bg-transparent text-xs outline-none w-full placeholder:text-muted"
          />
          {search && (
            <button onClick={() => setSearch('')} className="text-muted hover:text-gray-300">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {(['all', 'admin', 'user'] as const).map(r => (
          <button
            key={r}
            onClick={() => setFilterRole(r)}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filterRole === r
                ? 'bg-accent/15 text-accent border border-accent/25'
                : 'bg-surface2 text-muted hover:text-gray-200 border border-border/30'
            }`}
          >
            {r === 'all' ? `Tất cả (${users.length})` : r === 'admin' ? `Admin (${adminCount})` : `User (${users.length - adminCount})`}
          </button>
        ))}
      </div>

      {/* Bulk actions bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 bg-accent/5 border border-accent/20 rounded-xl px-4 py-2.5">
          <span className="text-xs text-accent font-medium">
            Đã chọn {selected.size} tài khoản
          </span>
          <button
            onClick={() => selectedNotSelf.length > 0 && setDeleteTarget(selectedNotSelf)}
            disabled={selectedNotSelf.length === 0}
            className="flex items-center gap-1.5 px-3 py-1 bg-red-400/10 border border-red-400/20 text-red-400 rounded-lg text-xs hover:bg-red-400/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Trash2 className="w-3 h-3" />
            Xoá ({selectedNotSelf.length})
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="ml-auto text-muted hover:text-gray-300 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Table */}
      {!loading && users.length === 0 ? (
        <div className="rounded-xl border border-border/40 p-12 text-center">
          <Users className="w-8 h-8 mx-auto mb-3 text-muted opacity-40" />
          <p className="text-sm text-muted">Chưa có người dùng nào</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border/40 overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-surface2/80">
              <tr>
                {/* Checkbox */}
                <th className="w-10 px-3 py-3">
                  <button onClick={toggleAll}>
                    {allSelected
                      ? <CheckSquare className="w-3.5 h-3.5 text-accent" />
                      : <Square className="w-3.5 h-3.5 text-muted/50" />}
                  </button>
                </th>
                <th className="px-3 py-3 text-left">
                  <button onClick={() => handleSort('username')} className="flex items-center gap-1 text-muted font-semibold hover:text-gray-200 transition-colors">
                    Người dùng <SortIcon field="username" />
                  </button>
                </th>
                <th className="px-3 py-3 text-left">
                  <button onClick={() => handleSort('email')} className="flex items-center gap-1 text-muted font-semibold hover:text-gray-200 transition-colors">
                    Email <SortIcon field="email" />
                  </button>
                </th>
                <th className="px-3 py-3 text-center">
                  <button onClick={() => handleSort('role')} className="flex items-center gap-1 text-muted font-semibold hover:text-gray-200 transition-colors mx-auto">
                    Role <SortIcon field="role" />
                  </button>
                </th>
                <th className="px-3 py-3 text-center text-muted font-semibold">Trạng thái</th>
                <th className="px-3 py-3 text-center">
                  <button onClick={() => handleSort('analysisCount')} className="flex items-center gap-1 text-muted font-semibold hover:text-gray-200 transition-colors mx-auto">
                    Phân tích <SortIcon field="analysisCount" />
                  </button>
                </th>
                <th className="px-3 py-3 text-center">
                  <button onClick={() => handleSort('created_at')} className="flex items-center gap-1 text-muted font-semibold hover:text-gray-200 transition-colors mx-auto">
                    Ngày tạo <SortIcon field="created_at" />
                  </button>
                </th>
                <th className="px-3 py-3 text-center text-muted font-semibold">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20">
              {displayed.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-muted">
                    Không tìm thấy kết quả
                  </td>
                </tr>
              ) : (
                displayed.map(u => (
                  <tr
                    key={u.id}
                    className={`hover:bg-surface2/30 transition-colors ${
                      selected.has(u.id) ? 'bg-accent/5' : ''
                    } ${!u.is_active ? 'opacity-50' : ''}`}
                  >
                    {/* Checkbox */}
                    <td className="px-3 py-3 text-center">
                      {u.id !== user?.id && (
                        <button onClick={() => toggleSelect(u.id)}>
                          {selected.has(u.id)
                            ? <CheckSquare className="w-3.5 h-3.5 text-accent" />
                            : <Square className="w-3.5 h-3.5 text-muted/50" />}
                        </button>
                      )}
                    </td>
                    {/* Username */}
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                          u.role === 'admin' ? 'bg-accent/15' : 'bg-surface2'
                        }`}>
                          <span className={`text-[10px] font-bold uppercase ${
                            u.role === 'admin' ? 'text-accent' : 'text-muted'
                          }`}>
                            {u.username.charAt(0)}
                          </span>
                        </div>
                        <div>
                          <p className="text-gray-200 font-medium">{u.username}</p>
                          {u.id === user?.id && (
                            <span className="text-[10px] text-accent">(bạn)</span>
                          )}
                        </div>
                      </div>
                    </td>
                    {/* Email */}
                    <td className="px-3 py-3 text-muted">{u.email || '—'}</td>
                    {/* Role */}
                    <td className="px-3 py-3 text-center">
                      <button
                        onClick={() => handleChangeRole(u)}
                        disabled={u.id === user?.id}
                        title={u.id === user?.id ? '' : `Đổi role thành ${u.role === 'admin' ? 'user' : 'admin'}`}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-colors ${
                          u.role === 'admin'
                            ? 'bg-accent/12 text-accent border-accent/25 hover:bg-accent/20'
                            : 'bg-surface2 text-muted border-border/30 hover:text-gray-200'
                        } disabled:cursor-default`}
                      >
                        {u.role === 'admin' ? <Shield className="w-2.5 h-2.5" /> : <User className="w-2.5 h-2.5" />}
                        {u.role.toUpperCase()}
                      </button>
                    </td>
                    {/* Status */}
                    <td className="px-3 py-3 text-center">
                      <button
                        onClick={() => u.id !== user?.id && handleToggleStatus(u)}
                        disabled={toggling === u.id || u.id === user?.id}
                        title={u.is_active ? 'Khoá tài khoản' : 'Kích hoạt'}
                        className="transition-colors disabled:cursor-default"
                      >
                        {toggling === u.id ? (
                          <span className="w-4 h-4 border border-accent border-t-transparent rounded-full animate-spin inline-block" />
                        ) : u.is_active ? (
                          <ToggleRight className="w-5 h-5 text-green-400" />
                        ) : (
                          <ToggleLeft className="w-5 h-5 text-muted" />
                        )}
                      </button>
                    </td>
                    {/* Analysis count */}
                    <td className="px-3 py-3 text-center">
                      <span className={`text-xs font-mono ${u.analysisCount > 0 ? 'text-accent' : 'text-muted/40'}`}>
                        {u.analysisCount}
                      </span>
                    </td>
                    {/* Created at */}
                    <td className="px-3 py-3 text-center text-muted">
                      {new Date(u.created_at).toLocaleDateString('vi-VN')}
                    </td>
                    {/* Actions */}
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => setModal({ mode: 'edit', user: u })}
                          className="p-1.5 rounded-lg text-muted hover:text-accent hover:bg-accent/10 transition-colors"
                          title="Chỉnh sửa"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        {u.id !== user?.id && (
                          <button
                            onClick={() => setDeleteTarget([u.id])}
                            className="p-1.5 rounded-lg text-muted hover:text-red-400 hover:bg-red-400/10 transition-colors"
                            title="Xoá"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {/* Footer */}
          <div className="border-t border-border/30 px-4 py-2.5 flex items-center justify-between text-[10px] text-muted bg-surface2/30">
            <span>
              Hiển thị {displayed.length} / {users.length} tài khoản
              {selected.size > 0 && ` · Đang chọn ${selected.size}`}
            </span>
            <span>Cập nhật: {new Date().toLocaleTimeString('vi-VN')}</span>
          </div>
        </div>
      )}
    </div>
  )
}
