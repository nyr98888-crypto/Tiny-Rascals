/** 2.5D rustic plank bridges with rope railings — ends tuck under island grass. */

function BridgeSvg({ className }: { className: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 220 90"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden
    >
      <defs>
        <linearGradient id="woodDeck" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#d2b07a" />
          <stop offset="40%" stopColor="#a67c48" />
          <stop offset="100%" stopColor="#6d4b2c" />
        </linearGradient>
        <linearGradient id="ropeGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#e8d4b0" />
          <stop offset="50%" stopColor="#b89568" />
          <stop offset="100%" stopColor="#e8d4b0" />
        </linearGradient>
        <filter id="bridgeShadow" x="-15%" y="-30%" width="130%" height="170%">
          <feDropShadow dx="0" dy="4" stdDeviation="3" floodColor="#1a140c" floodOpacity="0.4" />
        </filter>
      </defs>

      {/* Soft under shadow */}
      <path
        d="M 8 52 Q 110 62 212 52"
        fill="none"
        stroke="#2a1c10"
        strokeWidth="28"
        strokeLinecap="round"
        opacity="0.22"
      />

      {/* Deck bed */}
      <path
        d="M 8 48 Q 110 58 212 48"
        fill="none"
        stroke="url(#woodDeck)"
        strokeWidth="22"
        strokeLinecap="round"
        filter="url(#bridgeShadow)"
      />

      {/* Plank seams */}
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

      {/* Rope rails */}
      <path
        d="M 14 34 Q 110 44 206 34"
        fill="none"
        stroke="url(#ropeGrad)"
        strokeWidth="3.2"
        strokeLinecap="round"
      />
      <path
        d="M 14 62 Q 110 72 206 62"
        fill="none"
        stroke="url(#ropeGrad)"
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

      {/* End posts */}
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

/**
 * Bridges sit under island z-index; ends overlap side dirt-path exits
 * so grass rims visually tuck over the joins.
 */
export function WoodenBridges() {
  return (
    <>
      <BridgeSvg className="bridge bridge-left" />
      <BridgeSvg className="bridge bridge-right" />
    </>
  );
}
