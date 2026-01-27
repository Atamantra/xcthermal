export function setupSkywaysToggle(mapOrView, callbacks) {
    const checkbox = document.getElementById('skywaysCheckbox');
    if (!checkbox) return;

    checkbox.addEventListener('change', (e) => {
        if (e.target.checked) {
            if (callbacks && callbacks.onEnable) {
                callbacks.onEnable(mapOrView);
            }
        } else {
            if (callbacks && callbacks.onDisable) {
                callbacks.onDisable(mapOrView);
            }
        }
    });
}
