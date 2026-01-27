/**
 * Loads paragliding sites from the backend and displays them as 3D icons.
 * @param {__esri.SceneView} view - The ArcGIS SceneView instance.
 */
export async function loadParaglidingSites3d(view) {
    try {
        console.log("Loading paragliding sites for 3D view...");

        // Load required modules
        const [GraphicsLayer, Graphic, Point, webMercatorUtils] = await loadModules([
            "esri/layers/GraphicsLayer",
            "esri/Graphic",
            "esri/geometry/Point",
            "esri/geometry/support/webMercatorUtils"
        ]);

        // Create a layer for the sites
        const layer = new GraphicsLayer({
            title: "Paragliding Sites",
            elevationInfo: {
                mode: "relative-to-ground",
                offset: 50 // Float slightly above ground so they are visible
            }
        });
        view.map.add(layer);

        // Initialize State
        let lastFeaturesJson = "";
        let debounceTimer = null;

        // Function to refresh sites based on current view extent
        const refreshSites = async () => {
            // Debug: check if view and extent exist
            if (!view || !view.extent) return;

            try {
                // Convert WebMercator extent to Geographic (Lat/Lon)
                const geoExtent = webMercatorUtils.webMercatorToGeographic(view.extent);
                if (!geoExtent) return;

                const bounds = {
                    north: geoExtent.ymax,
                    south: geoExtent.ymin,
                    east: geoExtent.xmax,
                    west: geoExtent.xmin
                };

                const params = new URLSearchParams(bounds);
                // Add current time prevent caching
                params.append('_t', Date.now());

                const response = await fetch(`/proxy/paragliding-sites?${params.toString()}`);
                if (!response.ok) throw new Error(`Failed to fetch sites: ${response.status}`);

                const data = await response.json();
                const features = data.features || [];

                // --- OPTIMIZATION: Data Diffing ---
                // Create a simple signature to check if data actually changed
                // We use name + lat + lon as a unique enough key for this purpose
                const currentFeaturesJson = JSON.stringify(features.map(f => ({
                    n: f.properties.name,
                    c: f.geometry.coordinates
                })));

                if (currentFeaturesJson === lastFeaturesJson) {
                    // console.log("Sites unchanged, skipping update.");
                    return;
                }
                lastFeaturesJson = currentFeaturesJson;
                // ----------------------------------

                // Clear existing graphics before adding new ones 
                layer.removeAll();

                const graphics = features.map(feature => {
                    const [lon, lat] = feature.geometry.coordinates;
                    const name = feature.properties.name || "Unknown Site";
                    const altitude = feature.properties.altitude || "N/A";
                    const bestWind = feature.properties.best_wind_direction || "N/A";

                    const point = new Point({
                        longitude: lon,
                        latitude: lat
                    });

                    // 3D Icon Symbol (Billboard)
                    const symbol = {
                        type: "point-3d",
                        symbolLayers: [{
                            type: "icon",
                            resource: { href: "/static/paraglider.png" },
                            size: 20,
                            outline: { color: "white", size: 0.5 }
                        }],
                        verticalOffset: {
                            screenLength: 20,
                            maxWorldLength: 1000,
                            minWorldLength: 20
                        },
                        callout: {
                            type: "line",
                            size: 1.0,
                            color: [255, 255, 255],
                            border: {
                                color: [0, 0, 0]
                            }
                        }
                    };

                    const textSymbol = {
                        type: "point-3d",
                        symbolLayers: [{
                            type: "text",
                            material: { color: "white" },
                            halo: { color: "black", size: 1 },
                            text: name,
                            size: 10
                        }],
                        verticalOffset: {
                            screenLength: 45, // Above the icon
                            maxWorldLength: 1500,
                            minWorldLength: 40
                        }
                    };

                    const iconGraphic = new Graphic({
                        geometry: point,
                        symbol: symbol,
                        attributes: {
                            name: name,
                            altitude: altitude,
                            best_wind: bestWind,
                            link: feature.properties.link // if available
                        },
                        popupTemplate: {
                            title: "{name}",
                            content: `
                                <b>Altitude:</b> {altitude}<br>
                                <b>Best Wind:</b> {best_wind}<br>
                            `
                        }
                    });

                    const textGraphic = new Graphic({
                        geometry: point,
                        symbol: textSymbol
                    });

                    return [iconGraphic, textGraphic];
                }).flat();

                layer.addMany(graphics);

            } catch (err) {
                console.error("Error refreshing paragliding sites:", err);
            }
        };

        // Initial load & Watcher
        view.when(() => {
            // Watch for stationary changes with DEBOUNCE
            view.watch("stationary", (isStationary) => {
                if (isStationary) {
                    if (debounceTimer) clearTimeout(debounceTimer);
                    debounceTimer = setTimeout(() => {
                        refreshSites();
                    }, 1000); // Wait 1 second after stopping before fetching
                } else {
                    // Start moving, maybe cancel pending?
                    if (debounceTimer) clearTimeout(debounceTimer);
                }
            });

            // Initial check
            if (view.stationary) {
                refreshSites();
            }
        });

    } catch (error) {
        console.error("Error loading paragliding sites 3D:", error);
    }
}

// Helper to load ArcGIS modules (since we are in a module script but ArcGIS is AMD)
function loadModules(moduleNames) {
    return new Promise((resolve, reject) => {
        require(moduleNames, (...modules) => {
            resolve(modules);
        });
    });
}
