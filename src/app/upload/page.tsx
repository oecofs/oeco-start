"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { parseOFX, type ParsedTransaction } from "@/lib/parsers/ofx";
import { parseCSV, type ColumnMapping } from "@/lib/parsers/csv";
import Navigation from "@/components/Navigation";

export default function UploadPage() {
  const router = useRouter();
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [transactions, setTransactions] = useState<ParsedTransaction[]>([]);
  const [fileName, setFileName] = useState("");
  const [fileType, setFileType] = useState<"ofx" | "csv" | "">("");
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [needsManualMapping, setNeedsManualMapping] = useState(false);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvContent, setCsvContent] = useState("");
  const [manualMapping, setManualMapping] = useState<ColumnMapping>({
    dateColumn: null,
    descriptionColumn: null,
    amountColumn: null,
  });

  const MAX_FILE_SIZE = 5 * 1024 * 1024;

  function handleFileSelect() {
    fileInputRef.current?.click();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setError("");
    setSuccess("");
    setTransactions([]);
    setNeedsManualMapping(false);
    setCsvHeaders([]);
    setCsvContent("");

    const extension = file.name.split(".").pop()?.toLowerCase();
    if (extension !== "ofx" && extension !== "csv") {
      setError("Tipo de arquivo inválido. Use .ofx ou .csv");
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setError("Arquivo muito grande. Tamanho máximo: 5MB.");
      return;
    }

    setFileName(file.name);
    setFileType(extension as "ofx" | "csv");
    setLoading(true);

    try {
      const buffer = await file.arrayBuffer();

      if (extension === "ofx") {
        const parsed = parseOFX(buffer);
        setTransactions(parsed);
      } else {
        const text = new TextDecoder("utf-8").decode(buffer);
        const result = parseCSV(text);

        if (result.needsManualMapping) {
          setCsvHeaders(result.headers);
          setCsvContent(text);
          setNeedsManualMapping(true);
        } else {
          setTransactions(result.transactions);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao ler arquivo.");
    } finally {
      setLoading(false);
    }
  }

  function handleManualMap() {
    if (
      manualMapping.dateColumn === null ||
      manualMapping.descriptionColumn === null ||
      manualMapping.amountColumn === null
    ) {
      setError("Selecione as três colunas para continuar.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const result = parseCSV(csvContent, manualMapping);
      setTransactions(result.transactions);
      setNeedsManualMapping(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao processar CSV.");
    } finally {
      setLoading(false);
    }
  }

  async function handleImport() {
    if (transactions.length === 0) return;

    setImporting(true);
    setError("");

    try {
      // Remover duplicatas de month_ref sem usar Set
      const allMonthRefs = transactions.map((t) => t.month_ref);
      const monthRefs = allMonthRefs.filter((v, i, a) => a.indexOf(v) === i);

      const { data: existing } = await supabase
        .from("transactions")
        .select("fitid")
        .in("month_ref", monthRefs)
        .not("fitid", "is", null);

      // Usar array simples em vez de Set
      const existingFitids = (existing || []).map((t) => t.fitid);

      const newTransactions = transactions.filter(
        (t) => !existingFitids.includes(t.fitid)
      );

      const skipped = transactions.length - newTransactions.length;

      if (newTransactions.length === 0) {
        setSuccess(
          `Todas as ${transactions.length} transações já foram importadas anteriormente.`
        );
        setImporting(false);
        return;
      }

      const { error: insertError } = await supabase
        .from("transactions")
        .insert(
          newTransactions.map((t) => ({
            date: t.date,
            description: t.description,
            amount: t.amount,
            month_ref: t.month_ref,
            fitid: t.fitid,
            is_reconciled: false,
          }))
        );

      if (insertError) {
        setError("Erro ao importar transações.");
        setImporting(false);
        return;
      }

      setSuccess(
        `${newTransactions.length} transações importadas!${skipped > 0 ? ` ${skipped} duplicadas ignoradas.` : ""}`
      );

      setTimeout(() => {
        router.push("/transactions");
      }, 2000);
    } catch {
      setError("Erro inesperado ao importar.");
      setImporting(false);
    }
  }

  function handleReset() {
    setTransactions([]);
    setFileName("");
    setFileType("");
    setError("");
    setSuccess("");
    setNeedsManualMapping(false);
    setCsvHeaders([]);
    setCsvContent("");
    setManualMapping({
      dateColumn: null,
      descriptionColumn: null,
      amountColumn: null,
    });
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function formatCurrency(value: number): string {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  }

  function formatDate(dateStr: string): string {
    const [year, month, day] = dateStr.split("-");
    return `${day}/${month}/${year}`;
  }

  return (
    <Navigation>
      <div className="p-4 md:p-8 max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-800 mb-6">Subir Extrato</h1>

        {error && (
          <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-4 text-sm text-green-600 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
            {success}
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept=".ofx,.csv"
          onChange={handleFileChange}
          className="hidden"
        />

        {transactions.length === 0 && !loading && !needsManualMapping && (
          <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-6">
            <button
              onClick={handleFileSelect}
              className="w-full border-2 border-dashed border-gray-300 rounded-xl py-12 px-4 hover:border-primary hover:bg-primary/5 transition-colors"
            >
              <div className="flex flex-col items-center gap-2">
                <span className="text-4xl">📁</span>
                <span className="text-gray-600 font-medium">
                  Clique para selecionar um arquivo
                </span>
                <span className="text-sm text-gray-400">
                  Formatos aceitos: .ofx ou .csv (máx. 5MB)
                </span>
              </div>
            </button>
          </div>
        )}

        {loading && (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
            <p className="text-gray-500">Lendo arquivo...</p>
          </div>
        )}

        {needsManualMapping && !loading && (
          <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-2">
              Mapear colunas
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              Não foi possível detectar as colunas automaticamente. Selecione
              qual coluna corresponde a cada campo:
            </p>
            <p className="text-xs text-gray-400 mb-4">
              Colunas encontradas:{" "}
              {csvHeaders.map((h, i) => `[${i}] ${h}`).join("  |  ")}
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Coluna de Data
                </label>
                <select
                  value={manualMapping.dateColumn ?? ""}
                  onChange={(e) =>
                    setManualMapping({
                      ...manualMapping,
                      dateColumn:
                        e.target.value === "" ? null : parseInt(e.target.value),
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">Selecione...</option>
                  {csvHeaders.map((header, index) => (
                    <option key={index} value={index}>
                      [{index}] {header}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Coluna de Descrição
                </label>
                <select
                  value={manualMapping.descriptionColumn ?? ""}
                  onChange={(e) =>
                    setManualMapping({
                      ...manualMapping,
                      descriptionColumn:
                        e.target.value === ""
                          ? null
                          : parseInt(e.target.value),
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">Selecione...</option>
                  {csvHeaders.map((header, index) => (
                    <option key={index} value={index}>
                      [{index}] {header}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Coluna de Valor
                </label>
                <select
                  value={manualMapping.amountColumn ?? ""}
                  onChange={(e) =>
                    setManualMapping({
                      ...manualMapping,
                      amountColumn:
                        e.target.value === "" ? null : parseInt(e.target.value),
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">Selecione...</option>
                  {csvHeaders.map((header, index) => (
                    <option key={index} value={index}>
                      [{index}] {header}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleReset}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleManualMap}
                  className="flex-1 px-4 py-2 bg-primary text-white font-medium rounded-lg hover:bg-primary-dark transition-colors"
                >
                  Processar
                </button>
              </div>
            </div>
          </div>
        )}

        {transactions.length > 0 && !needsManualMapping && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-gray-800">
                    {transactions.length} transações encontradas
                  </h2>
                  <p className="text-sm text-gray-400">{fileName}</p>
                </div>
                <button
                  onClick={handleReset}
                  className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  Cancelar
                </button>
              </div>

              <div className="overflow-x-auto -mx-4 md:mx-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-gray-500">
                      <th className="py-2 px-2 md:px-3 font-medium">Data</th>
                      <th className="py-2 px-2 md:px-3 font-medium">
                        Descrição
                      </th>
                      <th className="py-2 px-2 md:px-3 font-medium text-right">
                        Valor
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.slice(0, 50).map((trx, index) => (
                      <tr key={index} className="border-b border-gray-50">
                        <td className="py-2 px-2 md:px-3 text-gray-600 whitespace-nowrap">
                          {formatDate(trx.date)}
                        </td>
                        <td className="py-2 px-2 md:px-3 text-gray-700 max-w-xs truncate">
                          {trx.description}
                        </td>
                        <td
                          className={`py-2 px-2 md:px-3 text-right font-medium whitespace-nowrap ${
                            trx.amount >= 0 ? "text-green-600" : "text-red-600"
                          }`}
                        >
                          {formatCurrency(trx.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {transactions.length > 50 && (
                <p className="text-center text-sm text-gray-400 mt-3">
                  Mostrando 50 de {transactions.length} transações
                </p>
              )}

              <div className="mt-6 flex justify-end">
                <button
                  onClick={handleImport}
                  disabled={importing}
                  className="px-6 py-2.5 bg-primary text-white font-medium rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {importing
                    ? "Importando..."
                    : `Importar ${transactions.length} transações`}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Navigation>
  );
}
