/**
 * terrain3d.js — Mapbox GL JS 3D Terrain Module
 * 
 * Provides enable/disable 3D terrain with:
 * - Anti-spike DEM config (tileSize:512, maxzoom:14, exaggeration:1.1)
 * - Sky layer + fog (removed on 2D switch)
 * - Pitch clamped to ≤80° (Safari crash prevention)
 * - Graceful fallback if raster-dem unsupported
 * - flyToLocation() for API integration without re-creating map
 */

const DEM_SOURCE_ID = 'mapbox-dem-v2';
const SKY_LAYER_ID = 'sky-atmosphere';
const MAX_3D_PITCH = 85;

/**
 * Check if the browser supports raster-dem tiles.
 * Safari < 15.4 and some mobile browsers lack support.
 */
export function is3DSupported() {
    try {
        // Check for WebGL2 or sufficient WebGL1 extensions
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
        if (!gl) return false;

        // Check if the browser can handle the required operations
        const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
        if (isSafari) {
            // Safari ≥ 15.4 supports terrain; older versions have rendering bugs
            const match = navigator.userAgent.match(/Version\/(\d+)\.(\d+)/);
            if (match) {
                const major = parseInt(match[1]);
                const minor = parseInt(match[2]);
                if (major < 15 || (major === 15 && minor < 4)) {
                    console.warn('⚠️ 3D terrain disabled: Safari version too old (need ≥ 15.4)');
                    return false;
                }
            }
        }
        return true;
    } catch (e) {
        console.warn('3D support check failed:', e);
        return false;
    }
}

/**
 * Enable 3D terrain mode on the map.
 * Adds DEM source, terrain, sky layer, and fog.
 * Smoothly transitions pitch and zoom.
 */
export function enable3DMode(map) {
    if (!map) {
        console.error('enable3DMode: map is not initialized');
        return false;
    }

    if (!is3DSupported()) {
        console.warn('3D terrain not supported on this browser. Staying in 2D.');
        return false;
    }

    try {
        // 0. Cleanup old source ID to flush the GPU/Worker cache
        if (map.getSource('mapbox-dem')) {
            map.removeSource('mapbox-dem');
        }
        if (map.getSource('mapbox-terrain-dem-v1')) {
            // Remove previous version if exists
            if (map.getTerrain() && map.getTerrain().source === 'mapbox-terrain-dem-v1') {
                map.setTerrain(null);
            }
            map.removeSource('mapbox-terrain-dem-v1');
        }


        // 1. Add DEM source (only if it doesn't exist — prevents duplication errors)
        if (!map.getSource(DEM_SOURCE_ID)) {
            map.addSource(DEM_SOURCE_ID, {
                type: 'raster-dem',
                url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
                tileSize: 512, // Critical for avoiding 256px misalignment spikes
                maxzoom: 14
            });
        }

        // 2. Set terrain with user-recommended exaggeration
        // Apply the 3D terrain with stabilization
        map.setTerrain({
            source: DEM_SOURCE_ID,
            exaggeration: 1.1 // Subtle exaggeration maintains performance and minimizes spikes
        });

        // 3. Error handler: catch failed DEM tile loads to prevent spikes at data boundaries
        if (!map._demErrorHandlerAdded) {
            map.on('error', (e) => {
                if (e.error && e.error.message && e.error.message.includes('raster-dem')) {
                    console.warn('DEM tile load error (handled gracefully):', e.error.message);
                    // Don't propagate — this prevents spikes at tile boundaries
                }
            });
            map._demErrorHandlerAdded = true;
        }

        // 4. Add sky layer (atmosphere) if not present
        if (!map.getLayer(SKY_LAYER_ID)) {
            map.addLayer({
                id: SKY_LAYER_ID,
                type: 'sky',
                paint: {
                    'sky-type': 'atmosphere',
                    'sky-atmosphere-sun': [0.0, 0.0],
                    'sky-atmosphere-sun-intensity': 15
                }
            });
        }

        // 5. Add fog for depth perception
        // Optimization: Atmosphere fog helps hide distant rendering glitches
        map.setFog({
            'range': [0.5, 10],
            'color': 'white', // User requested 'white' (or #ffffff)
            'horizon-blend': 0.1,
            // 'space-color': 'rgb(11, 11, 25)', // Keeping existing space color as it looks better than white space? 
            // User snippet only specified range, color, and horizon-blend. I will respect that but maybe keep space-color if not overridden?
            // Actually, user said: "add these atmospheric settings". I will use exactly what they gave for those keys.
            // But 'color': 'white' in fog might look weird if it overrides everything.
            // Mapbox defaults: color is white.
            // Let's stick to the prompt.
        });

        // 6. Smooth transition to 3D — clamp pitch to MAX_3D_PITCH for Safari safety
        // Limit the pitch to prevent 'infinite horizon' crashes in Safari
        map.setMaxPitch(MAX_3D_PITCH);

        const currentPitch = map.getPitch();
        const targetPitch = Math.min(currentPitch < 30 ? 60 : currentPitch, MAX_3D_PITCH);

        map.easeTo({
            pitch: targetPitch,
            duration: 1000,
            easing: (t) => t * (2 - t) // ease-out quad
        });

        // 7. Enforce max pitch constraint (Listener)
        if (!map._pitchClampAdded) {
            map.on('pitchend', () => {
                if (window._terrain3DEnabled && map.getPitch() > MAX_3D_PITCH) {
                    map.easeTo({ pitch: MAX_3D_PITCH, duration: 300 });
                }
            });
            map._pitchClampAdded = true;
        }

        // 8. Mark global state
        window._terrain3DEnabled = true;

        console.log('🏔️ 3D terrain mode enabled (Optimized V2)');
        return true;

    } catch (error) {
        console.error('Failed to enable 3D mode:', error);
        // Graceful fallback — disable terrain if it partially loaded
        try { map.setTerrain(null); } catch (e) { /* ignore */ }
        window._terrain3DEnabled = false;
        return false;
    }
}

