export function setupPanelToggle(map) {
  const toggleBtn = document.getElementById('searchToggleBtn');
  const searchWrapper = document.getElementById('searchWrapper');

  toggleBtn.addEventListener('click', () => {
    const isVisible = searchWrapper.style.display === 'block';
    searchWrapper.style.display = isVisible ? 'none' : 'block';
  });

  // Auto-hide when interacting with the map
  ['click', 'dragstart', 'zoomstart', 'touchstart'].forEach(event => {
    map.on(event, () => {
      if (searchWrapper.style.display === 'block') {
        searchWrapper.style.display = 'none';
      }
    });
  });
}
