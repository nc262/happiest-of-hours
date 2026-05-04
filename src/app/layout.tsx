import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Happiest of Hours – AI Happy Hour Finder",
  description:
    "Find the best happy hour deals near you using AI. Search by preferences like beer, cocktails, food, kid-friendly, and more.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-amber-50">{children}</body>
    </html>
  );
}
