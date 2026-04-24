import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "flash-trade-bot — guided setup",
  description:
    "Run automated Solana perps trading on your own wallet. ~30 min to set up. You keep your keys.",
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-bg text-fg">{children}</body>
    </html>
  );
}
