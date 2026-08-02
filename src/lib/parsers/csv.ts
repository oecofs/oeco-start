//
// Parser de CSV (Fallback)
// Lê arquivos .csv exportados por bancos brasileiros
//
export type ParsedTransaction = {
  date: string;        // YYYY-MM-DD
  description: string; // texto da descrição/histórico
  amount: number;      // positivo = entrada, negativo = saída
  fitid: string;       // ID único (gerado para CSV)
  month_ref: string;   // YYYY-MM
};

export type ColumnMapping = {
  dateColumn: number | null;
  descriptionColumn: number | null;
  amountColumn: number | null;
};

/**
 * Detecta o delimitador do CSV (vírgula, ponto e vírgula, ou tab)
 */
export function detectDelimiter(text: string): string {
  const firstLine = text.split("\n")[0] || "";
  const counts = {
    comma: (firstLine.match(/,/g) || []).length,
    semicolon: (firstLine.match(/;/g) || []).length,
    tab: (firstLine.match(/\t/g) || []).length,
  };
  if (counts.semicolon >= counts.comma && counts.semicolon >= counts.tab) {
    return ";";
  } else if (counts.tab >= counts.comma && counts.tab >= counts.semicolon) {
    return "\t";
  } else {
    return ",";
  }
}

/**
 * Faz o parse de uma linha CSV respeitando aspas
 */
function parseCSVLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === delimiter && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * Tenta mapear colunas automaticamente pelo cabeçalho
 */
export function autoDetectColumns(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {
    dateColumn: null,
    descriptionColumn: null,
    amountColumn: null,
  };
  headers.forEach((header, index) => {
    const normalized = header.toLowerCase().trim();
    // Data
    if (
      mapping.dateColumn === null &&
      (normalized.includes("data") || normalized.includes("date"))
    ) {
      mapping.dateColumn = index;
    }
    // Descrição — CORRIGIDO: adicionado "texto", "desc", "nome", "historico"
    if (
      mapping.descriptionColumn === null &&
      (normalized.includes("descri") ||
        normalized.includes("hist") ||
        normalized.includes("memo") ||
        normalized.includes("lanc") ||
        normalized.includes("texto") ||
        normalized.includes("desc") ||
        normalized.includes("nome") ||
        normalized.includes("historico"))
    ) {
      mapping.descriptionColumn = index;
    }
    // Valor
    if (
      mapping.amountColumn === null &&
      (normalized.includes("valor") ||
        normalized.includes("amount") ||
        normalized.includes("montant"))
    ) {
      mapping.amountColumn = index;
    }
  });
  return mapping;
}

/**
 * Normaliza data — CORRIGIDO: adicionado suporte a número serial do Excel
 */
function normalizeDate(dateStr: string): string {
  if (!dateStr) return "";
  const cleaned = dateStr.trim().replace(/["']/g, "");

  // Se já está no formato YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
    return cleaned;
  }

  // DD/MM/YYYY ou DD-MM-YYYY
  const match = cleaned.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})$/);
  if (match) {
    const day = match[1].padStart(2, "0");
    const month = match[2].padStart(2, "0");
    const year = match[3];
    return `${year}-${month}-${day}`;
  }

  // YYYY/MM/DD
  const match2 = cleaned.match(/^(\d{4})[/\-](\d{1,2})[/\-](\d{1,2})$/);
  if (match2) {
    const year = match2[1];
    const month = match2[2].padStart(2, "0");
    const day = match2[3].padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  // ===== NOVO: Número serial do Excel (ex: 45678) =====
  const excelMatch = cleaned.match(/^(\d{4,5})$/);
  if (excelMatch) {
    const serial = parseInt(excelMatch[1]);
    // Range válido: 1/1/1970 a ~31/12/2099
    if (serial > 25569 && serial < 73415) {
      const date = new Date((serial - 25569) * 86400 * 1000);
      const year = date.getUTCFullYear();
      const month = String(date.getUTCMonth() + 1).padStart(2, "0");
      const day = String(date.getUTCDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    }
  }

  // ===== NOVO: Data no formato DD/MM/YY (2 dígitos no ano) =====
  const match3 = cleaned.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{2})$/);
  if (match3) {
    const day = match3[1].padStart(2, "0");
    const month = match3[2].padStart(2, "0");
    let year = match3[3];
    // Se o ano tem 2 dígitos, assume 2000+
    if (year.length === 2) {
      year = "20" + year;
    }
    return `${year}-${month}-${day}`;
  }

  return "";
}

