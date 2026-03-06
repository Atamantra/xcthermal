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
                            content: fetchSitePopupContent // Function to fetch dynamic content
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

/**
 * Fetches site weather for the popup
 */
function fetchSitePopupContent(feature) {
    const graphic = feature.graphic;
    const lat = graphic.geometry.latitude;
    const lon = graphic.geometry.longitude;
    const name = graphic.attributes.name;

    // Return a DIV that we will populate asynchronously
    const div = document.createElement("div");
    div.innerHTML = `
        <div style="font-size:13px; margin-bottom:5px;"><b>Fetching live data...</b></div>
        <div class="popup-loading"></div>
    `;

    fetch(`/api/site-weather?lat=${lat}&lon=${lon}`)
        .then(res => res.json())
        .then(data => {
            if (data.error) throw new Error(data.error);

            // Format wind direction (cardinal)
            const getCardinal = (deg) => {
                const val = Math.floor((deg / 45) + 0.5);
                const arr = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
                return arr[val % 8];
            };
            const windDir = getCardinal(data.wind_direction);

            div.innerHTML = `
                <div style="line-height:1.6; font-size:13px;">
                    <div><b>Altitude:</b> ${Math.round(data.elevation)}m <span style="color:#aaa; font-size:0.9em;">(Open-Elevation)</span></div>
                    <div><b>Current Wind:</b> ${data.wind_speed} ${data.wind_unit} ${windDir} (${data.wind_direction}°) <span style="color:#aaa; font-size:0.9em;">(Open-Meteo)</span></div>
                    ${graphic.attributes.best_wind !== 'N/A' ? `<div><b>Best Wind (Site):</b> ${graphic.attributes.best_wind}</div>` : ''}
                </div>
            `;
        })
        .catch(err => {
            div.innerHTML = `
                <div style="color:red; font-size:13px;">
                    <b>Altitude:</b> N/A<br>
                    <b>Weather:</b> Failed to load<br>
                    <small>${err.message}</small>
                </div>
            `;
        });

    return div;
}
