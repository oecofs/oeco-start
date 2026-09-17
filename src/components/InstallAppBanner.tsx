"use client";

import { useState, useEffect } from "react";

export default function InstallAppBanner() {
  const [showBanner, setShowBanner] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSModal, setShowIOSModal] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    // 1. Verifica se já está rodando como PWA instalado (standalone)
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true;

    if (isStandalone) {
      return; // Já é um app instalado, não mostra o banner
    }

    // 2. Verifica se o usuário dispensou nas últimas 48 horas
    const dismissedAt = localStorage.getItem("oeco_install_dismissed");
    if (dismissedAt) {
      const hoursDiff = (Date.now() - parseInt(dismissedAt, 10)) / (1000 * 60 * 60);
      if (hoursDiff < 48) {
        return;
      }
    }

    // 3. Detecta se é dispositivo móvel (iOS ou Android)
    const userAgent = window.navigator.userAgent || "";
    const isIPhoneOrIPad = /iPhone|iPad|iPod/i.test(userAgent);
    const isAndroid = /Android/i.test(userAgent);

    if (!isIPhoneOrIPad && !isAndroid) {
      return; // Dispositivos desktop comuns não exibem o banner mobile
    }

    setIsIOS(isIPhoneOrIPad);

    // 4. Captura o evento nativo de instalação no Android/Chrome
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowBanner(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    // No iOS, se for mobile e não for standalone, exibe o banner após 3 segundos
    if (isIPhoneOrIPad) {
      const timer = setTimeout(() => setShowBanner(true), 2500);
      return () => clearTimeout(timer);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  const handleDismiss = () => {
    setShowBanner(false);
    setShowIOSModal(false);
    localStorage.setItem("oeco_install_dismissed", Date.now().toString());
  };

  const handleInstallClick = async () => {
    if (isIOS) {
      setShowIOSModal(true);
      return;
    }

    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        setShowBanner(false);
      }
      setDeferredPrompt(null);
    } else {
      // Fallback caso o prompt não esteja disponível
      alert("Para instalar, abra o menu do seu navegador e selecione 'Instalar aplicativo' ou 'Adicionar à tela inicial'.");
    }
  };

  if (!showBanner) return null;

  return (
    <>
      {/* Banner Flutuante Inferior no Celular */}
      <aside
        aria-label="Instalação do Aplicativo"
        className="fixed bottom-20 left-4 right-4 z-50 md:hidden animate-in fade-in slide-in-from-bottom-5 duration-300"
      >
        <div className="bg-slate-900/95 text-white p-4 rounded-2xl shadow-2xl backdrop-blur-md border border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-primary flex items-center justify-center text-xl flex-shrink-0 shadow-inner">
              📱
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h2 className="text-xs font-bold text-white tracking-wide">Instalar App Oeco Start</h2>
                <span className="text-[9px] font-extrabold uppercase bg-emerald-500/20 text-emerald-400 px-1.5 py-0.2 rounded border border-emerald-500/30">
                  App
                </span>
              </div>
              <p className="text-[11px] text-slate-300 truncate mt-0.5">
                Acesse em tela cheia direto da sua tela de início
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={handleInstallClick}
              className="bg-primary hover:bg-primary-hover text-white text-xs font-bold px-3 py-2 rounded-xl shadow-xs transition-colors"
            >
              Instalar
            </button>
            <button
              onClick={handleDismiss}
              className="text-slate-400 hover:text-white text-sm font-bold p-1.5"
              title="Dispensar por 48 horas"
            >
              ✕
            </button>
          </div>
        </div>
      </aside>

      {/* Modal Educativo com Instruções para iOS (iPhone / iPad) */}
      {showIOSModal && (
        <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-xs flex items-end sm:items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl text-gray-800 space-y-4 text-center">
            <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center text-2xl mx-auto shadow-inner">
              📲
            </div>

            <div>
              <h3 className="text-lg font-bold text-gray-900">Como instalar no seu iPhone</h3>
              <p className="text-xs text-gray-500 mt-1">
                Siga os 2 passos rápidos para ter o Oeco Start em tela cheia como um app nativo:
              </p>
            </div>

            <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 text-left space-y-3 text-xs">
              <div className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center font-bold text-xs flex-shrink-0">
                  1
                </span>
                <p className="text-gray-700 leading-tight pt-0.5">
                  Toque no botão de <strong>Compartilhar</strong> na barra inferior do Safari (o ícone de um quadrado com a seta para cima{" "}
                  <span className="inline-block border border-gray-300 rounded px-1 text-[11px] bg-white font-mono">
                    ⎋
                  </span>
                  ).
                </p>
              </div>

              <div className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center font-bold text-xs flex-shrink-0">
                  2
                </span>
                <p className="text-gray-700 leading-tight pt-0.5">
                  Role a lista e selecione a opção <strong>"Adicionar à Tela de Início"</strong> (com ícone de soma{" "}
                  <span className="inline-block border border-gray-300 rounded px-1 text-[11px] bg-white font-mono">
                    ➕
                  </span>
                  ).
                </p>
              </div>

              <div className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-xs flex-shrink-0">
                  ✓
                </span>
                <p className="text-gray-700 leading-tight pt-0.5">
                  Toque em <strong>"Adicionar"</strong> no canto superior direito. Pronto! O app aparecerá na sua tela de aplicativos.
                </p>
              </div>
            </div>

            <button
              onClick={handleDismiss}
              className="w-full py-3 bg-gray-900 hover:bg-black text-white text-xs font-bold rounded-xl shadow-xs transition-colors"
            >
              Entendi, obrigado!
            </button>
          </div>
        </div>
      )}
    </>
  );
}
