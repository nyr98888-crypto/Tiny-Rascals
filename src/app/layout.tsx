import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tiny Rascals — Sky Island",
  description: "2.5D sky island with a blue dragon companion",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
