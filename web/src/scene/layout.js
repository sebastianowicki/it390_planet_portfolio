// Ring layout, ported from the original Portfolio Galaxy. Pure functions, tested without a browser.
export const ringCapacity = (ring) => [4, 5, 5, 6, 8, 10][ring] ?? 10 + 2 * (ring - 5);

// A planet's index is its place in /api/planets (the order of PLANETS).
export function slotFor(index) {
  let ring = 0;
  while (index >= ringCapacity(ring)) {
    index -= ringCapacity(ring);
    ring += 1;
  }
  return { ring, slot: index };
}

export const ringRadius = (ring) => 20 + 14 * ring;
export const ringSpeed = (ring) => 0.05 / Math.sqrt(ringRadius(ring) / 20);
// Each ring leans a little, alternating up and down, so the orbits don't sit flat.
export const ringTilt = (ring) => (ring % 2 ? 1 : -1) * (0.03 + ring * 0.012);
export const baseAngle = (ring, slot) => (Math.PI * 2 * slot) / ringCapacity(ring) + 0.7 * ring;

export function positionFor(ring, angle) {
  const R = ringRadius(ring);
  return { x: Math.cos(angle) * R, y: Math.sin(angle) * R * ringTilt(ring), z: Math.sin(angle) * R };
}
