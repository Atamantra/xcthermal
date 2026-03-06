/**
 * Logs user activity to the backend database.
 * @param {string} action - Short identifier for the action (e.g., 'map_click', 'search').
 * @param {object|string} details - Additional data (e.g., {lat: 123, lon: 456}).
 */
export function logActivity(action, details = {}) {
    try {
        fetch('/api/app_log', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                action: action,
                details: JSON.stringify(details)
            })
        }).catch(err => console.warn("Background logging failed", err));
    } catch (e) {
        // Silently fail to not disrupt user experience
    }
}
