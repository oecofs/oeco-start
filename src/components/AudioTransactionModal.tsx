"use client";

import React, { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCompany } from "@/contexts/CompanyContext";
import { createClient } from "@/lib/supabase/client";

interface AudioTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetTypeHint?: "payable" | "receivable";
  onSuccess?: (type: "payable" | "receivable", data: any) => void;
}

interface ParsedTransaction {
  type: "payable" | "receivable";
  transcription: string;
  amount: number;
  entity_name: string;
  description: string;
  due_date: string;
  payment_method?: string;
  notes?: string;
}

export default function AudioTransactionModal({
  isOpen,
  onClose,
  targetTypeHint,
  onSuccess,
}: AudioTransactionModalProps) {
  const router = useRouter();
  const supabase = createClient();
  const { selectedCompany } = useCompany();

  // Estados de Gravação
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Resultado da IA
  const [parsedData, setParsedData] = useState<ParsedTransaction | null>(null);

  // Campos Editáveis após IA
  const [type, setType] = useState<"payable" | "receivable">("payable");
  const [entityName, setEntityName] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("pix");
  const [notes, setNotes] = useState("");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const mime = file.type || "audio/mp3";
    setAudioBlob(file);
    processAudioWithAI(file, mime);
  }

  // Reseta ao abrir ou fechar
  useEffect(() => {
    if (isOpen) {
      resetState();
      if (targetTypeHint) {
        setType(targetTypeHint);
      }
    } else {
      stopRecordingCleanup();
    }
  }, [isOpen, targetTypeHint]);

  function resetState() {
    setIsRecording(false);
    setRecordingTime(0);
    setAudioBlob(null);
    setProcessing(false);
    setSaving(false);
    setErrorMsg("");
    setParsedData(null);
    setEntityName("");
    setDescription("");
    setAmount("");
    setDueDate(new Date().toISOString().split("T")[0]);
    setPaymentMethod("pix");
    setNotes("");
  }

  function stopRecordingCleanup() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      try {
        mediaRecorderRef.current.stop();
      } catch (e) {}
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsRecording(false);
  }

  // Iniciar Gravação de Áudio
  async function startRecording() {
    setErrorMsg("");
    audioChunksRef.current = [];
    setAudioBlob(null);
    setParsedData(null);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setErrorMsg(
        "Seu navegador não oferece suporte à gravação de áudio ou a conexão não é segura (HTTPS é obrigatório)."
      );
      return;
    }

    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch (err: any) {
      // Fallback para { audio: true } simples
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (innerErr: any) {
        console.error("Erro no getUserMedia:", innerErr);
        const errName = innerErr?.name || err?.name || "";
        const errMsg = innerErr?.message || err?.message || "";

        if (errName === "NotAllowedError" || errName === "PermissionDeniedError") {
          setErrorMsg(
            "Permissão de microfone bloqueada pelo navegador. Se você acabou de ativar o microfone no ícone de cadeado do site, clique em 'Recarregar Página' para que o navegador aplique a alteração. Você também pode enviar um arquivo de áudio diretamente abaixo."
          );
        } else if (errName === "NotFoundError" || errName === "DevicesNotFoundError") {
          setErrorMsg("Nenhum microfone físico foi detectado no seu dispositivo.");
        } else if (errName === "NotReadableError" || errName === "TrackStartError") {
          setErrorMsg("O microfone está em uso por outro aplicativo (WhatsApp, Teams, Meet). Feche-o e tente novamente.");
        } else {
          setErrorMsg(`Erro de microfone (${errName || "desconhecido"}): ${errMsg || "Não autorizado"}.`);
        }
        return;
      }
    }

    try {
      // Suporte para webm, mp4 ou aac conforme o navegador
      let mimeType = "";
      if (typeof MediaRecorder !== "undefined") {
        const types = [
          "audio/webm;codecs=opus",
          "audio/webm",
          "audio/mp4",
          "audio/aac",
          "audio/ogg",
        ];
        for (const t of types) {
          if (MediaRecorder.isTypeSupported(t)) {
            mimeType = t;
            break;
          }
        }
      }

      const options = mimeType ? { mimeType } : undefined;
      let mediaRecorder: MediaRecorder;
      try {
        mediaRecorder = new MediaRecorder(stream, options);
      } catch (recErr) {
        // Fallback sem options se o navegador não gostar do mimeType
        mediaRecorder = new MediaRecorder(stream);
      }
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const actualType = mediaRecorder.mimeType || mimeType || "audio/webm";
        const recordedBlob = new Blob(audioChunksRef.current, {
          type: actualType,
        });
        setAudioBlob(recordedBlob);
        stream?.getTracks().forEach((track) => track.stop());
        // Envia automaticamente para a IA após parar
        processAudioWithAI(recordedBlob, actualType);
      };

      mediaRecorder.start(250); // Coleta a cada 250ms
      setIsRecording(true);
      setRecordingTime(0);

      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch (err: any) {
      console.error("Erro ao inicializar MediaRecorder:", err);
      stream?.getTracks().forEach((track) => track.stop());
      setErrorMsg(
        `Erro ao inicializar o gravador do navegador: ${err?.message || "codec de áudio incompatível"}.`
      );
    }
  }

  // Parar Gravação
  function stopRecording() {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setIsRecording(false);
    }
  }

  // Enviar áudio para API Gemini
  async function processAudioWithAI(blob: Blob, mimeType: string) {
    setProcessing(true);
    setErrorMsg("");

    try {
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = async () => {
        const base64Data = reader.result as string;

        const response = await fetch("/api/ai/audio-transaction", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            audioBase64: base64Data,
            mimeType: mimeType,
            targetTypeHint: targetTypeHint || type,
            referenceDate: new Date().toISOString().split("T")[0],
          }),
        });

        const resJson = await response.json();

        if (!response.ok || !resJson?.data) {
          throw new Error(resJson?.error || "Não foi possível entender o áudio gravado.");
        }

        const data: ParsedTransaction = resJson.data;
        setParsedData(data);

        // Preenche os campos para conferência do usuário
        setType(data.type || targetTypeHint || "payable");
        setEntityName(data.entity_name || "");
        setDescription(data.description || "");
        setAmount(data.amount ? String(data.amount) : "");
        setDueDate(data.due_date || new Date().toISOString().split("T")[0]);
        setPaymentMethod(data.payment_method || "pix");
        setNotes(data.notes || "");
        setProcessing(false);
      };
    } catch (err: any) {
      console.error("Erro no processamento:", err);
      setErrorMsg(err.message || "Erro ao interpretar áudio com IA.");
      setProcessing(false);
    }
  }

  // Salvar no Banco de Dados
  async function handleSaveTransaction(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCompany) {
      setErrorMsg("Nenhuma empresa selecionada.");
      return;
    }

    const numAmount = parseFloat(amount.replace(",", "."));
    if (isNaN(numAmount) || numAmount <= 0) {
      setErrorMsg("Informe um valor válido maior que zero.");
      return;
    }

    if (!entityName.trim()) {
      setErrorMsg(`Informe o ${type === "payable" ? "fornecedor" : "cliente"}.`);
      return;
    }

    if (!dueDate) {
      setErrorMsg("Informe a data de vencimento.");
      return;
    }

    setSaving(true);
    setErrorMsg("");

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const monthRef = dueDate.slice(0, 7);

      if (type === "payable") {
        // 1. Cadastra/Vincula Fornecedor
        let supplierId: string | null = null;
        const cleanName = entityName.trim();

        const { data: existingSup } = await supabase
          .from("suppliers")
          .select("id")
          .eq("company_id", selectedCompany.id)
          .ilike("name", cleanName)
          .maybeSingle();

        if (existingSup) {
          supplierId = existingSup.id;
        } else {
          const { data: newSup } = await supabase
            .from("suppliers")
            .insert({
              company_id: selectedCompany.id,
              name: cleanName,
            })
            .select()
            .maybeSingle();
          if (newSup) supplierId = newSup.id;
        }

        // 2. Insere Conta a Pagar
        const { data: insertedPayable, error: payErr } = await supabase
          .from("payables")
          .insert({
            company_id: selectedCompany.id,
            user_id: user?.id,
            supplier_id: supplierId,
            supplier_name: cleanName,
            description: description.trim() || `Despesa - ${cleanName}`,
            amount: numAmount,
            due_date: dueDate,
            month_ref: monthRef,
            status: "pending",
            notes: notes.trim()
              ? `[Lançado via IA/Voz]: ${notes.trim()}`
              : "[Lançado via IA/Voz]",
            is_active: true,
          })
          .select()
          .single();

        if (payErr) throw payErr;

        if (onSuccess) {
          onSuccess("payable", insertedPayable);
        } else {
          router.push("/payables");
        }
      } else {
        // 1. Cadastra/Vincula Cliente
        let customerId: string | null = null;
        const cleanName = entityName.trim();

        const { data: existingCust } = await supabase
          .from("customers")
          .select("id")
          .eq("company_id", selectedCompany.id)
          .ilike("name", cleanName)
          .maybeSingle();

        if (existingCust) {
          customerId = existingCust.id;
        } else {
          const { data: newCust } = await supabase
            .from("customers")
            .insert({
              company_id: selectedCompany.id,
              name: cleanName,
            })
            .select()
            .maybeSingle();
          if (newCust) customerId = newCust.id;
        }

        // 2. Insere Conta a Receber
        const { data: insertedReceivable, error: recErr } = await supabase
          .from("receivables")
          .insert({
            company_id: selectedCompany.id,
            user_id: user?.id,
            customer_id: customerId,
            client_name: cleanName,
            description: description.trim() || `Receita - ${cleanName}`,
            amount: numAmount,
            due_date: dueDate,
            month_ref: monthRef,
            status: "open",
            received_amount: 0,
            is_active: true,
          })
          .select()
          .single();

        if (recErr) throw recErr;

        if (onSuccess) {
          onSuccess("receivable", insertedReceivable);
        } else {
          router.push("/receivables");
        }
      }

      onClose();
    } catch (err: any) {
      console.error("Erro ao salvar transação:", err);
      setErrorMsg(err.message || "Erro ao salvar transação no banco de dados.");
    } finally {
      setSaving(false);
    }
  }

  function formatTime(seconds: number) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-gray-100 space-y-5 max-h-[90vh] overflow-y-auto">
        
        {/* Top Header */}
        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 text-amber-900 flex items-center justify-center text-xl font-bold shadow-2xs">
              🎙️
            </div>
            <div>
              <h3 className="text-base font-extrabold text-gray-900 flex items-center gap-2">
                Lançamento Rápido por Voz
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-linear-to-r from-amber-500 to-orange-500 text-white font-black uppercase tracking-wider">
                  IA
                </span>
              </h3>
              <p className="text-xs text-gray-500">
                Fale o pagamento ou recebimento e a IA preenche tudo.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-2 rounded-xl text-lg font-bold"
          >
            ✕
          </button>
        </div>

        {/* Alerta de Erro com Ações de Tentar Novamente, Recarregar e Upload */}
        {errorMsg && (
          <div className="p-3.5 bg-red-50 border border-red-200 rounded-2xl text-xs text-red-800 space-y-2.5">
            <div className="flex items-start justify-between gap-2">
              <span className="leading-relaxed font-medium">⚠️ {errorMsg}</span>
              <button
                type="button"
                onClick={() => setErrorMsg("")}
                className="font-bold opacity-60 hover:opacity-100 p-1 text-sm"
              >
                ✕
              </button>
            </div>
            <div className="pt-1 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={startRecording}
                className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white font-bold text-[11px] rounded-lg shadow-2xs transition-colors flex items-center gap-1 cursor-pointer"
              >
                <span>🔄</span>
                <span>Tentar Novamente</span>
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="px-3 py-1.5 bg-gray-800 hover:bg-black text-white font-bold text-[11px] rounded-lg shadow-2xs transition-colors flex items-center gap-1 cursor-pointer"
              >
                <span>🔃</span>
                <span>Recarregar Página</span>
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-3 py-1.5 bg-white hover:bg-gray-100 text-gray-800 font-bold text-[11px] rounded-lg border border-gray-300 shadow-2xs transition-colors flex items-center gap-1 cursor-pointer"
              >
                <span>📁</span>
                <span>Enviar Áudio Gravado</span>
              </button>
            </div>
          </div>
        )}

        {/* ÁREA DE GRAVAÇÃO */}
        {!parsedData && (
          <div className="flex flex-col items-center justify-center py-6 px-4 bg-linear-to-b from-gray-50 to-white rounded-2xl border border-gray-200/80 text-center space-y-4">
            
            {/* Botão Central de Microfone */}
            <div className="relative">
              {isRecording && (
                <div className="absolute -inset-3 rounded-full bg-red-500/20 animate-ping" />
              )}
              <button
                type="button"
                onClick={isRecording ? stopRecording : startRecording}
                disabled={processing}
                className={`relative w-20 h-20 rounded-full flex items-center justify-center text-3xl shadow-lg transition-all duration-200 active:scale-95 cursor-pointer ${
                  isRecording
                    ? "bg-red-600 text-white shadow-red-500/40 animate-pulse"
                    : processing
                    ? "bg-gray-400 text-white cursor-not-allowed"
                    : "bg-[#2C1810] hover:bg-black text-white shadow-gray-900/20 hover:scale-105"
                }`}
              >
                {isRecording ? "⏹️" : processing ? "⏳" : "🎙️"}
              </button>
            </div>

            {/* Status / Cronômetro */}
            <div>
              {isRecording ? (
                <div className="space-y-1">
                  <span className="text-sm font-extrabold text-red-600 flex items-center justify-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-600 animate-ping inline-block" />
                    Gravando: {formatTime(recordingTime)}
                  </span>
                  <p className="text-xs text-gray-500">
                    Clique no botão vermelho para parar e processar.
                  </p>
                </div>
              ) : processing ? (
                <div className="space-y-1">
                  <span className="text-sm font-bold text-amber-700 animate-pulse">
                    Ouvindo e estruturando os dados com IA...
                  </span>
                  <p className="text-xs text-gray-400">Só leva 1 ou 2 segundos.</p>
                </div>
              ) : (
                <div className="space-y-1">
                  <span className="text-sm font-bold text-gray-800">
                    Toque para falar
                  </span>
                  <p className="text-xs text-gray-500">
                    Grave de forma natural e sem pressa.
                  </p>
                </div>
              )}
            </div>

            {/* Dica / Guia de Como Falar */}
            <div className="w-full bg-amber-50/80 border border-amber-200/80 rounded-2xl p-3.5 text-left text-xs space-y-1.5 mt-2">
              <span className="font-extrabold text-amber-950 flex items-center gap-1.5">
                💡 Dica de como falar (fórmula recomendada):
              </span>
              <p className="text-amber-900 font-semibold text-[11px]">
                &quot;[Pagar/Receber] + [Valor] + [Para quem] + [Quando] + [O que é]&quot;
              </p>
              <div className="text-[11px] text-amber-800/90 space-y-1 pt-1 border-t border-amber-200/50">
                <p>
                  🔴 <strong>Exemplo A Pagar:</strong> &quot;Paguei 350 reais no Pix hoje pro Posto Ipiranga de combustível&quot;
                </p>
                <p>
                  🟢 <strong>Exemplo A Receber:</strong> &quot;Recebi 1500 reais do cliente João Silva da consultoria de hoje&quot;
                </p>
              </div>
            </div>

            {/* Opção Alternativa: Upload de Arquivo / Nota de Voz */}
            <div className="pt-1 w-full flex flex-col items-center">
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*,.mp3,.m4a,.wav,.ogg,.aac,.webm,.caf"
                className="hidden"
                onChange={handleFileSelect}
              />
              <button
                type="button"
                disabled={processing || isRecording}
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-2 px-3 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-2xs"
              >
                <span>📁</span>
                <span>Ou selecione um áudio gravado / nota de voz</span>
              </button>
            </div>
          </div>
        )}

        {/* FORMULÁRIO DE CONFIRMAÇÃO (APÓS A IA PROCESSAR) */}
        {parsedData && (
          <form onSubmit={handleSaveTransaction} className="space-y-4 animate-in fade-in duration-300">
            
            {/* Transcrição da IA */}
            <div className="bg-gray-50 rounded-2xl p-3 border border-gray-200 space-y-1">
              <div className="flex items-center justify-between text-[11px] font-bold text-gray-500">
                <span>💬 O que a IA entendeu:</span>
                <button
                  type="button"
                  onClick={resetState}
                  className="text-amber-700 hover:text-amber-900 font-bold underline"
                >
                  Gravar outro áudio
                </button>
              </div>
              <p className="text-xs text-gray-800 italic font-medium">
                &quot;{parsedData.transcription}&quot;
              </p>
            </div>

            {/* Seleção do Tipo: Pagar ou Receber */}
            <div className="grid grid-cols-2 gap-2 p-1 bg-gray-100 rounded-xl">
              <button
                type="button"
                onClick={() => setType("payable")}
                className={`py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                  type === "payable"
                    ? "bg-red-600 text-white shadow-xs"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                <span>💸</span> Conta a Pagar
              </button>
              <button
                type="button"
                onClick={() => setType("receivable")}
                className={`py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                  type === "receivable"
                    ? "bg-emerald-600 text-white shadow-xs"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                <span>💰</span> Conta a Receber
              </button>
            </div>

            {/* Campos Principais */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  {type === "payable" ? "Fornecedor / Favorecido *" : "Cliente / Pagador *"}
                </label>
                <input
                  type="text"
                  required
                  value={entityName}
                  onChange={(e) => setEntityName(e.target.value)}
                  placeholder={type === "payable" ? "Ex: Posto Ipiranga" : "Ex: João Silva"}
                  className="w-full px-3 py-2 text-xs border border-gray-300 rounded-xl outline-none focus:border-amber-600 focus:ring-1 focus:ring-amber-600"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Valor (R$) *
                </label>
                <input
                  type="text"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0,00"
                  className="w-full px-3 py-2 text-xs font-bold text-gray-900 border border-gray-300 rounded-xl outline-none focus:border-amber-600 focus:ring-1 focus:ring-amber-600"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Data de Vencimento *
                </label>
                <input
                  type="date"
                  required
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-gray-300 rounded-xl outline-none focus:border-amber-600 focus:ring-1 focus:ring-amber-600"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Forma de Pagamento
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-gray-300 rounded-xl outline-none focus:border-amber-600 focus:ring-1 focus:ring-amber-600 bg-white"
                >
                  <option value="pix">Pix</option>
                  <option value="boleto">Boleto</option>
                  <option value="cartao_credito">Cartão de Crédito</option>
                  <option value="cartao_debito">Cartão de Débito</option>
                  <option value="dinheiro">Dinheiro</option>
                  <option value="outro">Outro</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                Descrição do Lançamento
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ex: Abastecimento de combustível"
                className="w-full px-3 py-2 text-xs border border-gray-300 rounded-xl outline-none focus:border-amber-600 focus:ring-1 focus:ring-amber-600"
              />
            </div>

            {/* Botões de Ação */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={resetState}
                className="px-4 py-2 text-xs font-bold text-gray-600 hover:text-gray-900 rounded-xl"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2.5 text-xs font-bold text-white bg-[#2C1810] hover:bg-black rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <span>{saving ? "Salvando..." : "✓ Confirmar e Salvar Lançamento"}</span>
              </button>
            </div>
          </form>
        )}

      </div>
    </div>
  );
}
