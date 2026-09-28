# 📱 Regras Mandatórias de Design e Arquitetura para Modais (Mobile-First)

Este documento estabelece as **regras obrigatórias** para a criação e manutenção de qualquer janela modal, gaveta (*drawer/slide-over*) ou diálogo no **Oeco Start**. Todo modal criado ou modificado no sistema **DEVE** seguir rigorosamente estas diretrizes para garantir que nunca quebre em smartphones (Android / iOS).

---

## 🛑 1. Os 5 Mandamentos dos Modais Mobile-First

### Regra 1: Arquitetura Tripartite Obrigatória (Header / Body / Footer)
Todo modal deve ser dividido em 3 blocos com `flex flex-col`:
1. **Header (shrink-0):** Título e botão de fechar (✕). Sempre fixo no topo, nunca rola junto com o formulário.
2. **Body (flex-1 overflow-y-auto overscroll-contain):** O único elemento com rolagem vertical. Todo o conteúdo/inputs vivem aqui.
3. **Footer (shrink-0):** Botões de ação (Cancelar, Salvar, Confirmar). Sempre visíveis e fixos na base do modal, garantindo que o usuário nunca precise rolar até o fim para salvar.

### Regra 2: Limite de Altura Dinâmico com `dvh` (`max-h-[90dvh]`)
* **NUNCA** use altura ilimitada ou `h-screen` puro.
* Sempre limite o card do modal com: `max-h-[90dvh] sm:max-h-[85vh]` ou `max-h-[calc(100dvh-2rem)]`.
* O uso de `dvh` (*dynamic viewport height*) é obrigatório para evitar que a barra de endereços do Safari (iOS) ou Chrome (Android) esconda os botões do rodapé.

### Regra 3: Posicionamento Responsivo (Bottom Sheet no Mobile / Centralizado no Desktop)
* **Mobile (<640px):** `items-end p-0` com `rounded-t-2xl` e `w-full` (comportamento de folha deslizante / *bottom sheet*).
* **Desktop (≥640px):** `sm:items-center sm:p-4` com `sm:rounded-2xl` e `sm:max-w-lg` (ou `sm:max-w-xl`, etc.).

### Regra 4: Prevenção de Auto-Zoom no iOS (`text-base sm:text-sm`)
* Em todos os inputs, selects e textareas dentro de modais, use no mínimo `text-base` no mobile e `sm:text-sm` no desktop (ex: `text-base sm:text-sm px-3 py-2.5 sm:py-2`).
* Isso impede o Safari do iOS de aplicar zoom forçado na tela ao tocar em um campo de formulário.

### Regra 5: Botões Amigáveis ao Toque (*Touch Targets* ≥ 44px)
* No mobile, os botões de ação do footer devem ter largura total (`w-full` ou `flex-1`) e altura mínima de toque (`py-3 sm:py-2` ou `min-h-[44px]`).
* Botões de fechar (✕) devem ter área de toque expandida com `p-2`.

---

## 🧱 2. Estrutura Padrão (Template JSX)

Ao criar um novo modal, utilize o componente padronizado `@/components/ui/Modal` ou a estrutura JSX abaixo:

```tsx
<div 
  className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-hidden animate-in fade-in duration-150"
  onClick={onClose}
>
  <div 
    className="bg-white w-full max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl border border-gray-150 flex flex-col max-h-[90dvh] sm:max-h-[85vh] overflow-hidden animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200"
    onClick={(e) => e.stopPropagation()}
  >
    {/* 1. HEADER (FIXO) */}
    <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-white shrink-0">
      <div className="flex items-center gap-2">
        <span className="text-lg">📄</span>
        <h3 className="text-base font-bold text-gray-800">Título do Modal</h3>
      </div>
      <button 
        type="button" 
        onClick={onClose}
        className="p-2 text-gray-400 hover:text-gray-600 rounded-lg transition-colors cursor-pointer"
        aria-label="Fechar"
      >
        ✕
      </button>
    </div>

    {/* 2. BODY (ROLÁVEL) */}
    <div className="p-5 overflow-y-auto space-y-4 flex-1 overscroll-contain">
      <div>
        <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
          Campo de Entrada
        </label>
        <input 
          type="text" 
          className="w-full text-base sm:text-sm px-3.5 py-2.5 sm:py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
        />
      </div>
    </div>

    {/* 3. FOOTER (FIXO NA BASE) */}
    <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-2.5 px-5 py-3.5 border-t border-gray-100 bg-gray-50/90 shrink-0">
      <button 
        type="button" 
        onClick={onClose}
        className="w-full sm:w-auto px-4 py-2.5 text-xs font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
      >
        Cancelar
      </button>
      <button 
        type="submit" 
        className="w-full sm:w-auto px-5 py-2.5 text-xs font-bold text-white bg-primary rounded-lg shadow-sm hover:opacity-90 transition-opacity"
      >
        Salvar Alterações
      </button>
    </div>
  </div>
</div>
```

---

## 🔍 Checklist de Validação Antes de Entregar um Modal

- [ ] O modal fecha ao clicar no backdrop (fundo escuro)?
- [ ] O modal divide Header, Body e Footer com `shrink-0` e `flex-1 overflow-y-auto`?
- [ ] O rodapé permanece visível e acessível mesmo quando o formulário é longo?
- [ ] O card utiliza `max-h-[90dvh]` ou similar com unidades dinâmicas?
- [ ] Os inputs usam `text-base sm:text-sm` para evitar zoom indesejado no iPhone?
- [ ] O `z-index` do overlay é suficiente (`z-50` ou superior) para sobrepor a barra de navegação inferior mobile?
- [ ] O modal se adapta suavemente tanto a telas de 360px de largura quanto a monitores 4K?
