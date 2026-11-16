"use client";

import type { ResolvedBridge } from "@/data/worldMap";

function BridgeSvg({
  bridge,
  originX,
  originY,
}: {
  bridge: ResolvedBridge;
  originX: number;
  originY: number;
}) {
  const uid = bridge.id;
  const midY = bridge.width * 0.55;
  const h = bridge.width * 1.15;
  return (
    <svg
      className="bridge"
      style={{
        left: bridge.x1 - originX,
        top: bridge.y1 - originY - midY,
        width: bridge.length,
        height: h,
        transform: `rotate(${bridge.angle}rad)`,
        transformOrigin: `0 ${midY}px`,
      }}
      viewBox={`0 0 220 ${90}`}
      preserveAspectRatio="none"
      aria-hidden
    >
      <defs>
        <linearGradient id={`${uid}-wood`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#d2b07a" />
          <stop offset="40%" stopColor="#a67c48" />
          <stop offset="100%" stopColor="#6d4b2c" />
        </linearGradient>
        <linearGradient id={`${uid}-rope`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#e8d4b0" />
          <stop offset="50%" stopColor="#b89568" />
          <stop offset="100%" stopColor="#e8d4b0" />
        </linearGradient>
        <filter id={`${uid}-shadow`} x="-15%" y="-30%" width="130%" height="170%">
          <feDropShadow dx="0" dy="4" stdDeviation="3" floodColor="#1a140c" floodOpacity="0.4" />
        </filter>
      </defs>

      <path
        d="M 8 52 Q 110 62 212 52"
        fill="none"
        stroke="#2a1c10"
        strokeWidth="28"
        strokeLinecap="round"
        opacity="0.22"
      />
      <path
        d="M 8 48 Q 110 58 212 48"
        fill="none"
        stroke={`url(#${uid}-wood)`}
        strokeWidth="22"
        strokeLinecap="round"
        filter={`url(#${uid}-shadow)`}
      />

      {Array.from({ length: 12 }, (_, i) => {
        const t = (i + 0.5) / 12;
        const x = 8 + t * 204;
        const y = 48 + Math.sin(t * Math.PI) * 10;
        return (
          <rect
            key={i}
            x={x - 7}
            y={y - 11}
            width={14}
            height={22}
            rx={2}
            fill={i % 2 === 0 ? "#b8905a" : "#8f6a3c"}
            stroke="#5a3f24"
            strokeWidth={1}
            opacity={0.92}
            transform={`rotate(${8 - t * 16} ${x} ${y})`}
          />
        );
      })}

      <path
        d="M 14 34 Q 110 44 206 34"
        fill="none"
        stroke={`url(#${uid}-rope)`}
        strokeWidth="3.2"
        strokeLinecap="round"
      />
      <path
        d="M 14 62 Q 110 72 206 62"
        fill="none"
        stroke={`url(#${uid}-rope)`}
        strokeWidth="3.2"
        strokeLinecap="round"
      />
      <path
        d="M 14 34 Q 110 44 206 34"
        fill="none"
        stroke="#7a5834"
        strokeWidth="1.1"
        strokeDasharray="5 4"
        strokeLinecap="round"
        opacity={0.75}
      />
      <path
        d="M 14 62 Q 110 72 206 62"
        fill="none"
        stroke="#7a5834"
        strokeWidth="1.1"
        strokeDasharray="5 4"
        strokeLinecap="round"
        opacity={0.75}
      />

      {[18, 202].map((x) => (
        <g key={x}>
          <line x1={x} y1={30} x2={x} y2={66} stroke="#6d4b2c" strokeWidth="4" strokeLinecap="round" />
          <circle cx={x} cy={30} r="4.5" fill="#c4a06a" stroke="#5a3f24" strokeWidth="1.2" />
          <circle cx={x} cy={66} r="4.5" fill="#c4a06a" stroke="#5a3f24" strokeWidth="1.2" />
        </g>
      ))}
    </svg>
  );
}

export function WoodenBridges({
  bridges = [],
  originX = 0,
  originY = 0,
}: {
  bridges?: ResolvedBridge[];
  originX?: number;
  originY?: number;
}) {
  return (
    <>
      {bridges.map((b) => (
        <BridgeSvg key={b.id} bridge={b} originX={originX} originY={originY} />
      ))}
    </>
  );
}
