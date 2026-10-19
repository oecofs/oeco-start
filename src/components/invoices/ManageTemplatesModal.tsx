"use client";

import React, { useState, useMemo, useRef, useEffect } from "react";
import { ServiceTemplate } from "./types";
import { searchCnaeServices, ServiceCnaeDefinition, COMMON_SERVICE_CNAES } from "@/lib/fiscal/cnaeServiceDatabase";

interface ManageTemplatesModalProps {
  isOpen: boolean;
  onClose: () => void;
  templates: ServiceTemplate[];
  onSaveTemplate: (template: ServiceTemplate) => void;
  onDeleteTemplate: (id: string) => void;
}

export default function ManageTemplatesModal({
  isOpen,
  onClose,
  templates,
  onSaveTemplate,
  onDeleteTemplate,
}: ManageTemplatesModalProps) {
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form states
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [cnae, setCnae] = useState("7020-4/00");
  const [lc116, setLc116] = useState("17.01");
  const [issRate, setIssRate] = useState(2.0);
  const [issRetainedDefault, setIssRetainedDefault] = useState(false);

  // Busca interativa de serviço
  const [searchTerm, setSearchTerm] = useState("");
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [selectedServiceDef, setSelectedServiceDef] = useState<ServiceCnaeDefinition | null>(COMMON_SERVICE_CNAES[0]);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowSearchDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const filteredServices = useMemo(() => {
    return searchCnaeServices(searchTerm);
  }, [searchTerm]);

  const resetForm = () => {
    setEditingId(null);
    setName("");
    setDescription("");
    setCnae("");
    setLc116("");
    setIssRate(2.0);
    setIssRetainedDefault(false);
    setSearchTerm("");
    setShowSearchDropdown(false);
    setSelectedServiceDef(null);
  };

  const handleStartCreate = () => {
    resetForm();
    setEditingId("new");
    setDescription("");
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleStartEdit = (tpl: ServiceTemplate) => {
    setEditingId(tpl.id);
    setName(tpl.name);
    setDescription(tpl.description);
    setCnae(tpl.cnae);
    setLc116(tpl.service_code_lc116);
    setIssRate(tpl.default_iss_rate);
    setIssRetainedDefault(tpl.iss_retained_default);

    const match = COMMON_SERVICE_CNAES.find((s) => s.cnae === tpl.cnae);
    if (match) setSelectedServiceDef(match);
  };

  const handleSelectService = (def: ServiceCnaeDefinition) => {
    setSelectedServiceDef(def);
    setCnae(def.cnae);
    setLc116(def.lc116); // Mapeado automaticamente nos bastidores sem assustar o usuário!
    setIssRate(def.default_iss);
    setShowSearchDropdown(false);
    setSearchTerm("");
    if (!name.trim()) {
      setName(def.description.split(" ")[0] + " " + (def.description.split(" ")[1] || ""));
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (!cnae || !selectedServiceDef) {
      alert("Por favor, selecione a atividade econômica do serviço pela busca antes de salvar o modelo.");
      return;
    }

    const tpl: ServiceTemplate = {
      id: editingId === "new" ? `tpl-${Date.now()}` : editingId!,
      name: name.trim(),
      description: description.trim(),
      cnae: cnae.trim(),
      service_code_lc116: lc116.trim(),
      default_iss_rate: issRate,
      iss_retained_default: issRetainedDefault,
    };

    onSaveTemplate(tpl);
    resetForm();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* TOPO DO MODAL */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center text-xl font-bold border border-amber-100">
              ⚡
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Modelos de Serviço (Templates Fiscais)
              </h2>
              <p className="text-xs text-slate-500">
                Templates exclusivos desta empresa para agilizar a emissão de notas
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleClose}
            className="w-8 h-8 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-500 text-xs font-bold transition-all cursor-pointer flex items-center justify-center"
          >
            ✕
          </button>
        </div>

        {/* CORPO DO MODAL */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {editingId ? (
            /* FORMULÁRIO DE CRIAÇÃO / EDIÇÃO */
            <form onSubmit={handleSave} className="space-y-4 animate-in fade-in duration-150">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  {editingId === "new" ? "+ Novo Modelo de Serviço" : "Editar Modelo de Serviço"}
                </h3>
                <button
                  type="button"
                  onClick={resetForm}
                  className="text-xs text-slate-500 hover:text-slate-800 underline font-medium cursor-pointer"
                >
                  Voltar para lista
                </button>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Nome do Modelo *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Consultoria Mensal, Medição de Obra, Honorários Contábeis..."
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full text-xs text-slate-900 bg-white border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 font-medium"
                />
              </div>

              {/* SELEÇÃO INTELIGENTE DE ATIVIDADE / CNAE (COM MAPEAMENTO FISCAL AUTOMÁTICO) */}
              <div className="space-y-1.5 bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
                <label className="text-xs font-bold text-slate-800 block">
                  Tipo de Atividade / Serviço *
                </label>
                <span className="text-[11px] text-slate-500 block mb-1">
                  Digite para pesquisar por nome. O sistema vincula o CNAE e o código municipal automaticamente.
                </span>

                <div ref={dropdownRef} className="relative">
                  <input
                    type="text"
                    placeholder="Buscar serviço... Ex: consultoria, obra, pintura, marcenaria, elétrica..."
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setShowSearchDropdown(true);
                    }}
                    onFocus={() => setShowSearchDropdown(true)}
                    className="w-full text-xs text-slate-900 bg-white border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                  />

                  {showSearchDropdown && (
                    <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-2xl shadow-xl z-20 max-h-52 overflow-y-auto divide-y divide-slate-100 p-1">
                      {filteredServices.map((def) => (
                        <button
                          key={def.cnae}
                          type="button"
                          onClick={() => handleSelectService(def)}
                          className="w-full text-left p-2 hover:bg-slate-50 rounded-xl transition-all flex flex-col gap-0.5 cursor-pointer"
                        >
                          <span className="text-xs font-bold text-slate-800">{def.description}</span>
                          <span className="text-[10px] text-slate-500 font-mono">
                            CNAE: {def.cnae} • ISS sugerido: {def.default_iss}%
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Tag de Atividade Selecionada ou Alerta se em branco */}
                {selectedServiceDef ? (
                  <div className="flex items-center justify-between bg-white p-2.5 rounded-xl border border-slate-200 text-xs mt-2">
                    <div className="space-y-0.5">
                      <strong className="text-slate-900 text-xs block">
                        {selectedServiceDef.description}
                      </strong>
                      <span className="text-[10px] font-mono text-slate-500">
                        CNAE {cnae} • Regime: Simples Nacional
                      </span>
                    </div>

                    <div className="text-right">
                      <label className="text-[10px] font-bold text-slate-500 block">Alíquota ISS (%)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={issRate}
                        onChange={(e) => setIssRate(parseFloat(e.target.value) || 0)}
                        className="w-16 text-xs text-right font-bold text-slate-900 border border-slate-200 rounded-lg px-2 py-0.5 font-mono"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-xl text-xs text-amber-800 flex items-center gap-2 mt-2">
                    <span>💡</span>
                    <span>Nenhuma atividade selecionada. Use a busca acima para selecionar a atividade correspondente ao serviço.</span>
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-700">
                    Texto Padrão da Discriminação dos Serviços
                  </label>
                  <span className="text-[10px] text-slate-400">
                    Use <strong className="text-amber-700">{"{MES_REFERENCIA}"}</strong> para o mês automático
                  </span>
                </div>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Ex: Serviços prestados de assessoria referente ao mês de {MES_REFERENCIA}."
                  className="w-full text-xs text-slate-800 bg-white border border-slate-200 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 leading-relaxed"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer"
                >
                  Salvar Modelo
                </button>
              </div>
            </form>
          ) : (
            /* LISTAGEM DOS TEMPLATES ATUAIS */
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Modelos desta Empresa ({templates.length})
                </span>

                <button
                  type="button"
                  onClick={handleStartCreate}
                  className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-2xs cursor-pointer"
                >
                  <span>+</span> Novo Modelo
                </button>
              </div>

              {templates.length === 0 ? (
                <div className="text-center py-10 bg-slate-50 rounded-2xl border border-slate-200/80 p-6 space-y-2">
                  <div className="text-2xl">⚡</div>
                  <h4 className="text-xs font-bold text-slate-700">Nenhum modelo cadastrado para esta empresa</h4>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    Crie modelos para os serviços que a empresa emite com frequência, ou emita direto de forma avulsa.
                  </p>
                  <button
                    type="button"
                    onClick={handleStartCreate}
                    className="mt-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl shadow-xs"
                  >
                    + Criar Primeiro Modelo
                  </button>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {templates.map((tpl) => (
                    <div
                      key={tpl.id}
                      className="p-4 rounded-2xl bg-slate-50/70 border border-slate-200/80 hover:border-slate-300 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <strong className="text-xs font-bold text-slate-900">{tpl.name}</strong>
                          <span className="text-[10px] font-mono font-bold bg-white px-2 py-0.5 rounded border border-slate-200 text-slate-600">
                            CNAE {tpl.cnae}
                          </span>
                          <span className="text-[10px] font-mono font-bold bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded border border-emerald-200">
                            ISS: {tpl.default_iss_rate}%
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 line-clamp-1 italic">
                          "{tpl.description}"
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleStartEdit(tpl)}
                          className="px-2.5 py-1 text-xs font-bold rounded-lg border border-slate-200 hover:bg-white text-slate-700 transition-all cursor-pointer"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (confirm(`Deseja excluir o modelo "${tpl.name}"?`)) {
                              onDeleteTemplate(tpl.id);
                            }
                          }}
                          className="px-2.5 py-1 text-xs font-bold rounded-lg border border-slate-200 hover:bg-rose-50 text-rose-600 transition-all cursor-pointer"
                        >
                          Excluir
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* RODAPÉ DO MODAL */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex justify-end">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-xl transition-all cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
