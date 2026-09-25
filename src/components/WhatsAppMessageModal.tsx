"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

export type WhatsAppModalProps = {
  isOpen: boolean;
  onClose: () => void;
  companyId?: string;
  companyName: string;
  companyPixKey?: string | null;
  companyCnpj?: string | null;
  companyEmail?: string | null;
  clientName: string;
  clientPhone?: string | null;
  receivable?: {
    id?: string;
    description: string;
    amount: number;
    due_date?: string;
    nf_number?: string | null;
    status?: "open" | "partial" | "received" | "overdue";
    received_amount?: number;
    installment_number?: number | null;
    total_installments?: number | null;
  } | null;
};

type TemplateType = "pre_due" | "due_today" | "overdue" | "receipt" | "custom";

type BankAccount = {
  id: string;
  name: string;
  bank_name?: string | null;
  agency?: string | null;
  account_number?: string | null;
  is_active: boolean;
};

export default function WhatsAppMessageModal({
  isOpen,
  onClose,
  companyId,
  companyName,
  companyPixKey,
  companyCnpj,
  companyEmail,
  clientName,
  clientPhone,
  receivable,
}: WhatsAppModalProps) {
  const supabase = createClient();

  const [templateType, setTemplateType] = useState<TemplateType>("due_today");
  const [customText, setCustomText] = useState("");
  const [copied, setCopied] = useState(false);
  const [pixSavedToast, setPixSavedToast] = useState(false);

  // Formas de Pagamento
  const [paymentMethodType, setPaymentMethodType] = useState<"pix" | "bank" | "boleto" | "none">("pix");
  const [pixInput, setPixInput] = useState(companyPixKey || companyCnpj || "");
  const [bankInput, setBankInput] = useState("");
  const [selectedBankAccountId, setSelectedBankAccountId] = useState<string>("");
  const [boletoInput, setBoletoInput] = useState("");

  // Contas Bancárias Cadastradas da Empresa
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [loadingBankAccounts, setLoadingBankAccounts] = useState(false);

  // Carrega contas bancárias da empresa e Pix salvo no localStorage
  const loadCompanyPaymentData = useCallback(async () => {
    if (!companyId) return;

    // 1. Pix salvo localmente
    const savedLocalPix = typeof window !== "undefined" ? localStorage.getItem(`oeco_default_pix_${companyId}`) : null;
    if (savedLocalPix) {
      setPixInput(savedLocalPix);
    } else if (companyPixKey) {
      setPixInput(companyPixKey);
    } else if (companyCnpj) {
      setPixInput(companyCnpj);
    }

    // 2. Busca contas bancárias cadastradas
    setLoadingBankAccounts(true);
    try {
      const { data, error } = await supabase
        .from("bank_accounts")
        .select("id, name, bank_name, agency, account_number, is_active")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .order("name", { ascending: true });

      if (!error && data) {
        setBankAccounts(data);
        if (data.length > 0) {
          // Prepara a primeira conta como sugestão
          const first = data[0];
          const bName = first.bank_name || first.name;
          const ag = first.agency ? ` | Agência: *${first.agency}*` : "";
          const cc = first.account_number ? ` | Conta: *${first.account_number}*` : "";
          setBankInput(`*${bName}*${ag}${cc} | Titular: *${companyName}*`);
          setSelectedBankAccountId(first.id);
        }
      }
    } catch (err) {
      console.error("Erro ao carregar contas bancárias para WhatsApp:", err);
    } finally {
      setLoadingBankAccounts(false);
    }
  }, [companyId, companyPixKey, companyCnpj, companyName, supabase]);

  useEffect(() => {
    if (isOpen) {
      loadCompanyPaymentData();
    }
  }, [isOpen, loadCompanyPaymentData]);

  // Salvar Chave Pix como padrão da empresa
  const handleSaveDefaultPix = async () => {
    if (!pixInput.trim()) {
      alert("Digite uma chave Pix antes de salvar.");
      return;
    }

    if (companyId && typeof window !== "undefined") {
      localStorage.setItem(`oeco_default_pix_${companyId}`, pixInput.trim());
      try {
        // Tenta atualizar no Supabase se houver coluna pix_key
        await supabase
          .from("companies")
          .update({ pix_key: pixInput.trim() })
          .eq("id", companyId);
      } catch (e) {
        // Silencioso se coluna não existir no DB
      }
    }

    setPixSavedToast(true);
    setTimeout(() => setPixSavedToast(false), 3000);
  };

  // Selecionar uma conta bancária registrada
  const handleSelectBankAccount = (acc: BankAccount) => {
    setSelectedBankAccountId(acc.id);
    const bName = acc.bank_name || acc.name;
    const ag = acc.agency ? ` | Agência: *${acc.agency}*` : "";
    const cc = acc.account_number ? ` | Conta: *${acc.account_number}*` : "";
    const formatted = `*${bName}*${ag}${cc} | Titular: *${companyName}*`;
    setBankInput(formatted);
  };

  const formattedAmount = useMemo(() => {
    if (!receivable) return "R$ 0,00";
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
      Number(receivable.amount)
    );
  }, [receivable]);

  const formattedReceivedAmount = useMemo(() => {
    if (!receivable || !receivable.received_amount) return formattedAmount;
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
      Number(receivable.received_amount)
    );
  }, [receivable, formattedAmount]);

  const formattedDueDate = useMemo(() => {
    if (!receivable?.due_date) return "—";
    const [y, m, d] = receivable.due_date.split("-");
    return `${d}/${m}/${y}`;
  }, [receivable?.due_date]);

  const nfOrDesc = useMemo(() => {
    if (!receivable) return "serviço";
    let text = "";
    if (receivable.nf_number) {
      text += `NF ${receivable.nf_number}`;
    }
    if (receivable.installment_number && receivable.total_installments) {
      text += ` (Parcela ${receivable.installment_number}/${receivable.total_installments})`;
    }
    if (!text) {
      text = receivable.description || "fatura";
    }
    return text;
  }, [receivable]);

  // Escolhe automaticamente o melhor template de acordo com o status
  useEffect(() => {
    if (!isOpen) return;

    if (receivable?.status === "received") {
      setTemplateType("receipt");
    } else if (receivable?.status === "overdue") {
      setTemplateType("overdue");
    } else if (receivable?.due_date) {
      const today = new Date().toISOString().split("T")[0];
      if (receivable.due_date === today) {
        setTemplateType("due_today");
      } else if (receivable.due_date > today) {
        setTemplateType("pre_due");
      } else {
        setTemplateType("overdue");
      }
    } else {
      setTemplateType("custom");
    }
    setCopied(false);
  }, [isOpen, receivable]);

  // Gera a linha de pagamento formatada
  const paymentLine = useMemo(() => {
    if (templateType === "receipt") return ""; // Recibo não precisa de cobrança

    if (paymentMethodType === "pix" && pixInput.trim()) {
      return `\n\nChave Pix para pagamento:\n🔑 *${pixInput.trim()}*`;
    }
    if (paymentMethodType === "bank" && bankInput.trim()) {
      return `\n\nDados bancários para transferência:\n🏦 ${bankInput.trim()}`;
    }
    if (paymentMethodType === "boleto" && boletoInput.trim()) {
      return `\n\nLinha digitável / Link para pagamento:\n📄 *${boletoInput.trim()}*`;
    }
    return "";
  }, [paymentMethodType, pixInput, bankInput, boletoInput, templateType]);

  // Gera o texto base dependendo do template selecionado
  useEffect(() => {
    let text = "";

    switch (templateType) {
      case "pre_due":
        text = `Olá, *${clientName}*! Tudo bem?\n\nPassando para lembrar que a fatura referente a *${nfOrDesc}* no valor de *${formattedAmount}* tem vencimento agendado para o dia *${formattedDueDate}*.${paymentLine}\n\nSe precisar de 2ª via ou alguma informação, estamos à disposição!\n\nAtenciosamente,\n*${companyName}*`;
        break;

      case "due_today":
        text = `Olá, *${clientName}*! Tudo bem?\n\nLembramos que sua fatura referente a *${nfOrDesc}* no valor de *${formattedAmount}* vence *hoje (${formattedDueDate})*.${paymentLine}\n\nCaso o pagamento já tenha sido realizado, por favor desconsidere este aviso.\n\nAtenciosamente,\n*${companyName}*`;
        break;

      case "overdue":
        text = `Olá, *${clientName}*! Esperamos que esteja bem.\n\nIdentificamos em nosso financeiro que a fatura referente a *${nfOrDesc}* no valor de *${formattedAmount}* (vencimento em ${formattedDueDate}) consta em aberto.${paymentLine}\n\nPedimos a gentileza de nos enviar o comprovante ou nos avisar caso precise de uma nova data.\n\nAtenciosamente,\n*${companyName}*`;
        break;

      case "receipt":
        text = `Olá, *${clientName}*! Tudo bem?\n\nConfirmamos o recebimento do valor de *${formattedReceivedAmount}* referente a *${nfOrDesc}*.\n\nSeu pagamento foi liquidado com sucesso em nosso sistema. Muito obrigado pela pontualidade e parceria!\n\nAtenciosamente,\n*${companyName}*`;
        break;

      case "custom":
      default:
        text = `Olá, *${clientName}*!\n\nEntramos em contato referente à sua conta com a *${companyName}*.${paymentLine}\n\nQualquer dúvida, estamos à disposição!`;
        break;
    }

    setCustomText(text);
  }, [templateType, clientName, companyName, paymentLine, nfOrDesc, formattedAmount, formattedReceivedAmount, formattedDueDate]);

  const [phoneInput, setPhoneInput] = useState(clientPhone || "");

  useEffect(() => {
    setPhoneInput(clientPhone || "");
  }, [clientPhone, isOpen]);

  if (!isOpen) return null;

  const cleanPhone = (phoneInput || "").replace(/\D/g, "");
  const formattedPhone =
    cleanPhone.length <= 11 ? `55${cleanPhone}` : cleanPhone;

  function handleSendWhatsApp() {
    if (!cleanPhone) {
      alert("Por favor, informe o número de WhatsApp/Telefone do cliente.");
      return;
    }
    const url = `https://wa.me/${formattedPhone}?text=${encodeURIComponent(customText)}`;
    window.open(url, "_blank");
  }

  function handleCopy() {
    navigator.clipboard.writeText(customText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // Lista de sugestões de Chaves Pix a partir do cadastro da empresa
  const pixSuggestions = [
    companyCnpj ? { label: "CNPJ", value: companyCnpj } : null,
    companyEmail ? { label: "E-mail", value: companyEmail } : null,
    companyPixKey && companyPixKey !== companyCnpj ? { label: "Pix Salvo", value: companyPixKey } : null,
  ].filter(Boolean) as { label: string; value: string }[];

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-gray-100 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 md:p-5 border-b border-gray-100 flex items-center justify-between bg-emerald-700 text-white rounded-t-2xl">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">💬</span>
            <div>
              <h3 className="text-base font-bold">Enviar Mensagem WhatsApp</h3>
              <p className="text-xs text-emerald-100 mt-0.5">
                {clientName}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-white/80 hover:text-white text-xl font-bold p-1 cursor-pointer"
          >
            ✕
          </button>
        </div>

        <div className="p-4 md:p-6 space-y-4 overflow-y-auto flex-1">
          {/* Campo de Telefone */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-700 mb-1">
              Telefone / WhatsApp de Destino *
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
                placeholder="(DDD) 99999-9999"
                className="w-full px-3 py-2 text-xs border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 outline-none font-mono"
              />
            </div>
          </div>

          {/* Seletor de Modelo / Template */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
              Modelo de Mensagem
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {[
                { id: "pre_due", label: "⏳ Pré-Vencimento", desc: "Lembrete 3 dias antes" },
                { id: "due_today", label: "📅 Vence Hoje", desc: "Aviso no dia" },
                { id: "overdue", label: "🚨 Em Atraso", desc: "Cobrança de pendência" },
                { id: "receipt", label: "✓ Recibo / Baixa", desc: "Confirmação de recebimento" },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTemplateType(t.id as TemplateType)}
                  className={`p-2 rounded-xl text-xs font-bold text-center border transition-all cursor-pointer ${
                    templateType === t.id
                      ? "bg-emerald-50 border-emerald-500 text-emerald-900 shadow-2xs"
                      : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  <span className="block">{t.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Painel Inteligente de Formas de Pagamento */}
          {templateType !== "receipt" && (
            <div className="p-3.5 bg-amber-50/50 rounded-xl border border-amber-200/80 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-1">
                <label className="block text-xs font-bold text-amber-900 uppercase tracking-wider">
                  💳 Forma de Pagamento no Texto
                </label>
                <span className="text-[10px] text-amber-700 font-medium">
                  Inserido automaticamente na mensagem
                </span>
              </div>

              {/* Seletor do Tipo de Pagamento */}
              <div className="grid grid-cols-4 gap-1">
                {[
                  { id: "pix", label: "⚡ Pix" },
                  { id: "bank", label: "🏦 Banco" },
                  { id: "boleto", label: "📄 Boleto/Link" },
                  { id: "none", label: "❌ Omitir" },
                ].map((pm) => (
                  <button
                    key={pm.id}
                    type="button"
                    onClick={() => setPaymentMethodType(pm.id as any)}
                    className={`py-1.5 px-1 rounded-lg text-xs font-bold border transition-all cursor-pointer text-center ${
                      paymentMethodType === pm.id
                        ? "bg-amber-100 border-amber-400 text-amber-950 font-extrabold shadow-2xs"
                        : "bg-white border-amber-200/70 text-amber-800 hover:bg-amber-50"
                    }`}
                  >
                    {pm.label}
                  </button>
                ))}
              </div>

              {/* 1. SEÇÃO PIX: Sugestões Inteligentes + Campo Editável + Botão de Salvar Padrão */}
              {paymentMethodType === "pix" && (
                <div className="space-y-2 pt-1">
                  {/* Sugestões rápidas do cadastro */}
                  {pixSuggestions.length > 0 && (
                    <div>
                      <span className="text-[10px] text-amber-800 font-bold block mb-1">
                        Puxar do cadastro da empresa:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {pixSuggestions.map((s, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => setPixInput(s.value)}
                            className="text-[11px] bg-white hover:bg-amber-100 text-amber-900 px-2 py-0.5 rounded-md border border-amber-300 font-semibold flex items-center gap-1 transition-colors cursor-pointer shadow-2xs"
                            title={`Usar ${s.label}: ${s.value}`}
                          >
                            <span>📌 {s.label}:</span>
                            <span className="font-mono text-[10px] truncate max-w-[140px]">{s.value}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <div className="flex items-center justify-between mb-0.5">
                      <label className="block text-[10px] font-bold text-amber-800">
                        Chave Pix (Editável):
                      </label>
                      <button
                        type="button"
                        onClick={handleSaveDefaultPix}
                        className="text-[10px] font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 cursor-pointer underline"
                        title="Salva esta chave para as próximas mensagens de cobrança"
                      >
                        <span>💾 Salvar como Pix Padrão</span>
                      </button>
                    </div>
                    <input
                      type="text"
                      value={pixInput}
                      onChange={(e) => setPixInput(e.target.value)}
                      placeholder="Ex: CNPJ, e-mail, telefone ou chave aleatória"
                      className="w-full px-3 py-1.5 text-xs border border-amber-300 rounded-lg bg-white focus:ring-2 focus:ring-amber-400/30 focus:border-amber-500 outline-none font-mono"
                    />
                    {pixSavedToast && (
                      <span className="text-[10px] text-emerald-700 font-bold block mt-1 animate-in fade-in">
                        ✓ Chave Pix salva como padrão para as próximas mensagens!
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* 2. SEÇÃO CONTAS BANCÁRIAS: Puxadas do banco de dados + Cartões Selecionáveis */}
              {paymentMethodType === "bank" && (
                <div className="space-y-2 pt-1">
                  <div>
                    <span className="text-[10px] text-amber-800 font-bold block mb-1">
                      Selecionar Conta Bancária Cadastrada:
                    </span>
                    {loadingBankAccounts ? (
                      <p className="text-[11px] text-amber-700 italic">Carregando contas da empresa...</p>
                    ) : bankAccounts.length === 0 ? (
                      <p className="text-[11px] text-amber-800 bg-white p-2 rounded-lg border border-amber-200">
                        Nenhuma conta bancária ativa cadastrada em Configurações. Digite os dados manualmente abaixo:
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        {bankAccounts.map((acc) => {
                          const isSelected = selectedBankAccountId === acc.id;
                          return (
                            <button
                              key={acc.id}
                              type="button"
                              onClick={() => handleSelectBankAccount(acc)}
                              className={`p-2 rounded-lg text-left border transition-all cursor-pointer ${
                                isSelected
                                  ? "bg-white border-emerald-500 ring-2 ring-emerald-500/20 shadow-2xs"
                                  : "bg-white/80 border-amber-200 hover:bg-white"
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-xs text-gray-900 block truncate">
                                  🏦 {acc.bank_name || acc.name}
                                </span>
                                {isSelected && (
                                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1 rounded">
                                    ✓ Ativa
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px] text-gray-500 block mt-0.5 font-mono">
                                {acc.agency ? `Ag: ${acc.agency}` : ""} {acc.account_number ? `• CC: ${acc.account_number}` : ""}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-amber-800 mb-0.5">
                      Texto dos Dados Bancários (Editável):
                    </label>
                    <input
                      type="text"
                      value={bankInput}
                      onChange={(e) => setBankInput(e.target.value)}
                      placeholder="Ex: Banco Itaú (341) | Ag 1234 | CC 56789-0 | Titular: Empresa Ltda"
                      className="w-full px-3 py-1.5 text-xs border border-amber-300 rounded-lg bg-white focus:ring-2 focus:ring-amber-400/30 focus:border-amber-500 outline-none font-sans"
                    />
                  </div>
                </div>
              )}

              {/* 3. SEÇÃO BOLETO / LINK */}
              {paymentMethodType === "boleto" && (
                <div className="pt-1">
                  <label className="block text-[10px] font-bold text-amber-800 mb-0.5">
                    Linha Digitável do Boleto ou Link de Pagamento:
                  </label>
                  <input
                    type="text"
                    value={boletoInput}
                    onChange={(e) => setBoletoInput(e.target.value)}
                    placeholder="Ex: 34191.79001 01043.510047... ou https://link.pagamento..."
                    className="w-full px-3 py-1.5 text-xs border border-amber-300 rounded-lg bg-white focus:ring-2 focus:ring-amber-400/30 focus:border-amber-500 outline-none font-mono"
                  />
                </div>
              )}
            </div>
          )}

          {/* Dados do Título Selecionado */}
          {receivable && (
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 text-xs grid grid-cols-2 sm:grid-cols-3 gap-2">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Fatura / NF</span>
                <span className="font-semibold text-slate-800">{nfOrDesc}</span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Valor Previsto</span>
                <span className="font-bold text-slate-900">{formattedAmount}</span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Vencimento</span>
                <span className="font-semibold text-slate-800">{formattedDueDate}</span>
              </div>
            </div>
          )}

          {/* Editor de Texto da Mensagem */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-700">
                Texto da Mensagem (Editável em Tempo Real)
              </label>
              <button
                type="button"
                onClick={handleCopy}
                className="text-xs font-semibold text-slate-600 hover:text-slate-900 flex items-center gap-1 cursor-pointer"
              >
                <span>{copied ? "✓ Copiado!" : "📋 Copiar"}</span>
              </button>
            </div>
            <textarea
              rows={8}
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              className="w-full p-3.5 text-xs font-sans border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 shadow-2xs leading-relaxed bg-emerald-50/20"
              placeholder="Digite sua mensagem..."
            />
          </div>
        </div>

        {/* Footer com Botões */}
        <div className="p-4 border-t border-gray-100 bg-slate-50 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-gray-600 hover:text-gray-900 cursor-pointer"
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={handleSendWhatsApp}
            disabled={!cleanPhone}
            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl text-xs transition-all shadow-sm flex items-center gap-2 cursor-pointer"
          >
            <span>📲</span>
            <span>Abrir no WhatsApp</span>
          </button>
        </div>
      </div>
    </div>
  );
}