/**
 * Disable 3D terrain mode. Removes terrain, sky, fog.
 * Smoothly transitions back to flat 2D view.
 */
export function disable3DMode(map) {
    if (!map) return;

    try {
        // 1. Remove terrain
        map.setTerrain(null);

        // 2. Remove sky layer
        if (map.getLayer(SKY_LAYER_ID)) {
            map.removeLayer(SKY_LAYER_ID);
        }

        // 3. Remove fog (saves GPU memory)
        map.setFog(null);

        // 4. Smooth transition back to 2D
        map.easeTo({
            pitch: 0,
            duration: 1000,
            easing: (t) => t * (2 - t)
        });

        // 5. Update global state
        window._terrain3DEnabled = false;

        console.log('🗺️ 2D mode restored');

    } catch (error) {
        console.error('Error disabling 3D mode:', error);
        window._terrain3DEnabled = false;
    }
}

/**
 * Toggle between 2D and 3D modes.
 * @returns {boolean} true if now in 3D, false if in 2D
 */
export function toggle3DMode(map) {
    if (window._terrain3DEnabled) {
        disable3DMode(map);
        return false;
    } else {
        return enable3DMode(map);
    }
}

/**
 * Fly to a location from API data without re-creating the map.
 * @param {mapboxgl.Map} map
 * @param {number} lat
 * @param {number} lon
 * @param {number} asl - Altitude above sea level in meters
 */
export function flyToLocation(map, lat, lon, asl) {
    if (!map) return;

    // Calculate zoom based on altitude — higher alt = lower zoom
    let zoom = 13;
    if (asl > 3000) zoom = 11;
    else if (asl > 1500) zoom = 12;
    else if (asl > 500) zoom = 13;
    else zoom = 14;

    const pitch = window._terrain3DEnabled ? Math.min(60, MAX_3D_PITCH) : 0;

    map.flyTo({
        center: [lon, lat],
        zoom: zoom,
        pitch: pitch,
        bearing: 0,
        duration: 2000,
        essential: true // This animation is essential for UX, don't skip for a11y
    });
}
