import { initMap } from './map/initMap.js';
import { setupGeocoder } from './ui/search.js';
import { setupPanelToggle } from './ui/panelToggle.js';
import { setupThermalPanel, expandThermalPanel } from './ui/thermalPanel.js';
import { setupHistory, saveToHistory } from './ui/history.js';
import { promptAltitude } from './utils/promptAltitude.js';
import { placeMarkerAndFetch } from './services/thermalService.js';
import { setupAIInterpretation } from './services/aiService.js';
import { setupStyleToggle } from './map/styleToggle.js';
import { setupSettingsPanel } from './ui/settingsPanel.js';
import { setupHotspotToggle } from './ui/hotspotToggle.js';
import { setupClickRadius, createWobblyCircle } from './ui/circleOverlay.js';
import { getSunPosition } from './map/sunPosition.js';
import { fetchAltitude } from './services/altitudeService.js';
// Expose for inline scripts
window.fetchAltitude = fetchAltitude;
import { setupMapStyleRadios } from './utils/mapStyleRadios.js';

import { showClickConfirm, showXcPerfectConfirm } from './ui/confirmClickModal.js';
import { isCalculatorActive, setupCalculator } from './ui/calculator.js';
import { logActivity } from './utils/tracking.js';

window.showXcPerfectConfirm = showXcPerfectConfirm;
window.isXcPerfectSelecting = false;

// Log App Load
logActivity('app_load_2d');

const authModalOverlay = document.getElementById('authModalOverlay');

let currentTutorialStep = 0;
let tutorialDummyMarker = null; // Track the dummy marker

const tutorialSteps = [
    {
        element: 'searchToggleBtn',
        title: 'Find Locations',
        text: 'Start by searching for any location worldwide.',
        position: 'right'
    },
    {
        element: 'settingsBtn',
        title: 'Settings',
        text: 'Customize units, map styles, and AI preferences here.',
        position: 'right',
        action: 'openSettings'
    },
    {
        element: 'map',
        title: 'Click Location',
        text: 'Click anywhere on the map to view detailed thermal forecasts.',
        position: 'center',
        action: 'dummyClick'
    },
    {
        element: 'statsButton',
        title: 'Advanced Meteograms',
        text: 'Access detailed Meteoblue meteograms here to analyze cloud base, wind, and thermal quality.',
        position: 'left'
    },
    {
        element: 'fakeAiToggleBtn',
        title: 'AI Interpretation',
        text: 'The most powerful feature! Click this to get an instant, expert analysis of the flying conditions.',
        position: 'right',
        highlightClass: 'rainbow-glow'
    },
    {
        element: 'aiPanel',
        title: 'Magic in Progress',
        text: 'The AI takes 30-60 seconds to generate a report. Play the mini-game while you wait, or email the results to yourself!',
        position: 'left',
        action: 'openAI'
    }
];

