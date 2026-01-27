import { translations } from '../ui/translations.js';

export function promptAltitude() {
  return new Promise(resolve => {
    const lang = localStorage.getItem('aiLanguage') || 'en';
    const t = translations[lang] || translations.en;

    // Elements
    const modal = document.getElementById('altitudeModal');
    const input = document.getElementById('altitudeInput');
    const promptText = document.getElementById('altitudePromptText');
    const confirmBtn = document.getElementById('altitudeConfirm');
    const cancelBtn = document.getElementById('altitudeCancel');

    // Set translated content
    promptText.textContent = t.altitudePrompt;
    input.placeholder = t.altitudePlaceholder;
    confirmBtn.textContent = t.confirm;
    cancelBtn.textContent = t.cancel;

    input.value = '';
    modal.classList.remove('hidden');
    input.focus();

    const close = () => modal.classList.add('hidden');

    confirmBtn.onclick = () => {
      const val = parseFloat(input.value);
      close();
      resolve(isNaN(val) ? null : val);
    };

    cancelBtn.onclick = () => {
      close();
      resolve(null);
    };

    input.onkeydown = (e) => {
      if (e.key === 'Enter') confirmBtn.click();
    };
  });
}
