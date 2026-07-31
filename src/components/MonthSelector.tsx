"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

type MonthOption = {
  value: string; // YYYY-MM
  label: string; // "Julho de 2026"
};

export default function MonthSelector({
  value,
  onChange,
}: {
  value: string;
  onChange: (month: string) => void;
}) {
  const supabase = createClient();
  const [months, setMonths] = useState<MonthOption[]>([]);

  const monthNames = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
  ];

  const getCurrentMonth = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  };

  const formatMonthLabel = (monthRef: string) => {
    const [year, month] = monthRef.split("-");
    const monthIndex = parseInt(month) - 1;
    return `${monthNames[monthIndex]} de ${year}`;
  };

  const fetchMonths = useCallback(async () => {
    // Busca meses que têm transações
    const { data } = await supabase
      .from("transactions")
      .select("month_ref")
      .order("month_ref", { ascending: false });

    const uniqueMonths = [...new Set((data || []).map((t) => t.month_ref))];

    // Adiciona o mês atual se não estiver na lista
    const currentMonth = getCurrentMonth();
    if (!uniqueMonths.includes(currentMonth)) {
      uniqueMonths.unshift(currentMonth);
    }

    // Ordena do mais recente para o mais antigo
    uniqueMonths.sort((a, b) => b.localeCompare(a));

    const options = uniqueMonths.map((m) => ({
      value: m,
      label: formatMonthLabel(m),
    }));

    setMonths(options);

    // Se o valor atual não está na lista, usa o mês atual
    if (!uniqueMonths.includes(value)) {
      onChange(currentMonth);
    }
  }, [supabase, value, onChange]);

  useEffect(() => {
    fetchMonths();
  }, [fetchMonths]);

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
    >
      {months.map((month) => (
        <option key={month.value} value={month.value}>
          {month.label}
        </option>
      ))}
    </select>
  );
}
