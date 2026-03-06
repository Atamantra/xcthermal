import { getUserSettings } from '../ui/settingsPanel.js';
import { startLoadingGame, stopLoadingGame } from '../ui/cloudGame.js';
import { updateLatestHistory } from '../ui/history.js';
import { clearMarker } from './thermalService.js';

// --- STATE MANAGEMENT ---
let isAiLoading = false;
let isSpeaking = false;

// --- TTS HELPERS ---
function setupTTS() {
  const ttsBtn = document.getElementById('ttsBtn');
  const ttsStopBtn = document.getElementById('ttsStopBtn');
  if (!ttsBtn || !ttsStopBtn) return;

  ttsBtn.addEventListener('click', () => startSpeech());
  ttsStopBtn.addEventListener('click', () => stopSpeech());
}

function showTTS() {
  const c = document.getElementById('ttsContainer');
  if (c) c.style.display = 'flex';
  // Reset buttons
  const btn = document.getElementById('ttsBtn');
  const stop = document.getElementById('ttsStopBtn');
  const status = document.getElementById('ttsStatus');
  if (btn) { btn.style.display = 'inline-block'; btn.textContent = '🔊 Listen'; }
  if (stop) stop.style.display = 'none';
  if (status) status.textContent = '';
}

function hideTTS() {
  const c = document.getElementById('ttsContainer');
  if (c) c.style.display = 'none';
  stopSpeech();
}

let currentAudio = null;
let ttsQueue = [];
let isPlayingQueue = false;
let preloadedFirstAudio = null; // Store the first audio chunk in memory

function splitTextIntoChunks(text, maxLen) {
  const chunks = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }
    let splitAt = -1;
    // Look for sentence endings
    for (let i = maxLen; i >= 0; i--) {
      if (remaining[i] === '.' || remaining[i] === '!' || remaining[i] === '?' || remaining[i] === '\n') {
        splitAt = i + 1;
        break;
      }
    }
    // Fallback to comma if no period found
    if (splitAt <= 0) {
      for (let i = maxLen; i >= 0; i--) {
        if (remaining[i] === ',') {
          splitAt = i + 1;
          break;
        }
      }
    }
    if (splitAt <= 0) splitAt = maxLen; // Hard split
    chunks.push(remaining.substring(0, splitAt).trim());
    remaining = remaining.substring(splitAt).trim();
  }
  return chunks.filter(c => c.length > 0);
}

// Automatically downloads the first sentence in the background
export function preloadFirstTTSChunk() {
  const aiOutput = document.getElementById('aiOutput');
  const text = aiOutput ? aiOutput.innerText : "";
  if (!text || text.length < 10) return;

  const tempQueue = splitTextIntoChunks(text, 250);
  if (tempQueue.length === 0) return;

  const chunkText = tempQueue[0];
  const langCode = (localStorage.getItem('language') || 'en').toLowerCase();
  const voiceStyle = localStorage.getItem('voiceStyle') || 'journey-f';

  fetch('/api/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: chunkText, language: langCode, voiceStyle: voiceStyle })
  })
    .then(res => res.json())
    .then(data => {
      if (data.audioContent) {
        preloadedFirstAudio = new Audio('data:audio/mp3;base64,' + data.audioContent);
        console.log("TTS Preloaded successfully.");
      }
    })
    .catch(err => console.error("TTS Preload error:", err));
}

function startSpeech() {
  const aiOutput = document.getElementById('aiOutput');
  if (!aiOutput) return;

  stopSpeech();

  const text = aiOutput.innerText;
  if (!text || text.length < 10) return;

  ttsQueue = splitTextIntoChunks(text, 250);
  if (ttsQueue.length === 0) return;

  isSpeaking = true;
  isPlayingQueue = true;
  const btn = document.getElementById('ttsBtn');
  const stop = document.getElementById('ttsStopBtn');
  const status = document.getElementById('ttsStatus');
  if (btn) btn.style.display = 'none';
  if (stop) stop.style.display = 'inline-block';
  if (status) status.textContent = 'Speaking...';

  // If we successfully preloaded the first chunk, play it immediately
  if (preloadedFirstAudio) {
    ttsQueue.shift(); // Remove the first chunk we already downloaded
    currentAudio = preloadedFirstAudio;
    preloadedFirstAudio = null; // Clear the cache

    currentAudio.onended = () => {
      playNextChunk();
    };
    currentAudio.onerror = () => {
      console.error("Preloaded audio playback error");
      playNextChunk();
    };
    currentAudio.play();
  } else {
    // If it hasn't finished preloading or failed, download it normally
    playNextChunk();
  }
}

