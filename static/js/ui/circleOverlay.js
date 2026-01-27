let radiusSourceId = "radius-circle";
let radiusLayerId = "radius-layer";

// Helper to create an organic, wobbly polygon
export function createWobblyCircle(center, radiusKm, seedOffset = 0) {
  const steps = 128;
  const coordinates = [];
  const [centerLng, centerLat] = center;

  // Randomize phase slightly based on radius/index to make layers distinct but related
  const phase1 = Math.random() * Math.PI * 2 + seedOffset;
  const phase2 = Math.random() * Math.PI * 2;

  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * 2 * Math.PI; // radians

    // Perturb radius: Base + low freq wobble + high freq detail
    // Using Math.sin to ensure it loops perfectly at 0/360
    const wobble = 1 +
      0.08 * Math.sin(3 * angle + phase1) +
      0.04 * Math.sin(7 * angle + phase2);

    const r = radiusKm * wobble;

    // Convert (r, theta) to (lat, lng) approximation
    // 1 deg lat ~= 111km
    const dLat = (r / 111.32) * Math.cos(angle);
    // 1 deg lng ~= 111km * cos(lat)
    const dLng = (r / (111.32 * Math.cos(centerLat * Math.PI / 180))) * Math.sin(angle);

    coordinates.push([centerLng + dLng, centerLat + dLat]);
  }

  // Ensure ring is closed (first point === last point) for valid GeoJSON Polygon
  if (coordinates.length > 0) {
    coordinates.push(coordinates[0]);
  }

  return turf.polygon([coordinates], { radius: radiusKm });
}

import { isCalculatorActive } from './calculator.js';

export function setupClickRadius(map) {
  map.on("click", (e) => {
    if (isCalculatorActive()) return;

    const { lng, lat } = e.lngLat;

    const features = [];
    const seed = Math.random() * 10; // Keep stack consistent for this click

    // Generate 6 concentric organic blobs
    for (let r = 6; r >= 1; r--) {
      // Pass 'r' as offset to shift the wobble slightly per layer
      const blob = createWobblyCircle([lng, lat], r, seed + (r * 0.2));
      blob.properties = { radius: r };
      features.push(blob);
    }

    const collection = turf.featureCollection(features);

    if (map.getSource(radiusSourceId)) {
      map.getSource(radiusSourceId).setData(collection);
    } else {
      map.addSource(radiusSourceId, {
        type: "geojson",
        data: collection
      });

      map.addLayer({
        id: radiusLayerId,
        type: "fill",
        source: radiusSourceId,
        paint: {
          "fill-color": [
            "interpolate",
            ["linear"],
            ["get", "radius"],
            1.0, "#f0f921", // Center - Bright Yellow
            1.5, "#fdc328",
            2.0, "#f89441", // Orange
            2.5, "#e56b5d",
            3.0, "#cc4678", // Magenta
            3.5, "#b52f8c",
            4.0, "#9a179b",
            4.5, "#7e03a8", // Purple
            5.0, "#6a00a8",
            5.5, "#5402a3",
            6.0, "#3b0f70", // Deep Purple
            6.5, "#0d0887"  // Darkest Edge
          ],
          "fill-opacity": [
            "interpolate",
            ["linear"],
            ["get", "radius"],
            1, 0.4,
            6, 0.05
          ],
          "fill-opacity-transition": { duration: 500 }
        }
      });

      // Outline for the largest blob
      map.addLayer({
        id: "radius-outline",
        type: "line",
        source: radiusSourceId,
        filter: ["==", ["get", "radius"], 6],
        paint: {
          "line-color": "#0d0887", // Match darkest edge color
          "line-width": 1.5,
          "line-opacity": 0.5
        }
      });
    }
  });
}
