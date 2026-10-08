const { haversine } = require('./geo');

/**
 * Fallback route generator that produces an interpolated polyline between origin and destination
 */
function generateFallbackRoute(from, to, numPoints = 60) {
    const route = [];
    for (let i = 0; i <= numPoints; i++) {
        const t = i / numPoints;
        const lat = from.lat + (to.lat - from.lat) * t;
        const lng = from.lng + (to.lng - from.lng) * t;
        route.push([lng, lat]);
    }
    const distanceM = haversine(from, to);
    const durationS = Math.round(distanceM / 11.1); // ~40 km/h average
    return { route, distanceM, durationS };
}

/**
 * Gets a driving route between two points using OSRM with automatic fallback
 */
async function getRoute(origin, destination) {
    const from = { lat: Number(origin.lat), lng: Number(origin.lng) };
    const to = { lat: Number(destination.lat), lng: Number(destination.lng) };

    const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);

        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timeout);

        if (!res.ok) throw new Error(`OSRM HTTP error: ${res.status}`);
        const data = await res.json();

        if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
            const first = data.routes[0];
            return {
                route: first.geometry.coordinates, // array of [lng, lat]
                distanceM: first.distance,
                durationS: first.duration
            };
        }
    } catch {
        // Fallback gracefully on network error or timeout
    }

    return generateFallbackRoute(from, to);
}

module.exports = {
    getRoute
};
