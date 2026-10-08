// =========================================================================
// Oeco Start — Parser Universal de Extratos e Relatórios de Adquirentes
// =========================================================================

import { PaymentMethod } from './cards';

export interface ParsedStatementRow {
  saleDate: string; // ISO ou YYYY-MM-DD
  grossAmount: number;
  netAmount: number;
  feeAmount: number;
  feePercentage?: number;
  paymentMethod: PaymentMethod;
  brand: string;
  installmentsCount: number;
  installmentNumber?: number;
  authorizationCode?: string;
  nsu?: string;
  docNumber?: string;
  cardLastDigits?: string;
  settlementDate?: string;
  settlementBatchId?: string;
  status: 'approved' | 'cancelled' | 'chargeback';
  rawRow?: Record<string, any>;
}

/**
 * Normaliza strings para comparação (remove acentos, pontuações e espaços extras)
 */
function normalizeHeader(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Converte valor em string (ex: "R$ 1.250,50" ou "1250.50" ou "-15,00") para número float
 */
export function parseCurrency(val: any): number {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  const clean = String(val)
    .replace(/R\$/g, '')
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(',', '.');
  const num = parseFloat(clean);
  return isNaN(num) ? 0 : Math.abs(num);
}

/**
 * Converte data de múltiplos formatos (DD/MM/YYYY, DD/MM/YYYY HH:mm:ss, YYYY-MM-DD) para ISO YYYY-MM-DD
 */
export function parseDateString(val: any): string {
  if (!val) return new Date().toISOString().split('T')[0];
  const str = String(val).trim();

  // Formato DD/MM/YYYY ou DD/MM/YYYY HH:mm
  const brMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (brMatch) {
    const day = brMatch[1].padStart(2, '0');
    const month = brMatch[2].padStart(2, '0');
    let year = brMatch[3];
    if (year.length === 2) year = '20' + year;
    return `${year}-${month}-${day}`;
  }

  // Formato YYYY-MM-DD
  const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }

  return new Date().toISOString().split('T')[0];
}

/**
 * Detecta a modalidade de pagamento com base no texto da planilha
 */
export function detectPaymentMethod(typeStr: string, installments: number = 1): PaymentMethod {
  const norm = normalizeHeader(typeStr);
  if (norm.includes('debit') || norm.includes('debito')) return 'debit';
  if (norm.includes('voucher') || norm.includes('refeicao') || norm.includes('alimentacao')) return 'voucher';
  if (norm.includes('pix')) return 'pix';
  if (installments > 1 || norm.includes('parcel') || norm.includes('parc')) return 'credit_installment';
  return 'credit_cash';
}

/**
 * Normaliza bandeira do cartão
 */
export function detectBrand(brandStr: string): string {
  const norm = normalizeHeader(brandStr);
  if (norm.includes('visa')) return 'visa';
  if (norm.includes('master')) return 'mastercard';
  if (norm.includes('elo')) return 'elo';
  if (norm.includes('hiper')) return 'hipercard';
  if (norm.includes('amex') || norm.includes('american')) return 'amex';
  return 'other';
}

/**
 * Parser universal para arquivos CSV / texto delimitado por vírgula ou ponto-e-vírgula
 */
