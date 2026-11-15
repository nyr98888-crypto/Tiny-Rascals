import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tiny Rascals",
  description: "Cozy 2.5D tabletop diorama & idle life-sim",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
