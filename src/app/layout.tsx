import type { Metadata } from "next";
import "./globals.css";
import { getWhiteLabelConfig, darkenColor, lightenColor } from "@/lib/whitelabel";

const wl = getWhiteLabelConfig();

export const metadata: Metadata = {
  title: wl.appName,
  description: "Conciliação financeira simplificada",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Injeta as variáveis CSS do white-label dinamicamente
  const styleInjection = `
    :root {
      --color-primary: ${wl.primaryColor};
      --color-primary-dark: ${darkenColor(wl.primaryColor, 20)};
      --color-primary-light: ${lightenColor(wl.primaryColor, 20)};
    }
  `;

  return (
    <html lang="pt-BR">
      <head>
        <style dangerouslySetInnerHTML={{ __html: styleInjection }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
