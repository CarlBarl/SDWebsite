function openApp() {
    // Try to open the mobile app using deep linking
    const appScheme = 'studentdiscount://';
    const playStoreUrl = 'https://play.google.com/store/apps/details?id=com.pvt.pvt152live1';
    const appStoreUrl = 'https://apps.apple.com/app/student-discount/id123456789'; // Replace with actual App Store ID
    
    // Detect if user is on mobile
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    if (isMobile) {
        // Try to open the app
        window.location.href = appScheme;
        
        // Fallback to app stores if app is not installed
        setTimeout(() => {
            if (/Android/i.test(navigator.userAgent)) {
                window.location.href = playStoreUrl;
            } else if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
                window.location.href = appStoreUrl;
            }
        }, 2000);
    } else {
        // On desktop, show a message or redirect to download page
        alert('Please open the Student Discount app on your mobile device to continue.');
    }
}

function closeWindow() {
    // Try to close the window/tab
    window.close();
    
    // If window.close() doesn't work (some browsers restrict it),
    // redirect to a thank you message
    setTimeout(() => {
        document.body.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: center; min-height: 100vh; font-family: 'Segoe UI', sans-serif;">
                <div style="text-align: center; color: #4C655D;">
                    <h2>Thank you!</h2>
                    <p>You can now close this tab.</p>
                </div>
            </div>
        `;
    }, 1000);
}

function redirectToAdminLogin() {
    window.location.href = '/admin-login.html';
}

// Auto-close after 30 seconds if user doesn't interact
setTimeout(() => {
    closeWindow();
}, 30000);