function showTutorialStep(stepIndex) {
    if (stepIndex < 0 || stepIndex >= tutorialSteps.length) {
        return;
    }

    try {
        // Clear previous highlight
        const prevStep = tutorialSteps[currentTutorialStep];
        if (prevStep && prevStep.element) {
            const prevElement = document.getElementById(prevStep.element);
            if (prevElement) {
                prevElement.classList.remove('tutorial-highlight');
                if (prevStep.highlightClass) {
                    prevElement.classList.remove(prevStep.highlightClass);
                }
            }
        }

        currentTutorialStep = stepIndex;
        const step = tutorialSteps[currentTutorialStep];

        const tutorialModal = document.querySelector('.tutorial-modal');
        // No alert here, assuming modal is found if overlay is active.

        const tutorialTitle = document.getElementById('tutorialTitle');
        const tutorialText = document.getElementById('tutorialText');
        const tutorialPrevBtn = document.getElementById('tutorialPrevBtn');
        const tutorialNextBtn = document.getElementById('tutorialNextBtn');
        const tutorialDoneBtn = document.getElementById('tutorialDoneBtn');

        // Update Content (Hardcoded English)
        tutorialTitle.textContent = step.title;
        tutorialText.textContent = step.text;

        // Update buttons
        tutorialPrevBtn.style.display = currentTutorialStep > 0 ? 'inline-block' : 'none';
        tutorialNextBtn.style.display = currentTutorialStep < tutorialSteps.length - 1 ? 'inline-block' : 'none';
        tutorialDoneBtn.style.display = currentTutorialStep === tutorialSteps.length - 1 ? 'inline-block' : 'none';

        // --- Dynamic Element Handling ---

        // AI Panel Action
        const aiPanel = document.getElementById('aiPanel');
        if (step.action === 'openAI') {
            if (aiPanel) aiPanel.classList.add('active');
        } else if (step.action === 'closeAI') {
            if (aiPanel) aiPanel.classList.remove('active');
        }

        // Settings Panel Action - Auto Close if not the target step
        const settingsPanel = document.getElementById('settingsPanel');
        if (settingsPanel) {
            if (step.action === 'openSettings') {
                settingsPanel.classList.add('active');
            } else {
                // Determine if we should close: Close on any step that is NOT 'openSettings'
                settingsPanel.classList.remove('active');
            }
        }

        // Dummy Marker Action
        if (step.action === 'dummyClick') {
            const overlay = document.getElementById('tutorialOverlay');
            // User requested opacity 1 for all steps, so we don't lower it here.
            // if (overlay) overlay.style.setProperty('background-color', 'rgba(0, 0, 0, 0.3)', 'important');

            if (window.currentMap) {
                // Remove existing if any (just in case)
                if (tutorialDummyMarker) tutorialDummyMarker.remove();

                const center = window.currentMap.getCenter();
                // User wants it "centered", so we use anchor: 'center' and remove the weird highlight box
                tutorialDummyMarker = new mapboxgl.Marker({ color: "#FF0000", anchor: 'center' })
                    .setLngLat(center)
                    .addTo(window.currentMap);

                // Ensure it is visible above the overlay
                const markerEl = tutorialDummyMarker.getElement();
                if (markerEl) {
                    // Manual z-index instead of class to avoid box-shadow misalignment
                    markerEl.style.zIndex = '22001';
                    markerEl.style.pointerEvents = 'none'; // Click-through
                }

                // --- DUMMY CIRCLE OVERLAY ---
                const features = [];
                const seed = 12345; // Fixed seed for stable "dummy" look
                const { lng, lat } = center;

                // Generate 6 concentric organic blobs (same as real click)
                for (let r = 6; r >= 1; r--) {
                    const blob = createWobblyCircle([lng, lat], r, seed + (r * 0.2));
                    blob.properties = { radius: r };
                    features.push(blob);
                }
                const collection = turf.featureCollection(features);
                const sourceId = 'tutorial-dummy-radius';

                if (!window.currentMap.getSource(sourceId)) {
                    window.currentMap.addSource(sourceId, {
                        type: "geojson",
                        data: collection
                    });

                    // Fill Layer
                    window.currentMap.addLayer({
                        id: 'tutorial-dummy-radius-fill',
                        type: "fill",
                        source: sourceId,
                        paint: {
                            "fill-color": [
                                "interpolate",
                                ["linear"],
                                ["get", "radius"],
                                1.0, "#f0f921",
                                1.5, "#fdc328",
                                2.0, "#f89441",
                                2.5, "#e56b5d",
                                3.0, "#cc4678",
                                3.5, "#b52f8c",
                                4.0, "#9a179b",
                                4.5, "#7e03a8",
                                5.0, "#6a00a8",
                                5.5, "#5402a3",
                                6.0, "#3b0f70",
                                6.5, "#0d0887"
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

                    // Outline Layer
                    window.currentMap.addLayer({
                        id: 'tutorial-dummy-radius-outline',
                        type: "line",
                        source: sourceId,
                        filter: ["==", ["get", "radius"], 6],
                        paint: {
                            "line-color": "#0d0887",
                            "line-width": 1.5,
                            "line-opacity": 0.5
                        }
                    });
                }
            }
        } else {
            // Cleanup if not on this step
            const overlay = document.getElementById('tutorialOverlay');
            // User requested opacity 1 for all steps, so we don't lower it here.
            // if (overlay) overlay.style.removeProperty('background-color');

            if (tutorialDummyMarker) {
                tutorialDummyMarker.remove();
                tutorialDummyMarker = null;
            }
            if (window.currentMap) {
                if (window.currentMap.getLayer('tutorial-dummy-radius-outline')) window.currentMap.removeLayer('tutorial-dummy-radius-outline');
                if (window.currentMap.getLayer('tutorial-dummy-radius-fill')) window.currentMap.removeLayer('tutorial-dummy-radius-fill');
                if (window.currentMap.getSource('tutorial-dummy-radius')) window.currentMap.removeSource('tutorial-dummy-radius');
            }
        }

        // Fake AI Button Visibility
        const fakeAiBtn = document.getElementById('fakeAiToggleBtn');
        if (step.element === 'fakeAiToggleBtn') {
            if (fakeAiBtn) {
                fakeAiBtn.style.display = 'block';
                fakeAiBtn.style.zIndex = '22002'; // Ensure it's above the overlay
            }
        } else {
            if (fakeAiBtn) {
                fakeAiBtn.style.display = 'none';
                fakeAiBtn.style.zIndex = ''; // Reset
            }
        }

        // --- Positioning Logic ---
        let padding = 15;
        if (step.position === 'left') {
            padding = 30;
        }

        let targetElement = null;
        if (step.element && step.element !== 'map' && step.element !== 'aiPanel') {
            targetElement = document.getElementById(step.element);
        }

        // Reset classes
        tutorialModal.classList.remove('centered');

        // Apply Highlight
        if (targetElement) {
            targetElement.classList.add('tutorial-highlight');
            if (step.highlightClass) {
                targetElement.classList.add(step.highlightClass);
            }
        }

        // Calculate Position
        if (targetElement && step.position !== 'center') {
            const rect = targetElement.getBoundingClientRect();

            let top = 0;
            let left = 0;
            const modalWidth = 300;

            if (step.position === 'right') {
                left = rect.right + padding;
                top = rect.top + (rect.height / 2) - 100;
            } else if (step.position === 'left') {
                left = rect.left - modalWidth - padding;
                top = rect.top + (rect.height / 2) - 100;
            } else if (step.position === 'top') {
                left = rect.left + (rect.width / 2) - (modalWidth / 2);
                top = rect.top - 200 - padding;
            } else if (step.position === 'bottom') {
                left = rect.left + (rect.width / 2) - (modalWidth / 2);
                top = rect.bottom + padding;
            }

            // Boundary checks
            if (left < 10) left = 10;
            if (top < 10) top = 10;
            if (left + modalWidth > window.innerWidth) left = window.innerWidth - modalWidth - 10;

            tutorialModal.style.top = `${top}px`;
            tutorialModal.style.left = `${left}px`;
            tutorialModal.style.transform = 'none';

        } else {
            // Center case - Use calculated pixels to avoid unit mixing lag
            const modalWidth = 300; // Match CSS or measured width
            const centerLeft = (window.innerWidth / 2) - (modalWidth / 2);
            const centerTop = (window.innerHeight / 2) + 50; // Slightly below center

            tutorialModal.style.top = `${centerTop}px`;
            tutorialModal.style.left = `${centerLeft}px`;
            tutorialModal.style.transform = 'none'; // Avoid transform transition
        }

        // Apply specific positioning for "Find Locations" step
        if (currentTutorialStep === 0) {
            tutorialModal.style.top = '45px';
            tutorialModal.style.left = '30px';
            tutorialModal.style.transform = 'none';
        }

        // Apply specific positioning for "Advanced Meteograms" step
        if (currentTutorialStep === 3) {
            tutorialModal.style.top = '200px';
            tutorialModal.style.left = '50px';
            tutorialModal.style.transform = 'none';
        }

        // Apply specific positioning for AI Interpretation step
        if (currentTutorialStep === 4) { // AI Interpretation step (was 3)
            tutorialModal.style.top = '220.75px';
            tutorialModal.style.left = '55px';
            tutorialModal.style.transform = 'none';
        }

        // Show
        requestAnimationFrame(() => {
            tutorialModal.classList.add('visible');
        });

        // --- Special Z-index & Positioning for 5th step (AI Panel) ---
        if (currentTutorialStep === 5) { // AI Panel step (was 4)
            tutorialModal.style.zIndex = '9999999999'; // Super high Z-index
            // Manual override for "too low" issue
            tutorialModal.style.top = '160px';
            tutorialModal.style.transform = 'none';
        } else {
            tutorialModal.style.zIndex = ''; // Reset to CSS default (10005)
        }

    } catch (err) {
        console.error("Tutorial Error:", err);
    }
}

function completeTutorial() {
    document.getElementById('tutorialOverlay').style.display = 'none';
    const tutorialModal = document.querySelector('.tutorial-modal');
    if (tutorialModal) tutorialModal.classList.remove('visible');

    // Cleanup Dummy Marker & Circle
    if (tutorialDummyMarker) {
        tutorialDummyMarker.remove();
        tutorialDummyMarker = null;
    }
    if (window.currentMap) {
        if (window.currentMap.getLayer('tutorial-dummy-radius-outline')) window.currentMap.removeLayer('tutorial-dummy-radius-outline');
        if (window.currentMap.getLayer('tutorial-dummy-radius-fill')) window.currentMap.removeLayer('tutorial-dummy-radius-fill');
        if (window.currentMap.getSource('tutorial-dummy-radius')) window.currentMap.removeSource('tutorial-dummy-radius');
    }

    // Cleanup Fake AI Button
    const fakeAiBtn = document.getElementById('fakeAiToggleBtn');
    if (fakeAiBtn) fakeAiBtn.style.display = 'none';

    // Cleanup AI Panel (Close it)
    const aiPanel = document.getElementById('aiPanel');
    if (aiPanel) aiPanel.classList.remove('active');

    // Remove all highlights
    tutorialSteps.forEach(step => {
        if (step.element) {
            const el = document.getElementById(step.element);
            if (el) el.classList.remove('tutorial-highlight');
            if (step.highlightClass && el) el.classList.remove(step.highlightClass);
        }
    });

    // Mark tutorial as completed on the backend
    if (window.userIsAuthenticated) {
        fetch('/api/tutorial_completed', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({})
        })
            .then(response => {
                if (response.ok) {
                    console.log('Tutorial marked as completed successfully.');
                    window.userTutorialCompleted = true; // Update client-side status
                } else {
                    console.error('Failed to mark tutorial as completed.');
                }
            })
            .catch(error => {
                console.error('Error marking tutorial as completed:', error);
            });
    }
}

function setupTutorial() {
    const tutorialOverlay = document.getElementById('tutorialOverlay');
    const tutorialSkipBtn = document.getElementById('tutorialSkipBtn');
    const tutorialPrevBtn = document.getElementById('tutorialPrevBtn');
    const tutorialNextBtn = document.getElementById('tutorialNextBtn');
    const tutorialDoneBtn = document.getElementById('tutorialDoneBtn');
    const tutorialBtn = document.getElementById('tutorialBtn'); // The restart button

    // Restart Listener
    if (tutorialBtn) {
        // New User Rainbow Hint Logic
        const hasSeenHint = localStorage.getItem('tutorialHintSeen');
        if (!hasSeenHint) {
            tutorialBtn.classList.add('rainbow-button');

            // Remove hint on first click
            const removeHint = () => {
                tutorialBtn.classList.remove('rainbow-button');
                localStorage.setItem('tutorialHintSeen', 'true');
                tutorialBtn.removeEventListener('click', removeHint);
            };
            tutorialBtn.addEventListener('click', removeHint);
        }

        tutorialBtn.addEventListener('click', () => {
            window.userTutorialCompleted = false;
            if (tutorialOverlay) tutorialOverlay.style.display = 'flex';
            showTutorialStep(0);
        });
    }

    // Attach listeners unconditionally so they work on restart
    if (tutorialSkipBtn) tutorialSkipBtn.addEventListener('click', completeTutorial);
    if (tutorialPrevBtn) tutorialPrevBtn.addEventListener('click', () => showTutorialStep(currentTutorialStep - 1));
    if (tutorialNextBtn) tutorialNextBtn.addEventListener('click', () => showTutorialStep(currentTutorialStep + 1));
    if (tutorialDoneBtn) tutorialDoneBtn.addEventListener('click', completeTutorial);

    // Auto-start if not completed OR if forced via URL param
    const urlParams = new URLSearchParams(window.location.search);
    const forceTutorial = urlParams.get('start_tutorial');

    if ((window.userIsAuthenticated && !window.userTutorialCompleted) || forceTutorial) {
        if (tutorialOverlay) {
            tutorialOverlay.style.display = 'flex';
            showTutorialStep(0);
        }
    } else {
        if (tutorialOverlay) tutorialOverlay.style.display = 'none';

        // Custom URL Handler for Profile Redirect
        const openProfile = urlParams.get('open_profile');
        if (openProfile === 'true' && window.userIsAuthenticated) {
            const overlay = document.getElementById('profileModalOverlay');
            if (overlay) {
                overlay.classList.add('active');
                // Also hide user info if needed, matching the button click logic
                const userInfo = document.querySelector('.user-info');
                if (userInfo) userInfo.style.display = 'none';
            }
        }
    }
}


document.addEventListener("DOMContentLoaded", async () => {
    try {
        // --- Welcome Modal Logic ---
        const WELCOME_VERSION = 'v1.1'; // Update this when you want to show the modal again for a new version
        const hasSeenWelcome = localStorage.getItem(`welcomeShown_${WELCOME_VERSION}`);
        const welcomeOverlay = document.getElementById('welcomeModalOverlay');

        if (!hasSeenWelcome && welcomeOverlay) {
            // Use a small timeout to ensure styles are loaded and transitions work
            setTimeout(() => {
                welcomeOverlay.classList.add('active');
            }, 500);

            // Mark as seen immediately so it doesn't annoy them on refresh
            localStorage.setItem(`welcomeShown_${WELCOME_VERSION}`, 'true');
        }

        // --- Nav Modal Handlers ---
        const navLoginBtn = document.getElementById('navLoginBtn');
        const navRegisterBtn = document.getElementById('navRegisterBtn');
        const navProfileBtn = document.getElementById('navProfileBtn');

        function closeAllAuthModals() {
            const ids = ['authModalOverlay', 'registerModalOverlay', 'resetPasswordModalOverlay', 'profileModalOverlay'];
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
                closeAllAuthModals();
                const overlay = document.getElementById('profileModalOverlay');
                if (overlay) overlay.classList.add('active');

                // Hide user-info when profile is opened
                const userInfo = document.querySelector('.user-info');
                if (userInfo) userInfo.style.display = 'none';
            });
        }



        // --- INDEPENDENT UI SETUP (DOES NOT DEPEND ON MAP) ---
        // Setup these FIRST so buttons work even if the map fails to load.
        setupAIInterpretation();
        setupSettingsPanel();
        setupTutorial(); // Setup tutorial listeners (some might need map, but the restart button etc. don't)

        let map;
        try {
            // Initialize Map (Replace empty string with token if not handled in initMap)
            map = await initMap("pk.eyJ1IjoiYXRhbWFudHJhIiwiYSI6ImNtZGxrcnZrdjExZjQya3M1Nm9peGg3bGcifQ.jefvIQmFvkvVupd5ekfoSg");

            // ANTIGRAVITY PRELOADER CONTROL
            setTimeout(() => {
                const preloader = document.getElementById('antigravity-preloader');
                if (preloader) {
                    preloader.classList.add('hidden');
                    setTimeout(() => preloader.remove(), 1000);
                }
                // Show Logo
                const logo = document.getElementById('mapLogoContainer');
                if (logo) logo.classList.add('logo-visible');
            }, 500);
        } catch (mapErr) {
            console.error("Map failed to fully initialize:", mapErr);
            // Even if map fails, we want the rest of the UI to work.
            // We can show a toast or something, but we let the rest of the code run if possible.
            // However, subsequent map-dependent setups might fail, so we should check for map existence.
        }

        if (map) {
            // UI and Map Feature Setups
            setupMapStyleRadios(map);
            setupStyleToggle(map);

            // Geocoder setup
            setupGeocoder(map, (lat, lon) => {
                map.flyTo({ center: [lon, lat], zoom: 11 });
            });

            map.on('click', async (e) => {
                if (isCalculatorActive()) return;
                if (window.isXcPerfectSelecting) return;

                console.log("Map clicked. Coordinates:", e.lngLat.toArray());

                // 1. Authentication Check
                if (!window.userIsAuthenticated) {
                    console.log("User not authenticated. Showing auth modal.");
                    if (authModalOverlay) authModalOverlay.classList.add('active');
                    return;
                }

                const { lat, lng } = e.lngLat;
                logActivity('map_click', { lat, lon: lng });

                const coordsDisplay = document.getElementById('analysisCoordsDisplay');
                if (coordsDisplay) {
                    coordsDisplay.textContent = `Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)}`;
                }

                // 2. Confirmation Modal
                showClickConfirm(async (confirmed) => {
                    if (!confirmed) {
                        console.log("Analysis cancelled by user.");
                        return;
                    }

                    console.log("Analysis confirmed. Fetching altitude...");

                    // 3. Fetch Altitude
                    const asl = await fetchAltitude(lat, lng, authModalOverlay);
                    if (asl === null) {
                        console.warn("Altitude fetch failed or user cancelled altitude prompt.");
                        return;
                    }
                    console.log(`Altitude fetched: ${asl}m ASL`);

                    // 3.5 Credit Check
                    if (window.userCredits < 1) {
                        const creditsModal = document.getElementById('creditsModalOverlay');
                        if (creditsModal) {
                            creditsModal.classList.add('active');
                        } else {
                            alert("You do not have enough credits to view the thermal forecast.");
                        }
                        return;
                    }

                    // 4. Place Marker and Fetch Thermal Data
                    try {
                        console.log("Placing marker and fetching thermal data...");
                        await placeMarkerAndFetch(map, lat, lng, asl);
                        console.log("Thermal data fetched and marker placed.");
                        expandThermalPanel();

                        // 5. Update History and Last Clicked Location
                        const sun = getSunPosition(lat, lng);
                        let label = `${lat.toFixed(1)}, ${lng.toFixed(1)}`; // Default to 3 digit (1 decimal) format

                        // reverse geocode
                        try {
                            const token = "pk.eyJ1IjoiYXRhbWFudHJhIiwiYSI6ImNtZGxrcnZrdjExZjQya3M1Nm9peGg3bGcifQ.jefvIQmFvkvVupd5ekfoSg";
                            const geoUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${token}&types=place,locality,neighborhood,district`;
                            const response = await fetch(geoUrl);
                            const data = await response.json();
                            if (data && data.features && data.features.length > 0) {
                                label = data.features[0].place_name;
                                // Optional: Simplify place name (e.g. remove postcode) if needed, but user asked for "Fethiye Türkiye" which place_name usually provides.
                            }
                        } catch (geoErr) {
                            console.warn("Reverse geocode failed, using coordinates", geoErr);
                        }

                        // Use helper to save properly with timestamp
                        saveToHistory({
                            lat,
                            lon: lng,
                            asl,
                            sun,
                            placeName: label
                        });

                        window.lastClickedLocation = { lat, lon: lng, asl, sun, label };
                        console.log("History and last clicked location updated.");

                    } catch (placeMarkerError) {
                        console.error("Error during placeMarkerAndFetch:", placeMarkerError);
                        alert("Failed to fetch thermal data. Please try again.");
                    }
                });
            });
            // *** END CONSOLIDATED MAP CLICK HANDLER ***

            // Initialize UI components that depend on map
            setupPanelToggle(map);
            setupThermalPanel(map);
            setupHistory(map);
            setupHotspotToggle(map);
            setupClickRadius(map);
            setupCalculator(map);

        } else {
            console.warn("Skipping map-dependent setups because map is not defined.");
        }

        console.log("Map application initialization complete.");

    } catch (err) {
        console.error("Failed to initialize map app (General Error):", err);
        const errorDisplay = document.createElement('div');
        errorDisplay.className = 'error-message';
        errorDisplay.style.cssText = "position:fixed; top:0; left:0; width:100%; background:red; color:white; text-align:center; padding:10px; z-index:9999;";
        errorDisplay.textContent = `App partially failed to load: ${err.message}. Refresh or try again later.`;
        document.body.prepend(errorDisplay);
    }
});