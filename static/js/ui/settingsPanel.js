// settingsPanel.js
import { translations } from './translations.js';

// Configuration: Change this URL to match your actual backend API
const API_URL = '/api/settings';

export async function setupSettingsPanel() {
  console.log("[settingsPanel.js] Initializing settings panel setup.");

  // 1. Get Elements
  const settingsBtn = document.getElementById('settingsBtn');
  const settingsPanel = document.getElementById('settingsPanel');
  const closeSettingsBtn = document.getElementById('closeSettingsBtn');

  const inputs = {
    aiLanguage: document.getElementById('languageSelect'),
    unitSystem: document.getElementById('unitSelect'),
    aiPromptStyle: document.getElementById('aiPromptStyle'),
    mapStyle: document.getElementById('mapStyleSelect')
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
  // We loop through the inputs object to reduce code repetition
  for (const [key, element] of Object.entries(inputs)) {
    if (element) {
      element.addEventListener('change', async (e) => {
        const newValue = e.target.value;

        // A. Save to LocalStorage (Instant UI feedback)
        localStorage.setItem(key, newValue);

        // B. Apply specific logic (Map/Language)
        if (key === 'aiLanguage') applyLanguage(newValue);
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
  // This handles cases where the user changed settings on a different device
  await syncWithBackend(inputs);
}

// --- Helper Functions ---

function restoreLocalSettings(inputs) {
  const defaults = {
    aiLanguage: 'en',
    unitSystem: 'metric',
    aiPromptStyle: 'xc',
    mapStyle: 'mapbox://styles/mapbox/satellite-streets-v12'
  };

  for (const [key, element] of Object.entries(inputs)) {
    if (element) {
      const savedValue = localStorage.getItem(key) || defaults[key];
      element.value = savedValue;

      // Apply side effects immediately
      if (key === 'aiLanguage') applyLanguage(savedValue);
      // Note: Map style usually waits for map load, handled separately in map logic
    }
  }
  console.log("[settingsPanel.js] Local settings restored.");
}

/**
 * Fetches settings from the database and updates UI + LocalStorage
 */
async function syncWithBackend(inputs) {
  try {
    const response = await fetch(API_URL, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' } // Add Auth headers here if needed
    });

    if (response.ok) {
      const serverSettings = await response.json();

      // Iterate through server data and update if different
      for (const [key, value] of Object.entries(serverSettings)) {
        if (inputs[key] && value) {
          inputs[key].value = value;
          localStorage.setItem(key, value); // Sync local storage

          if (key === 'aiLanguage') applyLanguage(value);
          if (key === 'mapStyle' && window.currentMap) window.currentMap.setStyle(value);
        }
      }
      console.log("[settingsPanel.js] Synced with backend data.");
    }
  } catch (error) {
    console.warn("[settingsPanel.js] Could not fetch settings from backend (Offline?):", error);
  }
}

/**
 * Sends a single setting change to the database
 */
async function saveSettingToBackend(key, value) {
  try {
    const payload = {};
    payload[key] = value;

    const response = await fetch(API_URL, {
      method: 'POST', // or PATCH
      headers: {
        'Content-Type': 'application/json'
        // 'Authorization': 'Bearer ' + token // If you use tokens
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Server responded with ${response.status}`);
    }
  } catch (error) {
    console.error(`[settingsPanel.js] Failed to save ${key} to backend:`, error);
    // Optional: Show a "Save Failed" toast notification here
  }
}

export function getUserSettings() {
  return {
    language: localStorage.getItem('aiLanguage') || 'en',
    unitSystem: localStorage.getItem('unitSystem') || 'metric',
    aiPromptStyle: localStorage.getItem('aiPromptStyle') || 'basic',
    mapStyle: localStorage.getItem('mapStyle') || 'mapbox://styles/mapbox/satellite-streets-v12'
  };
}

function applyLanguage(lang = 'en') {
  const t = translations[lang] || translations.en;

  const elementsToTranslate = {
    settingsTitle: t.settings,
    labelLanguage: t.language + ':',
    labelUnits: t.units + ':',
    labelStyle: t.aiPromptStyle + ':',
    labelMapStyle: t.mapStyle + ':',
    historyToggle: t.history,
    aiToggleBtn: t.interpret,
    navLoginBtn: t.login,
    navRegisterBtn: t.register,
    navProfileBtn: t.profile,
    // For Logout, we might need to find the link if it doesn't have an ID
  };

  for (const id in elementsToTranslate) {
    const element = document.getElementById(id);
    if (element) {
      // Handle special cases where element has other children (like nav Login/Register)
      // Or if it's an input/button with a specific structure
      if (id === 'navLoginBtn' || id === 'navRegisterBtn' || id === 'navProfileBtn') {
        element.textContent = elementsToTranslate[id];
      } else {
        element.textContent = elementsToTranslate[id];
      }
    }
  }

  // Class-based translations
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
    if (speedOption) speedOption.textContent = t.speed || "Speed Flight"; // Add translation logic
    if (acroOption) acroOption.textContent = t.acro || "Acro Flight";     // Add translation logic
    if (ridgeOption) ridgeOption.textContent = t.ridge;
  }
}