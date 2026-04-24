import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/react";
import "./globals.css";

export const metadata: Metadata = {
  title: "flash-trade-bot — guided setup",
  description:
    "Run automated Solana perps trading on your own wallet. ~30 min to set up. You keep your keys.",
  robots: { index: true, follow: true },
  openGraph: {
    title: "flash-trade-bot",
    description:
      "Guided setup for self-hosted Solana perps automation. You keep the keys.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-bg text-fg">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
