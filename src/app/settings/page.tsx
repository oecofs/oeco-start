"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getWhiteLabelConfig } from "@/lib/whitelabel";
import Navigation from "@/components/Navigation";
import CategoriesManager from "@/components/CategoriesManager";

export default function SettingsPage() {
  const wl = getWhiteLabelConfig();
  const router = useRouter();
  const supabase = createClient();

  const [companyName, setCompanyName] = useState("");
  const [bankName, setBankName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error">("success");

  // Load settings on mount
  const loadSettings = useCallback(async () => {
    const { data, error } = await supabase.from("settings").select("*").limit(1).single();

    if (error && error.code !== "PGRST116") {
      // PGRST116 = no rows found, which is normal on first load
      setError("Erro ao carregar configurações.");
      setLoading(false);
      return;
    }

    if (data) {
      setCompanyName(data.company_name || "");
      setBankName(data.bank_name || "");
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  function setError(msg: string) {
    setMessage(msg);
    setMessageType("error");
  }

  function setSuccess(msg: string) {
    setMessage(msg);
    setMessageType("success");
  }

  // Save company settings
  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage("");

    if (!companyName.trim()) {
      setError("O nome da empresa é obrigatório.");
      setSaving(false);
      return;
    }

    // Check if settings record exists
    const { data: existing } = await supabase.from("settings").select("id").limit(1).single();

    if (existing) {
      // Update
      const { error } = await supabase
        .from("settings")
        .update({
          company_name: companyName.trim(),
          bank_name: bankName.trim() || null,
        })
        .eq("id", existing.id);

      if (error) {
        setError("Erro ao salvar configurações.");
      } else {
        setSuccess("Configurações salvas com sucesso!");
      }
    } else {
      // Create new record — webhook_url comes from env var
      const { error } = await supabase.from("settings").insert({
        company_name: companyName.trim(),
        bank_name: bankName.trim() || null,
        webhook_url: wl.webhookUrl || "https://placeholder.com/webhook",
      });

      if (error) {
        setError("Erro ao salvar configurações.");
      } else {
        setSuccess("Configurações salvas com sucesso!");
      }
    }

    setSaving(false);
  }

  // Logout
  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  if (loading) {
    return (
      <Navigation>
        <div className="p-4 md:p-8">
          <p className="text-gray-400">Carregando...</p>
        </div>
      </Navigation>
    );
  }

  return (
    <Navigation>
      <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold text-gray-800">Configurações</h1>

        {/* Company settings */}
        <form onSubmit={handleSaveSettings} className="bg-white rounded-xl border border-gray-200 p-4 md:p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-800">Dados da empresa</h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nome da empresa</label>
            <input type="text" value={companyName} onChange={(e) => setCompanyName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              placeholder="Ex: Padaria São João" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Banco principal</label>
            <input type="text" value={bankName} onChange={(e) => setBankName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              placeholder="Ex: Banco do Brasil" />
          </div>

          {/* webhook_url is NOT shown — configured via env var */}
          {/* It's stored in settings table automatically on first save */}

          <button type="submit" disabled={saving}
            className="px-4 py-2 bg-primary text-white font-medium rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </form>

        {/* Categories management */}
        <CategoriesManager />

        {/* Logout */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-6">
          <button onClick={handleLogout}
            className="w-full md:w-auto px-4 py-2 bg-red-50 text-red-600 font-medium rounded-lg hover:bg-red-100 transition-colors">
            Sair (logout)
          </button>
        </div>

        {/* Toast message */}
        {message && (
          <div className={`fixed bottom-20 md:bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg shadow-lg z-50 text-sm ${
            messageType === "success" ? "bg-green-600 text-white" : "bg-red-600 text-white"
          }`}>
            {message}
          </div>
        )}
      </div>
    </Navigation>
  );
}