function playNextChunk() {
  if (!isPlayingQueue || ttsQueue.length === 0) {
    if (isPlayingQueue) finishSpeech();
    return;
  }

  const chunkText = ttsQueue.shift();
  const langCode = (localStorage.getItem('language') || 'en').toLowerCase();
  const voiceStyle = localStorage.getItem('voiceStyle') || 'journey-f';
  const status = document.getElementById('ttsStatus');

  fetch('/api/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: chunkText, language: langCode, voiceStyle: voiceStyle })
  })
    .then(res => res.json())
    .then(data => {
      if (data.error) throw new Error(data.error);

      if (isPlayingQueue) {
        if (status) status.textContent = 'Speaking...';
        currentAudio = new Audio('data:audio/mp3;base64,' + data.audioContent);
        currentAudio.onended = () => {
          playNextChunk();
        };
        currentAudio.onerror = () => {
          console.error("Audio playback error");
          playNextChunk();
        };
        currentAudio.play();
      }
    })
    .catch(err => {
      console.error(err);
      playNextChunk(); // Skip broken chunk and try the next one
    });
}

function finishSpeech() {
  isSpeaking = false;
  isPlayingQueue = false;
  const btn = document.getElementById('ttsBtn');
  const stop = document.getElementById('ttsStopBtn');
  const status = document.getElementById('ttsStatus');
  if (btn) { btn.style.display = 'inline-block'; btn.textContent = '🔊 Replay'; }
  if (stop) stop.style.display = 'none';
  if (status) status.textContent = 'Done';
}

function stopSpeech() {
  isSpeaking = false;
  isPlayingQueue = false;
  ttsQueue = [];

  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }

  const btn = document.getElementById('ttsBtn');
  const stop = document.getElementById('ttsStopBtn');
  const status = document.getElementById('ttsStatus');
  if (btn) { btn.style.display = 'inline-block'; btn.textContent = '🔊 Listen'; }
  if (stop) stop.style.display = 'none';
  if (status) status.textContent = '';
}

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

  // Initialize TTS button listeners
  setupTTS();
  // Preload voices (some browsers need this)
  if (typeof speechSynthesis !== 'undefined') {
    speechSynthesis.getVoices();
    speechSynthesis.onvoiceschanged = () => speechSynthesis.getVoices();
  }

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
          // Allow guest for free trial
          // if (aiOutput) aiOutput.innerHTML = `<p style="color:red; padding:10px;">Login required.</p>`;
          // return;
        }

        // START LOADING STATE
        isAiLoading = true;
        hideTTS(); // Hide TTS from previous interpretation

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

          // Save to History (only if successful or partial)

          if (result.error === 'FREE_TRIAL_ENDED') {
            // Show Free Trial Ended Popup immediately if they try again
            document.getElementById('freeTrialModalOverlay').classList.add('active');
            throw new Error(result.message);
          }

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

            // --- FREE TRIAL LOGIC ---
            if (result.free_trial) {
              const modalId = window.isFreeTrialMode ? 'signupEncouragementModal' : 'freeTrialModalOverlay';
              const onScroll = () => {
                if (aiOutput.scrollTop + aiOutput.clientHeight >= aiOutput.scrollHeight - 50) {
                  document.getElementById(modalId).classList.add('active');
                  aiOutput.removeEventListener('scroll', onScroll);
                }
              };
              aiOutput.addEventListener('scroll', onScroll);
              // Also trigger if content is short
              setTimeout(() => {
                if (aiOutput.scrollHeight <= aiOutput.clientHeight + 100) {
                  document.getElementById(modalId).classList.add('active');
                }
              }, 5000); // 5 seconds delay for short content
            }
          }

          // Save to History
          updateLatestHistory(result.interpretation);

          // Show TTS button now that interpretation is ready
          showTTS();

          // Preload the first chunk of audio in the background!
          preloadFirstTTSChunk();

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
    aiCloseBtn.addEventListener('click', closeAiPanel);
  }
}

// --- EXPORTED CLOSE FUNCTION ---
export function closeAiPanel() {
  const aiPanel = document.getElementById('aiPanel');
  if (aiPanel) aiPanel.classList.remove('active');

  stopLoadingGame();
  stopProgressAnimation();
  stopSpeech(); // Stop any ongoing TTS

  // Clear Overlay/Graphics
  clearMarker(); // Uses imported thermalService logic (2D)
  if (window.currentView && window.currentView.graphics) {
    window.currentView.graphics.removeAll(); // Logic for 3D
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

  // Re-select container after dynamic insert
  const newGameContainer = document.getElementById('gameContainer');
  if (newGameContainer) startLoadingGame(newGameContainer);
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