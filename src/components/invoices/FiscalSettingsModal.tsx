"use client";

import React, { useState, useEffect, useRef } from "react";
import { CompanyFiscalSettings } from "./types";

interface FiscalSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  companyId: string;
  companyName: string;
  onSaved?: (settings: CompanyFiscalSettings) => void;
}

export default function FiscalSettingsModal({
  isOpen,
  onClose,
  companyId,
  companyName,
  onSaved,
}: FiscalSettingsModalProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Dados Fiscais
  const [currentSettings, setCurrentSettings] = useState<CompanyFiscalSettings | null>(null);
  const [municipalInscription, setMunicipalInscription] = useState("");
  const [taxRegime, setTaxRegime] = useState<"mei" | "simples_nacional">("simples_nacional");
  const [environment, setEnvironment] = useState<"sandbox" | "production">("sandbox");

  // Arquivo do Certificado & Senha
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showReplaceForm, setShowReplaceForm] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Carrega configurações atuais da empresa ao abrir o modal
  useEffect(() => {
    if (!isOpen || !companyId) return;

    setFeedback(null);
    setSelectedFile(null);
    setPassword("");
    setShowReplaceForm(false);
    setLoading(true);

    fetch(`/api/invoices/certificate?company_id=${companyId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.settings) {
          setCurrentSettings(data.settings);
          setMunicipalInscription(data.settings.municipal_inscription || "");
          setTaxRegime(data.settings.tax_regime || "simples_nacional");
          setEnvironment(data.settings.environment || "sandbox");
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [isOpen, companyId]);

  // Manipulação de arquivo
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const name = file.name.toLowerCase();
      if (!name.endsWith(".pfx") && !name.endsWith(".p12")) {
        setFeedback({ type: "error", text: "Por favor, selecione um arquivo de certificado com extensão .pfx ou .p12" });
        return;
      }
      setSelectedFile(file);
      setFeedback(null);
    }
  };

  // Envio do formulário
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    // Se estiver enviando novo arquivo, a senha é obrigatória
    if (selectedFile && !password.trim()) {
      setFeedback({ type: "error", text: "Informe a senha do certificado digital para validação." });
      return;
    }

    setSaving(true);
    try {
      const formData = new FormData();
      formData.append("company_id", companyId);
      formData.append("municipal_inscription", municipalInscription);
      formData.append("tax_regime", taxRegime);
      formData.append("environment", environment);

      if (selectedFile) {
        formData.append("certificate", selectedFile);
        formData.append("password", password);
      }

      const res = await fetch("/api/invoices/certificate", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Falha ao salvar configurações fiscais.");
      }

      setFeedback({
        type: "success",
        text: data.message || "Configurações e Certificado salvos com sucesso!",
      });

      if (data.settings) {
        setCurrentSettings(data.settings);
        if (onSaved) onSaved(data.settings);
      }

      setSelectedFile(null);
      setPassword("");
      setShowReplaceForm(false);
    } catch (err: any) {
      setFeedback({ type: "error", text: err.message || "Erro ao conectar com o servidor." });
    } finally {
      setSaving(false);
    }
  };

  // Formatação de data
  const formatDate = (isoString?: string) => {
    if (!isoString) return "";
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString("pt-BR");
    } catch {
      return isoString;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* CABEÇALHO */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center text-xl font-bold border border-amber-200">
              🔒
            </div>
            <div>
              <h2 className="text-base font-black text-slate-800">
                Certificado Digital A1 & Dados Fiscais
              </h2>
              <p className="text-xs text-slate-500 font-medium">
                {companyName || "Empresa selecionada"}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-slate-200 text-slate-400 hover:text-slate-600 flex items-center justify-center transition-all cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* CORPO */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* FEEDBACK BANNER */}
          {feedback && (
            <div
              className={`p-3.5 rounded-2xl text-xs font-semibold flex items-center gap-2.5 animate-in fade-in ${
                feedback.type === "success"
                  ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                  : "bg-rose-50 text-rose-800 border border-rose-200"
              }`}
            >
              <span>{feedback.type === "success" ? "✓" : "⚠️"}</span>
              <span className="flex-1">{feedback.text}</span>
            </div>
          )}

          {/* STATUS ATUAL DO CERTIFICADO */}
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/80 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Status do Certificado
              </span>
              
              {currentSettings?.has_certificate_a1 ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  Certificado A1 Ativo
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  Pendente de Certificado
                </span>
              )}
            </div>

            {currentSettings?.has_certificate_a1 ? (
              <div className="flex items-center justify-between pt-1 border-t border-slate-200/60">
                <div>
                  <span className="text-xs text-slate-600 block">
                    Válido até: <strong className="text-slate-900">{formatDate(currentSettings.certificate_expiry) || "1 ano"}</strong>
                  </span>
                  <span className="text-[10px] text-slate-400">
                    Assinatura eletrônica habilitada para emissão de NFS-e
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setShowReplaceForm(!showReplaceForm)}
                  className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-xl transition-all cursor-pointer"
                >
                  {showReplaceForm ? "Cancelar Substituição" : "Substituir Certificado"}
                </button>
              </div>
            ) : (
              <p className="text-xs text-slate-600 leading-relaxed">
                Para assinar e emitir notas fiscais eletrônicas de serviço na prefeitura, anexe abaixo o arquivo do seu Certificado Digital modelo A1 com a respectiva senha.
              </p>
            )}
          </div>

          {/* ÁREA DE UPLOAD E SENHA (SE NÃO TIVER OU SE CLICOU EM SUBSTITUIR) */}
          {(!currentSettings?.has_certificate_a1 || showReplaceForm) && (
            <div className="space-y-3.5 p-4 bg-emerald-50/40 rounded-2xl border border-emerald-200/70 animate-in fade-in duration-150">
              <label className="text-xs font-bold text-slate-800 block">
                Anexar Certificado Digital A1 (.pfx ou .p12)
              </label>

              {/* DROPZONE / FILE SELECTOR */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".pfx,.p12"
                onChange={handleFileChange}
                className="hidden"
              />

              {!selectedFile ? (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-emerald-300 hover:border-emerald-500 bg-white rounded-2xl p-5 text-center cursor-pointer transition-all group"
                >
                  <div className="text-2xl mb-1 group-hover:scale-110 transition-transform">📂</div>
                  <p className="text-xs font-bold text-slate-700">
                    Clique para selecionar o arquivo do seu computador
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Formatos aceitos: <strong>.pfx</strong> ou <strong>.p12</strong> (Tamanho máx: 5MB)
                  </p>
                </div>
              ) : (
                <div className="p-3 bg-white rounded-xl border border-emerald-300 flex items-center justify-between shadow-2xs">
                  <div className="flex items-center gap-2.5 overflow-hidden">
                    <span className="text-lg">📄</span>
                    <div className="truncate">
                      <p className="text-xs font-bold text-slate-800 truncate">{selectedFile.name}</p>
                      <p className="text-[10px] text-slate-400">
                        {(selectedFile.size / 1024).toFixed(1)} KB
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setSelectedFile(null)}
                    className="text-xs text-rose-600 hover:text-rose-700 font-bold px-2 py-1 rounded hover:bg-rose-50 transition-colors"
                  >
                    Remover
                  </button>
                </div>
              )}

              {/* SENHA DO CERTIFICADO */}
              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">
                  Senha de Instalação do Certificado *
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Digite a senha do arquivo"
                    className="w-full text-xs text-slate-800 bg-white border border-slate-200 rounded-xl px-3 py-2 pr-10 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-2 text-xs text-slate-400 hover:text-slate-600 transition-colors"
                    title={showPassword ? "Ocultar senha" : "Ver senha"}
                  >
                    {showPassword ? "🙈" : "👁️"}
                  </button>
                </div>
                <span className="text-[10px] text-slate-400 block mt-1">
                  🔒 A senha é transmitida com criptografia ponta a ponta e utilizada exclusivamente para assinatura na prefeitura.
                </span>
              </div>
            </div>
          )}

          {/* DADOS FISCAIS COMPLEMENTARES */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
            <div>
              <label className="text-[11px] font-bold text-slate-700 block mb-1">
                Inscrição Municipal (IM)
              </label>
              <input
                type="text"
                value={municipalInscription}
                onChange={(e) => setMunicipalInscription(e.target.value)}
                placeholder="Ex: 12345678"
                className="w-full text-xs text-slate-800 bg-white border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
              <span className="text-[10px] text-slate-400 block mt-0.5">
                Número de cadastro na sua prefeitura local
              </span>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-700 block mb-1">
                Regime Tributário
              </label>
              <select
                value={taxRegime}
                onChange={(e) => setTaxRegime(e.target.value as any)}
                className="w-full text-xs font-bold text-slate-800 bg-white border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              >
                <option value="simples_nacional">Simples Nacional (ME / EPP)</option>
                <option value="mei">Microempreendedor Individual (MEI)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-[11px] font-bold text-slate-700 block mb-1">
              Ambiente de Emissão
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className={`p-2.5 rounded-xl border text-xs font-bold cursor-pointer transition-all ${
                environment === "sandbox" ? "bg-amber-50 border-amber-300 text-amber-900" : "bg-white border-slate-200 text-slate-600"
              }`}>
                <input
                  type="radio"
                  name="env"
                  value="sandbox"
                  checked={environment === "sandbox"}
                  onChange={() => setEnvironment("sandbox")}
                  className="hidden"
                />
                <div className="flex items-center gap-1.5">
                  <span className={`w-2.5 h-2.5 rounded-full ${environment === "sandbox" ? "bg-amber-500" : "bg-slate-300"}`} />
                  <span>Homologação (Testes)</span>
                </div>
              </label>

              <label className={`p-2.5 rounded-xl border text-xs font-bold cursor-pointer transition-all ${
                environment === "production" ? "bg-emerald-50 border-emerald-300 text-emerald-900" : "bg-white border-slate-200 text-slate-600"
              }`}>
                <input
                  type="radio"
                  name="env"
                  value="production"
                  checked={environment === "production"}
                  onChange={() => setEnvironment("production")}
                  className="hidden"
                />
                <div className="flex items-center gap-1.5">
                  <span className={`w-2.5 h-2.5 rounded-full ${environment === "production" ? "bg-emerald-500" : "bg-slate-300"}`} />
                  <span>Produção Oficial</span>
                </div>
              </label>
            </div>
          </div>

          {/* BOTÕES DE AÇÃO */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold transition-all cursor-pointer"
            >
              Fechar
            </button>

            <button
              type="submit"
              disabled={saving || loading}
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black transition-all shadow-md shadow-emerald-600/20 flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {saving ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Validando e Salvando...</span>
                </>
              ) : (
                <span>Salvar Configurações Fiscais</span>
              )}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}
