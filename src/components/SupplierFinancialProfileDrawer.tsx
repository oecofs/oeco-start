"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { Supplier } from "@/app/payables/page";

export type SupplierProfileDrawerProps = {
  isOpen: boolean;
  onClose: () => void;
  supplier: Supplier | null;
  companyId: string;
  companyName: string;
};

type SupplierPayable = {
  id: string;
  description: string;
  amount: number;
  paid_amount: number;
  due_date: string;
  month_ref: string;
  status: "open" | "paid" | "partial" | "overdue" | "cancelled";
  barcode_or_pix?: string | null;
  paid_at?: string | null;
  attachment_url?: string | null;
};

type SupplierTransaction = {
  id: string;
  date: string;
  description: string;
  amount: number;
  bank_account_name?: string;
};

function formatBRL(val: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val || 0);
}

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return "—";
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

export default function SupplierFinancialProfileDrawer({
  isOpen,
  onClose,
  supplier,
  companyId,
  companyName,
}: SupplierProfileDrawerProps) {
  const supabase = createClient();

  const [activeTab, setActiveTab] = useState<"payables" | "transactions">("payables");
  const [loading, setLoading] = useState(false);
  const [payables, setPayables] = useState<SupplierPayable[]>([]);
  const [transactions, setTransactions] = useState<SupplierTransaction[]>([]);

  const fetchSupplierData = useCallback(async () => {
    if (!supplier || !companyId) return;

    setLoading(true);
    try {
      // 1. Busca contas a pagar deste fornecedor
      let query = supabase
        .from("payables")
        .select("*")
        .eq("company_id", companyId)
        .eq("is_active", true);

      if (supplier.id) {
        query = query.or(`supplier_id.eq.${supplier.id},supplier_name.eq.${supplier.name}`);
      } else {
        query = query.eq("supplier_name", supplier.name);
      }

      const { data: payData } = await query.order("due_date", { ascending: false });

      // 2. Busca transações bancárias vinculadas a este fornecedor
      const payIds = (payData || []).map((p) => p.id);
      let trxList: SupplierTransaction[] = [];

      if (payIds.length > 0) {
        const { data: trxData } = await supabase
          .from("transactions")
          .select("id, date, description, amount, payable_id, bank_accounts(name)")
          .in("payable_id", payIds)
          .order("date", { ascending: false });

        if (trxData) {
          trxList = trxData.map((t: any) => ({
            id: t.id,
            date: t.date,
            description: t.description,
            amount: Math.abs(Number(t.amount)),
            bank_account_name: t.bank_accounts?.name,
          }));
        }
      }

      setPayables(payData || []);
      setTransactions(trxList);
    } catch (err) {
      console.error("Erro ao carregar dados do fornecedor:", err);
    } finally {
      setLoading(false);
    }
  }, [supplier, companyId, supabase]);

  useEffect(() => {
    if (isOpen && supplier) {
      fetchSupplierData();
    }
  }, [isOpen, supplier, fetchSupplierData]);

  // Cálculos Consolidados de KPIs
  const stats = useMemo(() => {
    const today = new Date().toISOString().split("T")[0];

    const totalAmount = payables.reduce((sum, p) => sum + Number(p.amount), 0);
    const totalPaid = payables.reduce((sum, p) => sum + Number(p.paid_amount || 0), 0);
    const totalPending = Math.max(0, totalAmount - totalPaid);

    const overdueItems = payables.filter((p) => p.due_date < today && p.status !== "paid");
    const totalOverdue = overdueItems.reduce(
      (sum, p) => sum + Math.max(0, Number(p.amount) - Number(p.paid_amount || 0)),
      0
    );

    return {
      totalAmount,
      totalPaid,
      totalPending,
      totalOverdue,
      overdueCount: overdueItems.length,
    };
  }, [payables]);

  if (!isOpen || !supplier) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-2xl bg-white shadow-2xl flex flex-col border-l border-gray-200">
          {/* Header do Drawer */}
          <div className="p-6 border-b border-gray-100 bg-[#FAF8F5]">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xl font-bold text-gray-900">{supplier.name}</span>
                  {supplier.cnpj && (
                    <span className="font-mono text-xs bg-white text-slate-700 px-2.5 py-0.5 rounded-lg border border-slate-200 font-semibold">
                      {supplier.cnpj}
                    </span>
                  )}
                </div>

                {supplier.default_pix_or_barcode && (
                  <p className="text-xs text-slate-500 font-mono pt-1">
                    🔑 Pix / Código: {supplier.default_pix_or_barcode}
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={onClose}
                className="p-1 text-gray-400 hover:text-gray-700 text-xl font-bold rounded-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* KPI Cards do Fornecedor */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-4">
              <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-2xs">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 block">
                  Total Já Pago
                </span>
                <span className="text-sm font-extrabold text-emerald-700 mt-0.5 block">
                  {formatBRL(stats.totalPaid)}
                </span>
              </div>

              <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-2xs">
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 block">
                  A Pagar / Pendente
                </span>
                <span className="text-sm font-extrabold text-amber-700 mt-0.5 block">
                  {formatBRL(stats.totalPending)}
                </span>
              </div>

              <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-2xs">
                <span className="text-[10px] font-bold uppercase tracking-wider text-red-600 block">
                  Em Atraso
                </span>
                <span
                  className={`text-sm font-extrabold mt-0.5 block ${
                    stats.totalOverdue > 0 ? "text-red-700" : "text-slate-400"
                  }`}
                >
                  {formatBRL(stats.totalOverdue)}
                </span>
              </div>
            </div>
          </div>

          {/* Abas do Dossiê */}
          <div className="flex border-b border-gray-200 px-6 gap-2 bg-white">
            <button
              type="button"
              onClick={() => setActiveTab("payables")}
              className={`py-3 px-3 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === "payables"
                  ? "border-primary text-primary"
                  : "border-transparent text-gray-400 hover:text-gray-700"
              }`}
            >
              <span>💳</span>
              <span>Contas & Boletos</span>
              <span className="text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.2 rounded-full font-semibold">
                {payables.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("transactions")}
              className={`py-3 px-3 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === "transactions"
                  ? "border-primary text-primary"
                  : "border-transparent text-gray-400 hover:text-gray-700"
              }`}
            >
              <span>🏦</span>
              <span>Extrato de Pagamentos</span>
              <span className="text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.2 rounded-full font-semibold">
                {transactions.length}
              </span>
            </button>
          </div>

          {/* Conteúdo das Abas */}
          <div className="p-6 overflow-y-auto flex-1 space-y-4">
            {loading ? (
              <div className="py-12 text-center text-xs text-gray-400">
                Carregando ficha financeira do fornecedor...
              </div>
            ) : (
              <>
                {activeTab === "payables" && (
                  <div className="space-y-3">
                    {payables.length === 0 ? (
                      <p className="text-xs text-gray-400 text-center py-8">
                        Nenhuma conta a pagar registrada para este fornecedor.
                      </p>
                    ) : (
                      payables.map((pay) => {
                        const isOverdue =
                          pay.due_date < new Date().toISOString().split("T")[0] &&
                          pay.status !== "paid";
                        const isPaid = pay.status === "paid";

                        return (
                          <div
                            key={pay.id}
                            className={`p-3.5 rounded-xl border transition-all flex items-center justify-between gap-3 ${
                              isPaid
                                ? "bg-emerald-50/20 border-emerald-100"
                                : isOverdue
                                ? "bg-red-50/30 border-red-200"
                                : "bg-white border-gray-200"
                            }`}
                          >
                            <div className="space-y-1">
                              <span className="font-bold text-gray-900 text-xs block">
                                {pay.description}
                              </span>
                              <div className="text-[11px] text-gray-500 flex items-center gap-3">
                                <span>Vencimento: <strong>{formatDate(pay.due_date)}</strong></span>
                                {pay.paid_at && (
                                  <span className="text-emerald-700">Pago em: {formatDate(pay.paid_at)}</span>
                                )}
                              </div>
                            </div>

                            <div className="text-right">
                              <span className="font-extrabold text-sm text-gray-900 block">
                                {formatBRL(Number(pay.amount))}
                              </span>
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-full inline-block mt-0.5 ${
                                  isPaid
                                    ? "bg-emerald-100 text-emerald-800"
                                    : isOverdue
                                    ? "bg-red-100 text-red-800"
                                    : "bg-amber-100 text-amber-800"
                                }`}
                              >
                                {isPaid ? "✓ Pago" : isOverdue ? "🚨 Em Atraso" : "⏳ A Pagar"}
                              </span>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}

                {activeTab === "transactions" && (
                  <div className="space-y-2">
                    {transactions.length === 0 ? (
                      <p className="text-xs text-gray-400 text-center py-8">
                        Nenhum pagamento bancário conciliado para este fornecedor.
                      </p>
                    ) : (
                      transactions.map((t) => (
                        <div
                          key={t.id}
                          className="p-3 rounded-xl border border-slate-100 bg-slate-50/60 flex items-center justify-between text-xs"
                        >
                          <div>
                            <span className="font-semibold text-gray-800 block">{t.description}</span>
                            <span className="text-[10px] text-gray-400">
                              {formatDate(t.date)} {t.bank_account_name ? `• ${t.bank_account_name}` : ""}
                            </span>
                          </div>
                          <span className="font-bold text-red-700">{formatBRL(t.amount)}</span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
