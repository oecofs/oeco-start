/**
 * Oeco Start — Serviço de Integração com a API do Spedy (docs.spedy.com.br)
 * Emissão e Gestão de Notas Fiscais de Serviços Eletrônicas (NFS-e)
 */

export interface SpedyReceiverAddress {
  street: string;
  number: string;
  complement?: string;
  district: string;
  postalCode: string;
  city: {
    name: string;
    state: string;
    ibgeCode?: string;
  };
}

export interface SpedyReceiver {
  name: string;
  federalTaxNumber: string; // CPF ou CNPJ (apenas dígitos)
  email?: string;
  phone?: string;
  municipalTaxNumber?: string;
  address: SpedyReceiverAddress;
}

export interface SpedyNfsePayload {
  integrationId: string; // UUID interno da Oeco
  effectiveDate: string; // ISO 8601 (ex: "2026-10-19T10:00:00Z")
  description: string; // Discriminação dos serviços
  federalServiceCode: string; // Item da LC 116/03 (ex: "17.01")
  cnaeCode?: string; // Código CNAE (ex: "6201501")
  cityServiceCode?: string; // Código municipal (se prefeitura exigir)
  serviceLocationCityCode?: string; // IBGE da cidade onde o serviço foi prestado
  receiver: SpedyReceiver;
  total: {
    invoiceAmount: number; // Valor bruto em R$
    issRate: number; // Alíquota do ISS (ex: 2.0 ou 0 para MEI)
    issWithheld?: boolean; // Se o ISS foi retido na fonte pelo tomador
    issAmount?: number; // Valor calculado do ISS
    deductionsAmount?: number;
    discountAmount?: number;
  };
}

export interface SpedyEmitResponse {
  id?: string;
  integrationId?: string;
  status: "processing" | "authorized" | "rejected" | "cancelled" | "error";
  number?: string;
  series?: string;
  verificationCode?: string;
  protocol?: string;
  danfseUrl?: string;
  xmlUrl?: string;
  messages?: Array<{ code?: string; message: string }>;
  raw?: any;
}

/**
 * Retorna as credenciais ativas do Spedy (Sandbox ou Produção)
 */
export function getSpedyConfig(customApiKey?: string, customEnvironment?: string) {
  const apiKey = customApiKey || process.env.SPEDY_API_KEY || "";
  const environment = customEnvironment || process.env.SPEDY_ENVIRONMENT || "sandbox";
  
  // Define URL base conforme o ambiente selecionado (produção vs sandbox)
  let apiUrl = process.env.SPEDY_API_URL;
  if (!apiUrl || customEnvironment) {
    apiUrl =
      environment === "production"
        ? "https://api.spedy.com.br/v1"
        : "https://sandbox-api.spedy.com.br/v1";
  }

  return { apiKey, apiUrl, environment };
}

/**
 * Transmite uma NFS-e para a API do Spedy
 */
export async function transmitNfseToSpedy(
  payload: SpedyNfsePayload,
  customApiKey?: string,
  customEnvironment?: string
): Promise<SpedyEmitResponse> {
  const { apiKey, apiUrl } = getSpedyConfig(customApiKey, customEnvironment);

  if (!apiKey) {
    throw new Error("Chave de API do Spedy (SPEDY_API_KEY) não configurada no servidor.");
  }

  try {
    const res = await fetch(`${apiUrl}/service-invoices`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": apiKey,
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const errMsg =
        data?.message ||
        data?.error ||
        (Array.isArray(data?.messages) ? data.messages.map((m: any) => m.message).join("; ") : null) ||
        `Erro ${res.status} ao conectar com Spedy.`;
      
      return {
        status: "rejected",
        messages: [{ message: errMsg }],
        raw: data,
      };
    }

    return {
      id: data.id || data._id || `spedy-${Date.now()}`,
      integrationId: payload.integrationId,
      status: (data.status as any) || "processing",
      number: data.number || data.invoiceNumber || undefined,
      series: data.series || "1",
      verificationCode: data.verificationCode || undefined,
      protocol: data.protocol || undefined,
      danfseUrl: data.danfseUrl || data.pdfUrl || undefined,
      xmlUrl: data.xmlUrl || undefined,
      messages: data.messages || [],
      raw: data,
    };
  } catch (error: any) {
    return {
      status: "rejected",
      messages: [{ message: error.message || "Falha de rede ao contatar a API do Spedy." }],
    };
  }
}

