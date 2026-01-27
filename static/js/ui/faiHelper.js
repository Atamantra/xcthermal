const SECTOR_COLORS = ['#4ade80', '#f87171', '#60a5fa']; // Green, Red, Blue
const TO_RAD = Math.PI / 180;
const TO_DEG = 180 / Math.PI;
const R_EARTH = 6371; // Earth radius in km

/**
 * Generates the "Butterfly" FAI sectors.
 * Uses a full 360-degree polar scan to find the exact boundaries of the 28% rule.
 */
export function generateFAIOptimizationLayer(triangleCoords) {
    const turf = window.turf;
    if (!turf) return { type: 'FeatureCollection', features: [] };

    const features = [];

    if (triangleCoords.length === 2) {
        const poly = calculateSector(triangleCoords[0], triangleCoords[1]);
        if (poly) {
            styleSector(poly, SECTOR_COLORS[2]);
            features.push(poly);
        }
    } else if (triangleCoords.length === 3) {
        triangleCoords.forEach((_, i) => {
            const base1 = triangleCoords[(i + 1) % 3];
            const base2 = triangleCoords[(i + 2) % 3];
            const poly = calculateSector(base1, base2);
            if (poly) {
                styleSector(poly, SECTOR_COLORS[i]);
                features.push(poly);
            }
        });
    }

    return turf.featureCollection(features);
}

function styleSector(poly, color) {
    poly.properties = {
        fill: color,
        "fill-opacity": 0.3,
        stroke: color,
        "stroke-width": 0,
        "stroke-opacity": 0
    };
}

/**
 * MATH CORE: High-Precision Polar Sweep with Binary Search
 */
function calculateSector(base1, base2) {
    const turf = window.turf;
    const options = { units: 'kilometers' };

    const baseDist = turf.distance(base1, base2, options);
    const midPoint = turf.midpoint(base1, base2);
    const rayOrigin = midPoint.geometry.coordinates;

    const maxSearchDist = baseDist * 2.0;

    // config for "pixel perfect" smoothness
    const step = 0.05; // 0.05 deg -> 7200 rays. Very detailed.
    const coarseResolution = 50; // Initial scan to find the "valid zone"

    // Pre-convert to Radians
    const p1Rad = [base1[0] * TO_RAD, base1[1] * TO_RAD];
    const p2Rad = [base2[0] * TO_RAD, base2[1] * TO_RAD];
    const originRad = [rayOrigin[0] * TO_RAD, rayOrigin[1] * TO_RAD];

    const validSamples = [];

    for (let angle = 0; angle < 360; angle += step) {
        const range = findValidRangeHighPrecision(
            p1Rad, p2Rad, originRad,
            angle,
            baseDist, maxSearchDist, coarseResolution
        );

        if (range) {
            validSamples.push({ angle, outer: range.outer, inner: range.inner });
        }
    }

    if (validSamples.length < 3) return null;

    // Group Segments
    const segments = [];
    let currentSegment = [validSamples[0]];

    for (let i = 1; i < validSamples.length; i++) {
        const prev = validSamples[i - 1];
        const curr = validSamples[i];

        if (Math.abs(curr.angle - prev.angle) <= step * 1.5) {
            currentSegment.push(curr);
        } else {
            segments.push(currentSegment);
            currentSegment = [curr];
        }
    }
    segments.push(currentSegment);

    // Wrap-Around
    const firstSample = validSamples[0];
    const lastSample = validSamples[validSamples.length - 1];
    const isWrap = (firstSample.angle === 0) && (lastSample.angle >= 360 - step - 0.05);

    if (segments.length > 1 && isWrap) {
        const firstSeg = segments[0];
        const lastSeg = segments.pop();
        segments[0] = lastSeg.concat(firstSeg);
    }

    // MultiPolygon
    const polygonRings = segments.map(seg => {
        const outer = seg.map(s => s.outer);
        const inner = seg.map(s => s.inner);
        return [
            ...outer,
            ...inner.reverse(),
            outer[0]
        ];
    });

    return turf.multiPolygon(polygonRings.map(ring => [ring]));
}

/**
 * 2-Stage Intersection: Coarse Scan + Binary Search Refinement
 */
