/**
 * Oeco Start — Motor de Sugestão Inteligente de Categorização
 * 
 * Analisa descrições bancárias em segundo plano, normaliza ruídos de extrato
 * e busca correspondências no histórico da empresa para sugerir categorias
 * e centros de custo com alto índice de assertividade.
 */

export type SuggestionResult = {
  transactionId: string;
  categoryId: string;
  categoryName: string;
  subcategoryId?: string | null;
  subcategoryName?: string | null;
  costCenter?: string | null;
  confidence: number; // 0 a 100
  reason: string; // Ex: "Correspondência exata no histórico (3x anteriores)"
};

export type HistoricalTransaction = {
  id: string;
  description: string;
  amount: number;
  category_id: string | null;
  cost_center: string | null;
  is_reconciled?: boolean;
};

export type CategoryItem = {
  id: string;
  name: string;
  type: "income" | "expense";
  parent_id: string | null;
  cost_center?: string | null;
};

// Termos comuns de ruído bancário a serem ignorados na comparação
const BANK_NOISE_TERMS = [
  "pix enviado",
  "pix recebido",
  "pix transf",
  "pix qrcode",
  "pix",
  "ted enviada",
  "ted recebida",
  "ted",
  "doc enviado",
  "doc recebido",
  "doc",
  "pagto",
  "pagamento",
  "pgto",
  "debito automatico",
  "deb aut",
  "debito",
  "credito",
  "compra cartao",
  "compra debito",
  "autorizacao",
  "aut",
  "transf",
  "transferencia",
  "lancamento",
  "tarifa",
  "tar",
];

/**
 * Normaliza e limpa a descrição bancária apenas em memória para análise
 * (Não altera o texto original gravado no banco de dados)
 */
export function cleanBankDescription(raw: string): string {
  if (!raw) return "";

  let cleaned = raw.toLowerCase();

  // 1. Remove termos de ruído bancário comuns
  for (const term of BANK_NOISE_TERMS) {
    cleaned = cleaned.replace(new RegExp(`\\b${term}\\b`, "gi"), " ");
  }

  // 2. Remove datas (DD/MM, DD/MM/YYYY, DD-MM-YYYY)
  cleaned = cleaned.replace(/\b\d{1,2}[\/\-\.]\d{1,2}([\/\-\.]\d{2,4})?\b/g, " ");

  // 3. Remove sequências numéricas longas (IDs de transação, agências/contas, FITIDs)
  cleaned = cleaned.replace(/\b\d{4,}\b/g, " ");

  // 4. Remove caracteres especiais e pontuações
  cleaned = cleaned.replace(/[^a-zA-Z0-9áàâãéèêíïóôõöúçñ\s]/gi, " ");

  // 5. Remove espaços duplicados
  cleaned = cleaned.replace(/\s+/g, " ").trim();

  return cleaned;
}

/**
 * Calcula índice de similaridade entre duas strings normalizadas (Dice Coefficient / Bigrams)
 */
export function calculateSimilarity(str1: string, str2: string): number {
  const s1 = cleanBankDescription(str1);
  const s2 = cleanBankDescription(str2);

  if (!s1 || !s2) return 0;
  if (s1 === s2) return 1.0;
  if (s1.includes(s2) || s2.includes(s1)) return 0.9;

  // Comparação por tokens/palavras
  const words1 = s1.split(" ").filter((w) => w.length > 2);
  const words2 = s2.split(" ").filter((w) => w.length > 2);

  if (words1.length === 0 || words2.length === 0) return 0;

  const matches = words1.filter((w) => words2.includes(w));
  const score = (2.0 * matches.length) / (words1.length + words2.length);

  return Math.min(1.0, score);
}

/**
 * Regras Universais para contas e serviços padrão no Brasil
 */
const UNIVERSAL_PATTERNS: Array<{
  pattern: RegExp;
  type: "income" | "expense";
  categoryMatch: string; // nome aproximado da categoria/subcategoria
  costCenterMatch?: string;
  confidence: number;
}> = [
  { pattern: /enel|sabesp|cpfl|comgas|light|cedae|copel|cemig|energisa/i, type: "expense", categoryMatch: "Energia Elétrica", confidence: 95 },
  { pattern: /aluguel|imobiliaria|locacao/i, type: "expense", categoryMatch: "Aluguel", confidence: 95 },
  { pattern: /das simples|simples nacional|receita federal|darf|gps inss|fgts|icms/i, type: "expense", categoryMatch: "Impostos", confidence: 95 },
  { pattern: /posto|ipiranga|shell|br petrobras|combustivel|gasolina/i, type: "expense", categoryMatch: "Insumos", confidence: 90 },
  { pattern: /tarifa banc|cesta pj|tar pacote|manut conta|iof/i, type: "expense", categoryMatch: "Software e Assinaturas", confidence: 90 },
  { pattern: /uber|99app|99 pop|taxi|cabify/i, type: "expense", categoryMatch: "Material de Escritório", confidence: 85 },
  { pattern: /google|microsoft|aws|adobe|notion|slack|zoom|openai|github/i, type: "expense", categoryMatch: "Software e Assinaturas", confidence: 95 },
  { pattern: /vivo|claro|tim|embratel|oi fibra/i, type: "expense", categoryMatch: "Internet e Telefone", confidence: 95 },
];

