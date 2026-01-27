export function showClickConfirm(callback) {
  // Remove existing modal if it exists
  const existing = document.getElementById('clickConfirmModal');
  if (existing) existing.remove();

  // Create Modal Elements
  const modal = document.createElement('div');
  modal.id = 'clickConfirmModal';
  // Use existing auth-modal-overlay for consistent styling and behavior
  modal.classList.add('auth-modal-overlay');
  modal.classList.add('active'); // Directly activate it

  modal.innerHTML = `
      <div id="confirmContent" class="auth-modal-content glass-modal antigravity-modal">
        <div class="antigravity-scene">
          <div class="gravity-core"></div>
          <div class="gravity-ripple r1"></div>
          <div class="gravity-ripple r2"></div>
          <div class="gravity-ripple r3"></div>
        </div>
        <h3 style="margin-top: 15px; color: #ffffff; position: relative; z-index: 2;">Analyze this location?</h3>
        <p class="credit-usage-text" style="font-size: 0.9rem; color: rgba(255,255,255,0.8) !important; position: relative; z-index: 2;">1 Credit Will Be Used</p>
        <div style="margin-top: 20px; position: relative; z-index: 2;">
            <button id="confirmYes" class="confirmation-btn confirm">Yes</button>
            <button id="confirmNo" class="confirmation-btn cancel">Cancel</button>
        </div>
      </div>
  `;

  document.body.appendChild(modal);

  // Event Listeners
  const yesBtn = modal.querySelector('#confirmYes');
  const noBtn = modal.querySelector('#confirmNo');

  const handleYes = () => {
    cleanup();
    callback(true);
  };

  const handleNo = () => {
    cleanup();
    callback(false);
  };

  const cleanup = () => {
    yesBtn.removeEventListener('click', handleYes);
    noBtn.removeEventListener('click', handleNo);
    modal.classList.remove('active'); // Deactivate overlay
    modal.remove();
  };

  yesBtn.addEventListener('click', handleYes);
  noBtn.addEventListener('click', handleNo);
}

export function showXcPerfectConfirm(callback) {
  // Remove existing modal if it exists
  const existing = document.getElementById('xcPerfectConfirmModal');
  if (existing) existing.remove();

  // Create Modal Elements
  const modal = document.createElement('div');
  modal.id = 'xcPerfectConfirmModal';
  // Use existing auth-modal-overlay for consistent styling and behavior
  modal.classList.add('auth-modal-overlay');
  modal.classList.add('active'); // Directly activate it

  modal.innerHTML = `
      <div id="xcPerfectContent" class="auth-modal-content glass-modal antigravity-modal">
        <div class="antigravity-scene">
          <div class="gravity-core" style="background: radial-gradient(circle, #007BFF, #0056b3);"></div>
          <div class="gravity-ripple r1" style="border-color: rgba(0, 123, 255, 0.6);"></div>
          <div class="gravity-ripple r2" style="border-color: rgba(0, 123, 255, 0.4);"></div>
          <div class="gravity-ripple r3" style="border-color: rgba(0, 123, 255, 0.2);"></div>
        </div>
        <h3 style="margin-top: 15px; color: #ffffff; position: relative; z-index: 2;">Set XcPerfect Location?</h3>
        <p class="credit-usage-text" style="font-size: 0.9rem; color: rgba(255,255,255,0.8) !important; position: relative; z-index: 2;">
            Do you want to update your daily interpreter coordinates to this location?
        </p>
        <div style="margin-top: 20px; position: relative; z-index: 2;">
            <button id="xcConfirmYes" class="confirmation-btn confirm" style="background: linear-gradient(135deg, #007BFF, #0056b3);">Yes</button>
            <button id="xcConfirmNo" class="confirmation-btn cancel">Cancel</button>
        </div>
      </div>
  `;

  document.body.appendChild(modal);

  // Event Listeners
  const yesBtn = modal.querySelector('#xcConfirmYes');
  const noBtn = modal.querySelector('#xcConfirmNo');

  const handleYes = () => {
    cleanup();
    callback(true);
  };

  const handleNo = () => {
    cleanup();
    callback(false);
  };

  const cleanup = () => {
    yesBtn.removeEventListener('click', handleYes);
    noBtn.removeEventListener('click', handleNo);
    modal.classList.remove('active');
    modal.remove();
  };

  yesBtn.addEventListener('click', handleYes);
  noBtn.addEventListener('click', handleNo);
}