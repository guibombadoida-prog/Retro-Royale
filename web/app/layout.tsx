import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Retro Royale — Arena 3D",
  description: "Arena 3D com batalhas de cartas, campeões e efeitos explosivos. Treine contra a IA ou dispute uma sala online.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="antialiased">{children}</body>
    </html>
  );
}
