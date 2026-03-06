const settingsBtn = document.getElementById('settingsBtn');
const settingsPanel = document.getElementById('settingsPanel');
if (settingsBtn) {
    console.log("Found settings button", settingsBtn);
    settingsBtn.click();
    console.log("Settings panel classes after click:", settingsPanel?.className);
} else {
    console.log("Settings button not found");
}
