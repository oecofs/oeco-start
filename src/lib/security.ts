/**
 * Utilitários de Segurança e Sanitização
 */

/**
 * Previne CSV / Formula Injection (Excel / Sheets Injection)
 * Se um texto iniciar com =, +, -, @, \t ou \r, escapa com aspas simples para impedir execução de comandos.
 */
export function sanitizeFormulaInjection(input: string): string {
  if (!input) return "";
  const trimmed = input.trim();
  const dangerousPrefixes = ["=", "+", "-", "@", "\t", "\r"];
  if (dangerousPrefixes.some((p) => trimmed.startsWith(p))) {
    // Se for número legítimo negativo ou positivo, não altera
    if (!isNaN(Number(trimmed))) {
      return trimmed;
    }
    return `'${trimmed}`;
  }
  return trimmed;
}

/**
 * Sanitiza e limpa CNPJ mantendo apenas números
 */
export function cleanCNPJ(cnpj: string): string {
  if (!cnpj) return "";
  return cnpj.replace(/\D/g, "");
}
