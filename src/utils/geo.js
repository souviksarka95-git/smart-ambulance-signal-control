// Geospatial utility functions for calculating distances and route alignment

function toRad(deg) {
    return (deg * Math.PI) / 180;
}

function normalizeCoord(c) {
    if (Array.isArray(c)) return { lng: c[0], lat: c[1] };
    return { lng: c.lng, lat: c.lat };
}

// Haversine formula: returns distance between two points in meters
function haversine(c1, c2) {
    const p1 = normalizeCoord(c1);
    const p2 = normalizeCoord(c2);

    const R = 6371000; // Earth's mean radius in meters
    const dLat = toRad(p2.lat - p1.lat);
    const dLng = toRad(p2.lng - p1.lng);
    const lat1 = toRad(p1.lat);
    const lat2 = toRad(p2.lat);

    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// Distance from point to line segment in meters
function distanceToSegment(p, a, b) {
    const dAB = haversine(a, b);
    if (dAB === 0) return haversine(p, a);

    const dAP = haversine(a, p);
    const dBP = haversine(b, p);

    // If triangle projection falls outside segment endpoints
    if (dAP * dAP >= dAB * dAB + dBP * dBP) return dBP;
    if (dBP * dBP >= dAB * dAB + dAP * dAP) return dAP;

    // Semi-perimeter Heron's formula for altitude of triangle
    const s = (dAB + dAP + dBP) / 2;
    const area = Math.sqrt(Math.max(0, s * (s - dAB) * (s - dAP) * (s - dBP)));
    return (2 * area) / dAB;
}

// Minimum distance from a position [lng, lat] to a route polyline [[lng, lat], ...]
function distanceToRoute(pos, route) {
    if (!route || route.length === 0) return Infinity;
    if (route.length === 1) return haversine(pos, route[0]);

    let min = Infinity;
    for (let i = 0; i < route.length - 1; i++) {
        const d = distanceToSegment(pos, route[i], route[i + 1]);
        if (d < min) min = d;
    }
    return min;
}

// Index of closest vertex on the route
function nearestIndex(pos, route) {
    if (!route || route.length === 0) return -1;
    let minIdx = 0;
    let minDist = Infinity;
    for (let i = 0; i < route.length; i++) {
        const d = haversine(pos, route[i]);
        if (d < minDist) {
            minDist = d;
            minIdx = i;
        }
    }
    return minIdx;
}

module.exports = {
    haversine,
    distanceToRoute,
    nearestIndex
};
