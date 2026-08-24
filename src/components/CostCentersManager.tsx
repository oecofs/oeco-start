"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";

type CostCenter = {
  id: string;
  name: string;
};

export default function CostCentersManager() {
  const supabase = createClient();
  const { selectedCompany } = useCompany();
  const [centers, setCenters] = useState<CostCenter[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const fetchCenters = useCallback(async () => {
    if (!selectedCompany) {
      setCenters([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data, error } = await supabase
      .from("cost_centers")
      .select("*")
      .eq("company_id", selectedCompany.id)
      .order("name");

    if (error) {
      setError("Erro ao carregar centros de custo.");
    } else {
      setCenters(data || []);
    }
    setLoading(false);
  }, [supabase, selectedCompany]);

  useEffect(() => {
    fetchCenters();
  }, [fetchCenters]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim() || !selectedCompany) return;
    setError("");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error } = await supabase
      .from("cost_centers")
      .insert({
        name: newName.trim(),
        company_id: selectedCompany.id,
        user_id: user?.id,
      });

    if (error) {
      setError("Erro ao criar centro de custo. Talvez já exista.");
      return;
    }

    setSuccess("Centro de custo criado!");
    setNewName("");
    fetchCenters();
  }

  async function handleSave(id: string) {
    if (!editName.trim()) return;
    setError("");

    const { error } = await supabase
      .from("cost_centers")
      .update({ name: editName.trim() })
      .eq("id", id);

    if (error) {
      setError("Erro ao atualizar.");
      return;
    }

    setSuccess("Centro de custo atualizado!");
    setEditingId(null);
    fetchCenters();
  }

  async function handleDelete(id: string) {
    if (!confirm("Excluir este centro de custo?")) return;

    const { error } = await supabase
      .from("cost_centers")
      .delete()
      .eq("id", id);

    if (error) {
      setError("Erro ao excluir.");
      return;
    }

    setSuccess("Centro de custo excluído.");
    fetchCenters();
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-6">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">Centros de Custo</h3>

      {error && (
        <div className="mb-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
      )}
      {success && (
        <div className="mb-3 text-sm text-green-600 bg-green-50 border border-green-200 rounded-lg px-3 py-2">{success}</div>
      )}

      {/* Add new */}
      <form onSubmit={handleAdd} className="flex gap-2 mb-4">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Ex: Operação"
          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <button type="submit" className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-dark transition-colors">
          + Adicionar
        </button>
      </form>

      {/* List */}
      {loading ? (
        <p className="text-gray-400 text-sm">Carregando...</p>
      ) : centers.length === 0 ? (
        <p className="text-gray-400 text-sm text-center py-4">
          Nenhum centro de custo criado ainda.
        </p>
      ) : (
        <div className="space-y-2">
          {centers.map((cc) => (
            <div key={cc.id} className="flex items-center justify-between py-2 px-2 hover:bg-gray-50 rounded-lg">
              {editingId === cc.id ? (
                <div className="flex gap-1 flex-1">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    autoFocus
                  />
                  <button onClick={() => handleSave(cc.id)} className="text-xs text-primary hover:bg-primary/10 px-2 py-1 rounded">✓</button>
                  <button onClick={() => setEditingId(null)} className="text-xs text-gray-500 hover:bg-gray-100 px-2 py-1 rounded">✕</button>
                </div>
              ) : (
                <>
                  <span className="text-gray-700 text-sm font-medium">{cc.name}</span>
                  <div className="flex gap-1">
                    <button
                      onClick={() => { setEditingId(cc.id); setEditName(cc.name); }}
                      className="text-xs text-gray-500 hover:bg-gray-100 px-2 py-1 rounded"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => handleDelete(cc.id)}
                      className="text-xs text-red-500 hover:bg-red-50 px-2 py-1 rounded"
                    >
                      Excluir
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
