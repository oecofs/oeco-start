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
 * Ex: "Cliente, S.A.";100,50 → ["Cliente, S.A.", "100,50"]
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
 * Procura por "data", "descrição"/"histórico", "valor"
 */
export function autoDetectColumns(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {
    dateColumn: null,
    descriptionColumn: null,
    amountColumn: null,
  };

  headers.forEach((header, index) => {
    const normalized = header.toLowerCase().trim();

    // Data: procura por "data"
    if (
      mapping.dateColumn === null &&
      (normalized.includes("data") || normalized.includes("date"))
    ) {
      mapping.dateColumn = index;
    }

    // Descrição: procura por "descrição", "descrição", "histórico", "memo", "description"
    if (
      mapping.descriptionColumn === null &&
      (normalized.includes("descri") ||
        normalized.includes("hist") ||
        normalized.includes("memo") ||
        normalized.includes("lanc"))
    ) {
      mapping.descriptionColumn = index;
    }

    // Valor: procura por "valor", "amount", "montant"
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
 * Normaliza data de DD/MM/YYYY ou DD-MM-YYYY para YYYY-MM-DD
 * Também lida com YYYY-MM-DD (já no formato certo)
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

  return "";
}

/**
 * Normaliza valor de formato brasileiro para número
 * "R$ 1.234,56" → 1234.56
 * "-1.234,56" → -1234.56
 * "1.234,56-" → -1234.56 (negativo com traço no final)
 * "1234.56" → 1234.56
 */
function normalizeAmount(valueStr: string): number {
  if (!valueStr) return 0;

  let cleaned = valueStr.trim().replace(/["']/g, "");

  // Remove R$ e espaços
  cleaned = cleaned.replace(/R\$/gi, "").trim();

  // Verifica se é negativo (traço no início ou no final)
  let isNegative = false;
  if (cleaned.startsWith("-")) {
    isNegative = true;
    cleaned = cleaned.substring(1);
  } else if (cleaned.endsWith("-")) {
    isNegative = true;
    cleaned = cleaned.slice(0, -1);
  }

  // Remove espaços
  cleaned = cleaned.trim();

  // Se tem vírgula e ponto (formato: 1.234,56)
  if (cleaned.includes(",") && cleaned.includes(".")) {
    // Remove os pontos (separador de milhares) e troca vírgula por ponto
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
 * Se autoDetect falhar, retorna erro para a UI mostrar mapeamento manual.
 */
export function parseCSV(
  content: string,
  manualMapping?: ColumnMapping
): { transactions: ParsedTransaction[]; needsManualMapping: boolean; headers: string[]; detectedMapping: ColumnMapping } {
  if (!content || content.trim().length === 0) {
    throw new Error("Arquivo CSV vazio.");
  }

  // Divide em linhas
  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);

  if (lines.length < 2) {
    throw new Error("CSV inválido: precisa ter pelo menos um cabeçalho e uma linha de dados.");
  }

  // Detecta delimitador
  const delimiter = detectDelimiter(content);

  // Primeira linha = cabeçalho
  const headers = parseCSVLine(lines[0], delimiter);

  // Mapeamento: manual ou automático
  let mapping: ColumnMapping;

  if (manualMapping) {
    mapping = manualMapping;
  } else {
    mapping = autoDetectColumns(headers);
  }

  // Verifica se conseguiu mapear todas as colunas
  if (mapping.dateColumn === null || mapping.descriptionColumn === null || mapping.amountColumn === null) {
    // Retorna sinal de que precisa mapeamento manual
    return {
      transactions: [],
      needsManualMapping: true,
      headers,
      detectedMapping: mapping,
    };
  }

  const transactions: ParsedTransaction[] = [];
  let skipped = 0;

  // Processa cada linha de dados (a partir da linha 2)
  for (let i = 1; i < lines.length; i++) {
    const columns = parseCSVLine(lines[i], delimiter);

    const dateStr = columns[mapping.dateColumn] || "";
    const description = (columns[mapping.descriptionColumn] || "").trim();
    const amountStr = columns[mapping.amountColumn] || "";

    const date = normalizeDate(dateStr);
    const amount = normalizeAmount(amountStr);

    // Valida
    if (!date || !description || isNaN(amount)) {
      skipped++;
      continue;
    }

    const month_ref = date.substring(0, 7); // YYYY-MM

    // Gera fitid único para CSV (não há ID nativo)
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
    throw new Error("Nenhuma transação válida encontrada no CSV. Verifique o formato do arquivo.");
  }

  return {
    transactions,
    needsManualMapping: false,
    headers,
    detectedMapping: mapping,
  };
}
