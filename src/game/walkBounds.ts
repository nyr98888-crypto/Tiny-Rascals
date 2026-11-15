/** Valid decorate / walk plateau on the island texture (normalized 0..1). */
export const WALK_BOUNDS = {
  minX: 0.1,
  maxX: 0.9,
  minY: 0.08,
  maxY: 0.88,
} as const;

export function clampToWalkBounds(x: number, y: number) {
  return {
    x: Math.min(WALK_BOUNDS.maxX, Math.max(WALK_BOUNDS.minX, x)),
    y: Math.min(WALK_BOUNDS.maxY, Math.max(WALK_BOUNDS.minY, y)),
  };
}
