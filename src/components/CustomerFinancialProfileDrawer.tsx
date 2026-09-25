"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { Customer } from "@/components/CustomersManager";

export type CustomerProfileDrawerProps = {
  isOpen: boolean;
  onClose: () => void;
  customer: Customer | null;
  companyId: string;
  companyName: string;
  onTriggerWhatsApp?: (receivable?: any) => void;
};

type CustomerReceivable = {
  id: string;
  description: string;
  amount: number;
  received_amount: number;
  due_date: string;
  month_ref: string;
  status: "open" | "partial" | "received" | "overdue";
  nf_number?: string | null;
  contract_id?: string | null;
  installment_number?: number | null;
  total_installments?: number | null;
  received_at?: string | null;
};

type CustomerContract = {
  id: string;
  title: string;
  total_amount: number;
  start_date: string;
  status: "active" | "completed" | "cancelled";
  notes?: string | null;
  created_at?: string;
};

type CustomerTransaction = {
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

export default function CustomerFinancialProfileDrawer({
  isOpen,
  onClose,
  customer,
  companyId,
  companyName,
  onTriggerWhatsApp,
}: CustomerProfileDrawerProps) {
  const supabase = createClient();

  const [activeTab, setActiveTab] = useState<"invoices" | "contracts" | "transactions">("invoices");
  const [loading, setLoading] = useState(false);
  const [receivables, setReceivables] = useState<CustomerReceivable[]>([]);
  const [contracts, setContracts] = useState<CustomerContract[]>([]);
  const [transactions, setTransactions] = useState<CustomerTransaction[]>([]);

  const fetchCustomerData = useCallback(async () => {
    if (!customer || !companyId) return;

    setLoading(true);
    try {
      // 1. Busca recebíveis por customer_id OU por client_name
      let query = supabase
        .from("receivables")
        .select("*")
        .eq("company_id", companyId)
        .eq("is_active", true);

      if (customer.id) {
        query = query.or(`customer_id.eq.${customer.id},client_name.eq.${customer.name}`);
      } else {
        query = query.eq("client_name", customer.name);
      }

      const { data: recData } = await query.order("due_date", { ascending: false });

      // 2. Busca contratos
      let contractQuery = supabase
        .from("contracts")
        .select("*")
        .eq("company_id", companyId);

      if (customer.id) {
        contractQuery = contractQuery.or(`customer_id.eq.${customer.id},client_name.eq.${customer.name}`);
      } else {
        contractQuery = contractQuery.eq("client_name", customer.name);
      }

      const { data: cData } = await contractQuery.order("created_at", { ascending: false });

      // 3. Busca transações bancárias vinculadas aos recebíveis deste cliente
      const recIds = (recData || []).map((r) => r.id);
      let trxList: CustomerTransaction[] = [];

      if (recIds.length > 0) {
        const { data: trxData } = await supabase
          .from("transactions")
          .select("id, date, description, amount, receivable_id, bank_accounts(name)")
          .in("receivable_id", recIds)
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

      setReceivables(recData || []);
      setContracts(cData || []);
      setTransactions(trxList);
    } catch (err) {
      console.error("Erro ao carregar dados do cliente:", err);
    } finally {
      setLoading(false);
    }
  }, [customer, companyId, supabase]);

  useEffect(() => {
    if (isOpen && customer) {
      fetchCustomerData();
    }
  }, [isOpen, customer, fetchCustomerData]);

  // Cálculos Consolidados de KPIs
  const stats = useMemo(() => {
    const today = new Date().toISOString().split("T")[0];

    const totalAmount = receivables.reduce((sum, r) => sum + Number(r.amount), 0);
    const totalReceived = receivables.reduce((sum, r) => sum + Number(r.received_amount || 0), 0);
    const totalPending = Math.max(0, totalAmount - totalReceived);

    const overdueItems = receivables.filter((r) => r.due_date < today && r.status !== "received");
    const totalOverdue = overdueItems.reduce(
      (sum, r) => sum + Math.max(0, Number(r.amount) - Number(r.received_amount || 0)),
      0
    );

    const receivedItems = receivables.filter((r) => r.status === "received");
    const punctualityPercent =
      receivables.length > 0
        ? Math.round((receivedItems.length / receivables.length) * 100)
        : 100;

    return {
      totalAmount,
      totalReceived,
      totalPending,
      totalOverdue,
      overdueCount: overdueItems.length,
      punctualityPercent,
    };
  }, [receivables]);

  if (!isOpen || !customer) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-2xl bg-white shadow-2xl flex flex-col border-l border-gray-200">
          {/* Header do Drawer */}
          <div className="p-6 border-b border-gray-100 bg-[#FAF8F5]">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xl font-bold text-gray-900">{customer.name}</span>
                  {customer.document && (
                    <span className="font-mono text-xs bg-white text-slate-700 px-2.5 py-0.5 rounded-lg border border-slate-200 font-semibold">
                      {customer.document}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap pt-1">
                  {customer.phone && (
                    <span className="flex items-center gap-1 font-semibold text-emerald-700">
                      <span>📱</span> {customer.phone}
                    </span>
                  )}
                  {customer.email && (
                    <span className="flex items-center gap-1 text-slate-600">
                      <span>✉️</span> {customer.email}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {customer.phone && (
                  <button
                    type="button"
                    onClick={() => onTriggerWhatsApp && onTriggerWhatsApp()}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                    title="Enviar WhatsApp"
                  >
                    <span>💬</span>
                    <span>WhatsApp</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className="p-1 text-gray-400 hover:text-gray-700 text-xl font-bold rounded-lg cursor-pointer"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* KPI Cards do Cliente */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-4">
              <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-2xs">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                  Total Faturado
                </span>
                <span className="text-sm font-extrabold text-slate-900 mt-0.5 block">
                  {formatBRL(stats.totalAmount)}
                </span>
              </div>

              <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-2xs">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 block">
                  Total Recebido
                </span>
                <span className="text-sm font-extrabold text-emerald-700 mt-0.5 block">
                  {formatBRL(stats.totalReceived)}
                </span>
              </div>

              <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-2xs">
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 block">
                  A Receber
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
              onClick={() => setActiveTab("invoices")}
              className={`py-3 px-3 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === "invoices"
                  ? "border-primary text-primary"
                  : "border-transparent text-gray-400 hover:text-gray-700"
              }`}
            >
              <span>📋</span>
              <span>Faturas & Títulos</span>
              <span className="text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.2 rounded-full font-semibold">
                {receivables.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("contracts")}
              className={`py-3 px-3 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === "contracts"
                  ? "border-primary text-primary"
                  : "border-transparent text-gray-400 hover:text-gray-700"
              }`}
            >
              <span>📁</span>
              <span>Contratos</span>
              <span className="text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.2 rounded-full font-semibold">
                {contracts.length}
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
              <span>Extrato de Recebimentos</span>
              <span className="text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.2 rounded-full font-semibold">
                {transactions.length}
              </span>
            </button>
          </div>

          {/* Conteúdo das Abas */}
          <div className="p-6 overflow-y-auto flex-1 space-y-4">
            {loading ? (
              <div className="py-12 text-center text-xs text-gray-400">
                Carregando ficha financeira do cliente...
              </div>
            ) : (
              <>
                {/* ABA 1: FATURAS & TÍTULOS */}
                {activeTab === "invoices" && (
                  <div className="space-y-3">
                    {receivables.length === 0 ? (
                      <p className="text-xs text-gray-400 text-center py-8">
                        Nenhuma fatura ou recebível registrado para este cliente.
                      </p>
                    ) : (
                      receivables.map((rec) => {
                        const isOverdue =
                          rec.due_date < new Date().toISOString().split("T")[0] &&
                          rec.status !== "received";
                        const isReceived = rec.status === "received";

                        return (
                          <div
                            key={rec.id}
                            className={`p-3.5 rounded-xl border transition-all flex items-center justify-between gap-3 ${
                              isReceived
                                ? "bg-emerald-50/20 border-emerald-100"
                                : isOverdue
                                ? "bg-red-50/30 border-red-200"
                                : "bg-white border-gray-200"
                            }`}
                          >
                            <div className="space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-bold text-gray-900 text-xs">
                                  {rec.description}
                                </span>
                                {rec.nf_number && (
                                  <span className="text-[10px] font-semibold bg-slate-100 text-slate-700 px-1.5 py-0.2 rounded">
                                    NF {rec.nf_number}
                                  </span>
                                )}
                                {rec.installment_number && rec.total_installments && (
                                  <span className="text-[10px] font-bold bg-indigo-50 text-indigo-800 px-1.5 py-0.2 rounded">
                                    Parcela {rec.installment_number}/{rec.total_installments}
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-gray-500 flex items-center gap-3">
                                <span>Vencimento: <strong>{formatDate(rec.due_date)}</strong></span>
                                {rec.received_at && (
                                  <span className="text-emerald-700">Pago em: {formatDate(rec.received_at)}</span>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-3 text-right">
                              <div>
                                <span className="font-extrabold text-sm text-gray-900 block">
                                  {formatBRL(Number(rec.amount))}
                                </span>
                                <span
                                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full inline-block mt-0.5 ${
                                    isReceived
                                      ? "bg-emerald-100 text-emerald-800"
                                      : isOverdue
                                      ? "bg-red-100 text-red-800"
                                      : "bg-amber-100 text-amber-800"
                                  }`}
                                >
                                  {isReceived ? "✓ Recebido" : isOverdue ? "🚨 Em Atraso" : "⏳ A Vencer"}
                                </span>
                              </div>

                              {customer.phone && onTriggerWhatsApp && (
                                <button
                                  type="button"
                                  onClick={() => onTriggerWhatsApp(rec)}
                                  className="p-1.5 text-emerald-700 hover:bg-emerald-100 rounded-lg transition-colors cursor-pointer"
                                  title="Enviar cobrança / recibo WhatsApp"
                                >
                                  💬
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}

                {/* ABA 2: CONTRATOS */}
                {activeTab === "contracts" && (
                  <div className="space-y-3">
                    {contracts.length === 0 ? (
                      <p className="text-xs text-gray-400 text-center py-8">
                        Nenhum contrato ativo cadastrado para este cliente.
                      </p>
                    ) : (
                      contracts.map((c) => (
                        <div
                          key={c.id}
                          className="p-4 rounded-xl border border-gray-200 bg-white space-y-2 shadow-2xs"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-gray-900 text-xs">{c.title}</span>
                            <span className="font-extrabold text-sm text-primary">
                              {formatBRL(Number(c.total_amount))}
                            </span>
                          </div>
                          <div className="text-[11px] text-gray-500 flex items-center justify-between">
                            <span>Início em: {formatDate(c.start_date)}</span>
                            <span className="text-emerald-700 font-semibold uppercase text-[10px]">
                              {c.status === "active" ? "✓ Contrato Ativo" : c.status}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* ABA 3: EXTRATO BANCÁRIO */}
                {activeTab === "transactions" && (
                  <div className="space-y-2">
                    {transactions.length === 0 ? (
                      <p className="text-xs text-gray-400 text-center py-8">
                        Nenhum pagamento bancário conciliado para este cliente ainda.
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
                          <span className="font-bold text-emerald-700">{formatBRL(t.amount)}</span>
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
