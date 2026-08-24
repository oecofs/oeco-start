"use client";

import React, { useState, useEffect, useRef } from "react";

const MONTH_ABBR = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export default function MonthSelector({
  value,
  onChange,
}: {
  value: string; // YYYY-MM
  onChange: (month: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Extrai ano e mês do valor atual
  const [yearStr, monthStr] = (value || "").split("-");
  const selectedYear = parseInt(yearStr) || new Date().getFullYear();
  const selectedMonthNum = parseInt(monthStr) || new Date().getMonth() + 1; // 1 a 12

  // Ano exibido dentro do modal de meses (pode navegar antes de selecionar)
  const [viewYear, setViewYear] = useState<number>(selectedYear);

  // Sincroniza viewYear quando o valor externo mudar
  useEffect(() => {
    setViewYear(selectedYear);
  }, [selectedYear]);

  // Fecha o popup ao clicar fora
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Navegar mês a mês (setas da barra principal)
  const handlePrevMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    let newMonth = selectedMonthNum - 1;
    let newYear = selectedYear;
    if (newMonth < 1) {
      newMonth = 12;
      newYear -= 1;
    }
    const formatted = `${newYear}-${String(newMonth).padStart(2, "0")}`;
    onChange(formatted);
  };

  const handleNextMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    let newMonth = selectedMonthNum + 1;
    let newYear = selectedYear;
    if (newMonth > 12) {
      newMonth = 1;
      newYear += 1;
    }
    const formatted = `${newYear}-${String(newMonth).padStart(2, "0")}`;
    onChange(formatted);
  };

  // Navegar ano a ano dentro do modal
  const handlePrevYear = (e: React.MouseEvent) => {
    e.stopPropagation();
    setViewYear((prev) => prev - 1);
  };

  const handleNextYear = (e: React.MouseEvent) => {
    e.stopPropagation();
    setViewYear((prev) => prev + 1);
  };

  // Selecionar um mês no grid
  const handleSelectMonth = (monthIndex: number) => {
    const monthFormatted = String(monthIndex + 1).padStart(2, "0");
    onChange(`${viewYear}-${monthFormatted}`);
    setIsOpen(false);
  };

  const currentAbbr = MONTH_ABBR[selectedMonthNum - 1] || "jan";

  return (
    <div className="relative inline-block select-none" ref={containerRef}>
      {/* BARRA PRINCIPAL: <  ago/2026  > */}
      <div className="flex items-center bg-white border border-gray-200 hover:border-primary/40 rounded-xl shadow-xs transition-all">
        {/* Seta Esquerda (Mês Anterior) */}
        <button
          type="button"
          onClick={handlePrevMonth}
          className="px-2.5 py-1.5 text-primary hover:text-primary-dark hover:bg-slate-50 rounded-l-xl transition-colors font-bold text-sm"
          title="Mês anterior"
        >
          ‹
        </button>

        {/* Botão Central: texto ago/2026 */}
        <button
          type="button"
          onClick={() => {
            setViewYear(selectedYear);
            setIsOpen(!isOpen)}
          }
          className="px-3 py-1.5 text-xs font-bold text-slate-800 hover:text-primary transition-colors flex items-center gap-1.5"
          title="Clique para escolher mês e ano"
        >
          <span className="font-semibold tracking-wide">
            {currentAbbr}/{selectedYear}
          </span>
          <span className="text-[9px] text-slate-400">{isOpen ? "▲" : "▼"}</span>
        </button>

        {/* Seta Direita (Próximo Mês) */}
        <button
          type="button"
          onClick={handleNextMonth}
          className="px-2.5 py-1.5 text-primary hover:text-primary-dark hover:bg-slate-50 rounded-r-xl transition-colors font-bold text-sm"
          title="Próximo mês"
        >
          ›
        </button>
      </div>

      {/* POPOVER / DROPDOWN DE SELEÇÃO RÁPIDA DE MESES */}
      {isOpen && (
        <div className="absolute right-0 sm:left-1/2 sm:-translate-x-1/2 top-full mt-2 w-64 bg-white rounded-2xl border border-gray-200 shadow-2xl z-50 p-4 space-y-3 animate-in fade-in zoom-in-95 duration-100">
          {/* Ponta / Triângulo do Popover */}
          <div className="absolute -top-2 right-8 sm:left-1/2 sm:-translate-x-1/2 w-4 h-4 bg-white border-t border-l border-gray-200 transform rotate-45" />

          {/* Navegador de Ano: < 2026 > */}
          <div className="relative flex items-center justify-between border-b border-gray-100 pb-2.5 z-10">
            <button
              type="button"
              onClick={handlePrevYear}
              className="p-1 rounded-lg text-primary hover:bg-slate-100 font-bold text-base transition-colors"
              title="Ano anterior"
            >
              ‹
            </button>

            <span className="font-extrabold text-sm text-gray-900 tracking-wider">
              {viewYear}
            </span>

            <button
              type="button"
              onClick={handleNextYear}
              className="p-1 rounded-lg text-primary hover:bg-slate-100 font-bold text-base transition-colors"
              title="Próximo ano"
            >
              ›
            </button>
          </div>

          {/* Grid 3x4 de Meses (jan, fev, mar, abr...) */}
          <div className="grid grid-cols-4 gap-2 pt-1 z-10 relative">
            {MONTH_ABBR.map((abbr, index) => {
              const isSelected = selectedYear === viewYear && selectedMonthNum === index + 1;
              const isCurrentMonthNow =
                new Date().getFullYear() === viewYear && new Date().getMonth() === index;

              return (
                <button
                  key={abbr}
                  type="button"
                  onClick={() => handleSelectMonth(index)}
                  title={MONTH_NAMES[index]}
                  className={`h-9 flex items-center justify-center rounded-full text-xs font-semibold transition-all relative ${
                    isSelected
                      ? "border-2 border-primary text-primary font-bold bg-primary/10 shadow-xs scale-105"
                      : "text-slate-600 hover:text-primary hover:bg-slate-100"
                  }`}
                >
                  <span>{abbr}</span>
                  {/* Pequeno indicador se for o mês corrente no calendário real */}
                  {!isSelected && isCurrentMonthNow && (
                    <span className="absolute bottom-1 w-1 h-1 rounded-full bg-primary" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
