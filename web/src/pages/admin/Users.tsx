import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EmptyState } from '@/components/ui/empty-state'
import { useTranslation } from '@/lib/i18n'
import { usersApi } from '@/lib/api'
import { Users, Plus, Trash2, Pencil } from 'lucide-react'

interface UserItem {
  id: number
  email: string
  username: string
  role: 'admin' | 'user'
  createdAt: string
}

export default function AdminUsers() {
  const { t } = useTranslation()
  const [users, setUsers] = useState<UserItem[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [editingUser, setEditingUser] = useState<UserItem | null>(null)
  const [error, setError] = useState('')

  // Create form
  const [newEmail, setNewEmail] = useState('')
  const [newUsername, setNewUsername] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newRole, setNewRole] = useState<'admin' | 'user'>('user')

  // Edit form
  const [editEmail, setEditEmail] = useState('')
  const [editUsername, setEditUsername] = useState('')
  const [editRole, setEditRole] = useState<'admin' | 'user'>('user')

  const fetchUsers = async () => {
    setLoading(true)
    const result = await usersApi.list()
    if (result.success && result.data) {
      setUsers(result.data.filter(u => u.role !== 'admin'))
    }
    setLoading(false)
  }

  useEffect(() => { fetchUsers() }, [])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (newPassword.length < 6) {
      setError(t('settings.security.minLength'))
      return
    }
    const result = await usersApi.create({
      email: newEmail, username: newUsername, password: newPassword, role: newRole,
    })
    if (result.success) {
      setShowCreate(false)
      setNewEmail('')
      setNewUsername('')
      setNewPassword('')
      setNewRole('user')
      fetchUsers()
    } else {
      setError(result.error || t('common.error'))
    }
  }

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingUser) return
    setError('')
    const result = await usersApi.update(editingUser.id, {
      email: editEmail, username: editUsername, role: editRole,
    })
    if (result.success) {
      setEditingUser(null)
      fetchUsers()
    } else {
      setError(result.error || t('common.error'))
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm(t('users.deleteConfirm'))) return
    setError('')
    const result = await usersApi.delete(id)
    if (result.success) {
      fetchUsers()
    } else {
      setError(result.error || t('common.error'))
    }
  }

  const startEdit = (user: UserItem) => {
    setEditingUser(user)
    setEditEmail(user.email)
    setEditUsername(user.username)
    setEditRole(user.role)
    setShowCreate(false)
  }

  return (
    <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                {t('users.title')}
              </CardTitle>
              <CardDescription>{t('users.title')}</CardDescription>
            </div>
            <Button size="sm" onClick={() => { setShowCreate(true); setEditingUser(null); setError('') }}>
              <Plus className="h-4 w-4 mr-1" />
              {t('users.add')}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-4 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
              {error}
            </div>
          )}

          {/* Create form */}
          {showCreate && (
            <form onSubmit={handleCreate} className="mb-6 p-4 border rounded-lg space-y-3">
              <h4 className="font-medium">{t('users.new')}</h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>{t('users.email')}</Label>
                  <Input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)}
                    placeholder={t('users.emailPlaceholder')} required />
                </div>
                <div className="space-y-1">
                  <Label>{t('users.username')}</Label>
                  <Input value={newUsername} onChange={(e) => setNewUsername(e.target.value)}
                    placeholder={t('users.usernamePlaceholder')} required />
                </div>
                <div className="space-y-1">
                  <Label>{t('users.password')}</Label>
                  <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                    placeholder={t('users.passwordPlaceholder')} required />
                </div>
                <div className="space-y-1">
                  <Label>{t('users.role')}</Label>
                  <Select value={newRole} onValueChange={(v) => setNewRole(v as 'admin' | 'user')}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user">{t('users.roleUser')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex gap-2">
                <Button type="submit" size="sm">{t('users.create')}</Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setShowCreate(false)}>
                  {t('users.cancel')}
                </Button>
              </div>
            </form>
          )}

          {/* Edit form */}
          {editingUser && (
            <form onSubmit={handleEdit} className="mb-6 p-4 border rounded-lg space-y-3">
              <h4 className="font-medium">{t('users.editUser')}</h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>{t('users.email')}</Label>
                  <Input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} required />
                </div>
                <div className="space-y-1">
                  <Label>{t('users.username')}</Label>
                  <Input value={editUsername} onChange={(e) => setEditUsername(e.target.value)} required />
                </div>
                <div className="space-y-1">
                  <Label>{t('users.role')}</Label>
                  <Select value={editRole} onValueChange={(v) => setEditRole(v as 'admin' | 'user')}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user">{t('users.roleUser')}</SelectItem>
                      <SelectItem value="admin">{t('users.roleAdmin')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex gap-2">
                <Button type="submit" size="sm">{t('users.save')}</Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setEditingUser(null)}>
                  {t('users.cancel')}
                </Button>
              </div>
            </form>
          )}

          {/* Users table */}
          {loading ? (
            <p className="text-muted-foreground text-sm">{t('common.loading')}</p>
          ) : users.length === 0 ? (
            <EmptyState title={t('users.empty')} />
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium">{t('users.email')}</th>
                    <th className="text-left px-4 py-2 font-medium">{t('users.username')}</th>
                    <th className="text-left px-4 py-2 font-medium">{t('users.role')}</th>
                    <th className="text-left px-4 py-2 font-medium">{t('users.createdAt')}</th>
                    <th className="text-right px-4 py-2 font-medium">{t('users.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id} className="border-t hover:bg-muted/30">
                      <td className="px-4 py-2">{user.email}</td>
                      <td className="px-4 py-2">{user.username}</td>
                      <td className="px-4 py-2">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                          user.role === 'admin'
                            ? 'bg-primary/10 text-primary'
                            : 'bg-muted text-muted-foreground'
                        }`}>
                          {user.role === 'admin' ? t('users.roleAdmin') : t('users.roleUser')}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">
                        {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : '-'}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <Button size="sm" variant="ghost" onClick={() => startEdit(user)}
                          className="h-7 px-2 text-muted-foreground hover:text-foreground">
                          <Pencil className="h-3 w-3" />
                        </Button>
                        {user.role !== 'admin' && (
                          <Button size="sm" variant="ghost" onClick={() => handleDelete(user.id)}
                            className="h-7 px-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10">
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
  )
}
