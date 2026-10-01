"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import CategoriesManager from "@/components/CategoriesManager";
import SuppliersManager from "@/components/SuppliersManager";
import TeamManager from "@/components/TeamManager";

type ObrasConfigTab = "categories" | "suppliers" | "team";

export default function ObrasConfiguracoesPage() {
  const { selectedCompany } = useCompany();
  const supabase = createClient();
  const [activeTab, setActiveTab] = useState<ObrasConfigTab>("categories");
  const [seeding, setSeeding] = useState(false);
  const [seedSuccess, setSeedSuccess] = useState(false);

  async function handleSeedConstructionCategories() {
    if (!selectedCompany?.id) return;
    if (
      !confirm(
        "Deseja carregar o catálogo padrão de categorias para Construção Civil (Materiais Básicos, Hidráulica, Elétrica, Mão de Obra, Acabamento, Equipamentos, etc.)?"
      )
    ) {
      return;
    }

    setSeeding(true);
    setSeedSuccess(false);
    try {
      const { error } = await supabase.rpc("seed_construction_categories", {
        p_company_id: selectedCompany.id,
      });

      if (error) throw error;

      setSeedSuccess(true);
      window.location.reload();
    } catch (err: any) {
      alert(err.message || "Erro ao carregar categorias.");
    } finally {
      setSeeding(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Link
              href="/obras"
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            >
              ←
            </Link>
            <h1 className="text-xl sm:text-2xl font-black text-gray-900">
              Configurações — Oeco Obras
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">
            Personalize o plano de categorias, fornecedores e equipe da empresa ativa.
          </p>
        </div>

        {activeTab === "categories" && (
          <button
            type="button"
            onClick={handleSeedConstructionCategories}
            disabled={seeding}
            className="inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 font-bold text-xs shadow-2xs transition-all active:scale-95 disabled:opacity-50"
          >
            <span>🏗️</span> {seeding ? "Carregando..." : "Carregar Categorias Padrão de Obra"}
          </button>
        )}
      </div>

      {seedSuccess && (
        <div className="p-4 rounded-2xl bg-emerald-50 text-emerald-800 border border-emerald-200 text-sm font-semibold">
          ✓ Categorias de Construção Civil geradas com sucesso!
        </div>
      )}

      {/* Sub-tabs Elegantes */}
      <div className="flex gap-2 border-b border-gray-200">
        {[
          { id: "categories", label: "🏷️ Categorias de Custos" },
          { id: "suppliers", label: "🏢 Fornecedores" },
          { id: "team", label: "👥 Equipe & Acessos" },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id as any)}
            className={`pb-3 px-3 text-xs sm:text-sm font-bold border-b-2 transition-all ${
              activeTab === tab.id
                ? "border-amber-800 text-amber-950 font-black"
                : "border-transparent text-gray-500 hover:text-gray-800"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Conteúdo da Tab */}
      <div className="pt-2">
        {activeTab === "categories" && <CategoriesManager />}
        {activeTab === "suppliers" && <SuppliersManager />}
        {activeTab === "team" && <TeamManager />}
      </div>
    </div>
  );
}
