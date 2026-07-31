"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { parseOFX, type ParsedTransaction } from "@/lib/parsers/ofx";
import Navigation from "@/components/Navigation";

export default function UploadPage() {
  const router = useRouter();
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [transactions, setTransactions] = useState<ParsedTransaction[]>([]);
  const [fileName, setFileName] = useState("");
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [importedCount, setImportedCount] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);

  // Max file size: 5MB
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
    setImportedCount(0);
    setSkippedCount(0);

    // Validate file type
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (extension !== "ofx" && extension !== "csv") {
      setError("Tipo de arquivo inválido. Use .ofx ou .csv");
      return;
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      setError("Arquivo muito grande. Tamanho máximo: 5MB.");
      return;
    }

    setFileName(file.name);
    setLoading(true);

    try {
      const text = await file.text();

      if (extension === "ofx") {
        const parsed = parseOFX(text);
        setTransactions(parsed);
      } else {
        // CSV parser will be implemented in Etapa 7
        setError("Parser de CSV será implementado na próxima etapa.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao ler arquivo.");
    } finally {
      setLoading(false);
    }
  }

  // Import transactions to database
  async function handleImport() {
    if (transactions.length === 0) return;

    setImporting(true);
    setError("");

    try {
      // 1. Buscar fitids já existentes no banco para este mês
      const monthRefs = [...new Set(transactions.map((t) => t.month_ref))];

      const { data: existing } = await supabase
        .from("transactions")
        .select("fitid")
        .in("month_ref", monthRefs)
        .not("fitid", "is", null);

      const existingFitids = new Set((existing || []).map((t) => t.fitid));

      // 2. Filtrar apenas transações novas (fitid não existe)
      const newTransactions = transactions.filter(
        (t) => !existingFitids.has(t.fitid)
      );

      const skipped = transactions.length - newTransactions.length;

      if (newTransactions.length === 0) {
        setSkippedCount(transactions.length);
        setSuccess(`Todas as ${transactions.length} transações já foram importadas anteriormente.`);
        setImporting(false);
        return;
      }

      // 3. Inserir as transações novas
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

      setImportedCount(newTransactions.length);
      setSkippedCount(skipped);
      setSuccess(`${newTransactions.length} transações importadas!${skipped > 0 ? ` ${skipped} duplicadas ignoradas.` : ""}`);

      // Redirect to transactions page after 2 seconds
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
    setError("");
    setSuccess("");
    setImportedCount(0);
    setSkippedCount(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  // Format currency
  function formatCurrency(value: number): string {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  }

  // Format date DD/MM/YYYY
  function formatDate(dateStr: string): string {
    const [year, month, day] = dateStr.split("-");
    return `${day}/${month}/${year}`;
  }

  return (
    <Navigation>
      <div className="p-4 md:p-8 max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-800 mb-6">Subir Extrato</h1>

        {/* Error message */}
        {error && (
          <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
            {error}
          </div>
        )}

        {/* Success message */}
        {success && (
          <div className="mb-4 text-sm text-green-600 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
            {success}
          </div>
        )}

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".ofx,.csv"
          onChange={handleFileChange}
          className="hidden"
        />

        {/* Upload area */}
        {transactions.length === 0 && !loading && (
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

        {/* Loading */}
        {loading && (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
            <p className="text-gray-500">Lendo arquivo...</p>
          </div>
        )}

        {/* Preview */}
        {transactions.length > 0 && (
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

              {/* Preview table */}
              <div className="overflow-x-auto -mx-4 md:mx-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-gray-500">
                      <th className="py-2 px-2 md:px-3 font-medium">Data</th>
                      <th className="py-2 px-2 md:px-3 font-medium">Descrição</th>
                      <th className="py-2 px-2 md:px-3 font-medium text-right">Valor</th>
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

              {/* Import button */}
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
