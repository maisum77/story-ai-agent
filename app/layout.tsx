import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Story Forge | AI Novel Scene Generator",
  description: "Generate premium short story scenes with controlled free usage.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
