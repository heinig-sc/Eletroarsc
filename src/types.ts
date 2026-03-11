export interface Customer {
  id: number;
  name: string;
  phone: string;
  email?: string;
  cpf_cnpj?: string;
  vehicle_count?: number;
}

export interface Vehicle {
  id: number;
  customer_id: number;
  plate: string;
  brand: string;
  model: string;
  year: number;
  color: string;
}

export interface Service {
  id: number;
  vehicle_id: number;
  description: string;
  total_price: number;
  status: string;
  service_date: string;
  plate?: string;
  model?: string;
  customer_name?: string;
}

export interface Part {
  id: number;
  service_id: number;
  name: string;
  quantity: number;
  price: number;
}

export interface AccountPayable {
  id: number;
  supplier: string;
  description: string;
  amount: number;
  due_date: string;
  paid: boolean;
}

export interface User {
  id: number;
  username: string;
}

export interface SearchResult {
  customer_id: number;
  name: string;
  phone: string;
  cpf_cnpj?: string;
  vehicle_id: number;
  plate: string;
  brand: string;
  model: string;
  year: number;
  color: string;
}
