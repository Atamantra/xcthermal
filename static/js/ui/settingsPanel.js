// settingsPanel.js
import { translations } from './translations.js';
window.translations = translations;


// Configuration: Change this URL to match your actual backend API
const API_URL = '/api/settings';

export async function setupSettingsPanel() {
  console.log("[settingsPanel.js] Initializing settings panel setup.");

  // 1. Get Elements
  const settingsBtn = document.getElementById('settingsBtn');
  const settingsPanel = document.getElementById('settingsPanel');
  const closeSettingsBtn = document.getElementById('closeSettingsBtn');

  // Inputs list - added skyways
  const inputs = {
    aiLanguage: document.getElementById('languageSelect'),
    unitSystem: document.getElementById('unitSelect'),
    aiPromptStyle: document.getElementById('aiPromptStyle'),
    mapStyle: document.getElementById('mapStyleSelect'),
    voiceStyle: document.getElementById('voiceStyleSelect')
  };

  if (!settingsPanel) {
    console.error("Critical Error: Element 'settingsPanel' not found.");
    return;
  }

  // 2. UI Interactions (Open/Close)
  if (settingsBtn) {
    settingsBtn.addEventListener('click', () => settingsPanel.classList.toggle('active'));
  }
  if (closeSettingsBtn) {
    closeSettingsBtn.addEventListener('click', () => settingsPanel.classList.remove('active'));
  }

  // 3. Attach Event Listeners to Inputs
  for (const [key, element] of Object.entries(inputs)) {
    if (element) {
      element.addEventListener('change', async (e) => {
        let newValue;

        // Checkbox handling
        if (element.type === 'checkbox') {
          newValue = element.checked ? 'true' : 'false';
        } else {
          newValue = e.target.value;
        }

        // A. Save to LocalStorage (Instant UI feedback)
        localStorage.setItem(key, newValue);

        // B. Apply specific logic (Map/Language)
        if (key === 'aiLanguage') applyLanguage(newValue);

        if (key === 'voiceStyle') {
          // Play a preview of the selected voice style when changed
          playVoicePreview(newValue, localStorage.getItem('aiLanguage') || 'en');
        }

        if (key === 'mapStyle' && window.currentMap) {
          window.currentMap.setStyle(newValue);
        }



        console.log(`[settingsPanel.js] ${key} changed to: ${newValue}`);

        // C. Send to Backend
        await saveSettingToBackend(key, newValue);
      });
    } else {
      console.warn(`Warning: Input element for '${key}' not found.`);
    }
  }

  // 4. Initialization Strategy
  // First, load what we have in LocalStorage (Fast)
  restoreLocalSettings(inputs);

  // Then, try to fetch the latest "Truth" from the backend (Reliable)
  await syncWithBackend(inputs);

  // Pre-fetch the voice previews in the background so they are instant
  preloadAllVoicePreviews();
}

// --- Preview function for TTS ---
const preloadedPreviews = {};

function preloadAllVoicePreviews() {
  const previewText = "xc thermal";
  const styles = ['journey-f', 'journey-m', 'journey-o', 'wavenet-a', 'wavenet-b', 'wavenet-c', 'wavenet-d'];
  const lang = localStorage.getItem('aiLanguage') || 'en';

  styles.forEach(style => {
    fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: previewText, language: lang, voiceStyle: style })
    })
      .then(res => res.json())
      .then(data => {
        if (data.audioContent) {
          preloadedPreviews[style] = new Audio('data:audio/mp3;base64,' + data.audioContent);
        }
      })
      .catch(err => console.error("TTS Preload Error for", style, err));
  });
}

function playVoicePreview(voiceStyle, language) {
  if (window.currentAudioPreview) {
    window.currentAudioPreview.pause();
  }

  // Use preloaded audio if available for instant playback
  if (preloadedPreviews[voiceStyle]) {
    window.currentAudioPreview = preloadedPreviews[voiceStyle];
    window.currentAudioPreview.currentTime = 0; // reset to beginning
    window.currentAudioPreview.play();
    return;
  }

  // Fallback if not preloaded
  const previewText = "xc thermal";
  fetch('/api/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: previewText,
      language: language,
      voiceStyle: voiceStyle
    })
  })
    .then(res => res.json())
    .then(data => {
      if (data.audioContent) {
        window.currentAudioPreview = new Audio('data:audio/mp3;base64,' + data.audioContent);
        window.currentAudioPreview.play();
      }
    })
    .catch(err => console.error("TTS Preview Error:", err));
}

// --- Helper Functions ---

function getBrowserLanguage() {
  const browserLang = (navigator.language || navigator.userLanguage || '').substring(0, 2).toLowerCase();
  const supportedLangs = ['en', 'de', 'fr', 'tr', 'it', 'es'];
  return supportedLangs.includes(browserLang) ? browserLang : 'en';
}

function restoreLocalSettings(inputs) {
  const defaults = {
    aiLanguage: getBrowserLanguage(),
    unitSystem: 'metric',
    aiPromptStyle: 'xc',
    mapStyle: 'mapbox://styles/mapbox/satellite-streets-v12',
    voiceStyle: 'journey-f'
  };

  for (const [key, element] of Object.entries(inputs)) {
    if (element) {
      const savedValue = localStorage.getItem(key) || defaults[key];

      if (element.type === 'checkbox') {
        element.checked = (savedValue === 'true');
      } else {
        element.value = savedValue;
      }

      if (key === 'aiLanguage') applyLanguage(savedValue);
    }
  }
  console.log("[settingsPanel.js] Local settings restored.");
}

