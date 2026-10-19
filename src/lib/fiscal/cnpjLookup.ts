export interface CnpjLookupResult {
  razao_social: string;
  nome_fantasia?: string;
  cnpj: string;
  cep: string;
  logradouro: string;
  numero: string;
  complemento?: string;
  bairro: string;
  municipio: string;
  uf: string;
  email?: string;
  telefone?: string;
  situacao_cadastral?: string;
}

export interface CepLookupResult {
  cep: string;
  logradouro: string;
  complemento?: string;
  bairro: string;
  localidade: string;
  uf: string;
}

export const BRAZIL_UFS = [
  { uf: "AC", name: "Acre" },
  { uf: "AL", name: "Alagoas" },
  { uf: "AP", name: "Amapá" },
  { uf: "AM", name: "Amazonas" },
  { uf: "BA", name: "Bahia" },
  { uf: "CE", name: "Ceará" },
  { uf: "DF", name: "Distrito Federal" },
  { uf: "ES", name: "Espírito Santo" },
  { uf: "GO", name: "Goiás" },
  { uf: "MA", name: "Maranhão" },
  { uf: "MT", name: "Mato Grosso" },
  { uf: "MS", name: "Mato Grosso do Sul" },
  { uf: "MG", name: "Minas Gerais" },
  { uf: "PA", name: "Pará" },
  { uf: "PB", name: "Paraíba" },
  { uf: "PR", name: "Paraná" },
  { uf: "PE", name: "Pernambuco" },
  { uf: "PI", name: "Piauí" },
  { uf: "RJ", name: "Rio de Janeiro" },
  { uf: "RN", name: "Rio Grande do Norte" },
  { uf: "RS", name: "Rio Grande do Sul" },
  { uf: "RO", name: "Rondônia" },
  { uf: "RR", name: "Roraima" },
  { uf: "SC", name: "Santa Catarina" },
  { uf: "SP", name: "São Paulo" },
  { uf: "SE", name: "Sergipe" },
  { uf: "TO", name: "Tocantins" },
];

// Consulta CNPJ na Receita Federal via BrasilAPI gratuita
export async function lookupCnpj(cnpjRaw: string): Promise<CnpjLookupResult> {
  const cleanCnpj = cnpjRaw.replace(/\D/g, "");
  if (cleanCnpj.length !== 14) {
    throw new Error("CNPJ deve conter 14 dígitos.");
  }

  const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cleanCnpj}`);
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error("CNPJ não encontrado na base da Receita Federal.");
    }
    throw new Error("Não foi possível consultar os dados do CNPJ no momento.");
  }

  const data = await response.json();

  const tipo = (data.descricao_tipo_de_logradouro || data.tipo_logradouro || "").trim();
  const nomeLogradouro = (data.logradouro || "").trim();
  let fullLogradouro = nomeLogradouro;

  if (tipo && !nomeLogradouro.toLowerCase().startsWith(tipo.toLowerCase())) {
    fullLogradouro = `${tipo} ${nomeLogradouro}`.trim();
  }

  return {
    razao_social: data.razao_social || "",
    nome_fantasia: data.nome_fantasia || "",
    cnpj: cleanCnpj,
    cep: data.cep || "",
    logradouro: fullLogradouro || "",
    numero: data.numero || "",
    complemento: data.complemento || "",
    bairro: data.bairro || "",
    municipio: data.municipio || "",
    uf: data.uf || "SP",
    email: data.email || "",
    telefone: data.ddd_telefone_1 || "",
    situacao_cadastral: data.descricao_situacao_cadastral || "",
  };
}

// Consulta CEP via ViaCEP gratuita
export async function lookupCep(cepRaw: string): Promise<CepLookupResult> {
  const cleanCep = cepRaw.replace(/\D/g, "");
  if (cleanCep.length !== 8) {
    throw new Error("CEP deve conter 8 dígitos.");
  }

  const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
  if (!response.ok) {
    throw new Error("Erro ao consultar CEP.");
  }

  const data = await response.json();
  if (data.erro) {
    throw new Error("CEP não encontrado.");
  }

  return {
    cep: cleanCep,
    logradouro: data.logradouro || "",
    complemento: data.complemento || "",
    bairro: data.bairro || "",
    localidade: data.localidade || "",
    uf: data.uf || "",
  };
}
