import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sprite Calibrator — Tiny Rascals",
  description: "Assign action tags to 3×3 sheet cells without touching image files",
};

export default function CalibrateLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        overflow: "auto",
        background: "#12141a",
        color: "#f3ead7",
      }}
    >
      {children}
    </div>
  );
}
