import type { Metadata, Viewport } from "next";
import { getWhiteLabelConfig } from "@/lib/whitelabel";
import "./globals.css";

const wl = getWhiteLabelConfig();

export const metadata: Metadata = {
  title: wl.appName,
  description: "Conciliação bancária e gestão de recebíveis",
  manifest: "/manifest.json",
  icons: {
    icon: "/icon-512.png",
    apple: "/icon-512.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: wl.appName,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#1e40af",
};

import { CompanyProvider } from "@/contexts/CompanyContext";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body className="antialiased">
        <CompanyProvider>{children}</CompanyProvider>
      </body>
    </html>
  );
}
