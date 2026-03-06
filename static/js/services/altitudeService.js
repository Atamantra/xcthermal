
export async function fetchAltitude(lat, lon, authModalOverlay) {
  try {
    const res = await fetch(`/api/altitude?lat=${lat}&lon=${lon}`);
    if (!res.ok) {
      if (res.status === 401 && authModalOverlay) {
        authModalOverlay.classList.add('active');
      }
      console.error(`Error fetching altitude: ${res.status} ${res.statusText}`);
      return null;
    }
    const json = await res.json();
    return json.altitude || 0;
  } catch (err) {
    console.warn("Failed to fetch ASL. Using 0m.", err);
    return 0;
  }
}
