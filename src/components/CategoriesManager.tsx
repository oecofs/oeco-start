"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

type Category = {
  id: string;
  name: string;
  type: "income" | "expense";
  parent_id: string | null;
  cost_center: string | null;
  sort_order: number;
  created_at: string;
};

type CategoryFormData = {
  name: string;
  type: "income" | "expense";
  cost_center: string;
  parent_id: string | null;
};

export default function CategoriesManager() {
  const supabase = createClient();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formParentId, setFormParentId] = useState<string | null>(null);
  const [formData, setFormData] = useState<CategoryFormData>({
    name: "",
    type: "expense",
    cost_center: "",
    parent_id: null,
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Top-level categories (parent_id = null) grouped by type
  const topLevelCategories = categories.filter((c) => c.parent_id === null);
  const incomeCategories = topLevelCategories.filter((c) => c.type === "income");
  const expenseCategories = topLevelCategories.filter((c) => c.type === "expense");

  // Get subcategories for a given parent
  function getSubcategories(parentId: string): Category[] {
    return categories.filter((c) => c.parent_id === parentId);
  }

  // Fetch all categories
  const fetchCategories = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("categories")
      .select("*")
      .order("type", { ascending: true })
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (error) {
      setError("Erro ao carregar categorias.");
    } else {
      setCategories(data || []);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  // Open form for new category
  function handleNewCategory(parentId: string | null = null) {
    setEditingId(null);
    setFormParentId(parentId);
    const parent = parentId ? categories.find((c) => c.id === parentId) : null;
    setFormData({
      name: "",
      type: parent ? parent.type : "expense",
      cost_center: parent?.cost_center || "",
      parent_id: parentId,
    });
    setShowForm(true);
    setError("");
    setSuccess("");
  }

  // Open form for editing
  function handleEdit(category: Category) {
    setEditingId(category.id);
    setFormParentId(category.parent_id);
    setFormData({
      name: category.name,
      type: category.type,
      cost_center: category.cost_center || "",
      parent_id: category.parent_id,
    });
    setShowForm(true);
    setError("");
    setSuccess("");
  }

  // Save (create or update)
  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!formData.name.trim()) {
      setError("O nome da categoria é obrigatório.");
      return;
    }

    const payload = {
      name: formData.name.trim(),
      type: formData.type,
      cost_center: formData.cost_center.trim() || null,
      parent_id: formData.parent_id,
      sort_order: 0,
    };

    if (editingId) {
      const { error } = await supabase
        .from("categories")
        .update(payload)
        .eq("id", editingId);

      if (error) {
        setError("Erro ao atualizar categoria.");
        return;
      }
      setSuccess("Categoria atualizada com sucesso!");
    } else {
      const { error } = await supabase.from("categories").insert(payload);

      if (error) {
        setError("Erro ao criar categoria.");
        return;
      }
      setSuccess("Categoria criada com sucesso!");
    }

    setShowForm(false);
    fetchCategories();
  }

  // Delete
  async function handleDelete(category: Category) {
    if (!confirm(`Excluir "${category.name}"? As subcategorias também serão excluídas.`)) {
      return;
    }

    const { error } = await supabase
      .from("categories")
      .delete()
      .eq("id", category.id);

    if (error) {
      setError("Erro ao excluir categoria.");
      return;
    }

    setSuccess("Categoria excluída.");
    fetchCategories();
  }

  // Render a category row with its subcategories
  function renderCategoryRow(category: Category) {
    const subs = getSubcategories(category.id);
    return (
      <div key={category.id} className="border-b border-gray-100 last:border-0">
        <div className="flex items-center justify-between py-3 px-2 hover:bg-gray-50 rounded-lg">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className={`text-xs px-2 py-0.5 rounded-full ${category.type === "income" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
              {category.type === "income" ? "Entrada" : "Saída"}
            </span>
            <span className="font-medium text-gray-800 truncate">{category.name}</span>
            {category.cost_center && (
              <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">{category.cost_center}</span>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={() => handleNewCategory(category.id)} className="text-xs text-primary hover:bg-primary/10 px-2 py-1 rounded">+ Sub</button>
            <button onClick={() => handleEdit(category)} className="text-xs text-gray-500 hover:bg-gray-100 px-2 py-1 rounded">Editar</button>
            <button onClick={() => handleDelete(category)} className="text-xs text-red-500 hover:bg-red-50 px-2 py-1 rounded">Excluir</button>
          </div>
        </div>
        {/* Subcategories */}
        {subs.length > 0 && (
          <div className="ml-6 mb-2">
            {subs.map((sub) => (
              <div key={sub.id} className="flex items-center justify-between py-2 px-2 hover:bg-gray-50 rounded-lg">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span className="text-gray-300">↳</span>
                  <span className="text-gray-700 text-sm truncate">{sub.name}</span>
                  {sub.cost_center && (
                    <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">{sub.cost_center}</span>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => handleEdit(sub)} className="text-xs text-gray-500 hover:bg-gray-100 px-2 py-1 rounded">Editar</button>
                  <button onClick={() => handleDelete(sub)} className="text-xs text-red-500 hover:bg-red-50 px-2 py-1 rounded">Excluir</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-800">Categorias</h3>
        <button onClick={() => handleNewCategory(null)} className="text-sm bg-primary text-white px-3 py-1.5 rounded-lg hover:bg-primary-dark transition-colors">
          + Nova categoria
        </button>
      </div>

      {error && (
        <div className="mb-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
      )}
      {success && (
        <div className="mb-3 text-sm text-green-600 bg-green-50 border border-green-200 rounded-lg px-3 py-2">{success}</div>
      )}

      {loading ? (
        <p className="text-gray-400 text-sm">Carregando...</p>
      ) : categories.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-gray-400 mb-2">Nenhuma categoria criada ainda.</p>
          <p className="text-sm text-gray-400">Clique em "Nova categoria" para começar.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Expense categories */}
          {expenseCategories.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-500 uppercase mb-2">Saídas</h4>
              {expenseCategories.map((cat) => renderCategoryRow(cat))}
            </div>
          )}
          {/* Income categories */}
          {incomeCategories.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-500 uppercase mb-2">Entradas</h4>
              {incomeCategories.map((cat) => renderCategoryRow(cat))}
            </div>
          )}
        </div>
      )}

      {/* Modal form */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-[60] p-0 md:p-4" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-t-2xl md:rounded-2xl w-full md:max-w-md p-4 md:p-6 max-h-[95vh] overflow-y-auto pb-8" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-800 mb-4">
              {editingId ? "Editar categoria" : formParentId ? "Nova subcategoria" : "Nova categoria"}
            </h3>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
                <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  placeholder="Ex: Fornecedores" autoFocus />
              </div>
              {!formParentId && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
                  <select value={formData.type} onChange={(e) => setFormData({ ...formData, type: e.target.value as "income" | "expense" })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent">
                    <option value="expense">Saída</option>
                    <option value="income">Entrada</option>
                  </select>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Centro de custo (opcional)</label>
                <input type="text" value={formData.cost_center} onChange={(e) => setFormData({ ...formData, cost_center: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  placeholder="Ex: Operação" />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowForm(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors">
                  Cancelar
                </button>
                <button type="submit"
                  className="flex-1 px-4 py-2 bg-primary text-white font-medium rounded-lg hover:bg-primary-dark transition-colors">
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
