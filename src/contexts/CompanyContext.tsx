"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

import { SystemModuleKey, SYSTEM_MODULES } from "@/lib/modules";

export type Company = {
  id: string;
  name: string;
  cnpj?: string | null;
  pix_key?: string | null;
  logo_url?: string | null;
  is_active: boolean;
  role?: "master" | "admin" | "operator" | "viewer";
  segment?: "general" | "legal" | "obras_only" | "obras_financial";
};

type CompanyContextType = {
  companies: Company[];
  selectedCompany: Company | null;
  isMaster: boolean;
  userRole: "master" | "admin" | "operator" | "viewer" | null;
  loading: boolean;
  accessibleModules: SystemModuleKey[];
  companyEnabledModules: Record<SystemModuleKey, boolean>;
  isModuleAccessible: (key: SystemModuleKey) => boolean;
  isModuleEditable: (key: SystemModuleKey) => boolean;
  selectCompany: (companyId: string) => void;
  refreshCompanies: () => Promise<void>;
  refreshModules: () => Promise<void>;
  createCompany: (
    name: string,
    cnpj?: string,
    segment?: "general" | "legal" | "obras_only" | "obras_financial"
  ) => Promise<Company | null>;
};

const CompanyContext = createContext<CompanyContextType | undefined>(undefined);

const LOCAL_STORAGE_KEY = "oeco_active_company_id";

// Template padrão de categorias para seeding no client se RPC não estiver disponível
const DEFAULT_CATEGORIES_TEMPLATE = [
  { name: "Fornecedores", type: "expense" as const, subs: ["Insumos", "Matéria-prima"] },
  {
    name: "Escritório",
    type: "expense" as const,
    subs: [
      "Aluguel",
      "Energia Elétrica",
      "Água",
      "Internet e Telefone",
      "Material de Escritório",
      "Software e Assinaturas",
    ],
  },
  {
    name: "Despesa de Pessoal",
    type: "expense" as const,
    subs: ["Salários", "VR (Vale Refeição)", "VT (Vale Transporte)", "Pró-labore", "Encargos Trabalhistas"],
  },
  {
    name: "Impostos",
    type: "expense" as const,
    subs: ["DAS", "IRPJ", "CSLL", "PIS", "COFINS", "ISS", "ICMS"],
  },
  {
    name: "Serviço de Terceiros",
    type: "expense" as const,
    subs: ["Contabilidade", "Advogado", "Marketing"],
  },
  {
    name: "Receitas",
    type: "income" as const,
    subs: ["Receita de Serviços Prestados", "Receita de Produtos Vendidos", "Estorno/Devolução"],
  },
];

