import { initEsriMap } from './map/esriMap.js';

import { fetchAltitude } from './services/altitudeService.js';
// Expose for inline scripts
window.fetchAltitude = fetchAltitude;
import { updateThermalDiagram } from './services/thermalService.js';

import { setupThermalPanel } from './ui/thermalPanel.js';
import { setupSkywaysToggle } from './ui/skywaysToggle.js';
import { enableSkyways3D, disableSkyways3D } from './map/skywaysLayer3d.js';
import { setupAIInterpretation } from './services/aiService.js';
import { saveToHistory, setupHistory } from './ui/history.js';
import { loadParaglidingSites3d } from './map/paraglidingSites3d.js';
import { setupSettingsPanel } from './ui/settingsPanel.js';
import { showClickConfirm, showXcPerfectConfirm } from './ui/confirmClickModal.js';
import { enableHotspots3D, disableHotspots3D } from './map/thermalHotspots3d.js';
import { setupCalculator3d, isCalculatorActive, addPoint3d } from './ui/calculator3d.js';
import { logActivity } from './utils/tracking.js';

window.showXcPerfectConfirm = showXcPerfectConfirm;
window.isXcPerfectSelecting = false;


// Reusing existing UI logic where possible, or adapting
// Note: search.js in reference might be different or adapted. 
// In the reference main3d.js, setupSearchToggle and setupAuthModals were defined locally or imported.
// I will reuse local definitions or adapt imports.
// The reference `main3d.js` had `setupSearchToggle` defined locally. I will do the same to be safe as `ui/search.js` might be mapbox specific.

