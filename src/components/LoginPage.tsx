import { useState, useEffect, FormEvent } from 'react';
import { Wrench, Lock, User as UserIcon, AlertCircle, Loader2 } from 'lucide-react';
import { motion } from 'motion/react';

interface LoginPageProps {
  onLogin: (user: { id: number; username: string }) => void;
}

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [dbStatus, setDbStatus] = useState<'checking' | 'ok' | 'error' | 'no_tables'>('checking');
  const [dbMessage, setDbMessage] = useState('');

  const checkConnection = () => {
    setDbStatus('checking');
    fetch('/health')
      .then(res => res.json())
      .then(data => {
        if (data.status === 'ok') {
          if (data.database === 'connected_no_tables') {
            setDbStatus('no_tables');
          } else {
            setDbStatus('ok');
          }
        } else {
          setDbStatus('error');
        }
        setDbMessage(data.message || '');
      })
      .catch(() => {
        setDbStatus('error');
        setDbMessage('Não foi possível conectar ao servidor backend.');
      });
  };

  useEffect(() => {
    checkConnection();
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const endpoint = isRegistering ? '/api/auth/register' : '/api/auth/login';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
        credentials: 'include',
      });

      const data = await res.json();

      if (res.ok) {
        if (isRegistering) {
          setIsRegistering(false);
          setError('Usuário criado com sucesso! Agora você pode entrar.');
        } else {
          if (data.token) {
            localStorage.setItem('eletroar_token', data.token);
          }
          onLogin(data.user);
        }
      } else {
        setError(data.error || 'Erro ao processar solicitação');
      }
    } catch (err) {
      setError('Erro de conexão com o servidor');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F5F5] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-white rounded-3xl shadow-xl shadow-black/5 p-8 md:p-10 border border-black/5"
      >
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-emerald-600 rounded-2xl flex items-center justify-center text-white mb-4 shadow-lg shadow-emerald-600/20">
            <Wrench size={32} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-center">EletroAr</h1>
          <p className="text-black/50 text-sm text-center mt-1">
            {isRegistering ? 'Criar nova conta de acesso' : 'Acesse sua conta para gerenciar a oficina'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {dbStatus === 'error' && (
            <div className="p-4 rounded-xl bg-amber-50 text-amber-700 text-xs font-medium border border-amber-200 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertCircle size={14} />
                  <span>Banco de dados desconectado</span>
                </div>
                <button 
                  type="button"
                  onClick={checkConnection}
                  className="underline hover:text-amber-900"
                >
                  Tentar novamente
                </button>
              </div>
              {dbMessage && <p className="opacity-80 font-normal">{dbMessage}</p>}
            </div>
          )}
          {dbStatus === 'no_tables' && (
            <div className="p-4 rounded-xl bg-blue-50 text-blue-700 text-xs font-medium border border-blue-200 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertCircle size={14} />
                  <span>Tabelas não encontradas</span>
                </div>
                <button 
                  type="button"
                  onClick={checkConnection}
                  className="underline hover:text-blue-900"
                >
                  Verificar novamente
                </button>
              </div>
              <p className="opacity-80 font-normal">Conectado ao Supabase, mas as tabelas não existem. Execute o script de migração no editor SQL do Supabase.</p>
            </div>
          )}
          {error && (
            <div className={`p-4 rounded-xl flex items-center gap-3 text-sm font-medium ${error.includes('sucesso') || error.includes('login') ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
              <AlertCircle size={18} />
              {error}
            </div>
          )}

          <div className="space-y-2">
            <label className="text-xs font-bold text-black/40 uppercase ml-1">Usuário</label>
            <div className="relative">
              <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-black/30" size={18} />
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-[#F9F9F9] border border-black/5 rounded-xl pl-12 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all"
                placeholder="Digite seu usuário"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-black/40 uppercase ml-1">Senha</label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-black/30" size={18} />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-[#F9F9F9] border border-black/5 rounded-xl pl-12 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all"
                placeholder="Digite sua senha"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-emerald-600 text-white py-4 rounded-xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isLoading ? (
              <Loader2 className="animate-spin" size={20} />
            ) : (
              isRegistering ? 'Cadastrar Usuário' : 'Entrar no Sistema'
            )}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-black/5 text-center">
          <button 
            onClick={() => {
              setIsRegistering(!isRegistering);
              setError('');
            }}
            className="text-sm font-bold text-emerald-600 hover:text-emerald-700"
          >
            {isRegistering ? 'Já tem uma conta? Entrar' : 'Não tem conta? Cadastre-se aqui'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
