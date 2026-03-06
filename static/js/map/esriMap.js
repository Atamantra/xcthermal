let view;
let map;

/**
 * Initializes the ArcGIS SceneView.
 * @param {string} containerId - The ID of the container element.
 * @returns {Promise<__esri.SceneView>}
 */
export async function initEsriMap(containerId) {
    // Global error handler for this module's context
    window.addEventListener('error', (event) => {
        const container = document.getElementById(containerId);
        if (container && container.style.display !== 'none') {
            const errDiv = document.createElement('div');
            errDiv.style.cssText = "color: #ff5555; padding: 20px; text-align: left; background: rgba(0,0,0,0.8); position: absolute; top: 10px; left: 10px; z-index: 9999; font-family: monospace; white-space: pre-wrap; max-width: 80%; border: 1px solid red;";
            errDiv.innerHTML = `<strong>JS Error:</strong> ${event.message}<br><small>${event.filename}:${event.lineno}</small>`;
            container.appendChild(errDiv);
        }
    });

    console.log("initEsriMap called for", containerId);
    if (view) {
        console.log("Returning existing view");
        return view;
    }

    // Check if ArcGIS API is loaded
    if (typeof require === 'undefined') {
        throw new Error("ArcGIS API is not loaded (require is undefined).");
    }

    return new Promise((resolve, reject) => {
        // Timeout to prevent hanging
        const timeoutId = setTimeout(() => {
            reject(new Error("ArcGIS initialization timed out after 10 seconds."));
        }, 10000);

        console.log("Requiring ArcGIS modules...");
        require([
            "esri/Map",
            "esri/views/SceneView",
            "esri/layers/ElevationLayer",
            "esri/config"
        ], (Map, SceneView, ElevationLayer, esriConfig) => {
            console.log("ArcGIS modules loaded.");
            try {
                // Set your ArcGIS API Key here
                // Get one at https://developers.arcgis.com/dashboard/
                // Primary Key
                esriConfig.apiKey = "AAPTxy8BH1VEsoebNVZXo8HurMzWtLP7kYjabApkRZ4NpNIFVAcyp9PaJUTUkPQzcQtfonrMBPUBCIbVPzTItpbF7Kl5AF-0rx-eaLw_5RpArSerMLnuzcYyDMRGWAymSICRwXmERRHXiRoX0P46WNOuhbHLRPK1k2Arijdd55L2K5vzJV4GzoOHxNq5xISkc3P_1oaA_M0z6-USu6iDjvN7KqGON8JvD3f8-9feH6LvBo4OkzYAlUBliJqxfxoOdBA6AT1_wlwx0WZg";

                // Secondary Key (Stored for backup):
                // AAPT85fOqywZsicJupSmVSCGrlBcLCnww_mmCZQ4Jr1BCndyd5tnagyWPsLoyVgIXxstfwhQ313ocKR4nuyuu9kOsUqMw4_7biJ-O1O5X2OE-yahFEVr2X7BHI7W4t_MJPzYe-WO0ljEtZUq3jmmtG03EmrCixOyz9bASApTqZFcd62tb7K5wkMek2LexQ2X5zDnL9uZCH7Hhw77XAa6f9mvGkT8M00MrTzt4Z0oC8N3wmqotRVbbCtw3pMv0O9PfQsbAT2_wlwx0WZg

                console.log("Using API Key:", esriConfig.apiKey); // Verify key

                const map = new Map({
                    basemap: "satellite",
                    ground: "world-elevation"
                });

                console.log("Creating SceneView...");
                view = new SceneView({
                    container: containerId,
                    map: map,
                    qualityProfile: "high",
                    environment: {
                        atmosphere: {
                            quality: "high"
                        },
                        lighting: {
                            directShadowsEnabled: true
                        }
                    }
                    // ui: { components: ["attribution"] } // REMOVED to show default controls for debugging
                });

                // Move default widgets to top-right
                view.ui.move(["zoom", "navigation-toggle", "compass"], "top-right");

                // Listen for layer loading errors (e.g. Auth failed)
                view.on("layerview-create-error", (event) => {
                    console.error("Layer view failed to create:", event.error);
                    const container = document.getElementById(containerId);
                    if (container) {
                        // Append error, don't overwrite if multiple
                        const errDiv = document.createElement('div');
                        errDiv.style.cssText = "color: #ff5555; padding: 10px; text-align: center; background: rgba(0,0,0,0.7); position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 999;";
                        errDiv.innerHTML = `
                            <h3>Layer Load Error</h3>
                            <p>${event.error.message}</p>
                            <p>Check API Key Scopes (Basemaps/Elevation)</p>
                        `;
                        container.appendChild(errDiv);
                    }
                });

                console.log("Waiting for view to load...");
                view.when(() => {
                    clearTimeout(timeoutId);
                    console.log("ArcGIS SceneView initialized successfully");
                    resolve(view);
                }, (error) => {
                    clearTimeout(timeoutId);
                    console.error("ArcGIS SceneView failed to load", error);
                    const container = document.getElementById(containerId);
                    if (container) {
                        container.innerHTML = `<div style="color: white; padding: 20px; text-align: center;">
                            <h2>3D Map Failed to Load</h2>
                            <p>${error.message || error}</p>
                            <p>Please check your API Key and ensure "Basemaps" and "Elevation" are enabled.</p>
                        </div>`;
                    }
                    reject(error);
                });

            } catch (error) {
                clearTimeout(timeoutId);
                console.error("Error initializing ArcGIS map:", error);
                const container = document.getElementById(containerId);
                if (container) {
                    container.innerHTML = `<div style="color: white; padding: 20px; text-align: center;">
                        <h2>Initialization Error</h2>
                        <p>${error.message || error}</p>
                    </div>`;
                }
                reject(error);
            }
        });
    });
}

/**
 * Syncs the ArcGIS view to match the Mapbox view.
 * @param {object} mapboxMap - The Mapbox GL JS map instance.
 */
export function syncToMapbox(mapboxMap) {
    if (!view) return;

    const center = mapboxMap.getCenter();
    const zoom = mapboxMap.getZoom();
    const pitch = mapboxMap.getPitch();
    const bearing = mapboxMap.getBearing();

    // Convert Mapbox zoom to ArcGIS scale or altitude
    // Simple approximation or use goTo with center/zoom

    view.goTo({
        center: [center.lng, center.lat],
        zoom: zoom - 1, // ArcGIS zoom is slightly different, often needs -1 adjustment
        heading: 360 - bearing,
        tilt: pitch
    }, { animate: false })
        .catch(err => console.error("View sync failed:", err));
}

/**
 * Syncs the Mapbox view to match the ArcGIS view.
 * @param {object} mapboxMap - The Mapbox GL JS map instance.
 */
export function syncFromArcGIS(mapboxMap) {
    if (!view) return;

    const center = view.center;
    const zoom = view.zoom;
    const tilt = view.camera.tilt;
    const heading = view.camera.heading;

    mapboxMap.jumpTo({
        center: [center.longitude, center.latitude],
        zoom: zoom,
        pitch: tilt,
        bearing: heading
    });
}
