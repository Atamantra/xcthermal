
export function enableSkyways2D(map) {
    console.log("enableSkyways2D called - layer checking/adding implementation missing in v1.1_3d");
    // Placeholder: Check if layer exists, if not add it, etc.
}

export function disableSkyways2D(map) {
    console.log("disableSkyways2D called");
    if (map.getLayer('skyways-layer')) {
        map.setLayoutProperty('skyways-layer', 'visibility', 'none');
    }
}
