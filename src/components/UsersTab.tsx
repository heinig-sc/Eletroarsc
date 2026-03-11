import { useState, useEffect, FormEvent } from 'react';
import { UserPlus, Trash2, Shield, User as UserIcon, Loader2, AlertCircle } from 'lucide-react';
import { motion } from 'motion/react';
import { User } from '../types';

interface UsersTabProps {
  apiFetch: (url: string, options?: RequestInit) => Promise<Response>;
}

export default function UsersTab({ apiFetch }: UsersTabProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      const res = await apiFetch('/api/users');
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
      }
    } catch (err) {
      console.error("Error fetching users:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleCreateUser = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    
    try {
      const res = await apiFetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: newUsername, password: newPassword }),
      });

      const data = await res.json();

      if (res.ok) {
        setSuccess('Usuário criado com sucesso!');
        setNewUsername('');
        setNewPassword('');
        setIsCreating(false);
        fetchUsers();
      } else {
        setError(data.error || 'Erro ao criar usuário');
      }
    } catch (err) {
      setError('Erro de conexão');
    }
  };

  const handleDeleteUser = async (id: number) => {
    if (!confirm('Tem certeza que deseja excluir este usuário?')) return;
    
    try {
      const res = await apiFetch(`/api/users/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchUsers();
      } else {
        const data = await res.json();
        alert(data.error || 'Erro ao excluir usuário');
      }
    } catch (err) {
      alert('Erro de conexão');
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <header className="mb-10 flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold tracking-tight mb-2">Gestão de Usuários</h2>
          <p className="text-black/50">Gerencie quem tem acesso ao sistema da oficina.</p>
        </div>
        <button 
          onClick={() => setIsCreating(true)}
          className="bg-emerald-600 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/20"
        >
          <UserPlus size={20} /> Novo Usuário
        </button>
      </header>

      {isCreating && (
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 bg-white p-6 rounded-2xl border border-black/5 shadow-sm"
        >
          <h3 className="font-bold mb-4 flex items-center gap-2">
            <UserPlus size={18} className="text-emerald-600" />
            Cadastrar Novo Usuário
          </h3>
          <form onSubmit={handleCreateUser} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div className="space-y-2">
              <label className="text-xs font-bold text-black/40 uppercase ml-1">Usuário</label>
              <input 
                type="text"
                required
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                className="w-full bg-[#F9F9F9] border border-black/5 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                placeholder="Nome de usuário"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-black/40 uppercase ml-1">Senha</label>
              <input 
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full bg-[#F9F9F9] border border-black/5 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                placeholder="Senha de acesso"
              />
            </div>
            <div className="flex gap-2">
              <button 
                type="submit"
                className="flex-1 bg-emerald-600 text-white py-3 rounded-xl font-bold hover:bg-emerald-700 transition-all"
              >
                Salvar
              </button>
              <button 
                type="button"
                onClick={() => setIsCreating(false)}
                className="px-4 py-3 rounded-xl font-bold text-black/40 hover:bg-black/5 transition-all"
              >
                Cancelar
              </button>
            </div>
          </form>
          {error && <p className="mt-3 text-red-500 text-xs font-bold flex items-center gap-1"><AlertCircle size={12} /> {error}</p>}
          {success && <p className="mt-3 text-emerald-600 text-xs font-bold flex items-center gap-1"><Shield size={12} /> {success}</p>}
        </motion.div>
      )}

      <div className="bg-white rounded-3xl border border-black/5 overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="p-20 flex flex-col items-center justify-center gap-4">
            <Loader2 className="animate-spin text-emerald-600" size={32} />
            <p className="text-black/40 font-bold">Carregando usuários...</p>
          </div>
        ) : (
          <div className="divide-y divide-black/5">
            {users.map((u) => (
              <div key={u.id} className="p-6 flex items-center justify-between hover:bg-black/[0.01] transition-colors">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600">
                    <UserIcon size={24} />
                  </div>
                  <div>
                    <div className="font-bold text-lg">{u.username}</div>
                    <div className="text-black/40 text-xs font-medium uppercase tracking-wider">Acesso Total</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => handleDeleteUser(u.id)}
                    className="p-3 text-black/20 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                    title="Excluir Usuário"
                  >
                    <Trash2 size={20} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
