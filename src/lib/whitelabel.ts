export function getWhiteLabelConfig() {
  return {
    appName: process.env.NEXT_PUBLIC_APP_NAME || "Oeco Start",
    logoUrl: process.env.NEXT_PUBLIC_LOGO_URL || "",
    primaryColor: process.env.NEXT_PUBLIC_PRIMARY_COLOR || "#1e3a5f",
    webhookUrl: process.env.NEXT_PUBLIC_WEBHOOK_URL || "",
  };
}

// Converte uma cor HEX para uma versão mais escura (para hover/estados)
export function darkenColor(hex: string, percent: number = 20): string {
  const num = parseInt(hex.replace("#", ""), 16);
  const r = Math.max(0, ((num >> 16) & 0xff) - Math.round(255 * (percent / 100)));
  const g = Math.max(0, ((num >> 8) & 0xff) - Math.round(255 * (percent / 100)));
  const b = Math.max(0, (num & 0xff) - Math.round(255 * (percent / 100)));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

// Converte uma cor HEX para uma versão mais clara
export function lightenColor(hex: string, percent: number = 20): string {
  const num = parseInt(hex.replace("#", ""), 16);
  const r = Math.min(255, ((num >> 16) & 0xff) + Math.round(255 * (percent / 100)));
  const g = Math.min(255, ((num >> 8) & 0xff) + Math.round(255 * (percent / 100)));
  const b = Math.min(255, (num & 0xff) + Math.round(255 * (percent / 100)));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}