/**
 * Normaliza valor de formato brasileiro para número
 */
function normalizeAmount(valueStr: string): number {
  if (!valueStr) return 0;
  let cleaned = valueStr.trim().replace(/["']/g, "");

  // Remove R$ e espaços
  cleaned = cleaned.replace(/R\$/gi, "").trim();

  // Verifica se é negativo
  let isNegative = false;
  if (cleaned.startsWith("-")) {
    isNegative = true;
    cleaned = cleaned.substring(1);
  } else if (cleaned.endsWith("-")) {
    isNegative = true;
    cleaned = cleaned.slice(0, -1);
  }

  cleaned = cleaned.trim();

  // Se tem vírgula e ponto (formato: 1.234,56)
  if (cleaned.includes(",") && cleaned.includes(".")) {
    cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (cleaned.includes(",")) {
    // Só vírgula: 1234,56 → 1234.56
    cleaned = cleaned.replace(",", ".");
  }

  let amount = parseFloat(cleaned);
  if (isNaN(amount)) return 0;
  if (isNegative) {
    amount = -Math.abs(amount);
  }
  return amount;
}

/**
 * Faz o parse completo do CSV.
 */
export function parseCSV(
  content: string,
  manualMapping?: ColumnMapping
): { transactions: ParsedTransaction[]; needsManualMapping: boolean; headers: string[]; detectedMapping: ColumnMapping } {
  if (!content || content.trim().length === 0) {
    throw new Error("Arquivo CSV vazio.");
  }

  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) {
    throw new Error("CSV inválido: precisa ter pelo menos um cabeçalho e uma linha de dados.");
  }

  const delimiter = detectDelimiter(content);
  const headers = parseCSVLine(lines[0], delimiter);

  let mapping: ColumnMapping;
  if (manualMapping) {
    mapping = manualMapping;
  } else {
    mapping = autoDetectColumns(headers);
  }

  if (
    mapping.dateColumn === null ||
    mapping.descriptionColumn === null ||
    mapping.amountColumn === null
  ) {
    return {
      transactions: [],
      needsManualMapping: true,
      headers,
      detectedMapping: mapping,
    };
  }

  const transactions: ParsedTransaction[] = [];
  let skipped = 0;

  for (let i = 1; i < lines.length; i++) {
    const columns = parseCSVLine(lines[i], delimiter);
    const dateStr = columns[mapping.dateColumn] || "";
    const description = (columns[mapping.descriptionColumn] || "").trim();
    const amountStr = columns[mapping.amountColumn] || "";

    const date = normalizeDate(dateStr);
    const amount = normalizeAmount(amountStr);

    if (!date || !description || isNaN(amount)) {
      skipped++;
      continue;
    }

    const month_ref = date.substring(0, 7);
    const fitid = `csv-${date}-${i}-${description.substring(0, 15).replace(/\s/g, "")}`;

    transactions.push({
      date,
      description,
      amount,
      fitid,
      month_ref,
    });
  }

  if (transactions.length === 0) {
    throw new Error(
      `Nenhuma transação válida encontrada no CSV. Verifique o formato do arquivo. (${skipped} linhas ignoradas.)`
    );
  }

  return {
    transactions,
    needsManualMapping: false,
    headers,
    detectedMapping: mapping,
  };
}