/**
 * Consulta o status atualizado de uma NFS-e na Spedy
 */
export async function checkNfseStatusOnSpedy(
  spedyId: string,
  customApiKey?: string
): Promise<SpedyEmitResponse> {
  const { apiKey, apiUrl } = getSpedyConfig(customApiKey);

  if (!apiKey) {
    throw new Error("Chave de API do Spedy não configurada.");
  }

  try {
    const res = await fetch(`${apiUrl}/service-invoices/${spedyId}`, {
      method: "GET",
      headers: {
        "X-Api-Key": apiKey,
      },
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      return {
        status: "error",
        messages: [{ message: data?.message || "Erro ao consultar status da NFS-e." }],
        raw: data,
      };
    }

    return {
      id: data.id || spedyId,
      status: data.status || "processing",
      number: data.number || data.invoiceNumber,
      series: data.series,
      verificationCode: data.verificationCode,
      danfseUrl: data.danfseUrl || data.pdfUrl,
      xmlUrl: data.xmlUrl,
      messages: data.messages || [],
      raw: data,
    };
  } catch (error: any) {
    return {
      status: "error",
      messages: [{ message: error.message || "Erro de rede ao consultar status." }],
    };
  }
}

/**
 * Cancela uma NFS-e autorizada via Spedy
 */
export async function cancelNfseOnSpedy(
  spedyId: string,
  reason: string,
  customApiKey?: string
): Promise<{ success: boolean; message: string; raw?: any }> {
  const { apiKey, apiUrl } = getSpedyConfig(customApiKey);

  if (!apiKey) {
    throw new Error("Chave de API do Spedy não configurada.");
  }

  try {
    const res = await fetch(`${apiUrl}/service-invoices/${spedyId}/cancel`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": apiKey,
      },
      body: JSON.stringify({ reason }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      return {
        success: false,
        message: data?.message || "Falha ao solicitar cancelamento da NFS-e.",
        raw: data,
      };
    }

    return {
      success: true,
      message: "Solicitação de cancelamento enviada com sucesso.",
      raw: data,
    };
  } catch (error: any) {
    return {
      success: false,
      message: error.message || "Erro de conexão ao cancelar NFS-e.",
    };
  }
}

/**
 * Envia o certificado digital A1 (.pfx / .p12) e senha para a Spedy
 */
export async function uploadCertificateToSpedy(
  companySpedyId: string,
  formData: FormData,
  customApiKey?: string
): Promise<{ success: boolean; expiryDate?: string; message: string; raw?: any }> {
  const { apiKey, apiUrl } = getSpedyConfig(customApiKey);

  if (!apiKey) {
    throw new Error("Chave de API do Spedy não configurada.");
  }

  try {
    const res = await fetch(`${apiUrl}/companies/${companySpedyId}/certificates`, {
      method: "POST",
      headers: {
        "X-Api-Key": apiKey,
      },
      body: formData,
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      return {
        success: false,
        message: data?.message || data?.error || "Falha ao validar ou vincular certificado digital na Spedy.",
        raw: data,
      };
    }

    // Calcula validade aproximada de 1 ano caso a API não retorne a data explícita
    const oneYearFromNow = new Date();
    oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);

    return {
      success: true,
      expiryDate: data.expiresAt || data.validUntil || data.expirationDate || oneYearFromNow.toISOString(),
      message: "Certificado digital A1 validado e cadastrado com sucesso!",
      raw: data,
    };
  } catch (error: any) {
    return {
      success: false,
      message: error.message || "Erro de conexão ao enviar certificado digital.",
    };
  }
}