async function start() {
    try {
        console.log("Starting 3D Map Application...");
        logActivity('app_load_3d');

        // 1. Setup UI (Auth, Panels)
        setupAuthModals();
        setupSearchToggleLocal();
        setupSettingsPanel();

        // 2. Initialize Esri Map (Wait for load)
        const view = await initEsriMap("viewDiv");
        window.currentView = view; // Global reference

        // --- ANTIGRAVITY PRELOADER CONTROL ---
        // Map is loaded (view.when resolved in initEsriMap), hide preloader
        setTimeout(() => {
            const preloader = document.getElementById('antigravity-preloader');
            if (preloader) {
                preloader.classList.add('hidden');
                // Remove from DOM after transition to free resources
                setTimeout(() => preloader.remove(), 1000);
            }
            // Show Logo
            const logo = document.getElementById('mapLogoContainer');
            if (logo) logo.classList.add('logo-visible');
        }, 500); // 500ms delay for visual smoothness

        // Setup History
        setupHistory({
            flyTo: (options) => {
                const center = options.center; // [lon, lat]
                const zoom = options.zoom;
                view.goTo({
                    center: center,
                    zoom: zoom
                });
            }
        });

        setupThermalPanel();

        // Add Return Button to UI Stack
        view.ui.add("returnBtn", "top-right");
        view.padding = { top: 30 };

        // Check URL params for initial view
        const urlParams = new URLSearchParams(window.location.search);
        const lat = parseFloat(urlParams.get('lat'));
        const lon = parseFloat(urlParams.get('lon'));
        const zoom = parseFloat(urlParams.get('zoom'));
        const tilt = parseFloat(urlParams.get('tilt'));
        const heading = parseFloat(urlParams.get('heading'));

        let initialCenter = view.center;
        let initialZoom = view.zoom;
        let initialHeading = 0;
        let initialTilt = 0;

        if (!isNaN(lat) && !isNaN(lon)) {
            initialCenter = [lon, lat];
            if (!isNaN(zoom)) initialZoom = zoom - 1;
            if (!isNaN(heading)) initialHeading = heading;
            if (!isNaN(tilt)) initialTilt = tilt;
        } else if (window.userLastState && window.userLastState.map_type === '3d') {
            // Restore 3D state
            if (window.userLastState.lon && window.userLastState.lat) initialCenter = [window.userLastState.lon, window.userLastState.lat];
            if (window.userLastState.zoom) initialZoom = window.userLastState.zoom; // This is Altitude for 3D effectively
            if (window.userLastState.pitch) initialTilt = window.userLastState.pitch;
            if (window.userLastState.bearing) initialHeading = window.userLastState.bearing;
        }

        view.goTo({
            center: initialCenter,
            zoom: initialZoom,
            heading: initialHeading,
            tilt: initialTilt
        }, { animate: false });


        // Save State on Stationary (ArcGIS "moveend" equivalent)
        // Need debounce utility, reusing from utils if available or implementing simple one
        let saveTimeout;
        view.watch("stationary", (isStationary) => {
            if (isStationary && window.userIsAuthenticated) {
                clearTimeout(saveTimeout);
                saveTimeout = setTimeout(async () => {
                    const cam = view.camera;
                    const center = view.center;

                    try {
                        await fetch('/api/user/state', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                lat: center.latitude,
                                lon: center.longitude,
                                zoom: view.zoom, // Approximate zoom level or use camera.position.z for altitude if preferred
                                pitch: cam.tilt,
                                bearing: cam.heading,
                                map_type: '3d'
                            })
                        });
                        // console.log("3D State Saved");
                    } catch (e) {
                        console.error("Failed to save 3D map state:", e);
                    }
                }, 1000);
            }
        });

        // Setup Return to 2D Button
        const returnBtn = document.getElementById('returnBtn');
        if (returnBtn) {
            returnBtn.addEventListener('click', () => {
                const center = view.center;
                const cam = view.camera;
                const z = view.zoom;

                window.location.href = `/?lat=${center.latitude}&lon=${center.longitude}&zoom=${z}&pitch=${cam.tilt}&bearing=${cam.heading}`;
            });
        }

        // 3. Setup Skyways Toggle
        setupSkywaysToggle(view, {
            onEnable: enableSkyways3D,
            onDisable: disableSkyways3D
        });

        // 4. Setup ArcGIS Search Widget AND Calculator Modules
        require([
            "esri/widgets/Search",
            "esri/Graphic",
            "esri/geometry/geometryEngine",
            "esri/geometry/Polyline",
            "esri/geometry/Polygon"
        ], (Search, Graphic, GeometryEngine, Polyline, Polygon) => {
            const searchWidget = new Search({
                view: view,
                container: "geocoder-container", // Functionally replaces the mapbox geocoder
                // includeDefaultSources: true, // Auto-config failing, defining manual source below
                locationEnabled: false,
                sources: [{
                    url: "https://geocode-api.arcgis.com/arcgis/rest/services/World/GeocodeServer",
                    singleLineFieldName: "SingleLine",
                    name: "ArcGIS World Geocoding Service",
                    placeholder: "Search location...",
                    maxResults: 6,
                    maxSuggestions: 6,
                    suggestionsEnabled: true,
                    minSuggestCharacters: 3,
                    apiKey: "AAPTxy8BH1VEsoebNVZXo8HurMzWtLP7kYjabApkRZ4NpNIFVAcyp9PaJUTUkPQzcQtfonrMBPUBCIbVPzTItpbF7Kl5AF-0rx-eaLw_5RpArSerMLnuzcYyDMRGWAymSICRwXmERRHXiRoX0P46WNOuhbHLRPK1k2Arijdd55L2K5vzJV4GzoOHxNq5xISkc3P_1oaA_M0z6-USu6iDjvN7KqGON8JvD3f8-9feH6LvBo4OkzYAlUBliJqxfxoOdBA6AT1_wlwx0WZg"
                }]
            });
            console.log("Search widget initialized with manual source", searchWidget);

            // Handle search result selection
            // Handle search result selection
            searchWidget.on("select-result", (event) => {
                console.log("Search result selected", event);
                // User requested ONLY zooming, so we disable the meteogram popup logic here.
                // The default behavior of the Search widget handles the zoom.
            });

            searchWidget.on("suggest-start", () => console.log("Search suggest started"));
            searchWidget.on("suggest-complete", (res) => console.log("Search suggest completed", res));
            searchWidget.on("suggest-error", (err) => console.error("Search suggest error", err));


            // Pass Graphic constructor to global or closure
            window.EsriGraphic = Graphic;

            // Initialize Calculator with loaded modules
            setupCalculator3d(view, Graphic, GeometryEngine, Polyline, Polygon);
        });

        // 5. Map Click Handler
        view.on("click", async (event) => {
            console.log("3D Map Clicked!", event);

            // Collapse Search Bar if open
            const searchWrapper = document.getElementById('searchWrapper');
            if (searchWrapper) searchWrapper.style.display = 'none';

            // --- NEW: Calculator Check ---
            if (isCalculatorActive()) {
                addPoint3d(event.mapPoint);
                return; // Stop processing for thermal analysis
            }
            if (window.isXcPerfectSelecting) return;

            if (!window.userIsAuthenticated) {
                console.warn("User not authenticated. Showing modal.");
                const authOverlay = document.getElementById('authModalOverlay');
                if (authOverlay) authOverlay.classList.add('active');
                return;
            }

            const lat = event.mapPoint.latitude;
            const lon = event.mapPoint.longitude;
            console.log(`Coordinates: ${lat}, ${lon}`);
            logActivity('map_click_3d', { lat, lon });

            const coordsDisplay = null; // No display in 3D currently, or add one if needed

            // 2. Confirmation Modal
            showClickConfirm(async (confirmed) => {
                if (!confirmed) {
                    console.log("Analysis cancelled by user.");
                    return;
                }

                // Fetch Altitude
                console.log("Fetching altitude...");
                const asl = await fetchAltitude(lat, lon, document.getElementById('authModalOverlay'));
                console.log(`Altitude fetched: ${asl}`);

                if (asl === null) {
                    console.error("Altitude fetch failed (null).");
                    return;
                }

                // Check Credits (Mirroring 2D logic)
                if (window.userCredits < 1) {
                    const creditsModal = document.getElementById('creditsModalOverlay');
                    if (creditsModal) {
                        creditsModal.classList.add('active');
                    } else {
                        // Fallback if modal is missing for some reason
                        if (confirm("You do not have enough credits to view the thermal forecast. Would you like to add more?")) {
                            window.location.href = "/add_credits";
                        }
                    }
                    return;
                }

                // Place Marker & Fetch Data
                console.log("Placing marker and fetching thermal data...");
                await placeMarkerAndFetch3d(view, lat, lon, asl, window.EsriGraphic);
            });
        });

        // 6. Setup AI
        setupAIInterpretation();

        // 7. Load Paragliding Sites
        loadParaglidingSites3d(view);

        // 8. Setup Hotspots Toggle (Manual implementation for 3D)
        require(["esri/layers/GeoJSONLayer"], (GeoJSONLayer) => {
            const checklist = document.getElementById('hotspotCheckbox');
            if (checklist) {
                // Initial check
                if (checklist.checked) {
                    enableHotspots3D(view, GeoJSONLayer);
                }

                // Listener
                checklist.addEventListener('change', (e) => {
                    if (e.target.checked) {
                        enableHotspots3D(view, GeoJSONLayer);
                    } else {
                        disableHotspots3D(view);
                    }
                });
            }
        });

        console.log("3D Map Application Initialized.");

    } catch (error) {
        console.error("Failed to initialize 3D map:", error);
        alert("Failed to load 3D Map: " + error.message);
    }
}



