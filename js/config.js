// API Configuration - SINGLE SOURCE OF TRUTH
const API_BASE_URL = "https://moodwave-backend-1.onrender.com"; 


// Token management
let authToken = null;

function setAuthToken(token) {
    authToken = token;
    if (token) {
        localStorage.setItem('token', token);
    } else {
        localStorage.removeItem('token');
    }
}

function getAuthToken() {
    return authToken || localStorage.getItem('token');
}

function clearAuthToken() {
    authToken = null;
    localStorage.removeItem('token');
    localStorage.removeItem('user');
}

// Generic API request function
async function apiRequest(endpoint, options = {}) {
    const url = `${API_BASE_URL}${endpoint}`;
    const token = getAuthToken();
    
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };
    
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    
    const response = await fetch(url, {
        ...options,
        headers,
        credentials: 'include'
    });
    
    const data = await response.json();
    
    if (!response.ok) {
        throw new Error(data.message || 'Request failed');
    }
    
    return data;
}

// Export for use in Vue (make globally available)
window.API_BASE_URL = API_BASE_URL;
window.apiRequest = apiRequest;
window.setAuthToken = setAuthToken;
window.getAuthToken = getAuthToken;
window.clearAuthToken = clearAuthToken;