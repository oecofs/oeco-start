"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

export type Company = {
  id: string;
  name: string;
  cnpj?: string | null;
  logo_url?: string | null;
  is_active: boolean;
  role?: "master" | "admin" | "operator" | "viewer";
};

type CompanyContextType = {
  companies: Company[];
  selectedCompany: Company | null;
  isMaster: boolean;
  userRole: "master" | "admin" | "operator" | "viewer" | null;
  loading: boolean;
  selectCompany: (companyId: string) => void;
  refreshCompanies: () => Promise<void>;
  createCompany: (name: string, cnpj?: string) => Promise<Company | null>;
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

  const fetchCompaniesData = useCallback(async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setLoading(false);
        return;
      }

      // 1. Busca os vínculos do usuário na tabela user_companies
      const { data: userComps } = await supabase
        .from("user_companies")
        .select("company_id, role")
        .eq("user_id", user.id);

      const hasMasterRole = (userComps || []).some((uc) => uc.role === "master");
      setIsMaster(hasMasterRole);

      let availableCompanies: Company[] = [];

      if (hasMasterRole) {
        setUserRole("master");
        // Master tem acesso a todas as empresas cadastradas
        const { data: allComps } = await supabase
          .from("companies")
          .select("*")
          .order("name");

        availableCompanies = (allComps || []).map((c) => ({
          ...c,
          role: "master",
        }));
      } else if (userComps && userComps.length > 0) {
        setUserRole(userComps[0].role as any);
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
            role: matchingUc?.role || "admin",
          };
        });
      }

      // Fallback: se a tabela de empresas ainda estiver vazia ou sem vínculos,
      // busca se existe alguma empresa na tabela ou utiliza as configurações da empresa
      if (availableCompanies.length === 0) {
        const { data: fallbackComps } = await supabase.from("companies").select("*").limit(10);
        if (fallbackComps && fallbackComps.length > 0) {
          availableCompanies = fallbackComps.map((c) => ({ ...c, role: "master" }));
          setIsMaster(true);
          setUserRole("master");
        } else {
          // Fallback resiliente: busca nome em settings
          const { data: settingsData } = await supabase.from("settings").select("company_name").limit(1).maybeSingle();
          const fallbackName = settingsData?.company_name || "Minha Empresa";
          availableCompanies = [
            {
              id: "default-company",
              name: fallbackName,
              is_active: true,
              role: "master",
            },
          ];
          setIsMaster(true);
          setUserRole("master");
        }
      }

      setCompanies(availableCompanies);

      // Define a empresa selecionada mantendo sincronizado o objeto atualizado
      if (availableCompanies.length > 0) {
        const savedId = typeof window !== "undefined" ? localStorage.getItem(LOCAL_STORAGE_KEY) : null;
        setSelectedCompany((prev) => {
          if (prev) {
            const updated = availableCompanies.find((c) => c.id === prev.id);
            if (updated) return updated;
          }
          const matching = availableCompanies.find((c) => c.id === savedId);
          return matching || availableCompanies[0];
        });
      } else {
        setSelectedCompany(null);
      }
    } catch (err) {
      console.error("Erro ao carregar empresas:", err);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchCompaniesData();
  }, [fetchCompaniesData]);

  const selectCompany = (companyId: string) => {
    const target = companies.find((c) => c.id === companyId);
    if (target) {
      setSelectedCompany(target);
      if (typeof window !== "undefined") {
        localStorage.setItem(LOCAL_STORAGE_KEY, target.id);
      }
    }
  };

  const createCompany = async (name: string, cnpj?: string): Promise<Company | null> => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return null;

      // 1. Cria a empresa
      const { data: newCompany, error: compError } = await supabase
        .from("companies")
        .insert({
          name: name.trim(),
          cnpj: cnpj?.trim() || null,
          is_active: true,
        })
        .select()
        .single();

      if (compError || !newCompany) {
        console.error("Erro ao criar empresa:", compError);
        return null;
      }

      // 2. Vincula o usuário atual à nova empresa
      await supabase.from("user_companies").insert({
        user_id: user.id,
        company_id: newCompany.id,
        role: isMaster ? "master" : "admin",
      });

      // 3. Clona automaticamente as categorias padrão para a nova empresa
      try {
        await supabase.rpc("seed_company_default_categories", {
          p_company_id: newCompany.id,
          p_user_id: user.id,
        });
      } catch {
        // Fallback: inserção direta via client caso a RPC não tenha sido executada no banco
        for (let i = 0; i < DEFAULT_CATEGORIES_TEMPLATE.length; i++) {
          const group = DEFAULT_CATEGORIES_TEMPLATE[i];
          const { data: parentCat } = await supabase
            .from("categories")
            .insert({
              name: group.name,
              type: group.type,
              parent_id: null,
              sort_order: i + 1,
              user_id: user.id,
              company_id: newCompany.id,
            })
            .select("id")
            .single();

          if (parentCat) {
            for (let j = 0; j < group.subs.length; j++) {
              await supabase.from("categories").insert({
                name: group.subs[j],
                type: group.type,
                parent_id: parentCat.id,
                sort_order: j + 1,
                user_id: user.id,
                company_id: newCompany.id,
              });
            }
          }
        }
      }

      // 4. Atualiza a lista e seleciona a nova empresa
      await fetchCompaniesData();
      selectCompany(newCompany.id);

      return newCompany;
    } catch (err) {
      console.error("Erro no fluxo de criação de empresa:", err);
      return null;
    }
  };

  return (
    <CompanyContext.Provider
      value={{
        companies,
        selectedCompany,
        isMaster,
        userRole,
        loading,
        selectCompany,
        refreshCompanies: fetchCompaniesData,
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
