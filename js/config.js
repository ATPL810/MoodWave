// API Configuration - SINGLE SOURCE OF TRUTH
// IMPORTANT: Change this to your actual Render URL
const API_BASE_URL = 'https://moodwave-backend-4.onrender.com/api';

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
    
    console.log(`🌐 API Request: ${options.method || 'GET'} ${url}`);
    
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };
    
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    
    try {
        const response = await fetch(url, {
            ...options,
            headers,
            credentials: 'include'
        });
        
        const data = await response.json();
        console.log(`📥 API Response:`, data);
        
        if (!response.ok) {
            throw new Error(data.message || 'Request failed');
        }
        
        return data;
    } catch (error) {
        console.error('API Error:', error);
        throw error;
    }
}

// Make available globally
window.API_BASE_URL = API_BASE_URL;
window.apiRequest = apiRequest;
window.setAuthToken = setAuthToken;
window.getAuthToken = getAuthToken;
window.clearAuthToken = clearAuthToken;

console.log('✅ Config loaded. API URL:', API_BASE_URL);