export function CompanyProvider({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [isMaster, setIsMaster] = useState(false);
  const [userRole, setUserRole] = useState<"master" | "admin" | "operator" | "viewer" | null>(null);
  const [loading, setLoading] = useState(true);

  // Estados de Módulos
  const [accessibleModules, setAccessibleModules] = useState<SystemModuleKey[]>([]);
  const [companyEnabledModules, setCompanyEnabledModules] = useState<Record<SystemModuleKey, boolean>>({
    transactions: true,
    payables: true,
    receivables: true,
    cards: true,
    obras: false,
    legal_cases: false,
    reports: true,
    kpis: true,
  });
  const [userEditPermissions, setUserEditPermissions] = useState<Record<SystemModuleKey, boolean>>({
    transactions: true,
    payables: true,
    receivables: true,
    cards: true,
    obras: true,
    legal_cases: true,
    reports: true,
    kpis: true,
  });

  // Carregar permissões e módulos da empresa ativa
  const fetchModulesData = useCallback(
    async (companyId?: string, isMasterUser: boolean = false, currentSegment?: string) => {
      if (!companyId) {
        setAccessibleModules([]);
        return;
      }

      try {
        // 1. Busca os módulos habilitados da empresa diretamente da tabela company_modules
        const { data: compMods } = await supabase
          .from("company_modules")
          .select("module_key, is_enabled")
          .eq("company_id", companyId);

        let enabledMap: Record<SystemModuleKey, boolean> = {
          transactions: true,
          payables: true,
          receivables: true,
          cards: false,
          obras: false,
          legal_cases: false,
          reports: true,
          kpis: true,
        };

        if (compMods && compMods.length > 0) {
          compMods.forEach((cm: any) => {
            const k = cm.module_key as SystemModuleKey;
            enabledMap[k] = Boolean(cm.is_enabled);
          });
        } else if (currentSegment) {
          // Fallback inicial baseado no segmento
          enabledMap.cards = true;
          enabledMap.obras = currentSegment === "obras_only" || currentSegment === "obras_financial";
          enabledMap.legal_cases = currentSegment === "legal";
        }

        setCompanyEnabledModules(enabledMap);

        // 2. Se for Master, tem acesso exatamente aos módulos que a empresa contratou/habilitou
        if (isMasterUser) {
          const activeKeys = SYSTEM_MODULES.filter((m) => enabledMap[m.key]).map((m) => m.key);
          setAccessibleModules(activeKeys);
          setUserEditPermissions(enabledMap);
          return;
        }

        // 3. Para usuários comuns, consulta permissões individuais
        const { data: userPerms } = await supabase
          .from("company_user_module_permissions")
          .select("module_key, can_access, can_edit")
          .eq("company_id", companyId);

        const accessibleList: SystemModuleKey[] = [];
        const editMap: Record<SystemModuleKey, boolean> = {} as any;

        SYSTEM_MODULES.forEach((m) => {
          if (enabledMap[m.key]) {
            const perm = (userPerms || []).find((p: any) => p.module_key === m.key);
            const canAcc = perm ? Boolean(perm.can_access) : true;
            const canEd = perm ? Boolean(perm.can_edit) : true;
            if (canAcc) accessibleList.push(m.key);
            editMap[m.key] = canEd;
          } else {
            editMap[m.key] = false;
          }
        });

        setAccessibleModules(accessibleList);
        setUserEditPermissions(editMap);
      } catch (err) {
        console.error("Erro ao carregar permissões de módulos:", err);
      }
    },
    [supabase]
  );

  const fetchCompaniesData = useCallback(async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setIsMaster(false);
        setUserRole(null);
        setCompanies([]);
        setSelectedCompany(null);
        setLoading(false);
        return;
      }

      // 1. Busca os vínculos e permissões do usuário logado na tabela user_companies
      const { data: userComps, error: userCompsErr } = await supabase
        .from("user_companies")
        .select("company_id, role")
        .eq("user_id", user.id);

      if (userCompsErr) {
        console.error("Erro ao buscar vínculos do usuário:", userCompsErr);
      }

      const hasMasterRole = (userComps || []).some((uc) => uc.role === "master");
      setIsMaster(hasMasterRole);

      let availableCompanies: Company[] = [];

      if (hasMasterRole) {
        // Usuário Master Global: pode ver e gerenciar todas as empresas
        setUserRole("master");
        const { data: allComps } = await supabase
          .from("companies")
          .select("*")
          .order("name");

        availableCompanies = (allComps || []).map((c) => ({
          ...c,
          role: "master",
        }));
      } else if (userComps && userComps.length > 0) {
        // Usuário comum (Admin, Operador ou Visualizador de empresa específica)
        const primaryRole = (userComps[0].role as any) || "admin";
        setUserRole(primaryRole);

        const compIds = userComps.map((uc) => uc.company_id);
        const { data: userCompsList } = await supabase
          .from("companies")
          .select("*")
          .in("id", compIds)
          .order("name");

        availableCompanies = (userCompsList || []).map((c) => {
          const matchingUc = userComps.find((uc) => uc.company_id === c.id);
          return {
            ...c,
            role: matchingUc?.role || primaryRole,
          };
        });
      } else {
        // Usuário sem vínculos cadastrados: NUNCA conceder privilégio Master!
        setIsMaster(false);
        setUserRole("viewer");
        availableCompanies = [];
      }

      setCompanies(availableCompanies);

      // Define a empresa selecionada mantendo sincronizado o objeto atualizado
      let activeComp: Company | null = null;
      if (availableCompanies.length > 0) {
        const savedId = typeof window !== "undefined" ? localStorage.getItem(LOCAL_STORAGE_KEY) : null;
        setSelectedCompany((prev) => {
          if (prev) {
            const updated = availableCompanies.find((c) => c.id === prev.id);
            if (updated) {
              activeComp = updated;
              return updated;
            }
          }
          const matching = availableCompanies.find((c) => c.id === savedId);
          activeComp = matching || availableCompanies[0];
          return activeComp;
        });
      } else {
        setSelectedCompany(null);
      }

      // Carrega os módulos da empresa ativa
      if (activeComp) {
        await fetchModulesData((activeComp as Company).id, hasMasterRole, (activeComp as Company).segment);
      }
    } catch (err) {
      console.error("Erro ao carregar empresas:", err);
    } finally {
      setLoading(false);
    }
  }, [supabase, fetchModulesData]);

  useEffect(() => {
    fetchCompaniesData();

    // Escuta mudanças de sessão de autenticação em tempo real (Login / Logout / Troca de Conta)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "USER_UPDATED" || event === "TOKEN_REFRESHED" || event === "INITIAL_SESSION") {
        fetchCompaniesData();
      } else if (event === "SIGNED_OUT") {
        setIsMaster(false);
        setUserRole(null);
        setCompanies([]);
        setSelectedCompany(null);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [fetchCompaniesData, supabase]);

  const selectCompany = (companyId: string) => {
    const target = companies.find((c) => c.id === companyId);
    if (target) {
      setSelectedCompany(target);
      if (typeof window !== "undefined") {
        localStorage.setItem(LOCAL_STORAGE_KEY, target.id);
      }
      fetchModulesData(target.id, isMaster, target.segment);
    }
  };

  const refreshModules = async () => {
    if (selectedCompany) {
      await fetchModulesData(selectedCompany.id, isMaster, selectedCompany.segment);
    }
  };

  const isModuleAccessible = useCallback(
    (key: SystemModuleKey): boolean => {
      // O módulo só pode ser acessado se estiver explicitamente habilitado para a empresa ativa
      if (!companyEnabledModules[key]) return false;
      return accessibleModules.includes(key);
    },
    [companyEnabledModules, accessibleModules]
  );

  const isModuleEditable = useCallback(
    (key: SystemModuleKey): boolean => {
      if (!companyEnabledModules[key]) return false;
      if (userRole === "viewer") return false;
      return Boolean(userEditPermissions[key] && accessibleModules.includes(key));
    },
    [userRole, companyEnabledModules, userEditPermissions, accessibleModules]
  );

  const createCompany = async (
    name: string,
    cnpj?: string,
    segment: "general" | "legal" | "obras_only" | "obras_financial" = "general"
  ): Promise<Company | null> => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user || !isMaster) return null;

      // 1. Cria a empresa com o segmento/perfil configurado
      const { data: newCompany, error: compError } = await supabase
        .from("companies")
        .insert({
          name: name.trim(),
          cnpj: cnpj?.trim() || null,
          segment: segment,
          is_active: true,
        })
        .select()
        .single();

      if (compError || !newCompany) {
        console.error("Erro ao criar empresa:", compError);
        return null;
      }

      // 2. Vincula o usuário atual como Master na empresa
      await supabase.from("user_companies").insert({
        user_id: user.id,
        company_id: newCompany.id,
        role: "master",
      });

      // 3. Clona categorias padrão para a nova empresa
      try {
        const { error: rpcError } = await supabase.rpc("seed_company_default_categories", {
          p_company_id: newCompany.id,
          p_user_id: user.id,
        });

        if (rpcError) {
          await seedClientCategories(newCompany.id, user.id);
        }
      } catch {
        await seedClientCategories(newCompany.id, user.id);
      }

      // 4. Cria centros de custo padrão
      try {
        await supabase.from("cost_centers").insert([
          { name: "Operação", user_id: user.id, company_id: newCompany.id },
          { name: "Administrativo", user_id: user.id, company_id: newCompany.id },
          { name: "Comercial", user_id: user.id, company_id: newCompany.id },
        ]);
      } catch {}

      // 5. Cria registro inicial em settings
      try {
        await supabase.from("settings").insert({
          company_name: newCompany.name,
          company_id: newCompany.id,
          user_id: user.id,
          webhook_url: "https://placeholder.com/webhook",
        });
      } catch {}

      await fetchCompaniesData();
      return newCompany;
    } catch (err) {
      console.error("Erro inesperado ao criar empresa:", err);
      return null;
    }
  };

  // Helper client-side para seeding de categorias
  async function seedClientCategories(companyId: string, userId: string) {
    for (let i = 0; i < DEFAULT_CATEGORIES_TEMPLATE.length; i++) {
      const parent = DEFAULT_CATEGORIES_TEMPLATE[i];
      const { data: parentCat } = await supabase
        .from("categories")
        .insert({
          name: parent.name,
          type: parent.type,
          sort_order: i + 1,
          user_id: userId,
          company_id: companyId,
        })
        .select("id")
        .single();

      if (parentCat && parent.subs.length > 0) {
        const subInserts = parent.subs.map((subName, sIdx) => ({
          name: subName,
          type: parent.type,
          parent_id: parentCat.id,
          sort_order: sIdx + 1,
          user_id: userId,
          company_id: companyId,
        }));
        await supabase.from("categories").insert(subInserts);
      }
    }
  }

  const refreshCompanies = async () => {
    await fetchCompaniesData();
  };

  return (
    <CompanyContext.Provider
      value={{
        companies,
        selectedCompany,
        isMaster,
        userRole,
        loading,
        accessibleModules,
        companyEnabledModules,
        isModuleAccessible,
        isModuleEditable,
        selectCompany,
        refreshCompanies,
        refreshModules,
        createCompany,
      }}
    >
      {children}
    </CompanyContext.Provider>
  );
}

export function useCompany() {
  const context = useContext(CompanyContext);
  if (!context) {
    throw new Error("useCompany deve ser usado dentro de um CompanyProvider");
  }
  return context;
}
