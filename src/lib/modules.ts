export type SystemModuleKey =
  | "transactions"
  | "payables"
  | "receivables"
  | "invoices"
  | "cards"
  | "obras"
  | "legal_cases"
  | "reports"
  | "kpis";

export interface SystemModuleDefinition {
  key: SystemModuleKey;
  label: string;
  shortLabel: string;
  description: string;
  icon: string;
  route: string;
  category: "finance" | "specialized" | "analytics";
  badge?: string;
}

export const SYSTEM_MODULES: SystemModuleDefinition[] = [
  {
    key: "transactions",
    label: "Extrato & Conciliação",
    shortLabel: "Transações",
    description: "Extrato bancário, conciliação e fluxo de caixa operacional.",
    icon: "📋",
    route: "/transactions",
    category: "finance",
  },
  {
    key: "payables",
    label: "Contas a Pagar",
    shortLabel: "A Pagar",
    description: "Gestão de pagamentos, fornecedores e controle de boletos.",
    icon: "💸",
    route: "/payables",
    category: "finance",
  },
  {
    key: "receivables",
    label: "Contas a Receber",
    shortLabel: "Recebíveis",
    description: "Faturamento, cobranças a clientes e controle de inadimplência.",
    icon: "💰",
    route: "/receivables",
    category: "finance",
  },
  {
    key: "invoices",
    label: "Notas Fiscais (NFS-e)",
    shortLabel: "Notas Fiscais",
    description: "Emissão de NFS-e, modelos de serviço, DANFSE PDF, XML e certificado A1.",
    icon: "🧾",
    route: "/invoices",
    category: "finance",
    badge: "Fiscal",
  },
  {
    key: "cards",
    label: "Cartões & Maquininhas",
    shortLabel: "Cartões",
    description: "Conciliação MDR, canhotos OCR, adquirentes e antecipações.",
    icon: "💳",
    route: "/cards",
    category: "finance",
  },
  {
    key: "obras",
    label: "Obras & Projetos",
    shortLabel: "Obras",
    description: "Controle físico-financeiro, etapas e centros de custo de obras.",
    icon: "🏗️",
    route: "/obras",
    category: "specialized",
    badge: "Engenharia",
  },
  {
    key: "legal_cases",
    label: "Processos Jurídicos",
    shortLabel: "Processos",
    description: "Honorários, custas judiciais, alvarás e clientes jurídicos.",
    icon: "⚖️",
    route: "/legal-cases",
    category: "specialized",
    badge: "Jurídico",
  },
  {
    key: "reports",
    label: "Relatórios Contábeis",
    shortLabel: "Relatórios",
    description: "DRE Gerencial, DFC Direto e Indireto, Balancete e Fechamento.",
    icon: "📑",
    route: "/reports",
    category: "analytics",
  },
  {
    key: "kpis",
    label: "Indicadores & KPIs",
    shortLabel: "KPIs",
    description: "Painel executivo com Burn Rate, Runway, Margens e Liquidez.",
    icon: "🎯",
    route: "/kpis",
    category: "analytics",
    badge: "Estratégico",
  },
];

export interface CompanyModuleRecord {
  id?: string;
  company_id: string;
  module_key: SystemModuleKey;
  is_enabled: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface UserModulePermissionRecord {
  id?: string;
  company_id: string;
  user_id: string;
  module_key: SystemModuleKey;
  can_access: boolean;
  can_edit: boolean;
  created_at?: string;
  updated_at?: string;
}