export function parseStatementCsv(csvText: string): ParsedStatementRow[] {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  // Detecta delimitador (, ou ;)
  const delimiter = lines[0].includes(';') ? ';' : ',';
  const headers = lines[0].split(delimiter).map((h) => h.replace(/^["']|["']$/g, '').trim());
  const normHeaders = headers.map(normalizeHeader);

  // Mapeamento de índices de colunas
  const findIdx = (keywords: string[]) =>
    normHeaders.findIndex((h) => keywords.some((k) => h.includes(k)));

  const idxDate = findIdx(['datavenda', 'datatransacao', 'datahora', 'data']);
  const idxGross = findIdx(['valorbruto', 'vlrbruto', 'valortransacao', 'valor']);
  const idxNet = findIdx(['valorliquido', 'vlrliquido', 'liquido']);
  const idxFee = findIdx(['valortaxa', 'taxa', 'desconto', 'vlrtaxa']);
  const idxBrand = findIdx(['bandeira', 'band']);
  const idxMethod = findIdx(['modalidade', 'produto', 'tipotransacao', 'tipo', 'formapagamento']);
  const idxInstallments = findIdx(['parcelas', 'parcela', 'plano', 'qtdeparcelas']);
  const idxAuth = findIdx(['autorizacao', 'codautorizacao', 'aut', 'codigoautorizacao']);
  const idxNsu = findIdx(['nsu', 'cv', 'comprovante', 'cvnsu']);
  const idxDoc = findIdx(['doc', 'documento', 'numdoc']);
  const idxCard = findIdx(['cartao', 'numcartao', 'ultimosdigitos']);
  const idxSettlementDate = findIdx(['dataprevisao', 'datapagamento', 'dataliquidacao', 'prevpagto']);
  const idxBatch = findIdx(['lote', 'numlote', 'loteliquidacao', 'resumo']);

  const rows: ParsedStatementRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const rawCols = lines[i].split(delimiter).map((c) => c.replace(/^["']|["']$/g, '').trim());
    if (rawCols.length < 2) continue;

    const gross = parseCurrency(idxGross >= 0 ? rawCols[idxGross] : 0);
    if (gross <= 0) continue; // ignora linhas sem valor

    let net = idxNet >= 0 ? parseCurrency(rawCols[idxNet]) : 0;
    let fee = idxFee >= 0 ? parseCurrency(rawCols[idxFee]) : 0;

    if (net === 0 && fee > 0) net = Number((gross - fee).toFixed(2));
    if (fee === 0 && net > 0) fee = Number((gross - net).toFixed(2));

    const installmentsStr = idxInstallments >= 0 ? rawCols[idxInstallments] : '1';
    let installmentsCount = parseInt(installmentsStr.replace(/\D/g, '')) || 1;
    let installmentNumber = 1;

    // Se vier no formato "01/03"
    if (installmentsStr.includes('/')) {
      const parts = installmentsStr.split('/');
      installmentNumber = parseInt(parts[0]) || 1;
      installmentsCount = parseInt(parts[1]) || installmentsCount;
    }

    const typeStr = idxMethod >= 0 ? rawCols[idxMethod] : '';
    const paymentMethod = detectPaymentMethod(typeStr, installmentsCount);
    const brand = detectBrand(idxBrand >= 0 ? rawCols[idxBrand] : '');
    const saleDate = parseDateString(idxDate >= 0 ? rawCols[idxDate] : '');
    const settlementDate = idxSettlementDate >= 0 ? parseDateString(rawCols[idxSettlementDate]) : undefined;

    const auth = idxAuth >= 0 ? rawCols[idxAuth].replace(/\D/g, '') : undefined;
    const nsu = idxNsu >= 0 ? rawCols[idxNsu].replace(/\D/g, '') : undefined;
    const doc = idxDoc >= 0 ? rawCols[idxDoc].replace(/\D/g, '') : undefined;
    const cardDigits = idxCard >= 0 ? rawCols[idxCard].slice(-4) : undefined;
    const batchId = idxBatch >= 0 ? rawCols[idxBatch] : undefined;

    const feePercentage = gross > 0 && fee > 0 ? Number(((fee / gross) * 100).toFixed(2)) : undefined;

    rows.push({
      saleDate,
      grossAmount: gross,
      netAmount: net,
      feeAmount: fee,
      feePercentage,
      paymentMethod,
      brand,
      installmentsCount,
      installmentNumber,
      authorizationCode: auth || undefined,
      nsu: nsu || undefined,
      docNumber: doc || undefined,
      cardLastDigits: cardDigits || undefined,
      settlementDate,
      settlementBatchId: batchId || undefined,
      status: 'approved',
    });
  }

  return rows;
}
