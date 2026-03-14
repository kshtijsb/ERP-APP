import { getAreaOfPolygon } from 'geolib';

/**
 * Validates if a polygon is self-intersecting.
 * Uses a simple line segment intersection algorithm.
 */
export const isSelfIntersecting = (coordinates: { latitude: number; longitude: number }[]) => {
  if (coordinates.length < 4) return false;

  const n = coordinates.length;
  // Check each segment against every other non-adjacent segment
  for (let i = 0; i < n; i++) {
    const p1 = coordinates[i];
    const p2 = coordinates[(i + 1) % n];

    for (let j = i + 2; j < n; j++) {
      // Skip adjacent segments
      if (i === 0 && j === n - 1) continue;

      const p3 = coordinates[j];
      const p4 = coordinates[(j + 1) % n];

      if (doSegmentsIntersect(p1, p2, p3, p4)) {
        return true;
      }
    }
  }
  return false;
};

/**
 * Calculates the area of a polygon in acres.
 */
export const calculateAreaInAcres = (coordinates: { latitude: number; longitude: number }[]) => {
  if (coordinates.length < 3) return 0;
  
  // getAreaOfPolygon returns area in square meters
  const areaSqMeters = getAreaOfPolygon(coordinates);
  
  // 1 acre = 4046.86 square meters
  const areaAcres = areaSqMeters / 4046.86;
  
  return parseFloat(areaAcres.toFixed(2));
};

/**
 * Helper to check if two line segments intersect.
 */
const doSegmentsIntersect = (
  p1: { latitude: number; longitude: number },
  p2: { latitude: number; longitude: number },
  p3: { latitude: number; longitude: number },
  p4: { latitude: number; longitude: number }
) => {
  const ccw = (
    a: { latitude: number; longitude: number },
    b: { latitude: number; longitude: number },
    c: { latitude: number; longitude: number }
  ) => {
    return (c.longitude - a.longitude) * (b.latitude - a.latitude) > (b.longitude - a.longitude) * (c.latitude - a.latitude);
  };

  return (
    ccw(p1, p3, p4) !== ccw(p2, p3, p4) && ccw(p1, p2, p3) !== ccw(p1, p2, p4)
  );
};
