
import { FaiGeometry } from '../utils/faiGeometry.js';

export class TaskLayer3d {
    constructor(map) {
        this.map = map;
        this.sourceId = 'fai-task-source';
        this.optPathId = 'fai-opt-path';

        this.initLayers();
    }

    initLayers() {
        // Source for Control Zones (Polygons/Lines)
        if (!this.map.getSource(this.sourceId)) {
            this.map.addSource(this.sourceId, {
                type: 'geojson',
                data: { type: 'FeatureCollection', features: [] }
            });

            // Fill Layer (Cylinders, Goal Wedges)
            this.map.addLayer({
                id: 'fai-zone-fill',
                type: 'fill',
                source: this.sourceId,
                paint: {
                    'fill-color': ['get', 'color'],
                    'fill-opacity': 0.2
                }
            });

            // Outline Layer
            this.map.addLayer({
                id: 'fai-zone-line',
                type: 'line',
                source: this.sourceId,
                paint: {
                    'line-color': ['get', 'color'],
                    'line-width': 2
                }
            });

            // Labels (Point Names)
            this.map.addLayer({
                id: 'fai-zone-labels',
                type: 'symbol',
                source: this.sourceId,
                layout: {
                    'text-field': ['get', 'title'],
                    'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
                    'text-size': 12,
                    'text-offset': [0, 1.5]
                },
                paint: {
                    'text-color': '#000',
                    'text-halo-color': '#fff',
                    'text-halo-width': 2
                }
            });
        }

        // Source for Optimized Path
        if (!this.map.getSource(this.optPathId)) {
            this.map.addSource(this.optPathId, {
                type: 'geojson',
                data: { type: 'FeatureCollection', features: [] }
            });

            this.map.addLayer({
                id: 'fai-path-line',
                type: 'line',
                source: this.optPathId,
                layout: {
                    'line-join': 'round',
                    'line-cap': 'round'
                },
                paint: {
                    'line-color': '#4f46e5', // Indigo
                    'line-width': 4,
                    'line-dasharray': [1, 1] // Dashed to distinguish from flown track
                }
            });
        }
    }

    update(taskPoints, optimizedPath) {
        if (!window.turf) {
            console.warn("Turf.js not loaded, cannot render task.");
            return;
        }

        const features = [];

        taskPoints.forEach((p, i) => {
            const isStart = i === 1; // Assuming index 1 is Start in standard list
            const isGoal = i === taskPoints.length - 1;
            const color = isStart ? '#ef4444' : (isGoal ? '#10b981' : '#f59e0b');

            let feature;

            if (p.type === 'cylinder') {
                // Turf circle takes radius in km
                feature = window.turf.circle(p.center, p.radius, {
                    steps: 64,
                    units: 'kilometers',
                    properties: {
                        color: color,
                        title: p.name
                    }
                });
            } else if (p.type === 'line') {
                // Render as a LineString perpendicular to course?
                // Visualizing the definition: Center + Length + Orientation
                const geom = FaiGeometry.calculateLineZone(p.center, 0, p.orientation || 0, p.lineLength);
                feature = {
                    type: 'Feature',
                    properties: { color: color, title: p.name },
                    geometry: {
                        type: 'LineString',
                        coordinates: [geom.end1, geom.end2]
                    }
                };
            }

            if (feature) features.push(feature);

            // Add center marker geometry?
            features.push({
                type: 'Feature',
                properties: { color: color, title: '' },
                geometry: {
                    type: 'Point',
                    coordinates: p.center
                }
            });
        });

        this.map.getSource(this.sourceId).setData({
            type: 'FeatureCollection',
            features: features
        });

        // Update Path
        if (optimizedPath && optimizedPath.length > 1) {
            this.map.getSource(this.optPathId).setData({
                type: 'Feature',
                geometry: {
                    type: 'LineString',
                    coordinates: optimizedPath
                }
            });
        }
    }
}
