import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Paddock Bubbles",
  description: "2D online multiplayer bubble game",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="sk">
      <body className="overflow-hidden">
        {children}
      </body>
    </html>
  );
} 