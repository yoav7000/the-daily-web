// Helpers shared by the login, reporter and editor pages

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getAuthToken() {
    return localStorage.getItem('token');
}

function clearLocalLogin() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
}

// Ends the server session (so the cookie stops working) and clears the saved login
async function logout() {
    try {
        await fetch('/api/auth/logout', { method: 'POST' });
    } catch (err) {
        console.error('Logout request failed:', err);
    }
    clearLocalLogin();
    window.location.href = '/login.html';
}