async function syncWithBackend(inputs) {
  if (!window.userIsAuthenticated) return;

  try {
    const response = await fetch(API_URL, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });

    if (response.ok) {
      const serverSettings = await response.json();

      for (const [key, value] of Object.entries(serverSettings)) {
        if (inputs[key] && value !== undefined && value !== null) {

          let strVal = String(value);
          if (typeof value === 'boolean') strVal = value ? 'true' : 'false';

          if (inputs[key].type === 'checkbox') {
            inputs[key].checked = (strVal === 'true');
          } else {
            inputs[key].value = strVal;
          }

          localStorage.setItem(key, strVal);

          if (key === 'aiLanguage') applyLanguage(strVal);
          if (key === 'mapStyle' && window.currentMap) window.currentMap.setStyle(strVal);
        }
      }
      console.log("[settingsPanel.js] Synced with backend data.");
    }
  } catch (error) {
    console.warn("[settingsPanel.js] Could not fetch settings from backend:", error);
  }
}

async function saveSettingToBackend(key, value) {
  if (!window.userIsAuthenticated) return;

  try {
    const payload = {};
    payload[key] = value;

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Server responded with ${response.status}`);
    }
  } catch (error) {
    console.error(`[settingsPanel.js] Failed to save ${key} to backend:`, error);
  }
}

export function getUserSettings() {
  return {
    language: localStorage.getItem('aiLanguage') || getBrowserLanguage(),
    unitSystem: localStorage.getItem('unitSystem') || 'metric',
    aiPromptStyle: localStorage.getItem('aiPromptStyle') || 'basic',
    mapStyle: localStorage.getItem('mapStyle') || 'mapbox://styles/mapbox/satellite-streets-v12',
    voiceStyle: localStorage.getItem('voiceStyle') || 'journey-f'
  };
}

function applyLanguage(lang = 'en') {
  const t = translations[lang] || translations.en;

  const elementsToTranslate = {
    settingsTitle: t.settings,
    labelLanguage: t.language + ':',
    labelUnits: t.units + ':',
    labelStyle: t.aiPromptStyle + ':',
    labelVoiceStyle: t.voiceStyle + ':',
    labelMapStyle: t.mapStyle + ':',
    historyToggle: t.history,
    aiToggleBtn: t.interpret,
    navLoginBtn: t.login,
    navRegisterBtn: t.register,
    navProfileBtn: t.profile,

    // New additions
    t_homeMenu: t.homeMenu,
    t_emailLabel: t.emailLabel,
    t_creditsLabel: t.creditsLabel,
    t_joinedLabel: t.joinedLabel,
    t_totalFlightHour: t.totalFlightHour,
    t_addCredits: t.addCredits,
    t_logout: t.logout,
    t_flightLogs: t.flightLogs,
    t_uploadFlight: t.uploadFlight,
    t_date: t.date,
    t_location: t.location,
    t_duration: t.duration,
    t_dist: t.dist,
    t_gain: t.gain,
    t_action: t.action,
    t_aiReports: t.aiReports,
    t_noAiReports: t.noAiReports,
    t_purchases: t.purchases,
    t_addCreditsProfile: t.addCreditsProfile,
    t_noTransactions: t.noTransactions,
    t_interpretationsTitle: t.interpretationsTitle,
    t_noTransactions2: t.noTransactions2,
    t_getCreditsTitle: t.getCreditsTitle,
    t_currentBalance: t.currentBalance,
    t_creditsText: t.creditsText,
    t_bestPrice: t.bestPrice,
    t_creditLabel1: t.creditLabel1,
    t_securePayment: t.securePayment,
    t_conversionRate: t.conversionRate,
    t_welcomeTo: t.welcomeTo,
    t_howItWorks: t.howItWorks
  };

  for (const id in elementsToTranslate) {
    const element = document.getElementById(id);
    if (element) {
      if (id === 'navLoginBtn' || id === 'navRegisterBtn' || id === 'navProfileBtn') {
        element.textContent = elementsToTranslate[id];
      } else if (id === 't_welcomeExplanation') {
        element.innerHTML = elementsToTranslate[id]; // Use innerHTML to preserve syntax
      } else {
        element.textContent = elementsToTranslate[id];
      }
    }
  }

  const hotspotLabel = document.querySelector('#hotspotToggleContainer .label-text');
  if (hotspotLabel) hotspotLabel.textContent = t.hotspots;

  const viewText = document.querySelector('.btn-text-view');
  if (viewText) viewText.textContent = t.view;

  const liveText = document.querySelector('.btn-text-live');
  if (liveText) liveText.textContent = t.live;

  const aiPromptStyleSelect = document.getElementById('aiPromptStyle');
  if (aiPromptStyleSelect) {
    const basicOption = aiPromptStyleSelect.querySelector('option[value="basic"]');
    const pilotOption = aiPromptStyleSelect.querySelector('option[value="pilot"]');
    const xcOption = aiPromptStyleSelect.querySelector('option[value="xc"]');
    const tandemOption = aiPromptStyleSelect.querySelector('option[value="tandem"]');
    const expertOption = aiPromptStyleSelect.querySelector('option[value="expert"]');
    const speedOption = aiPromptStyleSelect.querySelector('option[value="speed"]');
    const acroOption = aiPromptStyleSelect.querySelector('option[value="acro"]');
    const ridgeOption = aiPromptStyleSelect.querySelector('option[value="ridge"]');

    if (basicOption) basicOption.textContent = t.basic;
    if (pilotOption) pilotOption.textContent = t.pilot;
    if (xcOption) xcOption.textContent = t.xc;
    if (tandemOption) tandemOption.textContent = t.tandem || "Tandem Pilot";
    if (expertOption) expertOption.textContent = t.expert || "Expert Level";
    if (speedOption) speedOption.textContent = t.speed || "Speed Flight";
    if (acroOption) acroOption.textContent = t.acro || "Acro Flight";
    if (ridgeOption) ridgeOption.textContent = t.ridge;
  }
}