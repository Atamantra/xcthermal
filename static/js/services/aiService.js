import { getUserSettings } from '../ui/settingsPanel.js';
import { startLoadingGame, stopLoadingGame } from '../ui/cloudGame.js';
import { updateLatestHistory } from '../ui/history.js';

// --- STATE MANAGEMENT ---
let isAiLoading = false;

function getLatestWeatherDataFromHistory() {
  try {
    const history = JSON.parse(localStorage.getItem("weatherHistory") || "{}");
    const keys = Object.keys(history);
    if (keys.length === 0) return null;
    return history[keys[keys.length - 1]];
  } catch (e) { return null; }
}

// --- MAIN SETUP ---
export function setupAIInterpretation() {
  const aiToggleBtn = document.getElementById('aiToggleBtn');
  const aiPanel = document.getElementById('aiPanel');
  const aiCloseBtn = document.getElementById('aiCloseBtn');
  const aiOutput = document.getElementById('aiOutput');
  // const emailContainer = document.getElementById('email-report-container'); // NOW USING CLASSES

  // --- 1. GLOBAL CLICK LISTENER FOR EMAIL BUTTON ---
  document.addEventListener('click', async (e) => {
    if (e.target && e.target.classList.contains('btn-send-email')) {
      e.preventDefault();
      const btn = e.target;
      const container = btn.closest('.email-report-container');
      const emailInput = container.querySelector('.recipient-email-input');
      const email = emailInput ? emailInput.value : '';
      const statusMsg = container.querySelector('.email-status-msg');

      if (!email || !email.includes('@')) {
        if (statusMsg) {
          statusMsg.innerText = "Invalid email";
          statusMsg.style.color = "red";
        }
        return;
      }

      const latest = getLatestWeatherDataFromHistory();
      if (!latest) {
        if (statusMsg) statusMsg.innerText = "No location data.";
        return;
      }

      btn.disabled = true;
      btn.innerText = "Sending...";

      // --- LOGIC SPLIT: WAITING VS FINISHED ---
      let apiUrl = '/api/send-interpretation-email'; // Default: Send existing text
      let payload = {
        email: email,
        lat: latest.lat,
        lon: latest.lon,
        asl: latest.asl || 0,
        interpretation: aiOutput ? aiOutput.innerText : ""
      };

      if (isAiLoading) {
        // USER DIDN'T WANT TO WAIT
        apiUrl = '/api/interpret-and-email'; // New Background Route
        // We don't send 'interpretation' text because it doesn't exist yet
      }

      try {
        const resp = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        // Robust Error Handling: Check if response is actually JSON
        const contentType = resp.headers.get("content-type");
        if (contentType && contentType.indexOf("application/json") !== -1) {
          const data = await resp.json();
          if (resp.ok) {
            if (statusMsg) {
              statusMsg.innerText = isAiLoading ? "Queued! We'll email you shortly." : "Sent successfully!";
              statusMsg.style.color = "green";
            }
            if (isAiLoading) {
              // If queued, we can stop the game and close the panel
              setTimeout(() => {
                aiPanel.classList.remove('active');
                stopLoadingGame();
                stopProgressAnimation();
              }, 2000);
            }
          } else {
            if (statusMsg) {
              statusMsg.innerText = "Error: " + (data.error || "Failed");
              statusMsg.style.color = "red";
            }
          }
        } else {
          // If not JSON, it's likely a 404 or 500 HTML error page
          const text = await resp.text();
          console.error("Server Error Response:", text);
          if (statusMsg) {
            statusMsg.innerText = `Server Error (${resp.status})`;
            statusMsg.style.color = "red";
          }
        }
      } catch (err) {
        console.error(err);
        if (statusMsg) {
          statusMsg.innerText = "Connection Error";
          statusMsg.style.color = "red";
        }
      } finally {
        btn.disabled = false;
        btn.innerText = "Send";
      }
    }
  });

  // --- 2. INTERPRET BUTTON CLICK ---
  if (aiToggleBtn) {
    aiToggleBtn.addEventListener('click', async () => {
      aiPanel.classList.toggle('active');

      if (aiPanel.classList.contains('active')) {

        const latest = getLatestWeatherDataFromHistory();
        if (!latest || !latest.lat) {
          if (aiOutput) aiOutput.innerHTML = `<p style="color:red; padding:10px;">Select a location first.</p>`;
          return;
        }
        if (!window.userIsAuthenticated) {
          if (aiOutput) aiOutput.innerHTML = `<p style="color:red; padding:10px;">Login required.</p>`;
          return;
        }

        // START LOADING STATE
        isAiLoading = true;

        // FORCE EMAIL BUTTON TO BE VISIBLE ("Underneath the game")
        const emailContainers = document.querySelectorAll('.email-report-container');
        emailContainers.forEach(container => {
          container.style.display = 'block';
          const sMsg = container.querySelector('.email-status-msg');
          if (sMsg) {
            sMsg.innerText = "Enter email to receive report when ready.";
            sMsg.style.color = "#888";
          }
        });

        // RENDER GAME
        if (aiOutput) {
          aiOutput.innerHTML = `
                <div class="ai-loading-container">
                    <div id="aiLoader" class="circular-progress" style="--progress: 65%"><span id="aiProgressText"></span></div>
                    <div id="aiLoadingText">Analyzing Atmosphere...</div>
                    <div style="font-size:0.8rem; opacity:0.7; margin-top:5px;">Don't want to wait? Enter your email below.</div>
                    <div id="gameContainer"></div>
                </div>
              `;
        }

        const gameContainer = document.getElementById('gameContainer');
        const loaderEl = document.getElementById('aiLoader');

        if (gameContainer) startLoadingGame(gameContainer);
        if (loaderEl) startProgressAnimation(loaderEl);

        try {
          // FETCH LIVE INTERPRETATION
          const settings = getUserSettings();
          // Note: unitSystem is not sent to backend as Open-Meteo handles it or backend defaults to metric? 
          // Wait, backend uses Open-Meteo defaults (metric). If I want to support units, I should send it.
          // But the prompt asks to CHECK if units are working.
          // Currently `app.py` doesn't seem to take `units` in `/api/interpret`.

          // Prepare Payload with Checkpoint Data
          const payload = {
            lat: latest.lat,
            lon: latest.lon,
            asl: latest.asl || 0,
            language: settings.language,
            style: settings.aiPromptStyle,
            units: settings.unitSystem
          };

          // Gather Camera/Map State for Checkpoint
          if (window.currentView && window.currentView.type === '3d') {
            // 3D Mode
            payload.map_type = '3d';
            payload.zoom = window.currentView.zoom;
            payload.pitch = window.currentView.camera.tilt;
            payload.bearing = window.currentView.camera.heading;
          } else if (window.currentMap) {
            // 2D Mode
            payload.map_type = '2d';
            payload.zoom = window.currentMap.getZoom();
            payload.pitch = window.currentMap.getPitch();
            payload.bearing = window.currentMap.getBearing();
          }

          const response = await fetch('/api/interpret', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
          });

          const result = await response.json();

          if (!response.ok) throw new Error(result.error || "Error");

          // FINISHED STATE
          isAiLoading = false;
          stopLoadingGame();
          stopProgressAnimation();

          if (aiOutput) {
            if (typeof marked !== 'undefined') {
              aiOutput.innerHTML = marked.parse(result.interpretation);
            } else {
              aiOutput.textContent = result.interpretation;
            }
          }

          // Save to History
          updateLatestHistory(result.interpretation);

          // Update status message to reflect instant send availability
          const allStatusMsgs = document.querySelectorAll('.email-status-msg');
          allStatusMsgs.forEach(msg => msg.innerText = "Report ready. Save it?");

        } catch (err) {
          isAiLoading = false;
          stopLoadingGame();
          stopProgressAnimation();
          if (aiOutput) aiOutput.innerHTML = `<div style="color:red; padding:10px;">Error: ${err.message}</div>`;
        }
      } else {
        stopLoadingGame();
        stopProgressAnimation();
      }
    });
  }

  if (aiCloseBtn) {
    aiCloseBtn.addEventListener('click', () => {
      aiPanel.classList.remove('active');
      stopLoadingGame();
      stopProgressAnimation();
    });
  }
}

