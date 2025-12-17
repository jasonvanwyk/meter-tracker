// Authentication utilities for Water Monitor frontend

const AUTH_TOKEN_KEY = 'authToken';
const AUTH_USER_KEY = 'authUser';

// Login user
async function login(username, password) {
    const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || data.errors?.[0]?.msg || 'Login failed');
    }

    // Store token and user info
    localStorage.setItem(AUTH_TOKEN_KEY, data.token);
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(data.user));

    // Redirect to main app
    window.location.href = '/';
}

// Register new user
async function register(username, password, email) {
    const body = { username, password };
    if (email) body.email = email;

    const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || data.errors?.[0]?.msg || 'Registration failed');
    }

    // Store token and user info
    localStorage.setItem(AUTH_TOKEN_KEY, data.token);
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(data.user));

    // Redirect to main app
    window.location.href = '/';
}

// Logout user
function logout() {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(AUTH_USER_KEY);
    window.location.href = '/login.html';
}

// Get auth token
function getAuthToken() {
    return localStorage.getItem(AUTH_TOKEN_KEY);
}

// Get current user info
function getCurrentUser() {
    const userStr = localStorage.getItem(AUTH_USER_KEY);
    return userStr ? JSON.parse(userStr) : null;
}

// Check if user is authenticated
function isAuthenticated() {
    return !!getAuthToken();
}

// Verify token is still valid
async function verifyToken() {
    const token = getAuthToken();
    if (!token) return false;

    try {
        const response = await fetch('/api/auth/me', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            // Token is invalid or expired
            logout();
            return false;
        }

        return true;
    } catch (error) {
        console.error('Token verification failed:', error);
        return false;
    }
}

// Make authenticated API call
async function apiCall(url, options = {}) {
    const token = getAuthToken();

    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(url, { ...options, headers });

    // Handle authentication errors
    if (response.status === 401 || response.status === 403) {
        logout();
        throw new Error('Authentication required');
    }

    return response;
}

// Require authentication - redirect to login if not authenticated
async function requireAuth() {
    if (!isAuthenticated()) {
        window.location.href = '/login.html';
        return false;
    }

    // Verify token is still valid
    const valid = await verifyToken();
    if (!valid) {
        return false;
    }

    return true;
}
