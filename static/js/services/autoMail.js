/**
 * static/js/services/autoMail.js
 * Exports the email sending logic to be used by aiService.js
 */

export async function sendEmail(email, interpretationText, lat, lon, asl) {
    const statusMsg = document.getElementById('email-status-msg');
    const sendBtn = document.getElementById('btn-send-email');

    // UI Loading State
    sendBtn.disabled = true;
    sendBtn.innerText = "Sending...";
    statusMsg.innerText = "";
    statusMsg.style.color = '#666';

    try {
        const response = await fetch('/api/send-interpretation-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                email: email, 
                interpretation: interpretationText,
                lat: lat,
                lon: lon,
                asl: asl
            })
        });

        const data = await response.json();

        if (response.ok) {
            statusMsg.style.color = '#51cf66'; // Green
            statusMsg.innerText = "Email sent successfully! Check your inbox.";
            document.getElementById('recipient-email').value = ""; // Clear input
        } else {
            statusMsg.style.color = '#ff6b6b'; // Red
            statusMsg.innerText = "Error: " + (data.error || "Failed to send.");
        }
    } catch (error) {
        console.error("AutoMail Error:", error);
        statusMsg.style.color = '#ff6b6b';
        statusMsg.innerText = "Network Error. Please try again.";
    } finally {
        sendBtn.disabled = false;
        sendBtn.innerText = "Send";
    }
}