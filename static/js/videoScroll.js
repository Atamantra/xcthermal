
document.addEventListener('DOMContentLoaded', () => {
    const video = document.getElementById('promoVideo');
    const videoSection = document.getElementById('video-section');

    if (!video || !videoSection) return;

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                // Video is visible
                video.classList.add('visible');
                video.play().catch(e => console.log('Autoplay prevented:', e));
            } else {
                // Video is not visible
                video.pause();
                video.classList.remove('visible');
            }
        });
    }, {
        threshold: 0.5 // Trigger when 50% visible
    });

    observer.observe(videoSection);

    // Optional: Parallax or other effects could go here

    // Handle Map Scroll Issue?
    // If the user swipes on the map, Mapbox consumes the event.
    // If we want to allow "pull down" from top of map to scroll page, 
    // it's tricky with Mapbox. 
    // However, if the user interacts with the UI (sidebar etc) scroll works.
    // The "scroll hint" button provides a clear way to navigate.
});
