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

// Quick demo login helper
async function quickLoginDemo(username, password, redirectUrl) {
    try {
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        if (res.ok && data.success) {
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));
            if (redirectUrl) {
                window.location.href = redirectUrl;
            }
            return data.user;
        } else {
            alert('שגיאה בהתחברות מהירה: ' + (data.message || 'ודא שהשרת פעיל'));
        }
    } catch (err) {
        console.error('Quick login error:', err);
        alert('שגיאת תקשורת עם השרת');
    }
}

/**
 * Auth guard for worker pages. Call at the top of DOMContentLoaded.
 * Checks for a valid JWT token via /api/auth/me. If not authenticated,
 * redirects to /login.html with a ?redirect= parameter so the user
 * returns to the original page after logging in.
 * Returns the user object on success, or null (and redirects) on failure.
 */
async function requireAuth() {
    const token = getAuthToken();
    if (!token) {
        window.location.href = '/login.html?redirect=' + encodeURIComponent(window.location.pathname);
        return null;
    }
    try {
        const res = await fetch('/api/auth/me', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) {
            clearLocalLogin();
            window.location.href = '/login.html?redirect=' + encodeURIComponent(window.location.pathname);
            return null;
        }
        const data = await res.json();
        return data.user || data;
    } catch (err) {
        clearLocalLogin();
        window.location.href = '/login.html?redirect=' + encodeURIComponent(window.location.pathname);
        return null;
    }
}
