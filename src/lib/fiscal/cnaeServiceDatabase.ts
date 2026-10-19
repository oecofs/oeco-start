export interface ServiceCnaeDefinition {
  cnae: string;
  description: string;
  keywords: string[];
  lc116: string;
  category: string;
  default_iss: number;
}

// Catálogo Amplo de Serviços para Simples Nacional e MEI
// Mapeamento automático com a Lista da Lei Complementar nº 116/2003
export const COMMON_SERVICE_CNAES: ServiceCnaeDefinition[] = [
  // --- TECNOLOGIA DA INFORMAÇÃO & SOFTWARE ---
  {
    cnae: "6201-5/01",
    description: "Desenvolvimento de programas de computador sob encomenda (Software/Apps)",
    keywords: ["software", "programacao", "ti", "desenvolvimento", "app", "sistema", "web", "programador", "fullstack"],
    lc116: "01.01",
    category: "Tecnologia",
    default_iss: 2.0,
  },
  {
    cnae: "6202-3/00",
    description: "Desenvolvimento e licenciamento de programas de computador customizáveis (SaaS)",
    keywords: ["software", "saas", "licenciamento", "plataforma", "ti", "sistemas"],
    lc116: "01.05",
    category: "Tecnologia",
    default_iss: 2.0,
  },
  {
    cnae: "6209-1/00",
    description: "Suporte técnico, manutenção e outros serviços em tecnologia da informação",
    keywords: ["suporte", "manutencao ti", "ti", "redes", "computador", "tecnico", "servidor", "helpdesk"],
    lc116: "01.07",
    category: "Tecnologia",
    default_iss: 2.0,
  },
  {
    cnae: "6311-9/00",
    description: "Tratamento de dados, provedores de serviços de aplicação e hospedagem na internet",
    keywords: ["hospedagem", "servidor", "cloud", "banco de dados", "web", "dados"],
    lc116: "01.03",
    category: "Tecnologia",
    default_iss: 2.0,
  },
  {
    cnae: "6319-4/00",
    description: "Portais, provedores de conteúdo e outros serviços de informação na internet",
    keywords: ["portal", "conteudo", "blog", "site", "informacao", "midia digital"],
    lc116: "01.08",
    category: "Tecnologia",
    default_iss: 2.0,
  },

  // --- GESTÃO, CONSULTORIA, FINANCEIRO & CONTÁBIL ---
  {
    cnae: "7020-4/00",
    description: "Atividades de consultoria em gestão empresarial e financeira",
    keywords: ["consultoria", "gestao", "financeiro", "estrategia", "bpo", "assessoria", "negocios", "mentor"],
    lc116: "17.01",
    category: "Consultoria & Gestão",
    default_iss: 2.0,
  },
  {
    cnae: "6920-6/01",
    description: "Atividades de contabilidade, auditoria e assessoria fiscal",
    keywords: ["contabilidade", "contador", "fiscal", "bpo", "auditoria", "folha", "balanco", "tributario"],
    lc116: "17.19",
    category: "Consultoria & Gestão",
    default_iss: 2.0,
  },
  {
    cnae: "8211-3/00",
    description: "Serviços combinados de escritório e apoio administrativo (BPO Administrativo)",
    keywords: ["administrativo", "apoio", "digitacao", "secretariado", "operacional", "escritorio", "bpo"],
    lc116: "17.02",
    category: "Consultoria & Gestão",
    default_iss: 2.0,
  },
  {
    cnae: "7490-1/04",
    description: "Atividades de intermediação e agenciamento de serviços e negócios em geral",
    keywords: ["intermediacao", "corretagem", "agenciamento", "comissao", "representacao", "parceria"],
    lc116: "10.05",
    category: "Consultoria & Gestão",
    default_iss: 2.0,
  },

  // --- ENGENHARIA, ARQUITETURA & PROJETOS TÉCNICOS ---
  {
    cnae: "7112-0/00",
    description: "Serviços de engenharia e consultoria técnica",
    keywords: ["engenharia", "engenheiro", "obra", "laudo", "vistoria", "projeto", "calculo", "art", "pericia"],
    lc116: "07.03",
    category: "Engenharia & Arquitetura",
    default_iss: 3.0,
  },
  {
    cnae: "7111-1/00",
    description: "Serviços de arquitetura, urbanismo e design de interiores",
    keywords: ["arquitetura", "arquiteto", "interiores", "planta", "decoracao", "design", "urbanismo"],
    lc116: "07.03",
    category: "Engenharia & Arquitetura",
    default_iss: 2.5,
  },
  {
    cnae: "7119-7/01",
    description: "Serviços de cartografia, topografia e geodésia",
    keywords: ["topografia", "topografo", "terreno", "agrimensura", "demarcacao", "georreferenciamento"],
    lc116: "07.03",
    category: "Engenharia & Arquitetura",
    default_iss: 2.5,
  },

  // --- CONSTRUÇÃO, OBRAS, REFORMAS & REPAROS (MUITO COMUM EM MEI/SIMPLES) ---
  {
    cnae: "4120-4/00",
    description: "Construção de edifícios, reformas gerais e empreitada civil",
    keywords: ["construcao", "obra", "reforma", "alvenaria", "empreitada", "pedreiro", "predio", "casa"],
    lc116: "07.02",
    category: "Construção & Reformas",
    default_iss: 3.0,
  },
  {
    cnae: "4321-5/00",
    description: "Instalação e manutenção elétrica residencial, comercial e predial",
    keywords: ["eletrica", "eletricista", "instalacao", "fiacao", "manutencao eletrica", "quadro", "padrao"],
    lc116: "07.05",
    category: "Construção & Reformas",
    default_iss: 2.0,
  },
  {
    cnae: "4322-3/01",
    description: "Instalações hidráulicas, sanitárias e de gás (Encanador)",
    keywords: ["hidraulica", "encanador", "cano", "esgoto", "vazamento", "gas", "torneira", "tubulacao"],
    lc116: "07.05",
    category: "Construção & Reformas",
    default_iss: 2.0,
  },
  {
    cnae: "4330-4/04",
    description: "Serviços de pintura de edifícios em geral",
    keywords: ["pintura", "pintor", "parede", "verniz", "fachada", "acabamento", "tintas"],
    lc116: "07.06",
    category: "Construção & Reformas",
    default_iss: 2.0,
  },
  {
    cnae: "4330-4/03",
    description: "Obras de acabamento em gesso e estuque (Gesseiro / Drywall)",
    keywords: ["gesso", "gesseiro", "drywall", "forro", "moldura", "sanca", "divisorias"],
    lc116: "07.06",
    category: "Construção & Reformas",
    default_iss: 2.0,
  },
  {
    cnae: "4330-4/02",
    description: "Instalação de portas, janelas, tetos, divisórias e armários embutidos (Marcenaria / Carpintaria)",
    keywords: ["marcenaria", "marceneiro", "porta", "janela", "armario", "madeira", "carpinteiro"],
    lc116: "07.06",
    category: "Construção & Reformas",
    default_iss: 2.0,
  },
  {
    cnae: "4330-4/05",
    description: "Aplicação de revestimentos e de resinas em interiores e exteriores (Azulejista / Piso)",
    keywords: ["piso", "azulejista", "porcelanato", "ceramica", "revestimento", "rejunte"],
    lc116: "07.06",
    category: "Construção & Reformas",
    default_iss: 2.0,
  },
  {
    cnae: "4322-3/02",
    description: "Instalação e manutenção de sistemas centrais de ar condicionado, ventilação e refrigeração",
    keywords: ["ar condicionado", "climatizacao", "refrigeracao", "split", "ventilacao", "manutencao ar"],
    lc116: "14.01",
    category: "Construção & Reformas",
    default_iss: 2.0,
  },
  {
    cnae: "2542-0/00",
    description: "Serviços de serralheria e fabricação de esquadrias metálicas",
    keywords: ["serralheria", "serralheiro", "portao", "grade", "ferro", "metal", "solda"],
    lc116: "14.05",
    category: "Construção & Reformas",
    default_iss: 2.0,
  },

  // --- MARKETING, PUBLICIDADE, DESIGN & COMUNICAÇÃO ---
  {
    cnae: "7319-0/02",
    description: "Publicidade, propaganda, promoção de vendas e marketing digital",
    keywords: ["marketing", "publicidade", "propaganda", "social media", "anuncio", "trafego", "campanha", "leads"],
    lc116: "17.06",
    category: "Marketing & Comunicação",
    default_iss: 2.0,
  },
  {
    cnae: "7410-2/02",
    description: "Design de interiores, design gráfico e criação visual",
    keywords: ["design", "designer", "grafico", "logo", "identidade visual", "layout", "banner", "criacao"],
    lc116: "17.06",
    category: "Marketing & Comunicação",
    default_iss: 2.0,
  },
  {
    cnae: "7420-0/01",
    description: "Atividades de produção de fotografias, filmagens e edição (Fotógrafo / Videomaker)",
    keywords: ["fotografia", "fotografo", "video", "videomaker", "filmagem", "edicao de video", "ensaio"],
    lc116: "13.03",
    category: "Marketing & Comunicação",
    default_iss: 2.0,
  },
  {
    cnae: "5912-0/99",
    description: "Atividades de pós-produção cinematográfica, de vídeos e de programas de televisão (Edição)",
    keywords: ["edicao", "pos producao", "video", "audiovisual", "animacao", "motion"],
    lc116: "13.01",
    category: "Marketing & Comunicação",
    default_iss: 2.0,
  },
  {
    cnae: "7490-1/01",
    description: "Serviços de tradução, interpretação e similares",
    keywords: ["traducao", "tradutor", "interprete", "ingles", "espanhol", "versao"],
    lc116: "17.17",
    category: "Marketing & Comunicação",
    default_iss: 2.0,
  },

  // --- EDUCAÇÃO, CURSOS, TREINAMENTO & DESENVOLVIMENTO ---
  {
    cnae: "8599-6/04",
    description: "Treinamento em desenvolvimento profissional e gerencial (Cursos, Workshops e Mentorias)",
    keywords: ["treinamento", "curso", "mentoria", "workshop", "palestra", "ensino", "aula", "capacitacao"],
    lc116: "08.02",
    category: "Educação & Treinamento",
    default_iss: 2.0,
  },
  {
    cnae: "8599-6/03",
    description: "Treinamento em informática e computação",
    keywords: ["curso de informatica", "aula de programacao", "treinamento ti", "computador"],
    lc116: "08.02",
    category: "Educação & Treinamento",
    default_iss: 2.0,
  },
  {
    cnae: "8593-7/00",
    description: "Ensino de idiomas (Aulas de inglês, espanhol e outras línguas)",
    keywords: ["idiomas", "ingles", "espanhol", "professor", "aulas de idiomas", "linguas"],
    lc116: "08.01",
    category: "Educação & Treinamento",
    default_iss: 2.0,
  },
  {
    cnae: "8592-9/01",
    description: "Ensino de dança, música e artes",
    keywords: ["danca", "musica", "violao", "piano", "canto", "teatro", "artes"],
    lc116: "08.02",
    category: "Educação & Treinamento",
    default_iss: 2.0,
  },
  {
    cnae: "8599-6/99",
    description: "Outras atividades de ensino não especificadas anteriormente (Aulas particulares e reforço escolar)",
    keywords: ["reforco escolar", "aula particular", "professor", "ensino", "pedagogia"],
    lc116: "08.02",
    category: "Educação & Treinamento",
    default_iss: 2.0,
  },

  // --- BELEZA, ESTÉTICA & BEM-ESTAR ---
  {
    cnae: "9602-5/01",
    description: "Cabeleireiros, barbearia, manicure e pedicure",
    keywords: ["salao", "cabelo", "barbeiro", "barbearia", "manicure", "pedicure", "unhas", "corte"],
    lc116: "06.01",
    category: "Beleza & Estética",
    default_iss: 2.0,
  },
  {
    cnae: "9602-5/02",
    description: "Atividades de estética e outros serviços de cuidados com a beleza (Esteticista)",
    keywords: ["estetica", "esteticista", "limpeza de pele", "massagem", "depilacao", "sobrancelha", "cilios"],
    lc116: "06.01",
    category: "Beleza & Estética",
    default_iss: 2.0,
  },
  {
    cnae: "9609-2/06",
    description: "Serviços de tatuagem e colocação de piercing",
    keywords: ["tatuagem", "tatuador", "piercing", "body piercing", "tattoo"],
    lc116: "06.02",
    category: "Beleza & Estética",
    default_iss: 2.0,
  },

  // --- SAÚDE & BEM-ESTAR ---
  {
    cnae: "8650-0/04",
    description: "Atividades de fisioterapia e terapia ocupacional",
    keywords: ["fisioterapia", "fisioterapeuta", "terapia", "reabilitacao", "postura", "pilates"],
    lc116: "04.08",
    category: "Saúde",
    default_iss: 2.0,
  },
  {
    cnae: "8650-0/03",
    description: "Atividades de psicologia e psicanálise",
    keywords: ["psicologia", "psicologo", "terapia", "saude mental", "consulta psicologica"],
    lc116: "04.16",
    category: "Saúde",
    default_iss: 2.0,
  },
  {
    cnae: "8650-0/02",
    description: "Atividades de fonoaudiologia",
    keywords: ["fonoaudiologia", "fonoaudiologo", "fala", "voz", "audicao"],
    lc116: "04.09",
    category: "Saúde",
    default_iss: 2.0,
  },
  {
    cnae: "8650-0/01",
    description: "Atividades de enfermagem e home care",
    keywords: ["enfermagem", "enfermeiro", "cuidador", "home care", "curativo", "idoso"],
    lc116: "04.06",
    category: "Saúde",
    default_iss: 2.0,
  },
  {
    cnae: "8650-0/06",
    description: "Atividades de nutrição e dietética",
    keywords: ["nutricao", "nutricionista", "dieta", "alimentacao", "consulta nutricional"],
    lc116: "04.14",
    category: "Saúde",
    default_iss: 2.0,
  },
  {
    cnae: "9313-1/00",
    description: "Atividades de condicionamento físico (Personal Trainer, Academias e Treino)",
    keywords: ["personal trainer", "treino", "academia", "educador fisico", "fitness", "ginastica"],
    lc116: "12.13",
    category: "Saúde",
    default_iss: 2.0,
  },

  // --- SERVIÇOS JURÍDICOS ---
  {
    cnae: "6911-7/01",
    description: "Serviços advocatícios e assessoria jurídica",
    keywords: ["advocacia", "advogado", "juridico", "direito", "honorarios", "processo", "audiencia"],
    lc116: "17.14",
    category: "Jurídico",
    default_iss: 2.0,
  },

  // --- EVENTOS, FESTAS & ENTRETENIMENTO ---
  {
    cnae: "8230-0/01",
    description: "Serviços de organização de feiras, congressos, exposições e festas (Promotor de Eventos)",
    keywords: ["eventos", "festa", "casamento", "cerimonial", "aniversario", "congresso", "produtor"],
    lc116: "17.10",
    category: "Eventos & Lazer",
    default_iss: 2.0,
  },
  {
    cnae: "5620-1/02",
    description: "Serviços de alimentação para eventos e recepções (Buffet)",
    keywords: ["buffet", "comida", "festa", "garcom", "coquetel", "catering"],
    lc116: "17.11",
    category: "Eventos & Lazer",
    default_iss: 2.0,
  },
  {
    cnae: "9001-9/06",
    description: "Atividades de sonorização, iluminação e efeitos especiais para festas e eventos (DJ e Som)",
    keywords: ["dj", "som", "iluminacao", "sonorizacao", "equipamento de som", "festa", "musica"],
    lc116: "12.01",
    category: "Eventos & Lazer",
    default_iss: 2.0,
  },

  // --- LIMPEZA, PORTARIA, JARDINAGEM & CONSERVAÇÃO ---
  {
    cnae: "8121-4/00",
    description: "Limpeza em prédios e em domicílios (Faxina, Limpeza residencial e pós-obra)",
    keywords: ["limpeza", "faxina", "diarista", "faxineira", "pos obra", "conservacao"],
    lc116: "07.10",
    category: "Limpeza & Conservação",
    default_iss: 2.0,
  },
  {
    cnae: "8130-3/00",
    description: "Atividades de jardinagem, paisagismo e manutenção de áreas verdes",
    keywords: ["jardinagem", "jardineiro", "grama", "poda", "paisagismo", "plantas"],
    lc116: "07.11",
    category: "Limpeza & Conservação",
    default_iss: 2.0,
  },
  {
    cnae: "8122-2/00",
    description: "Imunização e controle de pragas urbanas (Dedetização e Desratização)",
    keywords: ["dedetizacao", "dedetizador", "pragas", "barata", "cupim", "ratos", "fumigacao"],
    lc116: "07.13",
    category: "Limpeza & Conservação",
    default_iss: 2.0,
  },
  {
    cnae: "8111-7/00",
    description: "Serviços combinados para apoio a edifícios (Zeladoria e Portaria)",
    keywords: ["zeladoria", "zelador", "portaria", "porteiro", "condominio", "predio"],
    lc116: "17.05",
    category: "Limpeza & Conservação",
    default_iss: 2.0,
  },

  // --- TRANSPORTE, LOGÍSTICA & ENTREGAS ---
  {
    cnae: "5320-2/02",
    description: "Serviços de entrega rápida, motoboy e encomendas locais",
    keywords: ["motoboy", "entrega", "delivery", "malote", "encomenda", "courier"],
    lc116: "26.01",
    category: "Transporte & Entregas",
    default_iss: 2.0,
  },
  {
    cnae: "4930-2/01",
    description: "Transporte rodoviário de carga municipal e mudanças",
    keywords: ["mudanca", "frete", "transporte de carga", "carreto", "caminhao", "entrega"],
    lc116: "16.01",
    category: "Transporte & Entregas",
    default_iss: 2.0,
  },
  {
    cnae: "5229-0/02",
    description: "Serviços de reboque de veículos (Guincho)",
    keywords: ["guincho", "reboque", "socorro", "auto socorro", "guincheiro"],
    lc116: "14.02",
    category: "Transporte & Entregas",
    default_iss: 2.0,
  },

  // --- OFICINA, MECÂNICA, FUNILARIA & LAVA-RÁPIDO ---
  {
    cnae: "4520-0/01",
    description: "Serviços de manutenção e reparação mecânica de veículos automotores (Mecânico)",
    keywords: ["mecanico", "oficina", "carro", "motor", "freio", "suspensao", "revisao"],
    lc116: "14.01",
    category: "Automotivo & Mecânica",
    default_iss: 2.0,
  },
  {
    cnae: "4520-0/02",
    description: "Serviços de lanternagem ou funilaria e pintura de veículos automotores",
    keywords: ["funilaria", "funileiro", "pintura automotiva", "martelinho de ouro", "lataria"],
    lc116: "14.01",
    category: "Automotivo & Mecânica",
    default_iss: 2.0,
  },
  {
    cnae: "4520-0/05",
    description: "Serviços de lavagem, lubrificação e polimento de veículos automotores (Lava-rápido / Estética Automotiva)",
    keywords: ["lava rapido", "lavagem", "polimento", "estetica automotiva", "higienizacao", "lavacar"],
    lc116: "14.01",
    category: "Automotivo & Mecânica",
    default_iss: 2.0,
  },
  {
    cnae: "4520-0/06",
    description: "Serviços de borracharia para veículos automotores",
    keywords: ["borracharia", "borracheiro", "pneu", "alinhamento", "balanceamento", "camara de ar"],
    lc116: "14.01",
    category: "Automotivo & Mecânica",
    default_iss: 2.0,
  },

  // --- REPAROS DE ELETRODOMÉSTICOS & EQUIPAMENTOS ---
  {
    cnae: "9521-5/00",
    description: "Reparação e manutenção de equipamentos eletroeletrônicos de uso pessoal e doméstico (Conserto de Celular / TV)",
    keywords: ["conserto celular", "assistencia tecnica", "tv", "celular", "placa", "tela", "eletronico"],
    lc116: "14.01",
    category: "Reparos & Manutenção",
    default_iss: 2.0,
  },
  {
    cnae: "9529-1/02",
    description: "Chaveiros e cópia de chaves",
    keywords: ["chaveiro", "chave", "fechadura", "abertura", "cadeado", "copia de chave"],
    lc116: "14.02",
    category: "Reparos & Manutenção",
    default_iss: 2.0,
  },

  // --- SERVIÇOS VETERINÁRIOS & PETS ---
  {
    cnae: "7500-1/00",
    description: "Atividades veterinárias (Clínica e Consultas)",
    keywords: ["veterinario", "veterinaria", "clinica pet", "consulta animal", "vacina"],
    lc116: "05.01",
    category: "Veterinária & Pets",
    default_iss: 2.0,
  },
  {
    cnae: "9609-2/08",
    description: "Alojamento, higiene e embelezamento de animais domésticos (Banho e Tosa / Hotel Pet)",
    keywords: ["banho e tosa", "pet shop", "hotelzinho pet", "adestramento", "cuidador de caes"],
    lc116: "05.08",
    category: "Veterinária & Pets",
    default_iss: 2.0,
  },
];

// Helper de Busca Flexível por Palavras-chave ou CNAE
export function searchCnaeServices(term: string): ServiceCnaeDefinition[] {
  if (!term || !term.trim()) return COMMON_SERVICE_CNAES;
  const normalized = term
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

  return COMMON_SERVICE_CNAES.filter((item) => {
    const textTarget = `${item.cnae} ${item.description} ${item.keywords.join(" ")} ${item.category}`
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

    return textTarget.includes(normalized);
  });
}
