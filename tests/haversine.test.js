const { calculateDistance } = require('../src/utils/haversine');

describe('Haversine Distance Calculator', () => {
  test('returns 0 when coordinates are identical', () => {
    const lat = 12.971598;
    const lng = 77.594562;
    expect(calculateDistance(lat, lng, lat, lng)).toBe(0);
  });

  test('calculates correct distance between two cities', () => {
    // Bangalore to Chennai is roughly 290 km
    const bangaloreLat = 12.9716;
    const bangaloreLng = 77.5946;
    const chennaiLat = 13.0827;
    const chennaiLng = 80.2707;

    const dist = calculateDistance(bangaloreLat, bangaloreLng, chennaiLat, chennaiLng);
    expect(dist).toBeGreaterThan(280);
    expect(dist).toBeLessThan(305);
  });

  test('calculates correct distance for small offsets (sub-kilometer)', () => {
    // Offset of ~0.005 degrees
    const lat1 = 12.9715;
    const lng1 = 77.5945;
    const lat2 = 12.9765;
    const lng2 = 77.5945;

    const dist = calculateDistance(lat1, lng1, lat2, lng2);
    expect(dist).toBeCloseTo(0.55, 1);
  });
});