// --- PROGRESS ANIMATION HELPERS ---
let progressInterval;

function startProgressAnimation(el) {
  stopProgressAnimation(); // clear any existing
  let progress = 1;
  const maxProgress = 99;

  updateProgressUI(el, progress);

  // Update every 500ms to 1500ms randomly
  const updateStep = () => {
    if (progress >= maxProgress) return;

    // Random increment between 1 and 3
    const jump = Math.random() * 2 + 1;
    progress += jump;
    if (progress > maxProgress) progress = maxProgress;

    updateProgressUI(el, progress);

    // Random delay for next step to look realistic
    const delay = Math.random() * 1000 + 500; // 0.5s to 1.5s
    progressInterval = setTimeout(updateStep, delay);
  };

  progressInterval = setTimeout(updateStep, 500);
}

function updateProgressUI(el, value) {
  const rounded = Math.round(value);
  el.style.setProperty('--progress', `${rounded}%`);
  el.setAttribute('data-value', rounded); // For CSS content
}

function stopProgressAnimation() {
  if (progressInterval) clearTimeout(progressInterval);
}


// --- NEW ROUTE INTERPRETATION ---
export async function interpretRoute(points) {
  const aiPanel = document.getElementById('aiPanel');
  const aiOutput = document.getElementById('aiOutput');
  const emailContainers = document.querySelectorAll('.email-report-container'); // Changed to all
  const gameContainer = document.getElementById('gameContainer');
  const loaderEl = document.getElementById('aiLoader');

  if (!aiPanel) return;

  // 1. Open Panel
  aiPanel.classList.add('active');

  // 2. Auth Check
  if (!window.userIsAuthenticated) {
    if (aiOutput) aiOutput.innerHTML = `<p style="color:red; padding:10px;">Login required to interpret routes.</p>`;
    return;
  }

  // 3. UI Setup for Route Loading
  isAiLoading = true;
  emailContainers.forEach(c => c.style.display = 'none'); // Hide for now until logic is ready? Or show it?
  // User didn't ask for route email yet, but let's hide to be safe or keep it hidden as default.
  // Actually, let's keep it 'none' similar to before.

  if (aiOutput) {
    aiOutput.innerHTML = `
            <div class="ai-loading-container">
                <div id="aiLoader" class="circular-progress" style="--progress: 10%"><span id="aiProgressText"></span></div>
                <div id="aiLoadingText">Analyzing Full Route...</div>
                <div style="font-size:0.8rem; opacity:0.7; margin-top:5px; padding:0 20px;">
                    Checking weather along ${points.length} turnpoints.<br>Fetching wind, clouds, and thermals...
                </div>
                <div id="gameContainer"></div>
            </div>
        `;
  }

  if (gameContainer) startLoadingGame(gameContainer);
  // Reuse progress animation helper if available (it relies on finding #aiLoader in DOM)
  // We need to re-select it since innerHTML wiped the old one
  const newLoader = document.getElementById('aiLoader');
  if (newLoader) startProgressAnimation(newLoader);

  try {
    const settings = getUserSettings();

    // Prepare payload: convert array of arrays to array of objects
    const routePayload = points.map(p => ({ lat: p[1], lon: p[0] }));

    const response = await fetch("/api/interpret-route", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        route: routePayload,
        style: settings.aiPromptStyle,
        language: settings.language,
        units: settings.unitSystem
      })
    });

    const result = await response.json();

    if (!response.ok) throw new Error(result.error || "Route analysis failed");

    isAiLoading = false;
    stopLoadingGame();
    stopProgressAnimation();

    if (aiOutput) {
      if (typeof marked !== 'undefined') {
        aiOutput.innerHTML = marked.parse(result.interpretation);
      } else {
        aiOutput.textContent = result.interpretation;
      }
    }

    // Note: History saving for routes is complex, skipping for now or saving as special entry?
    // Let's just update latest to the *first* point or leave as is.

  } catch (err) {
    isAiLoading = false;
    stopLoadingGame();
    stopProgressAnimation();
    if (aiOutput) aiOutput.innerHTML = `<div style="color:red; padding:10px;">Error: ${err.message}</div>`;
  }
}