function findValidRangeHighPrecision(p1Rad, p2Rad, originRad, bearingDeg, baseDist, maxDist, coarseRes) {
    const bearingRad = bearingDeg * TO_RAD;

    // 1. Coarse Linear Scan identify WHERE the valid zone is
    let startCoarse = -1;
    let endCoarse = -1;
    let found = false;

    // We scan buckets.
    // Optimization: The zone is likely contiguous.
    for (let i = 0; i <= coarseRes; i++) {
        const d = 0.01 + (i / coarseRes) * maxDist;
        if (checkFAI(p1Rad, p2Rad, originRad, bearingRad, d, baseDist)) {
            if (!found) {
                startCoarse = i;
                found = true;
            }
            endCoarse = i;
        } else {
            if (found) break; // End of valid zone
        }
    }

    if (!found) return null;

    // 2. Binary Search Refinement
    // Find Exact Start (between startCoarse-1 and startCoarse)

    // Bounds for Start Search
    let minD = startCoarse > 0 ? 0.01 + ((startCoarse - 1) / coarseRes) * maxDist : 0;
    let maxD = 0.01 + (startCoarse / coarseRes) * maxDist;
    const exactStartDist = binarySearchBoundary(p1Rad, p2Rad, originRad, bearingRad, baseDist, minD, maxD, true);

    // Bounds for End Search
    minD = 0.01 + (endCoarse / coarseRes) * maxDist;
    // Check if end is at maxDist
    if (endCoarse === coarseRes) {
        // Range goes to infinity/max? Clamp to maxDist.
        maxD = maxDist;
    } else {
        maxD = 0.01 + ((endCoarse + 1) / coarseRes) * maxDist;
    }
    const exactEndDist = binarySearchBoundary(p1Rad, p2Rad, originRad, bearingRad, baseDist, minD, maxD, false);

    // Calc coords
    const innerPt = getDestination(originRad, bearingRad, exactStartDist);
    const outerPt = getDestination(originRad, bearingRad, exactEndDist);

    return { inner: innerPt, outer: outerPt };
}

/**
 * Binary Search for the 28% Boundary.
 * Finds the distance d where checkFAI flips.
 * @param {boolean} findStart - True if searching for geometric start (invalid -> valid transition)
 */
function binarySearchBoundary(p1Rad, p2Rad, origin, bearing, baseDist, low, high, findStart) {
    let l = low;
    let r = high;
    // 10 iterations = 1/1024 precision of the coarse bucket size. 
    // If bucket is 5km, precision is ~5m. 
    // 15 iterations -> ~0.1m precision.
    for (let i = 0; i < 15; i++) {
        const mid = (l + r) / 2;
        const isValid = checkFAI(p1Rad, p2Rad, origin, bearing, mid, baseDist);

        if (findStart) {
            // Looking for Invalid -> Valid transition
            if (isValid) r = mid; // Valid, so boundary is to the left
            else l = mid;      // Invalid, boundary is to the right
        } else {
            // Looking for Valid -> Invalid transition
            if (isValid) l = mid; // Valid, so boundary is to the right
            else r = mid;      // Invalid, boundary is to the left
        }
    }
    return (l + r) / 2;
}


function checkFAI(p1, p2, origin, bearing, dist, baseDist) {
    // 1. Calc Test Point
    const dr = dist / R_EARTH;
    const lat1 = origin[1];
    const lon1 = origin[0];
    const sinLat1 = Math.sin(lat1);
    const cosLat1 = Math.cos(lat1);
    const sinDr = Math.sin(dr);
    const cosDr = Math.cos(dr);

    const lat2 = Math.asin(sinLat1 * cosDr + cosLat1 * sinDr * Math.cos(bearing));
    const lon2 = lon1 + Math.atan2(Math.sin(bearing) * sinDr * cosLat1, cosDr - sinLat1 * Math.sin(lat2));
    const testPt = [lon2, lat2];

    // 2. Check Rule
    const d1 = getDistRad(p1, testPt);
    const d2 = getDistRad(p2, testPt);
    const total = baseDist + d1 + d2;
    const minLeg = Math.min(baseDist, d1, d2);

    return minLeg >= 0.28 * total;
}

function getDestination(origin, bearing, dist) {
    const dr = dist / R_EARTH;
    const lat1 = origin[1];
    const lon1 = origin[0];
    const sinLat1 = Math.sin(lat1);
    const cosLat1 = Math.cos(lat1);
    const sinDr = Math.sin(dr);
    const cosDr = Math.cos(dr);

    const lat2 = Math.asin(sinLat1 * cosDr + cosLat1 * sinDr * Math.cos(bearing));
    const lon2 = lon1 + Math.atan2(Math.sin(bearing) * sinDr * cosLat1, cosDr - sinLat1 * Math.sin(lat2));

    return [lon2 * TO_DEG, lat2 * TO_DEG];
}

function getDistRad(p1, p2) {
    const dLat = p2[1] - p1[1];
    const dLon = p2[0] - p1[0];
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(p1[1]) * Math.cos(p2[1]) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R_EARTH * c;
}
