export interface ServiceTemplate {
  id: string;
  company_id?: string;
  name: string; // Ex: "Consultoria & Assessoria Mensal"
  description: string; // Texto padrão da discriminação
  cnae: string; // Ex: "7020-4/00"
  service_code_lc116: string; // Ex: "17.01"
  municipal_service_code?: string; // Ex: "02488"
  default_iss_rate: number; // Ex: 2.0 (2%)
  iss_retained_default: boolean; // false para Simples
  is_favorite?: boolean;
}

export interface InvoiceCustomer {
  id: string;
  name: string;
  trade_name?: string;
  document: string; // CNPJ ou CPF
  email?: string;
  phone?: string;
  street?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  municipal_inscription?: string;
}

export interface NfseInvoice {
  id: string;
  number?: string; // Ex: "000421"
  series?: string; // Ex: "1" ou "E"
  verification_code?: string; // Ex: "A89F-23KC"
  company_id: string;
  customer_id?: string;
  customer_name: string;
  customer_document: string;
  customer_email?: string;
  customer_city: string;
  template_name?: string;
  service_description: string;
  cnae: string;
  service_code_lc116: string;
  competence_month: string; // "2026-10"
  issue_date: string; // "2026-10-18T14:30:00"
  amount: number; // Ex: 8500.00
  iss_rate: number; // Ex: 2.0 (%)
  iss_amount: number; // Ex: 170.00
  iss_retained: boolean; // false
  tax_regime: "simples_nacional" | "mei";
  status: "draft" | "processing" | "authorized" | "rejected" | "cancelled";
  status_message?: string;
  danfse_url?: string;
  xml_url?: string;
  receivable_id?: string;
}

export interface CompanyFiscalSettings {
  id?: string;
  company_id: string;
  spedy_company_id?: string;
  municipal_inscription?: string;
  tax_regime: "mei" | "simples_nacional";
  environment: "sandbox" | "production";
  has_certificate_a1: boolean;
  certificate_expiry?: string;
}
