import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Use-Case Studio",
  description: "From raw idea to a defensible build / refine / park decision.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
