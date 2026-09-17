"use client";

import React, { useEffect, useRef, useState } from "react";

interface DocumentAttachmentViewerProps {
  url: string;
  description?: string;
  amount?: number;
}

export default function DocumentAttachmentViewer({
  url,
  description,
}: DocumentAttachmentViewerProps) {
  const isPdf =
    url.toLowerCase().includes(".pdf") ||
    url.toLowerCase().includes("application/pdf");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [numPages, setNumPages] = useState<number>(0);
  const [renderedPages, setRenderedPages] = useState<string[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isPdf || !url) {
      setLoading(false);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(false);
    setRenderedPages([]);

    // Função para renderizar o PDF usando PDF.js
    const renderPdfWithLib = async (pdfjsLib: any) => {
      try {
        const loadingTask = pdfjsLib.getDocument({
          url,
          cMapUrl: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/",
          cMapPacked: true,
        });
        const pdf = await loadingTask.promise;
        if (!isMounted) return;

        setNumPages(pdf.numPages);
        const pagesDataUrls: string[] = [];

        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
          const page = await pdf.getPage(pageNum);
          // Scale 1.5 a 2.0 garante resolução cristalina na tela e na impressão A4
          const viewport = page.getViewport({ scale: 1.6 });

          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d");
          if (!context) continue;

          canvas.width = viewport.width;
          canvas.height = viewport.height;

          const renderContext = {
            canvasContext: context,
            viewport: viewport,
          };

          await page.render(renderContext).promise;
          pagesDataUrls.push(canvas.toDataURL("image/png"));
        }

        if (isMounted) {
          setRenderedPages(pagesDataUrls);
          setLoading(false);
        }
      } catch (err) {
        console.error("Erro ao renderizar PDF com PDF.js:", err);
        if (isMounted) {
          setError(true);
          setLoading(false);
        }
      }
    };

    // Carrega o script do PDF.js dinamicamente se necessário
    if (typeof window !== "undefined") {
      const win = window as any;
      if (win.pdfjsLib) {
        renderPdfWithLib(win.pdfjsLib);
      } else {
        const existingScript = document.getElementById("pdfjs-lib-script");
        if (!existingScript) {
          const script = document.createElement("script");
          script.id = "pdfjs-lib-script";
          script.src =
            "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
          script.async = true;
          script.onload = () => {
            if (win.pdfjsLib) {
              win.pdfjsLib.GlobalWorkerOptions.workerSrc =
                "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
              renderPdfWithLib(win.pdfjsLib);
            }
          };
          script.onerror = () => {
            if (isMounted) {
              setError(true);
              setLoading(false);
            }
          };
          document.body.appendChild(script);
        } else {
          // Script já existe no DOM, aguarda carregamento
          const checkInterval = setInterval(() => {
            if (win.pdfjsLib) {
              clearInterval(checkInterval);
              renderPdfWithLib(win.pdfjsLib);
            }
          }, 100);
          setTimeout(() => clearInterval(checkInterval), 10000);
        }
      }
    }

    return () => {
      isMounted = false;
    };
  }, [url, isPdf]);

  // Se for imagem direta (PNG, JPG, etc)
  if (!isPdf) {
    return (
      <div className="w-full flex flex-col items-center justify-center p-2 bg-gray-50 rounded-xl">
        <div className="w-full flex justify-end mb-2 no-print print:hidden">
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="text-[11px] font-semibold text-primary hover:underline inline-flex items-center gap-1"
          >
            Abrir imagem original ↗
          </a>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={description || "Comprovante"}
          className="max-h-[850px] w-auto max-w-full object-contain rounded-lg shadow-xs print:shadow-none print:max-h-[800px] print:w-auto print:mx-auto print:object-contain"
        />
      </div>
    );
  }

  // Se for PDF
  return (
    <div ref={containerRef} className="w-full flex flex-col items-center">
      {/* Barra de ação visível apenas na tela */}
      <div className="w-full flex items-center justify-between py-1.5 px-3 bg-gray-100 rounded-lg mb-3 text-xs text-gray-600 no-print print:hidden">
        <span className="flex items-center gap-1.5 font-medium">
          <span>📄</span>
          <span>
            {numPages > 0
              ? `${numPages} página${numPages > 1 ? "s" : ""} renderizada${numPages > 1 ? "s" : ""}`
              : "Documento PDF"}
          </span>
        </span>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="text-primary font-semibold hover:underline flex items-center gap-1"
        >
          <span>Abrir PDF original</span>
          <span>↗</span>
        </a>
      </div>

      {loading && (
        <div className="py-12 flex flex-col items-center justify-center space-y-3 text-gray-500">
          <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-xs font-medium">Carregando visualização do documento...</p>
        </div>
      )}

      {/* Renderização em alta resolução das páginas do PDF como imagens */}
      {!loading && renderedPages.length > 0 && (
        <div className="w-full space-y-4">
          {renderedPages.map((pageSrc, pageIdx) => (
            <div
              key={pageIdx}
              className={`w-full flex flex-col items-center ${
                pageIdx > 0 ? "print:break-before-page pt-2" : ""
              } break-inside-avoid`}
            >
              {renderedPages.length > 1 && (
                <div className="w-full text-right text-[10px] text-gray-400 font-mono mb-1 no-print print:hidden">
                  Página {pageIdx + 1} de {renderedPages.length}
                </div>
              )}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={pageSrc}
                alt={`${description || "Documento"} - Página ${pageIdx + 1}`}
                className="w-full max-w-3xl border border-gray-200 rounded-lg shadow-sm print:border-none print:shadow-none print:max-h-[820px] print:w-auto print:mx-auto print:object-contain"
              />
            </div>
          ))}
        </div>
      )}

      {/* Fallback caso a renderização via Canvas falhe */}
      {error && (
        <div className="w-full">
          <iframe
            src={`${url}#toolbar=0&navpanes=0`}
            className="w-full h-[750px] border border-gray-200 rounded-xl"
            title={description || "Documento em anexo"}
          />
        </div>
      )}
    </div>
  );
}
