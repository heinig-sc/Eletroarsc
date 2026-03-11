/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, ReactNode, FormEvent } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { 
  Search, 
  UserPlus, 
  Wrench, 
  FileText, 
  CreditCard, 
  History, 
  Plus, 
  ChevronRight,
  Filter,
  Calendar,
  Car,
  Phone,
  User,
  CheckCircle2,
  AlertCircle,
  Edit,
  Trash2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { SearchResult, Service, AccountPayable, Customer, Vehicle, User as UserType } from './types';
import LoginPage from './components/LoginPage';
import UsersTab from './components/UsersTab';
import { LogOut, Camera } from 'lucide-react';
import PlateOCRButton from './components/PlateOCRButton';

const validatePlate = (plate: string) => {
  if (!plate) return false;
  const cleanPlate = plate.replace(/[^A-Z0-9]/gi, '').toUpperCase();
  const oldFormat = /^[A-Z]{3}[0-9]{4}$/;
  const mercosulFormat = /^[A-Z]{3}[0-9][A-Z][0-9]{2}$/;
  return oldFormat.test(cleanPlate) || mercosulFormat.test(cleanPlate);
};

const formatPlate = (value: string) => {
  let v = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (v.length > 7) v = v.substring(0, 7);
  
  // AAA-0000 format
  if (v.length > 3 && /^[A-Z]{3}[0-9]{1,4}$/.test(v)) {
    return `${v.substring(0, 3)}-${v.substring(3)}`;
  }
  
  return v;
};

type Tab = 'search' | 'customers' | 'services' | 'payable' | 'reports' | 'users';

export default function App() {
  const [user, setUser] = useState<UserType | null>(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('search');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<SearchResult | null>(null);
  const [history, setHistory] = useState<Service[]>([]);
  const [isNewCustomerModalOpen, setIsNewCustomerModalOpen] = useState(false);
  const [isNewServiceModalOpen, setIsNewServiceModalOpen] = useState(false);
  const [isNewPayableModalOpen, setIsNewPayableModalOpen] = useState(false);
  const [viewingHistoryCustomer, setViewingHistoryCustomer] = useState<Customer | null>(null);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [editingPayable, setEditingPayable] = useState<AccountPayable | null>(null);
  const [editingServiceId, setEditingServiceId] = useState<number | null>(null);
  const [refreshCustomersKey, setRefreshCustomersKey] = useState(0);
  const [refreshPayablesKey, setRefreshPayablesKey] = useState(0);
  const [refreshServicesKey, setRefreshServicesKey] = useState(0);
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });

  const apiFetch = async (url: string, options: RequestInit = {}) => {
    try {
      const token = localStorage.getItem('eletroar_token');
      const headers = {
        ...options.headers,
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      };

      const res = await fetch(url, {
        ...options,
        headers,
        credentials: 'include',
      });
      
      if (res.status === 401) {
        if (user) {
          localStorage.removeItem('eletroar_token');
          setUser(null);
        }
      }
      return res;
    } catch (err: any) {
      console.error(`[FETCH ERROR] ${url}:`, err);
      const errorMessage = err.message === 'Failed to fetch' 
        ? `Não foi possível conectar ao servidor. O backend pode estar iniciando ou fora do ar.` 
        : `Erro de conexão: ${err.message}`;
      
      // We can show a toast or alert here if needed, but for now just throw
      throw new Error(errorMessage);
    }
  };

  const checkAuth = async (retries = 3) => {
    try {
      const token = localStorage.getItem('eletroar_token');
      const headers: any = { 'Accept': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/auth/me', { 
        credentials: 'include',
        headers
      });
      
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      
      const data = await res.json();
      if (data.authenticated) {
        setUser(data.user);
      } else {
        localStorage.removeItem('eletroar_token');
        setUser(null);
      }
      setIsAuthChecking(false);
    } catch (err) {
      console.error("[AUTH CHECK FAILED]", err);
      if (retries > 0) {
        console.log(`Retrying auth check... (${retries} retries left)`);
        setTimeout(() => checkAuth(retries - 1), 2000);
      } else {
        setIsAuthChecking(false);
      }
    }
  };

  const handleLogout = async () => {
    try {
      const token = localStorage.getItem('eletroar_token');
      const headers: any = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      await fetch('/api/auth/logout', { 
        method: 'POST', 
        credentials: 'include',
        headers
      });
      localStorage.removeItem('eletroar_token');
      setUser(null);
    } catch (err) {
      console.error("Logout failed", err);
    }
  };

  useEffect(() => {
    checkAuth();
    
    // Check if cookies are enabled
    if (!navigator.cookieEnabled) {
      console.error("Cookies are disabled in this browser.");
    }
  }, []);

  // Search logic
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (searchQuery.length > 1) {
        apiFetch(`/api/search?q=${encodeURIComponent(searchQuery)}`)
          .then(res => res.json())
          .then(data => {
            if (Array.isArray(data)) {
              setSearchResults(data);
            } else {
              setSearchResults([]);
            }
          })
          .catch(() => setSearchResults([]));
      } else {
        setSearchResults([]);
      }
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery]);

  const fetchHistory = async (customerId: number) => {
    try {
      const res = await apiFetch(`/api/customers/${customerId}/history`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setHistory(data);
      } else {
        setHistory([]);
      }
    } catch (error) {
      console.error("Error fetching history:", error);
      setHistory([]);
    }
  };

  const toggleServiceStatus = async (id: number, customerId?: number) => {
    try {
      const res = await apiFetch(`/api/services/${id}/toggle-status`, { method: 'PATCH' });
      if (res.ok) {
        if (customerId) {
          fetchHistory(customerId);
        }
      }
    } catch (error) {
      console.error("Error toggling status:", error);
    }
  };

  const handleSelectCustomer = (result: SearchResult) => {
    setSelectedCustomer(result);
    fetchHistory(result.customer_id);
  };

  const handleDeleteCustomer = async (id: number) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Excluir Cliente',
      message: 'Tem certeza que deseja excluir este cliente? Todos os veículos e serviços vinculados também serão excluídos.',
      onConfirm: async () => {
        try {
          const res = await apiFetch(`/api/customers/${id}`, { method: 'DELETE' });
          if (res.ok) {
            setRefreshCustomersKey(prev => prev + 1);
            if (selectedCustomer?.customer_id === id) {
              setSelectedCustomer(null);
              setHistory([]);
            }
          }
        } catch (error) {
          console.error("Error deleting customer:", error);
        }
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  if (isAuthChecking) {
    return (
      <div className="min-h-screen bg-[#F5F5F5] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 bg-emerald-600 rounded-xl flex items-center justify-center text-white animate-pulse">
            <Wrench size={24} />
          </div>
          <p className="text-sm font-bold text-black/40 animate-pulse">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage onLogin={(u) => setUser(u)} />;
  }

  return (
    <div className="min-h-screen bg-[#F5F5F5] text-[#1A1A1A] font-sans pb-20 md:pb-0">
      <AnimatePresence>
      </AnimatePresence>

      <>
        {/* Top Bar for Mobile */}
        <header className="md:hidden bg-white border-b border-black/5 p-4 sticky top-0 z-50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center text-white">
              <Wrench size={18} />
            </div>
            <h1 className="font-bold text-lg tracking-tight">EletroAr</h1>
          </div>
          <button 
            onClick={handleLogout}
            className="p-2 text-black/40 hover:text-red-600 transition-colors"
          >
            Sair
          </button>
        </header>

        {/* Sidebar / Bottom Nav */}
        <nav className="fixed bottom-0 left-0 w-full bg-white border-t border-black/5 p-2 flex flex-row justify-around items-center z-50 md:fixed md:left-0 md:top-0 md:h-full md:w-64 md:border-r md:border-t-0 md:p-6 md:flex-col md:gap-8 md:justify-start">
          <div className="hidden md:flex items-center gap-3 px-2">
            <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center text-white">
              <Wrench size={24} />
            </div>
            <h1 className="font-bold text-xl tracking-tight">EletroAr</h1>
          </div>

          <div className="flex flex-row w-full justify-around md:flex-col md:gap-2">
            <NavButton 
              active={activeTab === 'search'} 
              onClick={() => setActiveTab('search')}
              icon={<Search size={20} />}
              label="Buscar"
            />
            <NavButton 
              active={activeTab === 'customers'} 
              onClick={() => setActiveTab('customers')}
              icon={<User size={20} />}
              label="Clientes"
            />
            <NavButton 
              active={activeTab === 'services'} 
              onClick={() => setActiveTab('services')}
              icon={<Wrench size={20} />}
              label="Serviços"
            />
            <NavButton 
              active={activeTab === 'payable'} 
              onClick={() => setActiveTab('payable')}
              icon={<CreditCard size={20} />}
              label="Contas"
            />
            <NavButton 
              active={activeTab === 'reports'} 
              onClick={() => setActiveTab('reports')}
              icon={<FileText size={20} />}
              label="Relatórios"
            />
            <NavButton 
              active={activeTab === 'users'} 
              onClick={() => setActiveTab('users')}
              icon={<UserPlus size={20} />}
              label="Usuários"
            />
            
            <div className="hidden md:block mt-auto pt-6 border-t border-black/5">
              <button 
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-red-500 hover:bg-red-50 transition-all font-bold text-sm"
              >
                <LogOut size={20} />
                Sair
              </button>
            </div>
            
            <button 
              onClick={handleLogout}
              className="md:hidden flex flex-col items-center justify-center gap-1 px-2 py-1 text-red-500"
            >
              <LogOut size={20} />
              <span className="text-[10px] font-bold uppercase tracking-wider">Sair</span>
            </button>
          </div>
        </nav>

        {/* Main Content */}
        <main className="md:ml-64 p-4 md:p-10 pb-24 md:pb-10">
          <div className="max-w-7xl mx-auto">
            {activeTab === 'search' && (
              <div className="max-w-4xl mx-auto">
                <header className="mb-6 md:mb-10">
                  <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-1 md:mb-2 text-center md:text-left">Busca Inteligente</h2>
                  <p className="text-sm md:text-base text-black/50 text-center md:text-left">Localize clientes por nome, placa, telefone ou modelo.</p>
                </header>

                <div className="relative mb-6 md:mb-8">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-black/30" size={20} />
                  <input 
                    type="text"
                    placeholder="Ex: ABC-1234, João Silva..."
                    className="w-full bg-white border border-black/5 rounded-2xl py-4 md:py-5 pl-12 md:pl-14 pr-4 md:pr-6 text-base md:text-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>

                <div className="grid gap-4">
                  {searchResults.map((result) => (
                    <button
                      key={`${result.customer_id}-${result.vehicle_id}`}
                      onClick={() => handleSelectCustomer(result)}
                      className="w-full bg-white p-4 md:p-6 rounded-2xl border border-black/5 hover:border-emerald-500/50 transition-all flex items-center justify-between group text-left"
                    >
                      <div className="flex flex-col sm:flex-row gap-4 md:gap-6 sm:items-center">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 md:w-12 md:h-12 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600">
                            <Car size={20} />
                          </div>
                          <div>
                            <div className="font-bold text-base md:text-lg">{result.plate}</div>
                            <div className="text-black/50 text-xs md:text-sm">{result.brand} {result.model}</div>
                          </div>
                        </div>
                        <div className="hidden sm:block h-10 w-px bg-black/5" />
                        <div>
                          <div className="font-medium text-sm md:text-base">{result.name}</div>
                          <div className="flex flex-col sm:flex-row sm:gap-2">
                            <span className="text-black/50 text-xs md:text-sm">{result.phone}</span>
                            {result.cpf_cnpj && <span className="text-black/30 text-[10px] md:text-xs font-mono">{result.cpf_cnpj}</span>}
                          </div>
                        </div>
                      </div>
                      <ChevronRight className="text-black/20 group-hover:text-emerald-500 transition-colors" />
                    </button>
                  ))}
                </div>

                {selectedCustomer && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="mt-12 bg-white rounded-3xl border border-black/5 overflow-hidden shadow-xl"
                  >
                    <div className="bg-emerald-600 p-6 md:p-8 text-white flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                      <div>
                        <div className="text-emerald-100 text-[10px] md:text-sm uppercase tracking-wider font-bold mb-1">Cliente Selecionado</div>
                        <h3 className="text-2xl md:text-3xl font-bold">{selectedCustomer.name}</h3>
                        <div className="flex flex-wrap gap-2 md:gap-4 mt-3 md:mt-4 text-emerald-50">
                          <span className="flex items-center gap-2 bg-white/10 px-3 py-1 rounded-full text-xs md:text-sm">
                            <Phone size={12} /> {selectedCustomer.phone}
                          </span>
                          {selectedCustomer.cpf_cnpj && (
                            <span className="flex items-center gap-2 bg-white/10 px-3 py-1 rounded-full text-xs md:text-sm font-mono">
                              {selectedCustomer.cpf_cnpj}
                            </span>
                          )}
                          <span className="flex items-center gap-2 bg-white/10 px-3 py-1 rounded-full text-xs md:text-sm">
                            <Car size={12} /> {selectedCustomer.plate}
                          </span>
                        </div>
                      </div>
                      <button 
                        onClick={() => setIsNewServiceModalOpen(true)}
                        className="w-full md:w-auto bg-white text-emerald-600 px-6 py-2 md:py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-emerald-50 transition-colors text-sm md:text-base"
                      >
                        <Plus size={18} /> Novo Serviço
                      </button>
                    </div>

                    <div className="p-4 md:p-8">
                      <div className="flex items-center gap-2 mb-6 text-black/40 font-bold text-sm uppercase tracking-widest">
                        <History size={16} /> Histórico de Serviços
                      </div>
                      
                      <div className="space-y-4">
                        {history.length === 0 ? (
                          <div className="text-center py-10 text-black/30 italic">
                            Nenhum serviço registrado para este veículo.
                          </div>
                        ) : (
                          history.map((s) => (
                            <div key={s.id} className="flex flex-col sm:flex-row gap-2 sm:gap-6 p-4 rounded-xl hover:bg-black/[0.02] transition-colors border border-transparent hover:border-black/5">
                              <div className="text-xs md:text-sm font-mono text-black/40 pt-1">
                                {new Date(s.service_date).toLocaleDateString('pt-BR')}
                              </div>
                              <div className="flex-1">
                                <div className="font-bold text-sm md:text-base">{s.description}</div>
                                <div className="text-sm text-black/50 mt-1">
                                  <button 
                                    onClick={() => toggleServiceStatus(s.id, selectedCustomer.customer_id)}
                                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold transition-colors ${
                                      s.status === 'completed' 
                                        ? 'text-emerald-600 bg-emerald-50 hover:bg-emerald-100' 
                                        : 'text-amber-600 bg-amber-50 hover:bg-amber-100'
                                    }`}
                                  >
                                    {s.status === 'completed' ? <CheckCircle2 size={10} /> : <AlertCircle size={10} />}
                                    {s.status === 'completed' ? 'Concluído' : 'Pendente'}
                                  </button>
                                </div>
                              </div>
                              <div className="font-mono font-bold text-emerald-600 text-sm md:text-base">
                                R$ {(s.total_price || 0).toFixed(2)}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}
              </div>
            )}

            {activeTab === 'payable' && (
              <PayableTab 
                onOpenModal={() => setIsNewPayableModalOpen(true)} 
                onEdit={(p) => setEditingPayable(p)}
                refreshTrigger={refreshPayablesKey}
                apiFetch={apiFetch}
              />
            )}
            {activeTab === 'reports' && <ReportsTab apiFetch={apiFetch} />}
            {activeTab === 'customers' && (
              <CustomersTab 
                refreshTrigger={refreshCustomersKey}
                onOpenModal={() => setIsNewCustomerModalOpen(true)} 
                onViewHistory={(c) => setViewingHistoryCustomer(c)}
                onEdit={(c) => setEditingCustomer(c)}
                onDelete={handleDeleteCustomer}
                apiFetch={apiFetch}
              />
            )}
            {activeTab === 'services' && (
              <ServicesTab 
                onEdit={(id) => setEditingServiceId(id)}
                onNewService={() => setActiveTab('search')}
                refreshTrigger={refreshServicesKey}
                apiFetch={apiFetch}
              />
            )}
            {activeTab === 'users' && (
              <UsersTab apiFetch={apiFetch} />
            )}
          </div>
        </main>

        <NewCustomerModal 
          isOpen={isNewCustomerModalOpen} 
          onClose={() => setIsNewCustomerModalOpen(false)}
          onSuccess={(customerId, vehicleId) => {
            if (vehicleId) {
              // Fetch customer info to populate selectedCustomer
              apiFetch(`/api/customers/${customerId}`).then(res => res.json()).then(customer => {
                // We also need the vehicle info for the search result type
                apiFetch(`/api/customers/${customerId}/vehicles`).then(res => res.json()).then(vehicles => {
                  const vehicle = vehicles.find((v: any) => v.id === vehicleId);
                  if (vehicle) {
                    setSelectedCustomer({
                      customer_id: customerId,
                      name: customer.name,
                      phone: customer.phone,
                      cpf_cnpj: customer.cpf_cnpj,
                      vehicle_id: vehicleId,
                      plate: vehicle.plate,
                      brand: vehicle.brand,
                      model: vehicle.model,
                      year: vehicle.year,
                      color: vehicle.color
                    });
                    setIsNewServiceModalOpen(true);
                    setActiveTab('search');
                  }
                });
              });
            } else {
              setRefreshCustomersKey(prev => prev + 1);
              setActiveTab('customers');
            }
          }}
          apiFetch={apiFetch}
        />

        <NewServiceModal 
          isOpen={isNewServiceModalOpen} 
          vehicleId={selectedCustomer?.vehicle_id || 0}
          onClose={() => setIsNewServiceModalOpen(false)}
          onSuccess={() => {
            if (selectedCustomer) fetchHistory(selectedCustomer.customer_id);
            setRefreshServicesKey(prev => prev + 1);
          }}
          apiFetch={apiFetch}
        />

        <NewPayableModal 
          isOpen={isNewPayableModalOpen} 
          onClose={() => setIsNewPayableModalOpen(false)}
          onSuccess={() => setRefreshPayablesKey(prev => prev + 1)}
          apiFetch={apiFetch}
        />

        <EditPayableModal 
          isOpen={!!editingPayable}
          payable={editingPayable}
          onClose={() => setEditingPayable(null)}
          onSuccess={() => setRefreshPayablesKey(prev => prev + 1)}
          onConfirmDelete={(payable) => {
            setConfirmDialog({
              isOpen: true,
              title: 'Excluir Conta',
              message: 'Tem certeza que deseja excluir esta conta?',
              onConfirm: async () => {
                try {
                  const res = await apiFetch(`/api/accounts-payable/${payable.id}`, { method: 'DELETE' });
                  if (res.ok) {
                    setRefreshPayablesKey(prev => prev + 1);
                    setEditingPayable(null);
                  }
                } catch (error) {
                  console.error("Error deleting payable:", error);
                }
                setConfirmDialog(prev => ({ ...prev, isOpen: false }));
              }
            });
          }}
          apiFetch={apiFetch}
        />

        <EditServiceModal 
          isOpen={!!editingServiceId}
          serviceId={editingServiceId}
          onClose={() => setEditingServiceId(null)}
          onSuccess={() => setRefreshServicesKey(prev => prev + 1)}
          onConfirmDelete={(id) => {
            setConfirmDialog({
              isOpen: true,
              title: 'Excluir OS',
              message: 'Tem certeza que deseja excluir esta OS?',
              onConfirm: async () => {
                try {
                  const res = await apiFetch(`/api/services/${id}`, { method: 'DELETE' });
                  if (res.ok) {
                    setRefreshServicesKey(prev => prev + 1);
                    setEditingServiceId(null);
                    if (selectedCustomer) fetchHistory(selectedCustomer.customer_id);
                  }
                } catch (error) {
                  console.error("Error deleting service:", error);
                }
                setConfirmDialog(prev => ({ ...prev, isOpen: false }));
              }
            });
          }}
          apiFetch={apiFetch}
        />

        <CustomerHistoryModal 
          isOpen={!!viewingHistoryCustomer}
          customer={viewingHistoryCustomer}
          onClose={() => setViewingHistoryCustomer(null)}
          onNewService={(vehicleId) => {
            setSelectedCustomer({
              customer_id: viewingHistoryCustomer?.id || 0,
              name: viewingHistoryCustomer?.name || '',
              phone: viewingHistoryCustomer?.phone || '',
              vehicle_id: vehicleId,
              plate: '', brand: '', model: '', year: 0, color: ''
            });
            setIsNewServiceModalOpen(true);
          }}
          apiFetch={apiFetch}
        />

        <EditCustomerModal 
          isOpen={!!editingCustomer}
          customer={editingCustomer}
          onClose={() => setEditingCustomer(null)}
          onSuccess={() => {
            setRefreshCustomersKey(prev => prev + 1);
            setActiveTab('customers');
          }}
          onConfirmDeleteVehicle={(id) => {
            setConfirmDialog({
              isOpen: true,
              title: 'Excluir Veículo',
              message: 'Tem certeza que deseja excluir este veículo? Todos os serviços vinculados também serão excluídos.',
              onConfirm: async () => {
                try {
                  const res = await apiFetch(`/api/vehicles/${id}`, { method: 'DELETE' });
                  if (res.ok) {
                    setRefreshCustomersKey(prev => prev + 1);
                    setEditingCustomer(null);
                  }
                } catch (error) {
                  console.error("Error deleting vehicle:", error);
                }
                setConfirmDialog(prev => ({ ...prev, isOpen: false }));
              }
            });
          }}
          apiFetch={apiFetch}
        />

        <ConfirmModal 
          isOpen={confirmDialog.isOpen}
          title={confirmDialog.title}
          message={confirmDialog.message}
          onConfirm={confirmDialog.onConfirm}
          onClose={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
        />
      </>
    </div>
  );
}

function CustomerHistoryModal({ isOpen, customer, onClose, onNewService, apiFetch }: { isOpen: boolean, customer: Customer | null, onClose: () => void, onNewService: (vehicleId: number) => void, apiFetch: (url: string, options?: RequestInit) => Promise<Response> }) {
  const [history, setHistory] = useState<Service[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [showVehicleSelector, setShowVehicleSelector] = useState(false);

  const fetchHistory = async () => {
    if (!customer) return;
    try {
      const res = await apiFetch(`/api/customers/${customer.id}/history`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setHistory(data);
      } else {
        setHistory([]);
      }
    } catch (error) {
      console.error("Error fetching history:", error);
      setHistory([]);
    }
  };

  const fetchVehicles = async () => {
    if (!customer) return;
    try {
      const res = await apiFetch(`/api/customers/${customer.id}/vehicles`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setVehicles(data);
      }
    } catch (error) {
      console.error("Error fetching vehicles:", error);
    }
  };

  const toggleStatus = async (id: number) => {
    const res = await apiFetch(`/api/services/${id}/toggle-status`, { method: 'PATCH' });
    if (res.ok) {
      fetchHistory();
    }
  };

  useEffect(() => {
    if (isOpen && customer) {
      fetchHistory();
      fetchVehicles();
    }
  }, [isOpen, customer]);

  if (!isOpen || !customer) return null;

  const handleNewServiceClick = () => {
    if (vehicles.length === 1) {
      onNewService(vehicles[0].id);
      onClose();
    } else {
      setShowVehicleSelector(true);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden"
      >
        <div className="bg-emerald-600 p-6 text-white flex justify-between items-center">
          <div>
            <h3 className="text-xl font-bold">{customer.name}</h3>
            <p className="text-emerald-100 text-sm">{customer.phone}</p>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={handleNewServiceClick}
              className="bg-white/20 hover:bg-white/30 px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-colors"
            >
              <Plus size={18} /> Novo Serviço
            </button>
            <button onClick={onClose} className="hover:bg-white/10 p-2 rounded-lg transition-colors">
              <Plus className="rotate-45" size={24} />
            </button>
          </div>
        </div>
        
        <div className="p-8 max-h-[60vh] overflow-y-auto">
          {showVehicleSelector ? (
            <div>
              <div className="flex items-center gap-2 mb-6 text-black/40 font-bold text-sm uppercase tracking-widest">
                <Car size={16} /> Selecione o Veículo
              </div>
              <div className="grid gap-4">
                {vehicles.map(v => (
                  <button
                    key={v.id}
                    onClick={() => {
                      onNewService(v.id);
                      onClose();
                      setShowVehicleSelector(false);
                    }}
                    className="w-full p-4 rounded-xl border border-black/5 hover:border-emerald-500/50 hover:bg-emerald-50 transition-all flex items-center justify-between group text-left"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600">
                        <Car size={20} />
                      </div>
                      <div>
                        <div className="font-bold">{v.plate}</div>
                        <div className="text-black/50 text-sm">{v.brand} {v.model}</div>
                      </div>
                    </div>
                    <ChevronRight className="text-black/20 group-hover:text-emerald-500 transition-colors" />
                  </button>
                ))}
                <button 
                  onClick={() => setShowVehicleSelector(false)}
                  className="mt-4 text-black/40 font-bold text-sm hover:text-black transition-colors"
                >
                  Voltar ao Histórico
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-6 text-black/40 font-bold text-sm uppercase tracking-widest">
                <History size={16} /> Histórico de Serviços
              </div>
              
              <div className="space-y-4">
                {history.length === 0 ? (
                  <div className="text-center py-10 text-black/30 italic">
                    Nenhum serviço registrado para este cliente.
                  </div>
                ) : (
                  history.map((s) => (
                    <div key={s.id} className="flex gap-6 p-4 rounded-xl border border-black/5 items-center">
                      <div className="text-sm font-mono text-black/40">
                        {new Date(s.service_date).toLocaleDateString('pt-BR')}
                      </div>
                      <div className="flex-1">
                        <div className="font-bold">{s.description}</div>
                        <div className="text-xs text-black/40">{s.plate} • {s.model}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono font-bold text-emerald-600 mb-1">
                          R$ {s.total_price.toFixed(2)}
                        </div>
                        <button 
                          onClick={() => toggleStatus(s.id)}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold transition-colors ${
                            s.status === 'completed' 
                              ? 'text-emerald-600 bg-emerald-50 hover:bg-emerald-100' 
                              : 'text-amber-600 bg-amber-50 hover:bg-amber-100'
                          }`}
                        >
                          {s.status === 'completed' ? <CheckCircle2 size={10} /> : <AlertCircle size={10} />}
                          {s.status === 'completed' ? 'Concluído' : 'Pendente'}
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>
        <div className="p-6 bg-black/[0.02] border-t border-black/5 flex justify-end">
          <button 
            onClick={onClose}
            className="bg-black text-white px-6 py-2 rounded-xl font-bold hover:bg-black/80 transition-colors"
          >
            Fechar
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function NewServiceModal({ isOpen, vehicleId, onClose, onSuccess, apiFetch }: { isOpen: boolean, vehicleId: number, onClose: () => void, onSuccess: () => void, apiFetch: (url: string, options?: RequestInit) => Promise<Response> }) {
  const [formData, setFormData] = useState({
    vehicle_id: vehicleId,
    description: '',
    total_price: 0,
    parts: [] as { name: string, quantity: number, price: number }[]
  });

  useEffect(() => {
    setFormData(prev => ({ ...prev, vehicle_id: vehicleId }));
  }, [vehicleId]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiFetch('/api/services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      if (res.ok) {
        onSuccess();
        onClose();
        setFormData({ vehicle_id: vehicleId, description: '', total_price: 0, parts: [] });
      }
    } catch (error) {
      console.error("Error creating service:", error);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white w-[95%] max-w-xl rounded-3xl shadow-2xl overflow-hidden"
      >
        <div className="bg-emerald-600 p-4 md:p-6 text-white flex justify-between items-center">
          <h3 className="text-lg md:text-xl font-bold">Lançar Novo Serviço</h3>
          <button onClick={onClose} className="hover:bg-white/10 p-2 rounded-lg transition-colors">
            <Plus className="rotate-45" size={24} />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-4 md:p-8 space-y-4 md:space-y-6">
          <div>
            <label className="block text-sm font-medium mb-1">Descrição do Serviço</label>
            <textarea 
              required
              rows={3}
              className="w-full border border-black/10 rounded-xl px-4 py-2 focus:ring-2 focus:ring-emerald-500/20 outline-none resize-none"
              placeholder="Ex: Carga de gás, troca de compressor..."
              value={formData.description}
              onChange={e => setFormData({...formData, description: e.target.value})}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Valor Total (R$)</label>
            <input 
              type="number"
              step="0.01"
              required
              className="w-full border border-black/10 rounded-xl px-4 py-2 focus:ring-2 focus:ring-emerald-500/20 outline-none"
              value={formData.total_price}
              onChange={e => setFormData({...formData, total_price: parseFloat(e.target.value)})}
            />
          </div>

          <div className="flex justify-end gap-4 mt-6">
            <button 
              type="button"
              onClick={onClose}
              className="px-6 py-2 text-black/50 font-bold hover:text-black transition-colors"
            >
              Cancelar
            </button>
            <button 
              type="submit"
              className="bg-emerald-600 text-white px-8 py-2 rounded-xl font-bold hover:bg-emerald-700 transition-colors"
            >
              Finalizar Serviço
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

function NewPayableModal({ isOpen, onClose, onSuccess, apiFetch }: { isOpen: boolean, onClose: () => void, onSuccess: () => void, apiFetch: (url: string, options?: RequestInit) => Promise<Response> }) {
  const [formData, setFormData] = useState({
    supplier: '',
    description: '',
    amount: 0,
    due_date: ''
  });

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiFetch('/api/accounts-payable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      if (res.ok) {
        onSuccess();
        onClose();
        setFormData({ supplier: '', description: '', amount: 0, due_date: '' });
      }
    } catch (error) {
      console.error("Error creating payable:", error);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white w-[95%] max-w-lg rounded-3xl shadow-2xl overflow-hidden"
      >
        <div className="bg-emerald-600 p-4 md:p-6 text-white flex justify-between items-center">
          <h3 className="text-lg md:text-xl font-bold">Nova Conta a Pagar</h3>
          <button onClick={onClose} className="hover:bg-white/10 p-2 rounded-lg transition-colors">
            <Plus className="rotate-45" size={24} />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-4 md:p-8 space-y-4 md:space-y-6">
          <div>
            <label className="block text-sm font-medium mb-1">Fornecedor</label>
            <input 
              required
              className="w-full border border-black/10 rounded-xl px-4 py-2 focus:ring-2 focus:ring-emerald-500/20 outline-none"
              value={formData.supplier}
              onChange={e => setFormData({...formData, supplier: e.target.value})}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Descrição</label>
            <input 
              className="w-full border border-black/10 rounded-xl px-4 py-2 focus:ring-2 focus:ring-emerald-500/20 outline-none"
              value={formData.description}
              onChange={e => setFormData({...formData, description: e.target.value})}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Valor (R$)</label>
              <input 
                type="number"
                step="0.01"
                required
                className="w-full border border-black/10 rounded-xl px-4 py-2 focus:ring-2 focus:ring-emerald-500/20 outline-none"
                value={formData.amount}
                onChange={e => setFormData({...formData, amount: parseFloat(e.target.value)})}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Vencimento</label>
              <input 
                type="date"
                required
                className="w-full border border-black/10 rounded-xl px-4 py-2 focus:ring-2 focus:ring-emerald-500/20 outline-none"
                value={formData.due_date}
                onChange={e => setFormData({...formData, due_date: e.target.value})}
              />
            </div>
          </div>

          <div className="col-span-2 flex justify-end gap-4 mt-6">
            <button 
              type="button"
              onClick={onClose}
              className="px-6 py-2 text-black/50 font-bold hover:text-black transition-colors"
            >
              Cancelar
            </button>
            <button 
              type="submit"
              className="bg-emerald-600 text-white px-8 py-2 rounded-xl font-bold hover:bg-emerald-700 transition-colors"
            >
              Salvar Conta
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

function ConfirmModal({ isOpen, title, message, onConfirm, onClose }: { isOpen: boolean, title: string, message: string, onConfirm: () => void, onClose: () => void }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white w-[95%] max-w-sm rounded-3xl shadow-2xl overflow-hidden p-6 md:p-8 text-center"
      >
        <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
          <AlertCircle size={32} />
        </div>
        <h3 className="text-xl font-bold mb-2">{title}</h3>
        <p className="text-black/50 mb-8">{message}</p>
        <div className="flex gap-4">
          <button 
            onClick={onClose}
            className="flex-1 px-6 py-3 border border-black/10 rounded-xl font-bold hover:bg-black/[0.02] transition-colors"
          >
            Cancelar
          </button>
          <button 
            onClick={onConfirm}
            className="flex-1 px-6 py-3 bg-red-500 text-white rounded-xl font-bold hover:bg-red-600 transition-colors"
          >
            Excluir
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function EditPayableModal({ isOpen, payable, onClose, onSuccess, onConfirmDelete, apiFetch }: { isOpen: boolean, payable: AccountPayable | null, onClose: () => void, onSuccess: () => void, onConfirmDelete: (payable: AccountPayable) => void, apiFetch: (url: string, options?: RequestInit) => Promise<Response> }) {
  const [formData, setFormData] = useState({
    supplier: '',
    description: '',
    amount: 0,
    due_date: '',
    paid: false
  });

  useEffect(() => {
    if (payable) {
      setFormData({
        supplier: payable.supplier,
        description: payable.description || '',
        amount: payable.amount,
        due_date: payable.due_date.split('T')[0],
        paid: !!payable.paid
      });
    }
  }, [payable]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!payable) return;

    try {
      const res = await apiFetch(`/api/accounts-payable/${payable.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      if (res.ok) {
        onSuccess();
        onClose();
      }
    } catch (error) {
      console.error("Error updating payable:", error);
    }
  };

  if (!isOpen || !payable) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white w-[95%] max-w-lg rounded-3xl shadow-2xl overflow-hidden"
      >
        <div className="bg-emerald-600 p-4 md:p-6 text-white flex justify-between items-center">
          <h3 className="text-lg md:text-xl font-bold">Editar Conta a Pagar</h3>
          <button onClick={onClose} className="hover:bg-white/10 p-2 rounded-lg transition-colors">
            <Plus className="rotate-45" size={24} />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-4 md:p-8 space-y-4 md:space-y-6">
          <div>
            <label className="block text-sm font-medium mb-1">Fornecedor</label>
            <input 
              required
              className="w-full border border-black/10 rounded-xl px-4 py-2 focus:ring-2 focus:ring-emerald-500/20 outline-none"
              value={formData.supplier}
              onChange={e => setFormData({...formData, supplier: e.target.value})}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Descrição</label>
            <input 
              className="w-full border border-black/10 rounded-xl px-4 py-2 focus:ring-2 focus:ring-emerald-500/20 outline-none"
              value={formData.description}
              onChange={e => setFormData({...formData, description: e.target.value})}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Valor (R$)</label>
              <input 
                type="number"
                step="0.01"
                required
                className="w-full border border-black/10 rounded-xl px-4 py-2 focus:ring-2 focus:ring-emerald-500/20 outline-none"
                value={formData.amount}
                onChange={e => setFormData({...formData, amount: parseFloat(e.target.value)})}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Vencimento</label>
              <input 
                type="date" 
                required
                className="w-full border border-black/10 rounded-xl px-4 py-2 focus:ring-2 focus:ring-emerald-500/20 outline-none"
                value={formData.due_date}
                onChange={e => setFormData({...formData, due_date: e.target.value})}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input 
              type="checkbox"
              id="paid"
              checked={formData.paid}
              onChange={e => setFormData({...formData, paid: e.target.checked})}
              className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500"
            />
            <label htmlFor="paid" className="text-sm font-medium">Marcar como Pago</label>
          </div>

          <div className="flex justify-between gap-4 mt-6">
            <button 
              type="button"
              onClick={() => onConfirmDelete(payable)}
              className="px-6 py-2 text-red-500 font-bold hover:text-red-700 transition-colors flex items-center gap-2"
            >
              <Trash2 size={18} /> Excluir
            </button>
            <div className="flex gap-4">
              <button 
                type="button"
                onClick={onClose}
                className="px-6 py-2 text-black/50 font-bold hover:text-black transition-colors"
              >
                Cancelar
              </button>
              <button 
                type="submit"
                className="bg-emerald-600 text-white px-8 py-2 rounded-xl font-bold hover:bg-emerald-700 transition-colors"
              >
                Salvar
              </button>
            </div>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

function EditServiceModal({ isOpen, serviceId, onClose, onSuccess, onConfirmDelete, apiFetch }: { isOpen: boolean, serviceId: number | null, onClose: () => void, onSuccess: () => void, onConfirmDelete: (id: number) => void, apiFetch: (url: string, options?: RequestInit) => Promise<Response> }) {
  const [formData, setFormData] = useState({
    description: '',
    total_price: 0,
    parts: [] as { name: string, quantity: number, price: number }[]
  });
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (serviceId && isOpen) {
      fetchService();
    }
  }, [serviceId, isOpen]);

  const fetchService = async () => {
    setIsLoading(true);
    try {
      const res = await apiFetch(`/api/services/${serviceId}`);
      if (!res.ok) throw new Error('Falha ao carregar serviço');
      const data = await res.json();
      setFormData({
        description: data.description || '',
        total_price: data.total_price || 0,
        parts: data.parts || []
      });
    } catch (error) {
      console.error("Error fetching service:", error);
      alert("Erro ao carregar os dados do serviço. Verifique sua conexão.");
      onClose();
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!serviceId) return;
    const res = await apiFetch(`/api/services/${serviceId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData)
    });
    if (res.ok) {
      onSuccess();
      onClose();
    }
  };

  if (!isOpen || !serviceId) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white w-[95%] max-w-xl rounded-3xl shadow-2xl overflow-hidden"
      >
        <div className="bg-emerald-600 p-4 md:p-6 text-white flex justify-between items-center">
          <h3 className="text-lg md:text-xl font-bold">Editar Ordem de Serviço</h3>
          <button onClick={onClose} className="hover:bg-white/10 p-2 rounded-lg transition-colors">
            <Plus className="rotate-45" size={24} />
          </button>
        </div>
        
        {isLoading ? (
          <div className="p-8 text-center text-black/50 italic">Carregando dados...</div>
        ) : (
          <form onSubmit={handleSubmit} className="p-4 md:p-8 space-y-4 md:space-y-6">
            <div>
              <label className="block text-sm font-medium mb-1">Descrição do Serviço</label>
              <textarea 
                required
                rows={3}
                className="w-full border border-black/10 rounded-xl px-4 py-2 focus:ring-2 focus:ring-emerald-500/20 outline-none resize-none"
                value={formData.description}
                onChange={e => setFormData({...formData, description: e.target.value})}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Valor Total (R$)</label>
              <input 
                type="number"
                step="0.01"
                required
                className="w-full border border-black/10 rounded-xl px-4 py-2 focus:ring-2 focus:ring-emerald-500/20 outline-none"
                value={formData.total_price}
                onChange={e => setFormData({...formData, total_price: parseFloat(e.target.value)})}
              />
            </div>

            <div className="flex justify-between gap-4 mt-6">
              <button 
                type="button"
                onClick={() => onConfirmDelete(serviceId)}
                className="px-6 py-2 text-red-500 font-bold hover:text-red-700 transition-colors flex items-center gap-2"
              >
                <Trash2 size={18} /> Excluir
              </button>
              <div className="flex gap-4">
                <button 
                  type="button"
                  onClick={onClose}
                  className="px-6 py-2 text-black/50 font-bold hover:text-black transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="bg-emerald-600 text-white px-8 py-2 rounded-xl font-bold hover:bg-emerald-700 transition-colors"
                >
                  Salvar Alterações
                </button>
              </div>
            </div>
          </form>
        )}
      </motion.div>
    </div>
  );
}

function NavButton({ active, onClick, icon, label, className = "" }: { active: boolean, onClick: () => void, icon: ReactNode, label: string, className?: string }) {
  return (
    <button 
      onClick={onClick}
      className={`flex flex-col md:flex-row items-center gap-1 md:gap-4 px-3 py-2 md:px-4 md:py-3 rounded-xl font-medium transition-all ${
        active 
          ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20' 
          : 'text-black/50 hover:bg-black/5 hover:text-black'
      } ${className}`}
    >
      {icon}
      <span className="text-[10px] md:text-base">{label}</span>
    </button>
  );
}

function PayableTab({ onOpenModal, onEdit, refreshTrigger, apiFetch }: { onOpenModal: () => void, onEdit: (p: AccountPayable) => void, refreshTrigger?: number, apiFetch: (url: string, options?: RequestInit) => Promise<Response> }) {
  const [payables, setPayables] = useState<AccountPayable[]>([]);
  const [filter, setFilter] = useState({ start: '', end: '', supplier: '' });

  const fetchPayables = async () => {
    try {
      const params = new URLSearchParams(filter);
      const res = await apiFetch(`/api/accounts-payable?${params}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setPayables(data);
      } else {
        setPayables([]);
      }
    } catch (error) {
      console.error("Error fetching payables:", error);
      setPayables([]);
    }
  };

  const togglePaid = async (id: number) => {
    const res = await apiFetch(`/api/accounts-payable/${id}/toggle-paid`, { method: 'PATCH' });
    if (res.ok) {
      fetchPayables();
    }
  };

  useEffect(() => {
    fetchPayables();
  }, [filter, refreshTrigger]);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-5xl mx-auto"
    >
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end mb-6 md:mb-10 gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-1 md:mb-2">Contas a Pagar</h2>
          <p className="text-sm md:text-base text-black/50">Gerencie seus compromissos financeiros com fornecedores.</p>
        </div>
        <button 
          onClick={onOpenModal}
          className="w-full md:w-auto bg-emerald-600 text-white px-6 py-2 md:py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-600/20 text-sm md:text-base"
        >
          <Plus size={18} /> Nova Conta
        </button>
      </header>

      <div className="bg-white p-4 md:p-6 rounded-2xl border border-black/5 mb-6 md:mb-8 flex flex-col sm:flex-row gap-4 items-start sm:items-end">
        <button 
          onClick={() => {
            const today = new Date().toISOString().split('T')[0];
            setFilter({...filter, start: today, end: today });
          }}
          className="w-full sm:w-auto bg-emerald-50 text-emerald-600 px-4 py-2 rounded-lg text-sm font-bold hover:bg-emerald-100 transition-colors"
        >
          Hoje
        </button>
        <div className="w-full sm:flex-1">
          <label className="block text-xs font-bold text-black/40 uppercase mb-2">Fornecedor</label>
          <input 
            type="text" 
            className="w-full bg-[#F9F9F9] border border-black/5 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            placeholder="Filtrar por nome..."
            value={filter.supplier}
            onChange={(e) => setFilter({...filter, supplier: e.target.value})}
          />
        </div>
        <div className="w-full sm:w-auto">
          <label className="block text-xs font-bold text-black/40 uppercase mb-2">Início</label>
          <input 
            type="date" 
            className="w-full bg-[#F9F9F9] border border-black/5 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            value={filter.start}
            onChange={(e) => setFilter({...filter, start: e.target.value})}
          />
        </div>
        <div className="w-full sm:w-auto">
          <label className="block text-xs font-bold text-black/40 uppercase mb-2">Fim</label>
          <input 
            type="date" 
            className="w-full bg-[#F9F9F9] border border-black/5 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            value={filter.end}
            onChange={(e) => setFilter({...filter, end: e.target.value})}
          />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-black/5 overflow-hidden">
        {/* Desktop Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-black/[0.02] border-bottom border-black/5">
                <th className="px-6 py-4 text-xs font-bold text-black/40 uppercase">Vencimento</th>
                <th className="px-6 py-4 text-xs font-bold text-black/40 uppercase">Fornecedor</th>
                <th className="hidden lg:table-cell px-6 py-4 text-xs font-bold text-black/40 uppercase">Descrição</th>
                <th className="px-6 py-4 text-xs font-bold text-black/40 uppercase text-right">Valor</th>
                <th className="px-6 py-4 text-xs font-bold text-black/40 uppercase text-center">Status</th>
                <th className="px-6 py-4 text-xs font-bold text-black/40 uppercase text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {payables.map((p) => (
                <tr key={p.id} className="hover:bg-black/[0.01] transition-colors">
                  <td className="px-6 py-4 font-mono text-sm">{new Date(p.due_date).toLocaleDateString('pt-BR')}</td>
                  <td className="px-6 py-4 font-bold text-base">{p.supplier}</td>
                  <td className="hidden lg:table-cell px-6 py-4 text-black/50 text-sm">{p.description}</td>
                  <td className="px-6 py-4 text-right font-mono font-bold text-base">R$ {(p.amount || 0).toFixed(2)}</td>
                  <td className="px-6 py-4 text-center">
                    <button 
                      onClick={() => togglePaid(p.id)}
                      className="group focus:outline-none"
                      title="Clique para alterar o status"
                    >
                      {p.paid ? (
                        <span className="inline-flex items-center gap-1 text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full text-xs font-bold group-hover:bg-emerald-100 transition-colors">
                          <CheckCircle2 size={12} /> Pago
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-amber-600 bg-amber-50 px-2 py-1 rounded-full text-xs font-bold group-hover:bg-amber-100 transition-colors">
                          <AlertCircle size={12} /> Pendente
                        </span>
                      )}
                    </button>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button 
                      onClick={() => onEdit(p)}
                      className="text-black/40 hover:text-black transition-colors"
                    >
                      <Edit size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards */}
        <div className="md:hidden divide-y divide-black/5">
          {payables.length === 0 ? (
            <div className="p-8 text-center text-black/30 italic">Nenhuma conta encontrada.</div>
          ) : (
            payables.map((p) => (
              <div key={p.id} className="p-4 space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="text-[10px] font-bold text-black/40 uppercase tracking-wider">Vencimento</div>
                    <div className="font-mono text-sm">{new Date(p.due_date).toLocaleDateString('pt-BR')}</div>
                  </div>
                  <button 
                    onClick={() => togglePaid(p.id)}
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold transition-colors ${
                      p.paid ? 'text-emerald-600 bg-emerald-50' : 'text-amber-600 bg-amber-50'
                    }`}
                  >
                    {p.paid ? <CheckCircle2 size={10} /> : <AlertCircle size={10} />}
                    {p.paid ? 'Pago' : 'Pendente'}
                  </button>
                </div>
                <div>
                  <div className="text-[10px] font-bold text-black/40 uppercase tracking-wider">Fornecedor</div>
                  <div className="font-bold">{p.supplier}</div>
                </div>
                {p.description && (
                  <div>
                    <div className="text-[10px] font-bold text-black/40 uppercase tracking-wider">Descrição</div>
                    <div className="text-sm text-black/60">{p.description}</div>
                  </div>
                )}
                <div className="flex justify-between items-center pt-2">
                  <div className="font-mono font-bold text-emerald-600">R$ {(p.amount || 0).toFixed(2)}</div>
                  <button 
                    onClick={() => onEdit(p)}
                    className="flex items-center gap-1 text-black/40 font-bold text-xs"
                  >
                    <Edit size={14} /> Editar
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </motion.div>
  );
}

function ReportsTab({ apiFetch }: { apiFetch: (url: string, options?: RequestInit) => Promise<Response> }) {
  const [reportData, setReportData] = useState<Service[]>([]);
  const [range, setRange] = useState({ start: '', end: '' });

  const fetchReport = async () => {
    if (!range.start || !range.end) return;
    try {
      console.log("Fetching report for range:", range);
      const res = await apiFetch(`/api/reports/services?start=${range.start}&end=${range.end}`);
      const data = await res.json();
      console.log("Report data received:", data);
      if (Array.isArray(data)) {
        setReportData(data);
      } else {
        setReportData([]);
      }
    } catch (error) {
      console.error("Error fetching report:", error);
      setReportData([]);
    }
  };

  const generatePDF = () => {
    const doc = new jsPDF();
    
    // Header
    doc.setFontSize(20);
    doc.setTextColor(16, 185, 129); // Emerald-600
    doc.text('EletroAr - Relatório de Serviços', 14, 22);
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    const periodText = range.start && range.end 
      ? `Período: ${new Date(range.start).toLocaleDateString('pt-BR')} até ${new Date(range.end).toLocaleDateString('pt-BR')}`
      : 'Relatório Geral';
    doc.text(periodText, 14, 30);
    
    // Stats
    const totalRevenue = reportData.reduce((acc, s) => acc + (s.total_price || 0), 0);
    doc.setFontSize(12);
    doc.setTextColor(0);
    doc.text(`Total de Serviços: ${reportData.length}`, 14, 40);
    doc.text(`Faturamento Total: R$ ${totalRevenue.toFixed(2)}`, 14, 46);
    
    // Table
    const tableData = reportData.map(s => [
      new Date(s.service_date).toLocaleDateString('pt-BR'),
      s.customer_name,
      s.plate,
      s.description,
      `R$ ${Number(s.total_price || 0).toFixed(2)}`
    ]);

    autoTable(doc, {
      startY: 55,
      head: [['Data', 'Cliente', 'Placa', 'Descrição', 'Valor']],
      body: tableData,
      headStyles: { fillColor: [16, 185, 129] },
      alternateRowStyles: { fillColor: [245, 245, 245] },
    });

    doc.save(`relatorio-eletroar-${new Date().toISOString().split('T')[0]}.pdf`);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-5xl mx-auto"
    >
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end mb-6 md:mb-10 gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-1 md:mb-2">Relatórios</h2>
          <p className="text-sm md:text-base text-black/50">Análise detalhada de serviços e faturamento.</p>
        </div>
        {reportData.length > 0 && (
          <button 
            onClick={generatePDF}
            className="w-full md:w-auto flex items-center justify-center gap-2 bg-emerald-600 text-white px-6 py-2 md:py-3 rounded-xl font-bold hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-600/20 text-sm md:text-base"
          >
            <FileText size={18} /> Exportar PDF
          </button>
        )}
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-6 mb-6 md:mb-10">
        <div className="bg-white p-4 md:p-6 rounded-2xl md:rounded-3xl border border-black/5 shadow-sm">
          <div className="text-black/40 text-[10px] md:text-xs font-bold uppercase tracking-widest mb-1 md:mb-2">Total de Serviços</div>
          <div className="text-2xl md:text-4xl font-bold">{reportData.length}</div>
        </div>
        <div className="bg-white p-4 md:p-6 rounded-2xl md:rounded-3xl border border-black/5 shadow-sm">
          <div className="text-black/40 text-[10px] md:text-xs font-bold uppercase tracking-widest mb-1 md:mb-2">Faturamento Total</div>
          <div className="text-2xl md:text-4xl font-bold text-emerald-600">
            R$ {reportData.reduce((acc, s) => acc + (s.total_price || 0), 0).toFixed(2)}
          </div>
        </div>
        <div className="bg-white p-4 md:p-6 rounded-2xl md:rounded-3xl border border-black/5 shadow-sm">
          <div className="text-black/40 text-[10px] md:text-xs font-bold uppercase tracking-widest mb-1 md:mb-2">Ticket Médio</div>
          <div className="text-2xl md:text-4xl font-bold">
            R$ {reportData.length ? (reportData.reduce((acc, s) => acc + (s.total_price || 0), 0) / reportData.length).toFixed(2) : '0.00'}
          </div>
        </div>
      </div>

      <div className="bg-white p-4 md:p-8 rounded-2xl md:rounded-3xl border border-black/5">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 md:mb-8 gap-4">
          <h3 className="font-bold text-lg md:text-xl">Serviços Realizados</h3>
          <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto items-start sm:items-end">
            <button 
              onClick={() => {
                const today = new Date().toISOString().split('T')[0];
                setRange({ start: today, end: today });
                apiFetch(`/api/reports/services?start=${today}&end=${today}`)
                  .then(res => res.json())
                  .then(data => {
                    if (Array.isArray(data)) {
                      setReportData(data);
                    } else {
                      setReportData([]);
                    }
                  })
                  .catch(() => setReportData([]));
              }}
              className="w-full sm:w-auto bg-emerald-50 text-emerald-600 px-4 py-2 rounded-lg text-sm font-bold hover:bg-emerald-100 transition-colors"
            >
              Hoje
            </button>
            <div className="w-full sm:w-auto">
              <label className="block text-[10px] font-bold text-black/40 uppercase mb-1">Início</label>
              <input 
                type="date" 
                className="w-full bg-[#F9F9F9] border border-black/5 rounded-lg px-4 py-2 text-sm"
                value={range.start}
                onChange={(e) => setRange({...range, start: e.target.value})}
              />
            </div>
            <div className="w-full sm:w-auto">
              <label className="block text-[10px] font-bold text-black/40 uppercase mb-1">Fim</label>
              <input 
                type="date" 
                className="w-full bg-[#F9F9F9] border border-black/5 rounded-lg px-4 py-2 text-sm"
                value={range.end}
                onChange={(e) => setRange({...range, end: e.target.value})}
              />
            </div>
            <div className="flex gap-2 w-full sm:w-auto">
              <button 
                onClick={() => {
                  setRange({ start: '', end: '' });
                  setReportData([]);
                }}
                className="flex-1 sm:flex-none px-4 py-2 text-sm font-bold text-black/40 hover:text-black transition-colors"
              >
                Limpar
              </button>
              <button 
                onClick={fetchReport}
                className="flex-1 sm:flex-none bg-black text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-black/80 transition-colors"
              >
                Gerar
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {reportData.map((s) => (
            <div key={s.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border border-black/5 gap-2">
              <div className="flex gap-4 md:gap-6 items-center">
                <div className="text-xs md:text-sm font-mono text-black/40">{new Date(s.service_date).toLocaleDateString('pt-BR')}</div>
                <div>
                  <div className="font-bold text-sm md:text-base">{s.customer_name}</div>
                  <div className="text-xs md:text-sm text-black/50">{s.plate} • {s.description}</div>
                </div>
              </div>
              <div className="font-mono font-bold text-sm md:text-base text-right">R$ {s.total_price.toFixed(2)}</div>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

function CustomersTab({ onOpenModal, onViewHistory, onEdit, onDelete, refreshTrigger, apiFetch }: { onOpenModal: () => void, onViewHistory: (c: Customer) => void, onEdit: (c: Customer) => void, onDelete: (id: number) => void, refreshTrigger?: number, apiFetch: (url: string, options?: RequestInit) => Promise<Response> }) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchCustomers = async () => {
    setIsLoading(true);
    try {
      const res = await apiFetch('/api/customers');
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Erro do servidor: ${res.status}`);
      }
      const data = await res.json();
      if (Array.isArray(data)) {
        setCustomers(data);
      } else {
        setCustomers([]);
      }
    } catch (error: any) {
      console.error("Error fetching customers:", error);
      // You might want to show a toast or alert here
      setCustomers([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, [refreshTrigger]);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-5xl mx-auto"
    >
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end mb-6 md:mb-10 gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-1 md:mb-2">Gestão de Clientes</h2>
          <p className="text-sm md:text-base text-black/50">Visualize e gerencie todos os clientes cadastrados.</p>
        </div>
        <div className="flex gap-2 md:gap-4 w-full md:w-auto">
          <button 
            onClick={fetchCustomers}
            className="flex-1 md:flex-none bg-black text-white px-4 md:px-6 py-2 md:py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-black/80 transition-colors text-sm md:text-base"
          >
            <User size={18} /> <span className="hidden sm:inline">Listar Todos</span><span className="sm:hidden">Listar</span>
          </button>
          <button 
            onClick={onOpenModal}
            className="flex-1 md:flex-none bg-emerald-600 text-white px-4 md:px-6 py-2 md:py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-600/20 text-sm md:text-base"
          >
            <Plus size={18} /> <span className="hidden sm:inline">Novo Cliente</span><span className="sm:hidden">Novo</span>
          </button>
        </div>
      </header>

      {customers.length > 0 ? (
        <div className="bg-white rounded-2xl border border-black/5 overflow-hidden">
          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-black/[0.02] border-bottom border-black/5">
                  <th className="px-6 py-4 text-xs font-bold text-black/40 uppercase">Nome</th>
                  <th className="px-6 py-4 text-xs font-bold text-black/40 uppercase">Telefone</th>
                  <th className="hidden md:table-cell px-6 py-4 text-xs font-bold text-black/40 uppercase">E-mail</th>
                  <th className="px-6 py-4 text-xs font-bold text-black/40 uppercase text-center">Veículos</th>
                  <th className="px-6 py-4 text-xs font-bold text-black/40 uppercase text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {customers.map((c) => (
                  <tr key={c.id} className="hover:bg-black/[0.01] transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-bold text-base">{c.name}</div>
                      {c.cpf_cnpj && <div className="text-[10px] text-black/30 font-mono">{c.cpf_cnpj}</div>}
                    </td>
                    <td className="px-6 py-4 text-base">{c.phone}</td>
                    <td className="hidden md:table-cell px-6 py-4 text-black/50">{c.email || '-'}</td>
                    <td className="px-6 py-4 text-center">
                      <span className="bg-emerald-50 text-emerald-600 px-2 py-1 rounded-full text-xs font-bold">
                        {c.vehicle_count}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-3">
                        <button 
                          onClick={() => onEdit(c)}
                          className="text-black/40 hover:text-black font-bold text-sm flex items-center gap-1"
                        >
                          <Edit size={14} /> <span className="hidden sm:inline">Editar</span>
                        </button>
                        <button 
                          onClick={() => onViewHistory(c)}
                          className="text-emerald-600 hover:text-emerald-700 font-bold text-sm flex items-center gap-1"
                        >
                          <Plus size={14} /> <span className="hidden sm:inline">Novo Serviço</span>
                        </button>
                        <button 
                          onClick={() => onViewHistory(c)}
                          className="text-black/40 hover:text-black font-bold text-sm flex items-center gap-1"
                        >
                          <History size={14} /> <span className="hidden sm:inline">Histórico</span>
                        </button>
                        <button 
                          onClick={() => onDelete(c.id)}
                          className="text-red-500 hover:text-red-700 font-bold text-sm flex items-center gap-1"
                        >
                          <Trash2 size={14} /> <span className="hidden sm:inline">Excluir</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden divide-y divide-black/5">
            {customers.map((c) => (
              <div key={c.id} className="p-4 space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-bold text-lg">{c.name}</div>
                    {c.cpf_cnpj && <div className="text-[10px] text-black/30 font-mono">{c.cpf_cnpj}</div>}
                  </div>
                  <span className="bg-emerald-50 text-emerald-600 px-2 py-1 rounded-full text-[10px] font-bold">
                    {c.vehicle_count} {c.vehicle_count === 1 ? 'Veículo' : 'Veículos'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <div className="text-[10px] font-bold text-black/40 uppercase tracking-wider">Telefone</div>
                    <div>{c.phone}</div>
                  </div>
                  {c.email && (
                    <div>
                      <div className="text-[10px] font-bold text-black/40 uppercase tracking-wider">E-mail</div>
                      <div className="truncate">{c.email}</div>
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap justify-between items-center pt-2 border-t border-black/[0.02] gap-y-2">
                  <div className="flex gap-4">
                    <button 
                      onClick={() => onViewHistory(c)}
                      className="text-emerald-600 flex items-center gap-1 font-bold text-xs"
                    >
                      <Plus size={14} /> Novo Serviço
                    </button>
                    <button 
                      onClick={() => onViewHistory(c)}
                      className="text-black/40 flex items-center gap-1 font-bold text-xs"
                    >
                      <History size={14} /> Histórico
                    </button>
                  </div>
                  <div className="flex gap-4">
                    <button 
                      onClick={() => onEdit(c)}
                      className="text-black/40 flex items-center gap-1 font-bold text-xs"
                    >
                      <Edit size={14} /> Editar
                    </button>
                    <button 
                      onClick={() => onDelete(c.id)}
                      className="text-red-500 flex items-center gap-1 font-bold text-xs"
                    >
                      <Trash2 size={14} /> Excluir
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="text-center py-20 bg-white rounded-3xl border border-black/5">
          <UserPlus className="mx-auto text-black/10 mb-4" size={64} />
          <h3 className="text-xl font-bold mb-2">Nenhum cliente listado</h3>
          <p className="text-black/50 mb-8">Clique em "Listar Todos" para ver a base de clientes ou cadastre um novo.</p>
        </div>
      )}
    </motion.div>
  );
}

function NewCustomerModal({ isOpen, onClose, onSuccess, apiFetch }: { isOpen: boolean, onClose: () => void, onSuccess: (customerId: number, vehicleId?: number | null) => void, apiFetch: (url: string, options?: RequestInit) => Promise<Response> }) {
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    cpf_cnpj: '',
    vehicle: {
      plate: '',
      brand: '',
      model: '',
      year: '',
      color: ''
    }
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [plateError, setPlateError] = useState(false);

  const handleSubmit = async (e: FormEvent, startService: boolean = false) => {
    e.preventDefault();
    
    if (!validatePlate(formData.vehicle.plate)) {
      setPlateError(true);
      return;
    }
    setPlateError(false);

    setIsSubmitting(true);
    try {
      const res = await apiFetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const data = await res.json();
      if (res.ok) {
        onSuccess(data.id, startService ? data.vehicle_id : null);
        onClose();
        setFormData({
          name: '', phone: '', email: '', cpf_cnpj: '',
          vehicle: { plate: '', brand: '', model: '', year: '', color: '' }
        });
      } else {
        alert(data.error || "Erro ao salvar cadastro.");
      }
    } catch (error: any) {
      console.error("Error creating customer:", error);
      alert(error.message || "Erro de conexão com o servidor.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white w-[95%] max-w-2xl rounded-3xl shadow-2xl overflow-hidden"
      >
        <div className="bg-emerald-600 p-4 md:p-6 text-white flex justify-between items-center">
          <h3 className="text-lg md:text-xl font-bold">Novo Cliente & Veículo</h3>
          <button onClick={onClose} className="hover:bg-white/10 p-2 rounded-lg transition-colors">
            <Plus className="rotate-45" size={24} />
          </button>
        </div>
        
        <form onSubmit={(e) => handleSubmit(e)} className="p-4 md:p-8 grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 max-h-[80vh] overflow-y-auto">
          <div className="md:col-span-2">
            <h4 className="text-xs font-bold text-black/30 uppercase tracking-widest mb-4">Dados do Cliente</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium mb-1">Nome Completo</label>
                <input 
                  required
                  className="w-full border border-black/10 rounded-xl px-4 py-2 focus:ring-2 focus:ring-emerald-500/20 outline-none"
                  value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Telefone</label>
                <input 
                  required
                  className="w-full border border-black/10 rounded-xl px-4 py-2 focus:ring-2 focus:ring-emerald-500/20 outline-none"
                  value={formData.phone}
                  onChange={e => setFormData({...formData, phone: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">E-mail</label>
                <input 
                  type="email"
                  className="w-full border border-black/10 rounded-xl px-4 py-2 focus:ring-2 focus:ring-emerald-500/20 outline-none"
                  value={formData.email}
                  onChange={e => setFormData({...formData, email: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">CPF ou CNPJ</label>
                <input 
                  className="w-full border border-black/10 rounded-xl px-4 py-2 focus:ring-2 focus:ring-emerald-500/20 outline-none"
                  placeholder="Opcional"
                  value={formData.cpf_cnpj}
                  onChange={e => setFormData({...formData, cpf_cnpj: e.target.value})}
                />
              </div>
            </div>
          </div>

          <div className="md:col-span-2 mt-4">
            <h4 className="text-xs font-bold text-black/30 uppercase tracking-widest mb-4">Dados do Veículo</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Placa</label>
                <div className="relative">
                  <input 
                    required
                    placeholder="AAA-0000"
                    className={`w-full border rounded-xl pl-4 pr-10 py-2 focus:ring-2 outline-none transition-colors ${plateError ? 'border-red-500 focus:ring-red-500/20' : 'border-black/10 focus:ring-emerald-500/20'}`}
                    value={formData.vehicle.plate}
                    onChange={e => {
                      const formatted = formatPlate(e.target.value);
                      setFormData({...formData, vehicle: {...formData.vehicle, plate: formatted}});
                      if (plateError) setPlateError(!validatePlate(formatted));
                    }}
                    onBlur={() => setPlateError(!validatePlate(formData.vehicle.plate))}
                  />
                  <PlateOCRButton 
                    className="absolute right-1 top-1/2 -translate-y-1/2"
                    onPlateDetected={(plate) => {
                      const formatted = formatPlate(plate);
                      setFormData({...formData, vehicle: {...formData.vehicle, plate: formatted}});
                      setPlateError(!validatePlate(formatted));
                    }}
                  />
                </div>
                {plateError && <p className="text-[10px] text-red-500 mt-1 font-bold uppercase">Placa inválida</p>}
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Marca</label>
                <input 
                  required
                  className="w-full border border-black/10 rounded-xl px-4 py-2 focus:ring-2 focus:ring-emerald-500/20 outline-none"
                  value={formData.vehicle.brand}
                  onChange={e => setFormData({...formData, vehicle: {...formData.vehicle, brand: e.target.value}})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Modelo</label>
                <input 
                  required
                  className="w-full border border-black/10 rounded-xl px-4 py-2 focus:ring-2 focus:ring-emerald-500/20 outline-none"
                  value={formData.vehicle.model}
                  onChange={e => setFormData({...formData, vehicle: {...formData.vehicle, model: e.target.value}})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Ano</label>
                <input 
                  type="number"
                  className="w-full border border-black/10 rounded-xl px-4 py-2 focus:ring-2 focus:ring-emerald-500/20 outline-none"
                  value={formData.vehicle.year}
                  onChange={e => setFormData({...formData, vehicle: {...formData.vehicle, year: e.target.value}})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Cor</label>
                <input 
                  className="w-full border border-black/10 rounded-xl px-4 py-2 focus:ring-2 focus:ring-emerald-500/20 outline-none"
                  value={formData.vehicle.color}
                  onChange={e => setFormData({...formData, vehicle: {...formData.vehicle, color: e.target.value}})}
                />
              </div>
            </div>
          </div>

          <div className="md:col-span-2 flex flex-col sm:flex-row justify-end gap-3 mt-6">
            <button 
              type="button"
              onClick={onClose}
              className="px-6 py-2 text-black/50 font-bold hover:text-black transition-colors order-3 sm:order-1"
            >
              Cancelar
            </button>
            <button 
              type="button"
              disabled={isSubmitting}
              onClick={(e) => handleSubmit(e as any, true)}
              className="bg-black text-white px-6 py-2 rounded-xl font-bold hover:bg-black/80 transition-colors flex items-center justify-center gap-2 order-1 sm:order-2 disabled:opacity-50"
            >
              <Wrench size={18} /> Salvar e Iniciar Serviço
            </button>
            <button 
              type="submit"
              disabled={isSubmitting}
              className="bg-emerald-600 text-white px-8 py-2 rounded-xl font-bold hover:bg-emerald-700 transition-colors order-2 sm:order-3 disabled:opacity-50"
            >
              Salvar Cadastro
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

function ServicesTab({ onEdit, onNewService, refreshTrigger, apiFetch }: { onEdit: (id: number) => void, onNewService: () => void, refreshTrigger?: number, apiFetch: (url: string, options?: RequestInit) => Promise<Response> }) {
  const [services, setServices] = useState<Service[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [filter, setFilter] = useState({ start: '', end: '' });

  const fetchServices = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter.start) params.append('start', filter.start);
      if (filter.end) params.append('end', filter.end);
      
      const res = await apiFetch(`/api/services?${params.toString()}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setServices(data);
      } else {
        setServices([]);
      }
    } catch (error) {
      console.error("Error fetching services:", error);
      setServices([]);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleStatus = async (id: number) => {
    try {
      const res = await apiFetch(`/api/services/${id}/toggle-status`, { method: 'PATCH' });
      if (res.ok) {
        fetchServices();
      }
    } catch (error) {
      console.error("Error toggling status:", error);
    }
  };

  const generateReceipt = (service: Service) => {
    const doc = new jsPDF();
    
    // Header - Company Info
    doc.setFontSize(18);
    doc.setTextColor(0);
    doc.text('RECIBO DE SERVIÇO', 105, 20, { align: 'center' });
    
    doc.setFontSize(10);
    doc.text('Eletro-Ar Refrigeração LTDA', 105, 30, { align: 'center' });
    doc.text('CNPJ: 02.238.167/0001-10', 105, 35, { align: 'center' });
    doc.text('Rua Mariana Bronemann, 88 - CEP 89036-080', 105, 40, { align: 'center' });
    doc.text('Blumenau - SC', 105, 45, { align: 'center' });
    
    doc.setLineWidth(0.5);
    doc.line(14, 50, 196, 50);
    
    // Receipt Content
    doc.setFontSize(12);
    doc.text(`Recebemos de: ${service.customer_name}`, 14, 65);
    doc.text(`Referente ao veículo: ${service.model} - Placa: ${service.plate}`, 14, 75);
    
    doc.setFontSize(11);
    doc.text('Descrição do Serviço:', 14, 90);
    doc.setFontSize(10);
    const splitDescription = doc.splitTextToSize(service.description || 'Nenhuma descrição informada.', 180);
    doc.text(splitDescription, 14, 98);
    
    const yPos = 98 + (splitDescription.length * 5) + 10;
    
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(`VALOR: R$ ${(service.total_price || 0).toFixed(2)}`, 196, yPos, { align: 'right' });
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const dateStr = new Date(service.service_date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
    doc.text(`Blumenau, ${dateStr}`, 14, yPos + 20);
    
    // Signature
    doc.line(60, yPos + 50, 150, yPos + 50);
    doc.text('Eletro-Ar Refrigeração LTDA', 105, yPos + 55, { align: 'center' });
    
    doc.save(`recibo-${service.customer_name}-${service.plate}.pdf`);
  };

  useEffect(() => {
    fetchServices();
  }, [filter, refreshTrigger]);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-5xl mx-auto"
    >
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end mb-6 md:mb-10 gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-1 md:mb-2">Ordens de Serviço</h2>
          <p className="text-sm md:text-base text-black/50">Acompanhe todos os serviços realizados e em andamento.</p>
        </div>
        <div className="flex gap-2 md:gap-4 w-full md:w-auto">
          <button 
            onClick={fetchServices}
            disabled={isLoading}
            className={`flex-1 md:flex-none bg-black text-white px-4 md:px-6 py-2 md:py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-black/80 transition-colors text-sm md:text-base ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <History size={18} className={isLoading ? 'animate-spin' : ''} /> 
            <span className="hidden sm:inline">{isLoading ? 'Atualizando...' : 'Atualizar Lista'}</span>
            <span className="sm:hidden">{isLoading ? '...' : 'Atualizar'}</span>
          </button>
          <button 
            onClick={onNewService}
            className="flex-1 md:flex-none bg-emerald-600 text-white px-4 md:px-6 py-2 md:py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-600/20 text-sm md:text-base"
          >
            <Plus size={18} /> <span className="hidden sm:inline">Novo Serviço</span><span className="sm:hidden">Novo</span>
          </button>
        </div>
      </header>

      <div className="bg-white p-4 md:p-6 rounded-2xl border border-black/5 mb-6 md:mb-8 flex flex-col sm:flex-row gap-4 items-start sm:items-end">
        <button 
          onClick={() => {
            const today = new Date().toISOString().split('T')[0];
            setFilter({...filter, start: today, end: today });
          }}
          className="w-full sm:w-auto bg-emerald-50 text-emerald-600 px-4 py-2 rounded-lg text-sm font-bold hover:bg-emerald-100 transition-colors"
        >
          Hoje
        </button>
        <div className="w-full sm:w-auto">
          <label className="block text-xs font-bold text-black/40 uppercase mb-2">Início</label>
          <input 
            type="date" 
            className="w-full bg-[#F9F9F9] border border-black/5 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            value={filter.start}
            onChange={(e) => setFilter({...filter, start: e.target.value})}
          />
        </div>
        <div className="w-full sm:w-auto">
          <label className="block text-xs font-bold text-black/40 uppercase mb-2">Fim</label>
          <input 
            type="date" 
            className="w-full bg-[#F9F9F9] border border-black/5 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            value={filter.end}
            onChange={(e) => setFilter({...filter, end: e.target.value})}
          />
        </div>
        <button 
          onClick={() => setFilter({ start: '', end: '' })}
          className="w-full sm:w-auto px-4 py-2 text-sm font-bold text-black/40 hover:text-black transition-colors"
        >
          Limpar Filtros
        </button>
      </div>

      {services.length > 0 ? (
        <div className="bg-white rounded-2xl border border-black/5 overflow-hidden">
          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-black/[0.02] border-bottom border-black/5">
                  <th className="px-6 py-4 text-xs font-bold text-black/40 uppercase">Data</th>
                  <th className="px-6 py-4 text-xs font-bold text-black/40 uppercase">Cliente</th>
                  <th className="hidden lg:table-cell px-6 py-4 text-xs font-bold text-black/40 uppercase">Veículo</th>
                  <th className="hidden md:table-cell px-6 py-4 text-xs font-bold text-black/40 uppercase">Descrição</th>
                  <th className="px-6 py-4 text-xs font-bold text-black/40 uppercase text-right">Valor</th>
                  <th className="px-6 py-4 text-xs font-bold text-black/40 uppercase text-center">Status</th>
                  <th className="px-6 py-4 text-xs font-bold text-black/40 uppercase text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {services.map((s) => (
                  <tr key={s.id} className="hover:bg-black/[0.01] transition-colors">
                    <td className="px-6 py-4 font-mono text-sm">{new Date(s.service_date).toLocaleDateString('pt-BR')}</td>
                    <td className="px-6 py-4 font-bold text-base">{s.customer_name}</td>
                    <td className="hidden lg:table-cell px-6 py-4 text-sm">{s.plate} • {s.model}</td>
                    <td className="hidden md:table-cell px-6 py-4 text-black/50 text-sm">{s.description}</td>
                    <td className="px-6 py-4 text-right font-mono font-bold text-base">R$ {(s.total_price || 0).toFixed(2)}</td>
                    <td className="px-6 py-4 text-center">
                      <button 
                        onClick={() => toggleStatus(s.id)}
                        className="group focus:outline-none"
                        title="Clique para alterar o status"
                      >
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold transition-colors ${
                          s.status === 'completed' 
                            ? 'text-emerald-600 bg-emerald-50 group-hover:bg-emerald-100' 
                            : 'text-amber-600 bg-amber-50 group-hover:bg-amber-100'
                        }`}>
                          {s.status === 'completed' ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
                          {s.status === 'completed' ? 'Concluído' : 'Pendente'}
                        </span>
                      </button>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button 
                        onClick={() => generateReceipt(s)}
                        className="text-emerald-600 hover:text-emerald-700 transition-colors mr-3"
                        title="Gerar Recibo"
                      >
                        <FileText size={16} />
                      </button>
                      <button 
                        onClick={() => onEdit(s.id)}
                        className="text-black/40 hover:text-black transition-colors"
                      >
                        <Edit size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden divide-y divide-black/5">
            {services.map((s) => (
              <div key={s.id} className="p-4 space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="text-[10px] font-bold text-black/40 uppercase tracking-wider">Data</div>
                    <div className="font-mono text-sm">{new Date(s.service_date).toLocaleDateString('pt-BR')}</div>
                  </div>
                  <button 
                    onClick={() => toggleStatus(s.id)}
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold transition-colors ${
                      s.status === 'completed' ? 'text-emerald-600 bg-emerald-50' : 'text-amber-600 bg-amber-50'
                    }`}
                  >
                    {s.status === 'completed' ? <CheckCircle2 size={10} /> : <AlertCircle size={10} />}
                    {s.status === 'completed' ? 'Concluído' : 'Pendente'}
                  </button>
                </div>
                <div>
                  <div className="text-[10px] font-bold text-black/40 uppercase tracking-wider">Cliente / Veículo</div>
                  <div className="font-bold">{s.customer_name}</div>
                  <div className="text-xs text-black/50">{s.plate} • {s.model}</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold text-black/40 uppercase tracking-wider">Descrição</div>
                  <div className="text-sm text-black/60 line-clamp-2">{s.description}</div>
                </div>
                <div className="flex justify-between items-center pt-2">
                  <div className="font-mono font-bold text-emerald-600">R$ {(s.total_price || 0).toFixed(2)}</div>
                  <div className="flex gap-4">
                    <button 
                      onClick={() => generateReceipt(s)}
                      className="text-emerald-600 flex items-center gap-1 font-bold text-xs"
                    >
                      <FileText size={14} /> Recibo
                    </button>
                    <button 
                      onClick={() => onEdit(s.id)}
                      className="text-black/40 flex items-center gap-1 font-bold text-xs"
                    >
                      <Edit size={14} /> Editar
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="text-center py-20 bg-white rounded-3xl border border-black/5">
          <Wrench className="mx-auto text-black/10 mb-4" size={64} />
          <h3 className="text-xl font-bold mb-2">Nenhuma O.S. encontrada</h3>
          <p className="text-black/50">Utilize a busca inicial para selecionar um cliente e abrir uma nova O.S.</p>
        </div>
      )}
    </motion.div>
  );
}

function EditCustomerModal({ isOpen, customer, onClose, onSuccess, onConfirmDeleteVehicle, apiFetch }: { isOpen: boolean, customer: Customer | null, onClose: () => void, onSuccess: () => void, onConfirmDeleteVehicle: (id: number) => void, apiFetch: (url: string, options?: RequestInit) => Promise<Response> }) {
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    cpf_cnpj: ''
  });
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [isAddingVehicle, setIsAddingVehicle] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [vehicleForm, setVehicleForm] = useState({
    plate: '',
    brand: '',
    model: '',
    year: '',
    color: ''
  });
  const [plateError, setPlateError] = useState(false);

  const fetchVehicles = async () => {
    if (!customer) return;
    try {
      const res = await apiFetch(`/api/customers/${customer.id}/vehicles`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setVehicles(data);
      } else {
        setVehicles([]);
      }
    } catch (error) {
      console.error("Error fetching vehicles:", error);
      setVehicles([]);
    }
  };

  useEffect(() => {
    if (customer) {
      setFormData({
        name: customer.name,
        phone: customer.phone,
        email: customer.email || '',
        cpf_cnpj: customer.cpf_cnpj || ''
      });
      fetchVehicles();
    }
  }, [customer]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!customer) return;
    setIsSubmitting(true);
    try {
      const res = await apiFetch(`/api/customers/${customer.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      if (res.ok) {
        onSuccess();
        onClose();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Erro ao atualizar dados.");
      }
    } catch (error: any) {
      console.error("Error updating customer:", error);
      alert(error.message || "Erro de conexão com o servidor.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVehicleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!customer) return;

    if (!validatePlate(vehicleForm.plate)) {
      setPlateError(true);
      return;
    }
    setPlateError(false);

    const method = editingVehicle ? 'PUT' : 'POST';
    const url = editingVehicle ? `/api/vehicles/${editingVehicle.id}` : '/api/vehicles';
    const body = editingVehicle ? vehicleForm : { ...vehicleForm, customer_id: customer.id };

    const res = await apiFetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (res.ok) {
      fetchVehicles();
      setIsAddingVehicle(false);
      setEditingVehicle(null);
      setVehicleForm({ plate: '', brand: '', model: '', year: '', color: '' });
    }
  };

  if (!isOpen || !customer) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white w-[95%] max-w-2xl rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
      >
        <div className="bg-emerald-600 p-4 md:p-6 text-white flex justify-between items-center shrink-0">
          <h3 className="text-lg md:text-xl font-bold">Editar Cliente</h3>
          <button onClick={onClose} className="hover:bg-white/10 p-2 rounded-lg transition-colors">
            <Plus className="rotate-45" size={24} />
          </button>
        </div>
        
        <div className="overflow-y-auto p-4 md:p-8 space-y-6 md:space-y-8">
          <form onSubmit={handleSubmit} className="space-y-4 md:space-y-6">
            <div className="flex items-center gap-2 text-black/40 font-bold text-xs uppercase tracking-widest">
              <User size={16} /> Dados Pessoais
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium mb-1">Nome Completo</label>
                <input 
                  required
                  className="w-full border border-black/10 rounded-xl px-4 py-2 focus:ring-2 focus:ring-emerald-500/20 outline-none"
                  value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Telefone</label>
                <input 
                  required
                  className="w-full border border-black/10 rounded-xl px-4 py-2 focus:ring-2 focus:ring-emerald-500/20 outline-none"
                  value={formData.phone}
                  onChange={e => setFormData({...formData, phone: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">E-mail</label>
                <input 
                  type="email"
                  className="w-full border border-black/10 rounded-xl px-4 py-2 focus:ring-2 focus:ring-emerald-500/20 outline-none"
                  value={formData.email}
                  onChange={e => setFormData({...formData, email: e.target.value})}
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium mb-1">CPF ou CNPJ</label>
                <input 
                  className="w-full border border-black/10 rounded-xl px-4 py-2 focus:ring-2 focus:ring-emerald-500/20 outline-none"
                  placeholder="Opcional"
                  value={formData.cpf_cnpj}
                  onChange={e => setFormData({...formData, cpf_cnpj: e.target.value})}
                />
              </div>
            </div>
            <div className="flex justify-end">
              <button 
                type="submit"
                disabled={isSubmitting}
                className="bg-emerald-600 text-white px-8 py-2 rounded-xl font-bold hover:bg-emerald-700 transition-colors disabled:opacity-50"
              >
                {isSubmitting ? 'Salvando...' : 'Salvar Dados Pessoais'}
              </button>
            </div>
          </form>

          <div className="space-y-6 pt-6 border-t border-black/5">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2 text-black/40 font-bold text-xs uppercase tracking-widest">
                <Car size={16} /> Veículos
              </div>
              {!isAddingVehicle && !editingVehicle && (
                <button 
                  onClick={() => setIsAddingVehicle(true)}
                  className="text-emerald-600 hover:text-emerald-700 font-bold text-xs flex items-center gap-1"
                >
                  <Plus size={14} /> Adicionar Veículo
                </button>
              )}
            </div>

            {(isAddingVehicle || editingVehicle) && (
              <form onSubmit={handleVehicleSubmit} className="bg-black/[0.02] p-6 rounded-2xl border border-black/5 space-y-4">
                <h4 className="font-bold text-sm">{editingVehicle ? 'Editar Veículo' : 'Novo Veículo'}</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium mb-1">Placa</label>
                    <div className="relative">
                      <input 
                        required
                        placeholder="AAA-0000"
                        className={`w-full border rounded-lg pl-3 pr-9 py-1.5 text-sm outline-none focus:ring-2 transition-colors ${plateError ? 'border-red-500 focus:ring-red-500/20' : 'border-black/10 focus:ring-emerald-500/20'}`}
                        value={vehicleForm.plate}
                        onChange={e => {
                          const formatted = formatPlate(e.target.value);
                          setVehicleForm({...vehicleForm, plate: formatted});
                          if (plateError) setPlateError(!validatePlate(formatted));
                        }}
                        onBlur={() => setPlateError(!validatePlate(vehicleForm.plate))}
                      />
                      <PlateOCRButton 
                        className="absolute right-0.5 top-1/2 -translate-y-1/2"
                        onPlateDetected={(plate) => {
                          const formatted = formatPlate(plate);
                          setVehicleForm({...vehicleForm, plate: formatted});
                          setPlateError(!validatePlate(formatted));
                        }}
                      />
                    </div>
                    {plateError && <p className="text-[9px] text-red-500 mt-0.5 font-bold uppercase">Placa inválida</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Marca</label>
                    <input 
                      required
                      className="w-full border border-black/10 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500/20"
                      value={vehicleForm.brand}
                      onChange={e => setVehicleForm({...vehicleForm, brand: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Modelo</label>
                    <input 
                      required
                      className="w-full border border-black/10 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500/20"
                      value={vehicleForm.model}
                      onChange={e => setVehicleForm({...vehicleForm, model: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Ano</label>
                    <input 
                      type="number"
                      className="w-full border border-black/10 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500/20"
                      value={vehicleForm.year}
                      onChange={e => setVehicleForm({...vehicleForm, year: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Cor</label>
                    <input 
                      className="w-full border border-black/10 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500/20"
                      value={vehicleForm.color}
                      onChange={e => setVehicleForm({...vehicleForm, color: e.target.value})}
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-3">
                  <button 
                    type="button"
                    onClick={() => {
                      setIsAddingVehicle(false);
                      setEditingVehicle(null);
                      setVehicleForm({ plate: '', brand: '', model: '', year: '', color: '' });
                    }}
                    className="px-4 py-1.5 text-xs font-bold text-black/40 hover:text-black"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit"
                    className="bg-black text-white px-6 py-1.5 rounded-lg text-xs font-bold hover:bg-black/80"
                  >
                    {editingVehicle ? 'Atualizar' : 'Adicionar'}
                  </button>
                </div>
              </form>
            )}

            <div className="space-y-3">
              {vehicles.length === 0 ? (
                <div className="text-center py-6 text-black/30 text-sm italic">
                  Nenhum veículo cadastrado.
                </div>
              ) : (
                vehicles.map((v) => (
                  <div key={v.id} className="flex items-center justify-between p-4 rounded-xl border border-black/5 hover:bg-black/[0.01]">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-emerald-50 rounded-lg flex items-center justify-center text-emerald-600">
                        <Car size={20} />
                      </div>
                      <div>
                        <div className="font-bold text-sm">{v.plate}</div>
                        <div className="text-xs text-black/50">{v.brand} {v.model} • {v.color}</div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => {
                          setEditingVehicle(v);
                          setVehicleForm({
                            plate: v.plate,
                            brand: v.brand,
                            model: v.model,
                            year: v.year.toString(),
                            color: v.color
                          });
                          setIsAddingVehicle(false);
                        }}
                        className="p-2 text-black/30 hover:text-black transition-colors"
                      >
                        <Edit size={16} />
                      </button>
                      <button 
                        onClick={() => onConfirmDeleteVehicle(v.id)}
                        className="p-2 text-red-400 hover:text-red-600 transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
        
        <div className="p-6 bg-black/[0.02] border-t border-black/5 flex justify-end shrink-0">
          <button 
            onClick={onClose}
            className="px-8 py-2 bg-black text-white rounded-xl font-bold hover:bg-black/80 transition-colors"
          >
            Fechar
          </button>
        </div>
      </motion.div>
    </div>
  );
}
