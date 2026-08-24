"use client";

import React, { useState, useRef, useEffect } from "react";
import { useCompany } from "@/contexts/CompanyContext";

export default function CompanySwitcher({
  onOpenNewCompanyModal,
}: {
  onOpenNewCompanyModal?: () => void;
}) {
  const { companies, selectedCompany, isMaster, selectCompany, loading } = useCompany();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fecha o dropdown ao clicar fora
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (loading) {
    return (
      <div className="px-3 py-2 bg-slate-100/80 rounded-xl animate-pulse text-xs text-slate-400">
        Carregando empresas...
      </div>
    );
  }

  // Se não houver empresa selecionada ou apenas 1 empresa (sem permissão master)
  const canSwitch = isMaster || companies.length > 1;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        disabled={!canSwitch}
        onClick={() => canSwitch && setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-left transition-all border ${
          isOpen
            ? "bg-slate-100 border-primary/30 shadow-sm"
            : "bg-white/80 hover:bg-slate-50 border-slate-200"
        } ${canSwitch ? "cursor-pointer" : "cursor-default"}`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold text-xs flex-shrink-0">
            🏢
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-slate-800 truncate block">
                {selectedCompany?.name || "Selecionar Empresa"}
              </span>
              {isMaster && (
                <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 uppercase tracking-wider flex-shrink-0">
                  Master
                </span>
              )}
            </div>
            <span className="text-[10px] text-slate-400 block truncate">
              {selectedCompany?.cnpj || (canSwitch ? "Alternar empresa" : "Empresa ativa")}
            </span>
          </div>
        </div>

        {canSwitch && (
          <span className="text-slate-400 text-xs flex-shrink-0 ml-1">
            {isOpen ? "▲" : "▼"}
          </span>
        )}
      </button>

      {/* Dropdown Menu */}
      {isOpen && canSwitch && (
        <div className="absolute left-0 right-0 top-full mt-1.5 bg-white rounded-xl border border-slate-200 shadow-xl z-50 overflow-hidden py-1">
          <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 flex items-center justify-between">
            <span>Empresas ({companies.length})</span>
            {isMaster && <span className="text-primary">Visão Global</span>}
          </div>

          <div className="max-h-56 overflow-y-auto py-1">
            {companies.map((comp) => {
              const isCurrent = comp.id === selectedCompany?.id;
              return (
                <button
                  key={comp.id}
                  onClick={() => {
                    selectCompany(comp.id);
                    setIsOpen(false);
                  }}
                  className={`w-full px-3 py-2 text-left flex items-center justify-between text-xs transition-colors ${
                    isCurrent
                      ? "bg-primary/5 text-primary font-bold"
                      : "text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <div className="min-w-0 pr-2">
                    <span className="truncate block">{comp.name}</span>
                    {comp.cnpj && (
                      <span className="text-[10px] text-slate-400 block truncate">
                        {comp.cnpj}
                      </span>
                    )}
                  </div>
                  {isCurrent && <span className="text-primary text-xs">✓</span>}
                </button>
              );
            })}
          </div>

          {/* Botão de Nova Empresa para Master */}
          {isMaster && onOpenNewCompanyModal && (
            <div className="border-t border-slate-100 p-1.5 bg-slate-50">
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  onOpenNewCompanyModal();
                }}
                className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 bg-primary text-white text-xs font-semibold rounded-lg hover:bg-primary-dark transition-colors shadow-sm"
              >
                <span>+</span> Nova Empresa
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
