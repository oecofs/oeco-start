"use client";
import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

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
  const supabase = createClient();
  const [availableYears, setAvailableYears] = useState<number[]>([]);

  // Extrai ano e mês do valor atual
  const [currentYear, currentMonthNum] = value.split("-");
  const selectedYear = parseInt(currentYear);
  const selectedMonthNum = parseInt(currentMonthNum);

  const fetchYears = useCallback(async () => {
    const { data } = await supabase
      .from("transactions")
      .select("month_ref")
      .order("month_ref", { ascending: false });

    const years = new Set<number>();
    (data || []).forEach((t) => {
      const year = parseInt(t.month_ref.split("-")[0]);
      if (!isNaN(year)) years.add(year);
    });

    // Sempre inclui o ano atual
    const now = new Date();
    years.add(now.getFullYear());

    // Ordena do mais recente para o mais antigo
    setAvailableYears(Array.from(years).sort((a, b) => b - a));
  }, [supabase]);

  useEffect(() => {
    fetchYears();
  }, [fetchYears]);

  const handleYearChange = (year: number) => {
    const monthStr = String(selectedMonthNum).padStart(2, "0");
    onChange(`${year}-${monthStr}`);
  };

  const handleMonthChange = (month: number) => {
    const monthStr = String(month).padStart(2, "0");
    onChange(`${selectedYear}-${monthStr}`);
  };

  return (
    <div className="flex gap-2">
      {/* Dropdown de Mês */}
      <select
        value={selectedMonthNum}
        onChange={(e) => handleMonthChange(parseInt(e.target.value))}
        className="px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
      >
        {MONTH_NAMES.map((name, index) => (
          <option key={index + 1} value={index + 1}>
            {name}
          </option>
        ))}
      </select>
      {/* Dropdown de Ano */}
      <select
        value={selectedYear}
        onChange={(e) => handleYearChange(parseInt(e.target.value))}
        className="px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
      >
        {availableYears.map((year) => (
          <option key={year} value={year}>
            {year}
          </option>
        ))}
      </select>
    </div>
  );
}
