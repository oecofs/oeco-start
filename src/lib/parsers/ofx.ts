//
// Parser de OFX (Open Financial Exchange)
// Lê arquivos .ofx exportados por bancos brasileiros
//

export type ParsedTransaction = {
  date: string;        // YYYY-MM-DD
  description: string; // texto do MEMO
  amount: number;      // positivo = entrada, negativo = saída
  fitid: string;       // ID único da transação no OFX
  month_ref: string;   // YYYY-MM (derivado da data)
};

/**
 * Faz o parse de um arquivo OFX em texto.
 * Retorna array de transações normalizadas.
 */
export function parseOFX(content: string): ParsedTransaction[] {
  // Validar se é OFX
  if (!content.includes("<OFX") && !content.includes("<ofx")) {
    throw new Error("Arquivo OFX inválido. Verifique se você exportou o extrato no formato correto.");
  }

  // Extrair todos os blocos <STMTTRN>...</STMTTRN>
  const stmttrnRegex = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi;
  const matches = content.match(stmttrnRegex);

  if (!matches || matches.length === 0) {
    throw new Error("Nenhuma transação encontrada no arquivo OFX.");
  }

  const transactions: ParsedTransaction[] = [];

  for (const block of matches) {
    const trx = parseStmttrn(block);
    if (trx) {
      transactions.push(trx);
    }
  }

  if (transactions.length === 0) {
    throw new Error("Nenhuma transação válida encontrada no arquivo OFX.");
  }

  return transactions;
}

/**
 * Faz o parse de um bloco <STMTTRN> individual
 */
function parseStmttrn(block: string): ParsedTransaction | null {
  try {
    // TRNTYPE: DEBIT (saída) ou CREDIT (entrada)
    const trntype = extractTag(block, "TRNTYPE");

    // DTPOSTED: data no formato YYYYMMDD ou YYYYMMDDHHMMSS
    const dtposted = extractTag(block, "DTPOSTED");
    const date = parseOFXDate(dtposted);

    // TRNAMT: valor (pode ter ponto ou vírgula como decimal)
    const trnamt = extractTag(block, "TRNAMT");
    const amount = parseOFXAmount(trnamt, trntype);

    // FITID: ID único
    const fitid = extractTag(block, "FITID");

    // MEMO: descrição
    const memo = extractTag(block, "MEMO");

    if (!date || isNaN(amount) || !memo) {
      return null;
    }

    const month_ref = date.substring(0, 7); // YYYY-MM

    return {
      date,
      description: memo.trim(),
      amount,
      fitid: fitid || `${date}-${memo.substring(0, 20)}-${Math.random().toString(36).substring(7)}`,
      month_ref,
    };
  } catch {
    return null;
  }
}

/**
 * Extrai o valor de uma tag OFX (formato <TAG>valor)
 * OFX usa SGML, então as tags não têm fechamento (ou têm em alguns bancos)
 */
function extractTag(block: string, tag: string): string {
  // Tenta <TAG>valor</TAG>
  const closedRegex = new RegExp(`<${tag}>([\s\S]*?)<\/${tag}>`, "i");
  const closedMatch = block.match(closedRegex);
  if (closedMatch) {
    return closedMatch[1].trim();
  }

  // Tenta <TAG>valor (sem fechamento — padrão SGML)
  const openRegex = new RegExp(`<${tag}>([^<\r\\n]*)`, "i");
  const openMatch = block.match(openRegex);
  if (openMatch) {
    return openMatch[1].trim();
  }

  return "";
}

/**
 * Converte data do OFX (YYYYMMDD ou YYYYMMDDHHMMSS) para YYYY-MM-DD
 */
function parseOFXDate(dtposted: string): string {
  if (!dtposted || dtposted.length < 8) {
    return "";
  }

  const year = dtposted.substring(0, 4);
  const month = dtposted.substring(4, 6);
  const day = dtposted.substring(6, 8);

  // Validar
  const monthNum = parseInt(month);
  const dayNum = parseInt(day);

  if (monthNum < 1 || monthNum > 12 || dayNum < 1 || dayNum > 31) {
    return "";
  }

  return `${year}-${month}-${day}`;
}

/**
 * Converte o valor do OFX para número
 * - Pode usar ponto ou vírgula como separador decimal
 * - DEBIT deve ser negativo, CREDIT positivo
 * - Garante que saídas sejam negativas
 */
function parseOFXAmount(trnamt: string, trntype: string): number {
  if (!trnamt) return 0;

  // Remove espaços e R$ se existir
  let cleaned = trnamt.trim().replace(/R\$/g, "").trim();

  // Se tem vírgula como decimal (formato brasileiro)
  // Ex: "1.234,56" → "1234.56" | "1234,56" → "1234.56"
  if (cleaned.includes(",") && cleaned.includes(".")) {
    // Formato: 1.234,56 → remove pontos, troca vírgula por ponto
    cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (cleaned.includes(",")) {
    // Só vírgula: 1234,56 → 1234.56
    cleaned = cleaned.replace(",", ".");
  }

  let amount = parseFloat(cleaned);

  if (isNaN(amount)) return 0;

  // DEBIT = saída → garantir que é negativo
  if (trntype && trntype.toUpperCase() === "DEBIT" && amount > 0) {
    amount = -amount;
  }

  // CREDIT = entrada → garantir que é positivo
  if (trntype && trntype.toUpperCase() === "CREDIT" && amount < 0) {
    amount = Math.abs(amount);
  }

  return amount;
}