async function placeMarkerAndFetch3d(view, lat, lon, asl, GraphicClass) {
    if (!GraphicClass && window.EsriGraphic) GraphicClass = window.EsriGraphic;

    // 1. Remove existing graphics from view.graphics
    // Note: paragliding sites are in a separate GraphicsLayer, so clearing view.graphics affects only direct writes
    view.graphics.removeAll();

    // 2. Create new marker
    if (GraphicClass) {
        const point = {
            type: "point",
            longitude: lon,
            latitude: lat
        };

        const markerSymbol = {
            type: "simple-marker",
            color: [226, 119, 40],  // Orange
            outline: {
                color: [255, 255, 255], // White
                width: 2
            }
        };

        const pointGraphic = new GraphicClass({
            geometry: point,
            symbol: markerSymbol
        });

        view.graphics.add(pointGraphic);
    }

    // 3. Update Thermal Diagram (Reused from 2D)
    // This function fetches data and updates the thermalBox DOM elements
    console.log(`[main3d.js] calling updateThermalDiagram with lat=${lat}, lon=${lon}, asl=${asl}`);
    let imageUrl = null;
    try {
        imageUrl = await updateThermalDiagram(lat, lon, asl);
        console.log("[main3d.js] updateThermalDiagram returned:", imageUrl);
    } catch (err) {
        console.error("[main3d.js] updateThermalDiagram failed:", err);
    }

    // Fetch location name using ArcGIS
    let locationName = `${lat.toFixed(1)}, ${lon.toFixed(1)}`;
    try {
        const response = await fetch(`https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/reverseGeocode?f=json&location=${lon},${lat}&distance=1000`);
        const data = await response.json();
        if (data && data.address && data.address.Match_addr) {
            locationName = data.address.Match_addr;
        }
    } catch (e) {
        console.warn("Reverse geocoding failed:", e);
    }

    // 4. Update AI Context
    const sun = { azimuth: 180, altitude: 45 }; // Mock or calculate

    window.lastClickedLocation = {
        lat,
        lon,
        asl,
        sun,
        label: locationName
    };

    // 5. Save to History
    saveToHistory({
        lat,
        lon,
        asl,
        sun,
        placeName: locationName
    }, imageUrl);

    // 6. Show AI Button
    const aiBtn = document.getElementById("aiToggleBtn");
    if (aiBtn) aiBtn.style.display = "block";

    // 7. Expand Thermal Panel
    const thermalBox = document.getElementById("thermalBox");
    if (thermalBox) thermalBox.classList.remove("collapsed");
}

