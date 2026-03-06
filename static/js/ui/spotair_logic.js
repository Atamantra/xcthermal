document.addEventListener('DOMContentLoaded', () => {
    const spotairCheckbox = document.getElementById('spotairCheckbox');
    const overlay = document.getElementById('spotairOverlay');
    const iframe = document.getElementById('spotairIframe');
    const logoContainer = document.getElementById('mapLogoContainer');
    const creditPill = document.getElementById('creditPill');
    const settingsPanel = document.getElementById('settingsPanel');

    if (!spotairCheckbox) return;

    spotairCheckbox.addEventListener('change', (e) => {
        const isLiveMode = e.target.checked;

        if (isLiveMode) {
            // 1. Load the iframe (Auto Location enabled, Zoom 11)
            if (iframe && iframe.src === 'about:blank') {
                iframe.src = `https://www.spotair.mobi/widget/map?layers=wind,webcam&autolocation=1&zoom=11`;
            }

            // 2. Activate UI Overlay
            if (overlay) overlay.classList.add('visible');

            // 3. Move Logo
            if (logoContainer) {
                logoContainer.classList.add('centered-logo');
            }

            // 4. Hide Credit Pill
            if (creditPill) {
                creditPill.style.display = 'none';
            }

            // 5. Collapse Settings Panel
            if (settingsPanel) {
                settingsPanel.classList.remove('active');
            }

        } else {
            // Deactivate UI
            if (overlay) overlay.classList.remove('visible');

            // Reset Logo
            if (logoContainer) {
                logoContainer.classList.remove('centered-logo');
            }

            // Restore Credit Pill
            if (creditPill) {
                creditPill.style.display = 'flex';
            }
        }
    });
});
