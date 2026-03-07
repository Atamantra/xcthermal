console.log("Main.js loaded and executing...");
window.addEventListener("error", function (e) {
    const err = document.createElement('div');
    err.style.cssText = "position:fixed; top:0; left:0; right:0; background:red; color:white; z-index:99999; padding:10px; font-family:monospace;";
    err.textContent = "GLOBAL ERROR: " + e.message + " in " + e.filename + ":" + e.lineno;
    document.body.appendChild(err);
});

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
import { setupFlightManager } from './ui/flightManager.js';
import { logActivity } from './utils/tracking.js';
import { setupWeatherOverlay } from './map/weatherOverlay.js';

window.showXcPerfectConfirm = showXcPerfectConfirm;
window.isXcPerfectSelecting = false;

// Flight Footer Toggle
window.toggleFlightFooter = function () {
    const footer = document.getElementById('flight-analysis-footer');
    if (footer) {
        footer.classList.toggle('expanded');
    }
}

// 3D View Toggle logic moved to setupStyleToggle callback interaction in initApp

const authModalOverlay = document.getElementById('authModalOverlay');

let currentTutorialStep = 0;
let tutorialDummyMarker = null; // Track the dummy marker

function getTutorialSteps() {
    const lang = localStorage.getItem('aiLanguage') || 'en';
    const t = (window.translations && window.translations[lang]) ? window.translations[lang] : {
        tutFindLocationsTitle: 'Find Locations', tutFindLocationsText: 'Start by searching for any location worldwide.',
        tutSettingsTitle: 'Settings', tutSettingsText: 'Customize units, map styles, and AI preferences here.',
        tutClickLocationTitle: 'Click Location', tutClickLocationText: 'Click anywhere on the map to view detailed thermal forecasts.',
        tutAdvancedMeteogramsTitle: 'Advanced Meteograms', tutAdvancedMeteogramsText: 'Access detailed Meteoblue meteograms here to analyze cloud base, wind, and thermal quality.',
        tutAIInterpretationTitle: 'AI Interpretation', tutAIInterpretationText: 'The most powerful feature! Click this to get an instant, expert analysis of the flying conditions.',
        tutMagicInProgressTitle: 'Magic in Progress', tutMagicInProgressText: 'Don\'t want to wait? Try sending reports to your email!'
    };

    return [
        {
            element: 'searchToggleBtn',
            title: t.tutFindLocationsTitle,
            text: t.tutFindLocationsText,
            position: 'right'
        },
        {
            element: 'settingsBtn',
            title: t.tutSettingsTitle,
            text: t.tutSettingsText,
            position: 'right',
            action: 'openSettings'
        },
        {
            element: 'map',
            title: t.tutClickLocationTitle,
            text: t.tutClickLocationText,
            position: 'center',
            action: 'dummyClick'
        },
        {
            element: 'statsButton',
            title: t.tutAdvancedMeteogramsTitle,
            text: t.tutAdvancedMeteogramsText,
            position: 'left'
        },
        {
            element: 'fakeAiToggleBtn',
            title: t.tutAIInterpretationTitle,
            text: t.tutAIInterpretationText,
            position: 'right',
            highlightClass: 'rainbow-glow'
        },
        {
            element: 'aiPanel',
            title: t.tutMagicInProgressTitle,
            text: t.tutMagicInProgressText,
            position: 'left',
            action: 'openAI'
        }
    ];
}

