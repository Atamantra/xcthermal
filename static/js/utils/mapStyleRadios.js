// utils/mapStyleRadios.js
export function setupMapStyleRadios(map) {
  const radioInputs = document.querySelectorAll('input[name="mapStyle"]');
  const mapStyles = {
    outdoors: "mapbox://styles/mapbox/outdoors-v12",
    satellite: "mapbox://styles/mapbox/satellite-v9",
  };

  radioInputs.forEach((input) => {
    input.addEventListener("change", () => {
      const selectedStyle = input.value;
      map.setStyle(mapStyles[selectedStyle]);
      map.once('styledata', () => {
        if (!map.hasImage("paraglider")) {
          map.loadImage("/static/paraglider.png", (err, image) => {
            if (!err && image) map.addImage("paraglider", image);
          });
        }
        import('../map/paraglidingSites.js').then(({ loadParaglidingSites }) => {
          loadParaglidingSites(map);
        });
        import('./debounce.js').then(({ debounce }) => {
          const debouncedReload = debounce(() => loadParaglidingSites(map), 500);
          map.on("moveend", debouncedReload);
        });
      });
    });
  });
}
