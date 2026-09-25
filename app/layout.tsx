import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Poker Night Table",
  description: "Run your poker night from buy-ins to the final payout.",
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
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