function showTutorialStep(stepIndex) {
    const tutorialSteps = getTutorialSteps();
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

        // Update Content
        tutorialTitle.textContent = step.title;
        tutorialText.textContent = step.text;

        const lang = localStorage.getItem('site_language') || 'en';
        const t = (window.translations && window.translations[lang]) ? window.translations[lang] : {
            tutSkipTour: "Skip Tour", tutPrevious: "Previous", tutNext: "Next", tutDone: "Done"
        };
        if (tutorialSkipBtn) tutorialSkipBtn.textContent = t.tutSkipTour;
        if (tutorialPrevBtn) tutorialPrevBtn.textContent = t.tutPrevious;
        if (tutorialNextBtn) tutorialNextBtn.textContent = t.tutNext;
        if (tutorialDoneBtn) tutorialDoneBtn.textContent = t.tutDone;

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
    getTutorialSteps().forEach(step => {
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


async function initApp() {
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
            const removePreloader = () => {
                const preloader = document.getElementById('antigravity-preloader');
                if (preloader && !preloader.classList.contains('hidden')) {
                    preloader.classList.add('hidden');
                    setTimeout(() => {
                        if (preloader) preloader.remove();
                    }, 1000);
                }
                // Show Logo
                const logo = document.getElementById('mapLogoContainer');
                if (logo) logo.classList.add('logo-visible');
            };

            // Remove on map load
            setTimeout(removePreloader, 500);
        } catch (mapErr) {
            console.error("Map failed to fully initialize:", mapErr);
            // Ensure preloader is removed even on error
            const preloader = document.getElementById('antigravity-preloader');
            if (preloader) preloader.remove();
        }

        // Safety Timeout: Force remove preloader after 3 seconds max, just in case
        setTimeout(() => {
            const preloader = document.getElementById('antigravity-preloader');
            if (preloader && !preloader.classList.contains('hidden')) {
                console.warn("Forcing preloader removal due to timeout.");
                preloader.classList.add('hidden');
                setTimeout(() => { if (preloader) preloader.remove(); }, 1000);
                const logo = document.getElementById('mapLogoContainer');
                if (logo) logo.classList.add('logo-visible');
            }
        }, 3000);

        if (map) {
            // UI and Map Feature Setups


            // Setup 3D Toggle with Callback for HUD/Player
            setupStyleToggle(map, (is3D) => {
                const hud = document.getElementById('telemetryHUD');
                const playbackBar = document.getElementById('playbackBar'); if (is3D) {
                    // Enable UI - DISABLED per user request to debug spikes
                    // if (hud) hud.style.display = 'flex';
                    // if (playbackBar) playbackBar.style.display = 'flex';

                    // Init Player if not exists - DISABLED
                    /*
                    if (!window.flightPlayer) {
                        try {
                            window.flightPlayer = new FlightPlayerUI();
                            window.flightPlayer.setTotalDuration(3600); // Mock duration

                            // Monkey-patch updatePlayButton to sync mini button
                            if (window.flightPlayer.updatePlayButton) {
                                const originalUpdate = window.flightPlayer.updatePlayButton.bind(window.flightPlayer);
                                window.flightPlayer.updatePlayButton = function () {
                                    originalUpdate();
                                    if (miniPlayBtn) {
                                        miniPlayBtn.innerHTML = this.isPlaying ? '⏸' : '▶';
                                        miniPlayBtn.style.paddingLeft = this.isPlaying ? '0' : '3px';
                                    }
                                };
                            }
                            console.log("flightPlayer initialized via StyleToggle");
                        } catch (e) {
                            console.error("Error initializing FlightPlayerUI:", e);
                        }
                    }
                    */
                } else {
                    // Disable UI
                    if (hud) hud.style.display = 'none';
                    if (playbackBar) playbackBar.style.display = 'none';

                    if (window.flightPlayer) {
                        window.flightPlayer.stopMockPlayback();
                    }
                }
            });

            // Weather wind toggle (sits below 3D button)
            try { setupWeatherOverlay(map); } catch (e) { console.error('Weather overlay setup failed:', e); }

            setupFlightDeepLink(map);

            // Geocoder setup
            setupGeocoder(map, (lat, lon) => {
                map.flyTo({ center: [lon, lat], zoom: 11 });
            });

            map.on('click', async (e) => {
                if (isCalculatorActive()) return;
                if (window.isXcPerfectSelecting) return;

                console.log("Map clicked. Coordinates:", e.lngLat.toArray());

                // 1. Authentication Check (Bypassed for testing)
                // if (!window.userIsAuthenticated) {
                //    console.log("User not authenticated. Showing auth modal.");
                //    if (authModalOverlay) authModalOverlay.classList.add('active');
                //    return;
                // }

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

                    // 3.5 Credit Check & Spending (Bypassed for testing)
                    /* Bypassed block removed */

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

            // Initialize UI components that depend on map - WRAPPED IN TRY-CATCH
            try { setupPanelToggle(map); } catch (e) { console.error("Failed to setup Panel Toggle:", e); }
            try { setupThermalPanel(map); } catch (e) { console.error("Failed to setup Thermal Panel:", e); }
            try { setupHistory(map); } catch (e) { console.error("Failed to setup History:", e); }
            try { setupHotspotToggle(map); } catch (e) { console.error("Failed to setup Hotspot Toggle:", e); }
            try { setupClickRadius(map); } catch (e) { console.error("Failed to setup Click Radius:", e); }
            try { setupCalculator(map); } catch (e) { console.error("Failed to setup Calculator:", e); }
            try { setupFlightManager(map); } catch (e) { console.error("Failed to setup Flight Manager:", e); }

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
}

async function setupFlightDeepLink(map) {
    const urlParams = new URLSearchParams(window.location.search);
    const flightId = urlParams.get('flight_id');

    if (flightId) {
        console.log(`Deep link detected for flight ${flightId}`);
        try {
            // Import dynamically if possible, or assume calculator is available via bundle/globals
            // Since we are in main.js module, we can rely on imports.
            const { parseIGC, displayUploadedTrack } = await import('./ui/calculator.js');

            const response = await fetch(`/api/public/flight/${flightId}/track`);
            const data = await response.json();

            if (data.error || !data.content) {
                console.error("Failed to load flight:", data.error);
                return; // Silence or show toast
            }

            console.log("Flight track loaded from deep link. Parsing...");
            const parsed = parseIGC(data.content);

            if (parsed.coords.length > 0) {
                displayUploadedTrack(map, parsed);

                // Zoom to track
                const bounds = new mapboxgl.LngLatBounds();
                parsed.coords.forEach(c => bounds.extend(c));
                map.fitBounds(bounds, { padding: 50 });

                // Update info or show alert
                if (window.showCustomAlert) {
                    window.showCustomAlert(`Viewing flight by ${data.pilot || 'Pilot'}`, "info");
                }
            }

        } catch (err) {
            console.error("Error handling flight deep link:", err);
        }
    }
}


// Safari-safe: ES modules are deferred, so DOMContentLoaded may have
// already fired by the time this code runs. Check readyState first.
if (document.readyState === 'loading') {
    document.addEventListener("DOMContentLoaded", initApp);
} else {
    initApp();
}