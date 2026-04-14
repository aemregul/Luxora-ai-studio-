import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Luxora AI — Yapay Zeka İç Mimari Tasarım",
  description: "Odanızı yapay zeka ile yeniden tasarlayın. Profesyonel iç mimari tasarım, 3D görselleştirme ve sanal tur deneyimi.",
  keywords: "iç mimari, yapay zeka, tasarım, 3D, interior design, AI, Luxora",
  openGraph: {
    title: "Luxora AI — Yapay Zeka İç Mimari Tasarım",
    description: "Odanızı yapay zeka ile yeniden tasarlayın.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
