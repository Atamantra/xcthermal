
document.addEventListener('DOMContentLoaded', function() {
    const cookieBanner = document.getElementById('cookie-banner');
    const acceptBtn = document.getElementById('cookie-accept-btn');
    const declineBtn = document.getElementById('cookie-decline-btn');

    const consent = localStorage.getItem('cookie_consent');

    if (!consent) {
        cookieBanner.style.display = 'block';
    }

    acceptBtn.addEventListener('click', function() {
        localStorage.setItem('cookie_consent', 'accepted');
        cookieBanner.style.display = 'none';
    });

    declineBtn.addEventListener('click', function() {
        localStorage.setItem('cookie_consent', 'declined');
        cookieBanner.style.display = 'none';
    });
});
