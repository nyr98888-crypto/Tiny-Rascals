import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Map Layout Calibrator — Tiny Rascals",
  description: "Align plots, clearings, and road waypoints to the live world maps",
};

export default function CalibrateMapLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        overflow: "auto",
        background: "#12141a",
        color: "#f3ead7",
        fontFamily: "Segoe UI, system-ui, sans-serif",
      }}
    >
      {children}
    </div>
  );
}
