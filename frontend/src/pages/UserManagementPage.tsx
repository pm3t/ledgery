import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';

interface UserRow {
  id: string;
  nama: string;
  email: string;
  role: string;
  tenantId: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  tenant?: { nama_perusahaan: string };
}

interface FormState {
  nama: string;
  email: string;
  password: string;
  role: string;
  tenantId: string;
}

const EMPTY_FORM: FormState = { nama: '', email: '', password: '', role: 'STAF_AKUNTANSI', tenantId: '' };

export function UserManagementPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<UserRow | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const data = await api.getUsers();
      setUsers(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editTarget) {
        await api.updateUser(editTarget.id, form);
        alert('User berhasil diperbarui!');
      } else {
        await api.createUser(form);
        alert('User berhasil dibuat!');
      }
      setShowForm(false);
      setEditTarget(null);
      setForm(EMPTY_FORM);
      fetchUsers();
    } catch (err: any) {
      alert(`Gagal: ${err.message}`);
    }
  };

  const handleEdit = (u: UserRow) => {
    setEditTarget(u);
    setForm({ nama: u.nama, email: u.email, password: '', role: u.role, tenantId: u.tenantId || '' });
    setShowForm(true);
  };

  const handleDeactivate = async (id: string, nama: string) => {
    if (!confirm(`Nonaktifkan user "${nama}"?`)) return;
    try {
      await api.deactivateUser(id);
      fetchUsers();
    } catch (err: any) {
      alert(`Gagal: ${err.message}`);
    }
  };

  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  const roleOptions = isSuperAdmin
    ? ['SUPER_ADMIN', 'ADMIN_TENANT', 'STAF_AKUNTANSI']
    : ['STAF_AKUNTANSI'];

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'SUPER_ADMIN': return 'bg-rose-500/20 text-rose-400 border border-rose-500/30';
      case 'ADMIN_TENANT': return 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30';
      default: return 'bg-slate-500/20 text-slate-300 border border-slate-500/30';
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Manajemen User</h1>
          <p className="text-sm text-slate-400 mt-1">
            {isSuperAdmin ? 'Kelola semua user lintas tenant.' : 'Kelola Staf Akuntansi di tenant Anda.'}
          </p>
        </div>
        <button
          onClick={() => { setEditTarget(null); setForm(EMPTY_FORM); setShowForm(true); }}
          className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
        >
          + Tambah User
        </button>
      </div>

      {/* Form tambah/edit */}
      {showForm && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <h2 className="text-base font-semibold text-white mb-4">
            {editTarget ? 'Edit User' : 'Tambah User Baru'}
          </h2>
          <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4 max-w-2xl">
            <div>
              <label className="text-xs font-medium text-slate-400 mb-1 block">Nama Lengkap</label>
              <input required value={form.nama} onChange={e => setForm({ ...form, nama: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-sm text-white focus:border-indigo-500 outline-none" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-400 mb-1 block">Email</label>
              <input required type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-sm text-white focus:border-indigo-500 outline-none" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-400 mb-1 block">
                Password {editTarget && <span className="text-slate-500">(kosongkan jika tidak ingin diubah)</span>}
              </label>
              <input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-sm text-white focus:border-indigo-500 outline-none" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-400 mb-1 block">Role</label>
              <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-sm text-white focus:border-indigo-500 outline-none">
                {roleOptions.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            {isSuperAdmin && form.role !== 'SUPER_ADMIN' && (
              <div className="col-span-2">
                <label className="text-xs font-medium text-slate-400 mb-1 block">Tenant ID</label>
                <input value={form.tenantId} onChange={e => setForm({ ...form, tenantId: e.target.value })} placeholder="UUID tenant"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-sm text-white focus:border-indigo-500 outline-none" />
              </div>
            )}
            <div className="col-span-2 flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-slate-400 hover:text-white">Batal</button>
              <button type="submit" className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-sm font-medium">
                {editTarget ? 'Simpan Perubahan' : 'Buat User'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tabel user */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-slate-400 uppercase bg-slate-950 border-b border-slate-800">
            <tr>
              <th className="px-6 py-4 font-medium">Nama & Email</th>
              <th className="px-6 py-4 font-medium">Role</th>
              {isSuperAdmin && <th className="px-6 py-4 font-medium">Tenant</th>}
              <th className="px-6 py-4 font-medium">Status</th>
              <th className="px-6 py-4 font-medium">Login Terakhir</th>
              <th className="px-6 py-4 font-medium text-right">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50">
            {loading ? (
              <tr><td colSpan={6} className="p-6 text-center text-slate-500">Memuat...</td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={6} className="p-6 text-center text-slate-500">Belum ada user</td></tr>
            ) : (
              users.map(u => (
                <tr key={u.id} className="hover:bg-slate-800/20 transition-colors">
                  <td className="px-6 py-4">
                    <div className="font-medium text-white">{u.nama}</div>
                    <div className="text-xs text-slate-400">{u.email}</div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${getRoleBadge(u.role)}`}>{u.role}</span>
                  </td>
                  {isSuperAdmin && <td className="px-6 py-4 text-xs text-slate-300">{u.tenant?.nama_perusahaan || '-'}</td>}
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-[10px] font-bold ${u.isActive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-500/20 text-slate-400'}`}>
                      {u.isActive ? 'AKTIF' : 'NONAKTIF'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-xs text-slate-400">
                    {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString('id-ID') : 'Belum pernah'}
                  </td>
                  <td className="px-6 py-4 text-right space-x-2">
                    <button onClick={() => handleEdit(u)} className="text-xs text-indigo-400 hover:text-white transition-colors px-2 py-1 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20">Edit</button>
                    {u.isActive && u.id !== user?.userId && (
                      <button onClick={() => handleDeactivate(u.id, u.nama)} className="text-xs text-rose-400 hover:text-white transition-colors px-2 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20">Nonaktifkan</button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