function setupSearchToggleLocal() {
    const searchToggleBtn = document.getElementById('searchToggleBtn');
    const searchWrapper = document.getElementById('searchWrapper');
    const searchPanel = document.getElementById('searchPanel');

    if (searchToggleBtn && searchWrapper) {
        searchToggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (searchWrapper.style.display === 'none') {
                searchWrapper.style.display = 'block';
            } else {
                searchWrapper.style.display = 'none';
            }
        });

        document.addEventListener('click', (e) => {
            if (searchWrapper.style.display === 'block' &&
                !searchPanel.contains(e.target) &&
                e.target !== searchToggleBtn) {
                searchWrapper.style.display = 'none';
            }
        });
    }
}


// --- Tutorial Logic ---
// Simplified: Redirect to 2D page to show tutorial there
function setupTutorial() {
    const tutorialBtn = document.getElementById('tutorialBtn');
    if (tutorialBtn) {
        tutorialBtn.addEventListener('click', () => {
            // Redirect to 2D map with a flag to start tutorial
            window.location.href = '/?start_tutorial=1';
        });
    }

    // Hide overlay elements explicitly if they exist in HTML just in case
    const tutorialOverlay = document.getElementById('tutorialOverlay');
    if (tutorialOverlay) tutorialOverlay.style.display = 'none';
}



function setupAuthModals() {
    const navLoginBtn = document.getElementById('navLoginBtn');
    const navRegisterBtn = document.getElementById('navRegisterBtn');
    const navProfileBtn = document.getElementById('navProfileBtn');

    function closeAllAuthModals() {
        const ids = ['authModalOverlay', 'registerModalOverlay', 'resetPasswordModalOverlay', 'profileModalOverlay', 'welcomeModalOverlay'];
        ids.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.remove('active');
        });
    }

    if (navLoginBtn) {
        navLoginBtn.addEventListener('click', (e) => {
            e.preventDefault();
            closeAllAuthModals();
            const overlay = document.getElementById('authModalOverlay');
            if (overlay) overlay.classList.add('active');
        });
    }
    if (navRegisterBtn) {
        navRegisterBtn.addEventListener('click', (e) => {
            e.preventDefault();
            closeAllAuthModals();
            const overlay = document.getElementById('registerModalOverlay');
            if (overlay) overlay.classList.add('active');
        });
    }
    if (navProfileBtn) {
        navProfileBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            closeAllAuthModals();
            const overlay = document.getElementById('profileModalOverlay');
            if (overlay) overlay.classList.add('active');

            // Hide user-info when profile is opened
            const userInfo = document.querySelector('.user-info');
            if (userInfo) userInfo.style.display = 'none';
        });
    }


    setupTutorial();
}


// Start the app
document.addEventListener('DOMContentLoaded', start);
