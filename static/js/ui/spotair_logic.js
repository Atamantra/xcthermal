document.addEventListener('DOMContentLoaded', () => {
    const spotairCheckbox = document.getElementById('spotairCheckbox');
    const overlay = document.getElementById('spotairOverlay');
    const iframe = document.getElementById('spotairIframe');
    const logoContainer = document.getElementById('mapLogoContainer');

    if (!spotairCheckbox) return;

    spotairCheckbox.addEventListener('change', (e) => {
        const isLiveMode = e.target.checked;

        if (isLiveMode) {
            // 1. Load the iframe (Auto Location enabled, Zoom 11)
            if (iframe && iframe.src === 'about:blank') {
                iframe.src = `https://www.spotair.mobi/widget/map?layers=wind,webcam&autolocation=1&zoom=11`;
            }

            // 2. Activate UI Overlay
            if(overlay) overlay.classList.add('visible');

            // 3. Move Logo (Optional - keeping the previous behavior)
            if (logoContainer) {
                logoContainer.classList.add('centered-logo');
            }

        } else {
            // Deactivate UI
            if(overlay) overlay.classList.remove('visible');

            // Reset Logo
            if (logoContainer) {
                logoContainer.classList.remove('centered-logo');
            }
        }
    });
});
