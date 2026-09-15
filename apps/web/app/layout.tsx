import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Folio360 - Intelligent Document Management",
  description: "Folio360 — Intelligent Document Management. Scan, organize, review, and securely archive your documents.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
