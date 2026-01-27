
/**
 * FAI Geometry Utilities
 * Implements WGS84 geodesic calculations and FAI Control Zone definitions.
 * Based on FAI Sporting Code Section 7F (2024).
 */

export const FaiGeometry = {
    EARTH_RADIUS_KM: 6371.0,
    useEllipsoid: false, // Default to Sphere (Cat 2)

    setMethod: (method) => {
        FaiGeometry.useEllipsoid = (method === 'wgs84');
        console.log(`[FaiGeometry] Calculation method set to: ${FaiGeometry.useEllipsoid ? 'WGS84 Ellipsoid' : 'FAI Sphere'}`);
    },

    /**
     * Converts degrees to radians
     */
    toRad: (deg) => deg * Math.PI / 180,

    /**
     * Converts radians to degrees
     */
    toDeg: (rad) => rad * 180 / Math.PI,

    /**
     * Calculates the destination point given start point, distance, and bearing.
     */
    computeDestinationPoint: (point, distanceKm, bearingDeg) => {
        if (FaiGeometry.useEllipsoid) {
            return FaiGeometry.vincentyDestination(point, distanceKm * 1000, bearingDeg);
        }

        const lon1 = FaiGeometry.toRad(point[0]);
        const lat1 = FaiGeometry.toRad(point[1]);
        const brng = FaiGeometry.toRad(bearingDeg);
        const d = distanceKm;
        const R = FaiGeometry.EARTH_RADIUS_KM;

        const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d / R) +
            Math.cos(lat1) * Math.sin(d / R) * Math.cos(brng));

        const lon2 = lon1 + Math.atan2(Math.sin(brng) * Math.sin(d / R) * Math.cos(lat1),
            Math.cos(d / R) - Math.sin(lat1) * Math.sin(lat2));

        return [FaiGeometry.toDeg(lon2), FaiGeometry.toDeg(lat2)];
    },

    /**
     * Calculates the endpoints of a Line Control Zone.
     * Reference: FAI Section 7F 6.2.2 "Line control zone"
     */
    calculateLineZone: (waypoint, distanceKm, orientationDeg, lengthKm) => {
        // 1. Calculate Centerpoint
        let dist = distanceKm;
        let bearing = orientationDeg;

        if (dist < 0) {
            dist = Math.abs(dist);
            bearing = (bearing + 180) % 360;
        }

        const center = FaiGeometry.computeDestinationPoint(waypoint, dist, bearing);
        let axisBearing = bearing;

        // 3. Cylinder Endpoints (perpendicular)
        // Endpoint 1: +90 degrees
        const end1 = FaiGeometry.computeDestinationPoint(center, lengthKm, (axisBearing + 90) % 360);

        // Endpoint 2: -90 degrees
        const end2 = FaiGeometry.computeDestinationPoint(center, lengthKm, (axisBearing - 90 + 360) % 360);

        return {
            center: center,
            end1: end1,
            end2: end2
        };
    },

    /**
     * Calculates distance between two points in km
     */
    distance: (p1, p2) => {
        if (FaiGeometry.useEllipsoid) {
            return FaiGeometry.vincentyDistance(p1, p2) / 1000.0;
        }

        const R = FaiGeometry.EARTH_RADIUS_KM;
        const dLat = FaiGeometry.toRad(p2[1] - p1[1]);
        const dLon = FaiGeometry.toRad(p2[0] - p1[0]);
        const lat1 = FaiGeometry.toRad(p1[1]);
        const lat2 = FaiGeometry.toRad(p2[1]);

        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    },

    // --- Vincenty Implementation for WGS84 (Cat 1) ---
    // Source adapted from Chris Veness's geodesy scripts (MIT License)

    vincentyDistance: (p1, p2) => {
        const a = 6378137, b = 6356752.314245, f = 1 / 298.257223563;
        const L = FaiGeometry.toRad(p2[0] - p1[0]);
        const U1 = Math.atan((1 - f) * Math.tan(FaiGeometry.toRad(p1[1])));
        const U2 = Math.atan((1 - f) * Math.tan(FaiGeometry.toRad(p2[1])));
        const sinU1 = Math.sin(U1), cosU1 = Math.cos(U1);
        const sinU2 = Math.sin(U2), cosU2 = Math.cos(U2);

        let lambda = L, lambdaP, iterLimit = 100;
        let cosSqAlpha, sinSigma, cos2SigmaM, sigma, cosSigma;

        do {
            const sinLambda = Math.sin(lambda), cosLambda = Math.cos(lambda);
            sinSigma = Math.sqrt((cosU2 * sinLambda) * (cosU2 * sinLambda) +
                (cosU1 * sinU2 - sinU1 * cosU2 * cosLambda) * (cosU1 * sinU2 - sinU1 * cosU2 * cosLambda));
            if (sinSigma === 0) return 0;  // co-incident points

            cosSigma = sinU1 * sinU2 + cosU1 * cosU2 * cosLambda;
            sigma = Math.atan2(sinSigma, cosSigma);
            const sinAlpha = cosU1 * cosU2 * sinLambda / sinSigma;
            cosSqAlpha = 1 - sinAlpha * sinAlpha;
            cos2SigmaM = cosSigma - 2 * sinU1 * sinU2 / cosSqAlpha;
            if (isNaN(cos2SigmaM)) cos2SigmaM = 0;  // equatorial line: cosSqAlpha=0
            const C = f / 16 * cosSqAlpha * (4 + f * (4 - 3 * cosSqAlpha));
            lambdaP = lambda;
            lambda = L + (1 - C) * f * sinAlpha * (sigma + C * sinSigma * (cos2SigmaM + C * cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM)));
        } while (Math.abs(lambda - lambdaP) > 1e-12 && --iterLimit > 0);

        if (iterLimit === 0) return NaN;  // formula failed to converge

        const uSq = cosSqAlpha * (a * a - b * b) / (b * b);
        const A = 1 + uSq / 16384 * (4096 + uSq * (-768 + uSq * (320 - 175 * uSq)));
        const B = uSq / 1024 * (256 + uSq * (-128 + uSq * (74 - 47 * uSq)));
        const deltaSigma = B * sinSigma * (cos2SigmaM + B / 4 * (cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM) -
            B / 6 * cos2SigmaM * (-3 + 4 * sinSigma * sinSigma) * (-3 + 4 * cos2SigmaM * cos2SigmaM)));

        return b * A * (sigma - deltaSigma);
    },

    vincentyDestination: (p1, distanceMeters, bearingDeg) => {
        const a = 6378137, b = 6356752.314245, f = 1 / 298.257223563;
        const alpha1 = FaiGeometry.toRad(bearingDeg);
        const sinAlpha1 = Math.sin(alpha1), cosAlpha1 = Math.cos(alpha1);

        const tanU1 = (1 - f) * Math.tan(FaiGeometry.toRad(p1[1]));
        const cosU1 = 1 / Math.sqrt((1 + tanU1 * tanU1)), sinU1 = tanU1 * cosU1;
        const sigma1 = Math.atan2(tanU1, cosAlpha1);
        const sinAlpha = cosU1 * sinAlpha1;
        const cosSqAlpha = 1 - sinAlpha * sinAlpha;
        const uSq = cosSqAlpha * (a * a - b * b) / (b * b);
        const A = 1 + uSq / 16384 * (4096 + uSq * (-768 + uSq * (320 - 175 * uSq)));
        const B = uSq / 1024 * (256 + uSq * (-128 + uSq * (74 - 47 * uSq)));

        let sigma = distanceMeters / (b * A), sigmaP;
        let sinSigma, cosSigma, cos2SigmaM;

        let iterLimit = 100;
        do {
            cos2SigmaM = Math.cos(2 * sigma1 + sigma);
            sinSigma = Math.sin(sigma);
            cosSigma = Math.cos(sigma);
            const deltaSigma = B * sinSigma * (cos2SigmaM + B / 4 * (cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM) -
                B / 6 * cos2SigmaM * (-3 + 4 * sinSigma * sinSigma) * (-3 + 4 * cos2SigmaM * cos2SigmaM)));
            sigmaP = sigma;
            sigma = distanceMeters / (b * A) + deltaSigma;
        } while (Math.abs(sigma - sigmaP) > 1e-12 && --iterLimit > 0);

        if (iterLimit === 0) return NaN;

        const tmp = sinU1 * sinSigma - cosU1 * cosSigma * cosAlpha1;
        const lat2 = Math.atan2(sinU1 * cosSigma + cosU1 * sinSigma * cosAlpha1,
            (1 - f) * Math.sqrt(sinAlpha * sinAlpha + tmp * tmp));
        const lambda = Math.atan2(sinSigma * sinAlpha1, cosU1 * cosSigma - sinU1 * sinSigma * cosAlpha1);
        const C = f / 16 * cosSqAlpha * (4 + f * (4 - 3 * cosSqAlpha));
        const L = lambda - (1 - C) * f * sinAlpha *
            (sigma + C * sinSigma * (cos2SigmaM + C * cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM)));
        const lon2 = FaiGeometry.toRad(p1[0]) + L;

        return [FaiGeometry.toDeg(lon2), FaiGeometry.toDeg(lat2)];
    },

    /**
     * Calculates Goal Line Geometry (Line + Semicircle behind).
     * @param {Array} center - [lon, lat]
     * @param {number} lengthKm - Length of the line (e.g. 0.4km = 400m)
     * @param {Array} prevPoint - [lon, lat] The previous turnpoint to determine orientation
     * @returns {Object} { center, end1, end2, radius: lengthKm/2, bearing: angle }
     */
    calculateGoalLine: (center, lengthKm, prevPoint) => {
        // Warning: FAI Goal line orientation is perpendicular to the INCOMING path.
        // Bearing from Prev -> Center
        const dLon = FaiGeometry.toRad(center[0] - prevPoint[0]);
        const lat1 = FaiGeometry.toRad(prevPoint[1]);
        const lat2 = FaiGeometry.toRad(center[1]);

        const y = Math.sin(dLon) * Math.cos(lat2);
        const x = Math.cos(lat1) * Math.sin(lat2) -
            Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
        const incomingBearing = (FaiGeometry.toDeg(Math.atan2(y, x)) + 360) % 360;

        // Goal line is perpendicular (90 deg)
        const end1 = FaiGeometry.computeDestinationPoint(center, lengthKm / 2, (incomingBearing + 90) % 360);
        const end2 = FaiGeometry.computeDestinationPoint(center, lengthKm / 2, (incomingBearing - 90 + 360) % 360);

        return {
            center: center,
            end1: end1,
            end2: end2,
            radius: lengthKm / 2, // The semi-circle radius behind the goal
            bearing: incomingBearing // The direction we are flying INTO goal
        };
    },

    /**
     * Optimizes the route to find the shortest path through the control zones (Touch Points).
     * Uses a simple iterative approach: for each point, move it towards the optimal line 
     * between its neighbors, constrained by the cylinder radius.
     * 
     * @param {Array} zones - List of zones. Each zone: { type: 'cylinder'|'line', center: [lon, lat], radius: km }
     * @returns {Array} List of optimized [lon, lat] points
     */
    optimizeRoute: (zones) => {
        // Initial path: centers of all zones
        let path = zones.map(z => z.center);

        // Iteration config
        const MAX_ITER = 50;
        const MOVE_THRESHOLD = 0.0001; // ~10 meters

        for (let iter = 0; iter < MAX_ITER; iter++) {
            let maxChange = 0;

            // Start from index 1 to N-2 (Launch and Goal/LastTP usually fixed or optimized differently)
            // Actually, Launch (index 0) is a fixed point usually. 
            // Turnpoints (1..N-1) are cylinders/lines.
            // If the last point is Goal Line, it's also a target.

            for (let i = 1; i < path.length - 1; i++) {
                const prev = path[i - 1];
                const next = path[i + 1];
                const zone = zones[i];
                const current = path[i];

                if (zone.type === 'cylinder') {
                    // Logic: Find intersection of line Prev->Next with Cylinder.
                    // The point closest to the line connecting prev and next, ON the cylinder edge.
                    // Vector math (simplified for lat/lon as cartesian for small steps, or bearing math)

                    // Simple heuristic: Move current point to the edge of the cylinder 
                    // that minimizes dist(prev, p) + dist(p, next).
                    // This creates the "corner" on the inside of the turn.

                    // 1. Calculate bearing Prev -> Next
                    // 2. The optimal point on cylinder is at the "bisector" angle? 
                    // Actually, simpler: The optimal point lies on the cylinder boundary 
                    // intersecting the bisector of the angle Prev-Center-Next.

                    // Let's use the bearing from Center -> (Prev+Next)/2 ? No.
                    // Correct standard algo: The point is on the radius vector that bisects the angle <Prev-Center-Next>.
                    // But we want the "inner" side (shortest path).
                    // It is the point on the circle that intersects the bisector of the UN-REFLEX angle.

                    // Let's compute bearings
                    const bPrev = FaiGeometry.bearing(zone.center, prev);
                    const bNext = FaiGeometry.bearing(zone.center, next);

                    // Bisector
                    let bisector = (bPrev + bNext) / 2;
                    // Check if we need to flip 180 (to be on the "inside" of the turn)
                    // We want the point P on cylinder such that dist(Prev, P) + dist(P, Next) is minimized.

                    const p1 = FaiGeometry.computeDestinationPoint(zone.center, zone.radius, bisector);
                    const p2 = FaiGeometry.computeDestinationPoint(zone.center, zone.radius, (bisector + 180) % 360);

                    const d1 = FaiGeometry.distance(prev, p1) + FaiGeometry.distance(p1, next);
                    const d2 = FaiGeometry.distance(prev, p2) + FaiGeometry.distance(p2, next);

                    const bestP = (d1 < d2) ? p1 : p2;

                    // Update if significant change
                    const move = FaiGeometry.distance(current, bestP);
                    if (move > 0) {
                        path[i] = bestP;
                        maxChange = Math.max(maxChange, move);
                    }
                }
            }

            if (maxChange < MOVE_THRESHOLD) break;
        }

        return path;
    },

    /**
     * Helper: Bearing from A to B
     */
    bearing: (p1, p2) => {
        const dLon = FaiGeometry.toRad(p2[0] - p1[0]);
        const lat1 = FaiGeometry.toRad(p1[1]);
        const lat2 = FaiGeometry.toRad(p2[1]);
        const y = Math.sin(dLon) * Math.cos(lat2);
        const x = Math.cos(lat1) * Math.sin(lat2) -
            Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
        return (FaiGeometry.toDeg(Math.atan2(y, x)) + 360) % 360;
    }
};
