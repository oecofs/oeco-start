import type { Metadata } from "next";
import { getWhiteLabelConfig } from "@/lib/whitelabel";
import "./globals.css";

const wl = getWhiteLabelConfig();

export const metadata: Metadata = {
  title: wl.appName,
  description: "Conciliação bancária e gestão de recebíveis",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body className="antialiased">{children}</body>
    </html>
  );
}
