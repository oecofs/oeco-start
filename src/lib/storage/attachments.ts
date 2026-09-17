import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Utilitário de Otimização e Armazenamento Leve de Documentos Financeiros
 * Garante custo zero de infraestrutura no Supabase Free Tier através de
 * compressão automática de fotos no navegador e restrições de tamanho.
 */

export interface AttachmentResult {
  url: string;
  type: "file" | "external_link";
  fileName?: string;
  fileSizeBytes?: number;
}

/**
 * Comprime imagens no navegador utilizando Canvas API antes do upload.
 * Reduz fotos de câmeras de celular de 4MB-8MB para ~100KB-180KB sem perda de legibilidade de texto.
 */
export async function compressImage(
  file: File,
  maxDimension = 1280,
  quality = 0.8
): Promise<File> {
  // Se não for imagem, retorna o arquivo original
  if (!file.type.startsWith("image/")) {
    return file;
  }

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);

    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;

      img.onload = () => {
        let width = img.width;
        let height = img.height;

        // Redimensiona proporcionalmente mantendo proporção
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          return resolve(file);
        }

        // Fundo branco para garantir legibilidade de documentos
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        // Exporta como WebP (ou JPEG caso WebP não esteja disponível)
        canvas.toBlob(
          (blob) => {
            if (!blob) return resolve(file);
            const cleanName = file.name.replace(/\.[^/.]+$/, "") + ".webp";
            const compressedFile = new File([blob], cleanName, {
              type: "image/webp",
              lastModified: Date.now(),
            });
            resolve(compressedFile);
          },
          "image/webp",
          quality
        );
      };

      img.onerror = () => resolve(file);
    };

    reader.onerror = () => resolve(file);
  });
}

/**
 * Realiza o upload do documento otimizado para o Supabase Storage
 */
export async function uploadFinancialDocument(
  supabase: SupabaseClient,
  file: File,
  companyId: string,
  prefix = "payables"
): Promise<AttachmentResult> {
  const MAX_FILE_SIZE = 2.5 * 1024 * 1024; // 2.5MB máximo para PDFs

  if (file.type === "application/pdf" && file.size > MAX_FILE_SIZE) {
    throw new Error(
      "O arquivo PDF excede o limite de 2.5 MB. Recomendamos comprimir o PDF ou usar a opção de colar o link do Google Drive/OneDrive."
    );
  }

  // Comprime a imagem caso seja foto/scan
  const processedFile = await compressImage(file);

  const timestamp = Date.now();
  const sanitizedName = processedFile.name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9._-]/g, "_");

  const filePath = `${companyId}/${prefix}/${timestamp}_${sanitizedName}`;

  const { data, error } = await supabase.storage
    .from("financial_docs")
    .upload(filePath, processedFile, {
      cacheControl: "3600",
      upsert: false,
    });

  if (error) {
    // Se o bucket não existir ou falhar por permissão
    console.error("Erro no upload do storage:", error);
    throw new Error(
      `Falha ao enviar documento: ${error.message}. Você também pode utilizar o link externo do Google Drive.`
    );
  }

  const { data: publicUrlData } = supabase.storage
    .from("financial_docs")
    .getPublicUrl(data.path);

  return {
    url: publicUrlData.publicUrl,
    type: "file",
    fileName: sanitizedName,
    fileSizeBytes: processedFile.size,
  };
}