/**
 * Gera sugestão de categorização para uma transação individual
 */
export function suggestCategoryForTransaction(
  trx: { id: string; description: string; amount: number },
  history: HistoricalTransaction[],
  categories: CategoryItem[]
): SuggestionResult | null {
  const trxType: "income" | "expense" = trx.amount >= 0 ? "income" : "expense";
  const cleanedCurrent = cleanBankDescription(trx.description);

  if (!cleanedCurrent) return null;

  // 1. Busca no Histórico da Empresa (Maior Prioridade)
  const matchingHistory = history.filter((h) => {
    if (!h.category_id) return false;
    const hType = h.amount >= 0 ? "income" : "expense";
    return hType === trxType;
  });

  let bestMatch: HistoricalTransaction | null = null;
  let bestScore = 0;
  let matchOccurrences = 0;

  for (const h of matchingHistory) {
    const similarity = calculateSimilarity(trx.description, h.description);
    if (similarity > bestScore) {
      bestScore = similarity;
      bestMatch = h;
    }
  }

  // Se encontrou uma boa correspondência no histórico (score >= 0.7)
  if (bestMatch && bestMatch.category_id && bestScore >= 0.7) {
    // Conta quantas vezes essa descrição apareceu com essa categoria
    const sameCategoryMatches = matchingHistory.filter(
      (h) =>
        h.category_id === bestMatch!.category_id &&
        calculateSimilarity(trx.description, h.description) >= 0.7
    );
    matchOccurrences = sameCategoryMatches.length;

    // Se o valor for exatamente igual, aumenta a confiança
    const exactAmountBonus = Math.abs(bestMatch.amount - trx.amount) < 0.01 ? 0.05 : 0;
    const finalConfidence = Math.min(99, Math.round((bestScore + exactAmountBonus) * 100));

    // Identifica se a categoria é pai ou filha
    const targetCat = categories.find((c) => c.id === bestMatch!.category_id);
    if (targetCat) {
      let parentCat: CategoryItem | undefined = targetCat;
      let subCat: CategoryItem | undefined = undefined;

      if (targetCat.parent_id) {
        subCat = targetCat;
        parentCat = categories.find((c) => c.id === targetCat.parent_id);
      }

      return {
        transactionId: trx.id,
        categoryId: (subCat ? subCat.id : parentCat?.id) || targetCat.id,
        categoryName: parentCat?.name || targetCat.name,
        subcategoryId: subCat?.id || null,
        subcategoryName: subCat?.name || null,
        costCenter: bestMatch.cost_center || targetCat.cost_center || null,
        confidence: finalConfidence,
        reason:
          matchOccurrences > 1
            ? `Identificado pelo histórico (${matchOccurrences}x anteriores)`
            : "Correspondência com transação anterior",
      };
    }
  }

  // 2. Busca em Padrões Universais (Regras de Negócio)
  for (const rule of UNIVERSAL_PATTERNS) {
    if (rule.type === trxType && rule.pattern.test(trx.description)) {
      // Procura categoria com nome correspondente
      const foundCategory = categories.find(
        (c) =>
          c.type === rule.type &&
          c.name.toLowerCase().includes(rule.categoryMatch.toLowerCase())
      );

      if (foundCategory) {
        let parentCat: CategoryItem | undefined = foundCategory;
        let subCat: CategoryItem | undefined = undefined;

        if (foundCategory.parent_id) {
          subCat = foundCategory;
          parentCat = categories.find((c) => c.id === foundCategory.parent_id);
        }

        return {
          transactionId: trx.id,
          categoryId: (subCat ? subCat.id : parentCat?.id) || foundCategory.id,
          categoryName: parentCat?.name || foundCategory.name,
          subcategoryId: subCat?.id || null,
          subcategoryName: subCat?.name || null,
          costCenter: foundCategory.cost_center || null,
          confidence: rule.confidence,
          reason: `Padrão reconhecido (${rule.categoryMatch})`,
        };
      }
    }
  }

  return null;
}

/**
 * Gera mapa de sugestões para todas as transações pendentes da lista
 */
export function generateBulkSuggestions(
  pendingTransactions: Array<{ id: string; description: string; amount: number; is_reconciled?: boolean; category_id?: string | null }>,
  history: HistoricalTransaction[],
  categories: CategoryItem[],
  minConfidence: number = 75
): Map<string, SuggestionResult> {
  const suggestionsMap = new Map<string, SuggestionResult>();

  for (const trx of pendingTransactions) {
    if (trx.is_reconciled || trx.category_id) continue;

    const suggestion = suggestCategoryForTransaction(trx, history, categories);
    if (suggestion && suggestion.confidence >= minConfidence) {
      suggestionsMap.set(trx.id, suggestion);
    }
  }

  return suggestionsMap;
}
