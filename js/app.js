// ==================== API CONFIGURATION ====================
const API_BASE_URL = 'https://moodwave-backend-4.onrender.com';

// Global API request function
window.apiRequest = async (endpoint, options = {}) => {
    const token = localStorage.getItem('token');
    
    const defaultOptions = {
        headers: {
            'Content-Type': 'application/json',
            ...(token && { 'Authorization': `Bearer ${token}` })
        },
        credentials: 'include'
    };
    
    const finalOptions = { ...defaultOptions, ...options };
    
    if (options.body && typeof options.body === 'string') {
        // Body is already stringified
    } else if (options.body) {
        finalOptions.body = JSON.stringify(options.body);
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/api${endpoint}`, finalOptions);
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.message || 'Request failed');
        }
        
        return data;
    } catch (error) {
        console.error('API Error:', error);
        throw error;
    }
};

window.setAuthToken = (token) => {
    localStorage.setItem('token', token);
};

window.clearAuthToken = () => {
    localStorage.removeItem('token');
};

// ==================== FACE DETECTION ====================

let faceModelsLoaded = false;
let sessionTimer = null;

async function initFaceDetection() {
    try {
        // Correct model URL from official face-api.js repository
        const MODEL_URL = 'https://justadudewhohacks.github.io/face-api.js/models';
        
        await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
        await faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL);
        await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
        await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
        
        faceModelsLoaded = true;
        console.log("✅ Face detection models loaded");
        return true;
    } catch (error) {
        console.error("Face detection error:", error);
        // Try fallback CDN
        try {
            const FALLBACK_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/model';
            await faceapi.nets.tinyFaceDetector.loadFromUri(FALLBACK_URL);
            await faceapi.nets.faceExpressionNet.loadFromUri(FALLBACK_URL);
            faceModelsLoaded = true;
            console.log("✅ Face models loaded from fallback");
            return true;
        } catch (fallbackError) {
            console.error("Fallback also failed:", fallbackError);
            return false;
        }
    }
}

async function analyzeFacialExpression(videoElement) {
    if (!faceModelsLoaded || !videoElement) {
        return { mood: "Neutral", confidence: 50 };
    }
    
    try {
        const detections = await faceapi.detectSingleFace(videoElement, new faceapi.TinyFaceDetectorOptions())
            .withFaceExpressions();
        
        if (detections && detections.expressions) {
            const expressions = detections.expressions;
            
            let dominantExpression = "neutral";
            let maxScore = 0;
            for (const [expr, score] of Object.entries(expressions)) {
                if (score > maxScore) {
                    maxScore = score;
                    dominantExpression = expr;
                }
            }
            
            let mood = "Neutral";
            let confidence = Math.round(maxScore * 100);
            
            switch(dominantExpression) {
                case 'happy': mood = "Happy"; confidence += 10; break;
                case 'sad': mood = "Sad"; confidence += 5; break;
                case 'angry': mood = "Stressed"; confidence += 15; break;
                case 'fearful': mood = "Stressed"; confidence += 10; break;
                case 'surprised': mood = "Energetic"; confidence += 10; break;
                case 'disgusted': mood = "Stressed"; confidence += 5; break;
                case 'neutral': mood = "Neutral"; break;
            }
            
            confidence = Math.min(95, Math.max(40, confidence));
            
            return { mood, confidence };
        }
    } catch (error) {
        console.error("Expression detection error:", error);
    }
    
    return { mood: "Neutral", confidence: 50 };
}

// ==================== VOICE ANALYSIS ====================

async function analyzeVoiceEmotion(audioBlob) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = async function() {
            try {
                const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                const arrayBuffer = reader.result;
                const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
                
                const channelData = audioBuffer.getChannelData(0);
                let energy = 0;
                let zcr = 0;
                
                for (let i = 0; i < channelData.length; i++) {
                    energy += channelData[i] * channelData[i];
                }
                energy = Math.sqrt(energy / channelData.length);
                
                for (let i = 1; i < channelData.length; i++) {
                    if (channelData[i] * channelData[i-1] < 0) zcr++;
                }
                zcr = zcr / channelData.length;
                
                let mood = "Neutral";
                let confidence = 50;
                
                if (energy > 0.1) {
                    if (zcr > 0.07) {
                        mood = "Energetic";
                        confidence = 75;
                    } else {
                        mood = "Happy";
                        confidence = 70;
                    }
                } else if (energy < 0.03) {
                    if (zcr < 0.03) {
                        mood = "Calm";
                        confidence = 72;
                    } else {
                        mood = "Sad";
                        confidence = 65;
                    }
                } else {
                    if (zcr > 0.06) {
                        mood = "Stressed";
                        confidence = 65;
                    }
                }
                
                await audioContext.close();
                resolve({ mood, confidence });
            } catch (error) {
                console.error("Voice analysis error:", error);
                resolve({ mood: "Neutral", confidence: 50 });
            }
        };
        reader.readAsArrayBuffer(audioBlob);
    });
}

// ==================== TEXT ANALYSIS ====================

async function analyzeTextSentiment(text) {
    const lowerText = text.toLowerCase();
    
    const keywords = {
        Happy: ["happy", "great", "good", "wonderful", "amazing", "excited", "joy", "love", "fantastic"],
        Sad: ["sad", "down", "blue", "depressed", "unhappy", "miserable", "lonely", "heartbroken"],
        Energetic: ["energetic", "excited", "pumped", "thrilled", "dynamic", "active", "lively"],
        Calm: ["calm", "relaxed", "peaceful", "serene", "tranquil", "chill", "quiet"],
        Stressed: ["stressed", "anxious", "worried", "nervous", "overwhelmed", "tense", "frustrated"]
    };
    
    let scores = { Happy: 0, Sad: 0, Energetic: 0, Calm: 0, Stressed: 0 };
    
    for (const [mood, words] of Object.entries(keywords)) {
        for (const word of words) {
            if (lowerText.includes(word)) {
                scores[mood] += 2;
            }
        }
    }
    
    if (text.includes("!")) scores.Energetic += 3;
    if (text.includes("...")) scores.Calm += 2;
    
    let dominantMood = "Neutral";
    let maxScore = 0;
    for (const [mood, score] of Object.entries(scores)) {
        if (score > maxScore) {
            maxScore = score;
            dominantMood = mood;
        }
    }
    
    let confidence = maxScore > 0 ? Math.min(90, 55 + maxScore * 3) : 50;
    return { mood: dominantMood, confidence };
}

// ==================== VUE APP ====================

new Vue({
    el: '#app',
    data: {
        currentPage: 'login',
        currentUser: '',
        userId: '',
        
        login: { username: '', password: '', showPassword: false },
        register: {
            username: '', email: '', password: '', confirmPassword: '',
            showPassword: false, showConfirmPassword: false, agreeTerms: false
        },
        
        toast: { show: false, message: '', type: 'success' },
        isLoading: false,
        moodHistory: [],
        
        facialAnalysis: {
            recording: false, completed: false, countdown: 10, mood: '', accuracy: 0
        },
        voiceAnalysis: {
            recording: false, completed: false, mood: '', accuracy: 0
        },
        textAnalysis: {
            input: '', completed: false, mood: '', accuracy: 0
        },
        
        fusedMood: { mood: '', confidence: 0, description: '' },
        recommendedTracks: [],
        
        // Audio - Spotify only
        isPlaying: false,
        currentTrackName: '',
        currentArtist: '',
        currentTrackId: null,
        currentTrackUri: null,
        audioVolume: 0.7,
        showVolumeSlider: false,
        
        // Camera
        cameraStream: null,
        showCameraModal: false,
        cameraMood: '',
        cameraConfidence: 0,
        
        // Voice
        showVoiceModal: false,
        voiceMood: '',
        voiceConfidence: 0,
        mediaRecorder: null,
        audioChunks: [],
        isRecording: false,
        recordingTime: 0,
        recordingInterval: null,
        
        modelsReady: false,
        isLoadingRecommendations: false,
        
        darkMode: false,
        showThemeDropdown: false,
        showLogoutModal: false,
        
        recordingTimer: null,
        faceDetectionRunning: false,
        
        // Spotify connection status
        spotifyConnected: false
    },
    
    computed: {
        allModalsCompleted() {
            return this.facialAnalysis.completed && 
                   this.voiceAnalysis.completed && 
                   this.textAnalysis.completed;
        }
    },
    
    watch: {
        currentPage: {
            immediate: true,
            handler(newPage) {
                this.$nextTick(() => { this.applyTheme(); });
            }
        }
    },
    
    async mounted() {
        this.loadThemePreference();
        this.checkAuth();
        this.checkSpotifyConnection();
        
        const waitForFaceApi = setInterval(async () => {
            if (typeof faceapi !== 'undefined') {
                clearInterval(waitForFaceApi);
                this.modelsReady = await initFaceDetection();
                if (this.modelsReady) {
                    this.showToast('Face detection ready!', 'success');
                } else {
                    this.showToast('Face detection unavailable - using simulation', 'error');
                }
            }
        }, 500);
        
        setTimeout(() => clearInterval(waitForFaceApi), 15000);
        
        document.addEventListener('click', (e) => {
            if (this.showThemeDropdown && !e.target.closest('.theme-dropdown')) {
                this.showThemeDropdown = false;
            }
        });
    },
    
    methods: {
        switchToRegister() { this.currentPage = 'register'; this.clearForms(); },
        switchToLogin() { this.currentPage = 'login'; this.clearForms(); },
        navigateTo(page) { 
            this.currentPage = page; 
            if (page === 'music') this.resetAnalysis(); 
        },
        
        clearForms() {
            this.login = { username: '', password: '', showPassword: false };
            this.register = {
                username: '', email: '', password: '', confirmPassword: '',
                showPassword: false, showConfirmPassword: false, agreeTerms: false
            };
        },
        
        async handleLogin() {
            if (!this.login.username || !this.login.password) {
                this.showToast('Please fill in all fields', 'error');
                return;
            }
            this.isLoading = true;
            try {
                const data = await window.apiRequest('/auth/login', {
                    method: 'POST',
                    body: JSON.stringify({ username: this.login.username, password: this.login.password })
                });
                if (data.success) {
                    window.setAuthToken(data.token);
                    localStorage.setItem('user', JSON.stringify(data.user));
                    this.currentUser = data.user.username;
                    this.userId = data.user.id;
                    this.showToast('Login successful!', 'success');
                    this.startSessionTimer();
                    await this.fetchMoodHistory();
                    this.currentPage = 'loading';
                    setTimeout(() => { this.currentPage = 'home'; this.isLoading = false; }, 3000);
                }
            } catch (error) {
                this.showToast(error.message, 'error');
                this.isLoading = false;
            }
        },
        
        async handleRegister() {
            if (!this.register.username || !this.register.email || !this.register.password || !this.register.confirmPassword) {
                this.showToast('Please fill in all fields', 'error');
                return;
            }
            if (this.register.password.length < 8) {
                this.showToast('Password must be at least 8 characters', 'error');
                return;
            }
            if (this.register.password !== this.register.confirmPassword) {
                this.showToast('Passwords do not match', 'error');
                return;
            }
            if (!this.register.agreeTerms) {
                this.showToast('Please agree to the terms and conditions', 'error');
                return;
            }
            this.isLoading = true;
            try {
                const data = await window.apiRequest('/auth/register', {
                    method: 'POST',
                    body: JSON.stringify({
                        username: this.register.username,
                        email: this.register.email,
                        password: this.register.password,
                        confirmPassword: this.register.confirmPassword
                    })
                });
                if (data.success) {
                    this.showToast('Registration successful! Please login.', 'success');
                    setTimeout(() => { this.clearForms(); this.currentPage = 'login'; this.isLoading = false; }, 2000);
                }
            } catch (error) {
                this.showToast(error.message, 'error');
                this.isLoading = false;
            }
        },
        
        startSessionTimer() {
            if (sessionTimer) clearInterval(sessionTimer);
            sessionTimer = setInterval(async () => {
                try { await window.apiRequest('/auth/verify'); } catch (error) {
                    if (error.message.includes('expired')) {
                        this.showToast('Session expired. Please login again.', 'error');
                        this.logout();
                    }
                }
            }, 60000);
            setTimeout(() => {
                if (this.currentPage !== 'login' && this.currentPage !== 'register') {
                    this.showToast('Session expired. Please login again.', 'error');
                    this.logout();
                }
            }, 60 * 60 * 1000);
        },
        
        async fetchMoodHistory() {
            try {
                const data = await window.apiRequest('/mood/history');
                if (data.success) this.moodHistory = data.history;
            } catch (error) { console.error('Failed to fetch mood history:', error); }
        },
        
        confirmLogout() { this.showLogoutModal = true; },
        cancelLogout() { this.showLogoutModal = false; },
        
        async logout() {
            this.showLogoutModal = false;
            try { await window.apiRequest('/auth/logout', { method: 'POST' }); } catch(e) {}
            if (sessionTimer) clearInterval(sessionTimer);
            if (this.cameraStream) this.stopCameraStream();
            window.clearAuthToken();
            localStorage.removeItem('user');
            this.currentUser = '';
            this.currentPage = 'login';
            this.clearForms();
            this.moodHistory = [];
            this.resetAnalysis();
            this.showToast('Logged out successfully', 'success');
        },
        
        showToast(message, type) {
            this.toast = { show: true, message, type };
            setTimeout(() => { this.toast.show = false; }, 3000);
        },
        
        // ==================== SPOTIFY CONNECTION ====================
        
        async checkSpotifyConnection() {
            try {
                const data = await window.apiRequest('/spotify/status');
                this.spotifyConnected = data.connected;
            } catch (error) {
                console.error('Spotify status check failed:', error);
            }
        },
        
        async connectSpotify() {
            try {
                const data = await window.apiRequest('/spotify/login');
                if (data.authUrl) {
                    window.location.href = data.authUrl;
                }
            } catch (error) {
                this.showToast('Failed to connect Spotify', 'error');
            }
        },
        
        // ==================== FACE DETECTION ====================
        
        startFacialAnalysis() {
            this.showCameraModal = true;
            this.facialAnalysis.recording = true;
            this.facialAnalysis.countdown = 10;
            this.faceDetectionRunning = true;
            
            if (!this.modelsReady) {
                this.showToast('Face detection not ready - using simulation', 'error');
                this.startFacialAnalysisSimulation();
                return;
            }
            
            navigator.mediaDevices.getUserMedia({ video: true })
                .then(stream => {
                    this.cameraStream = stream;
                    this.$nextTick(() => {
                        const videoElement = document.getElementById('camera-preview');
                        if (videoElement) {
                            videoElement.srcObject = stream;
                            videoElement.play();
                            this.startRealTimeFaceDetection();
                        }
                    });
                    this.startCountdown();
                })
                .catch(error => {
                    console.error('Camera error:', error);
                    this.showToast('Could not access camera. Using simulation.', 'error');
                    this.closeCameraModal();
                    this.startFacialAnalysisSimulation();
                });
        },
        
        async startRealTimeFaceDetection() {
            const videoElement = document.getElementById('camera-preview');
            if (!videoElement) return;
            
            const detect = async () => {
                if (!this.facialAnalysis.recording || !this.faceDetectionRunning) return;
                
                const result = await analyzeFacialExpression(videoElement);
                this.cameraMood = result.mood;
                this.cameraConfidence = result.confidence;
                this.facialAnalysis.mood = result.mood;
                this.facialAnalysis.accuracy = result.confidence;
                
                const confidenceFill = document.querySelector('.camera-modal .confidence-fill');
                const confidenceText = document.querySelector('.confidence-text');
                const moodSpan = document.querySelector('.detected-mood');
                
                if (moodSpan) moodSpan.textContent = result.mood;
                if (confidenceFill) confidenceFill.style.width = result.confidence + '%';
                if (confidenceText) confidenceText.textContent = result.confidence + '%';
                
                if (this.facialAnalysis.recording) {
                    requestAnimationFrame(detect);
                }
            };
            
            detect();
        },
        
        startCountdown() {
            this.recordingTimer = setInterval(() => {
                this.facialAnalysis.countdown--;
                const countdownEl = document.querySelector('.countdown-number');
                if (countdownEl) countdownEl.textContent = this.facialAnalysis.countdown;
                
                if (this.facialAnalysis.countdown <= 0) {
                    clearInterval(this.recordingTimer);
                    this.completeFacialAnalysis();
                }
            }, 1000);
        },
        
        completeFacialAnalysis() {
            this.facialAnalysis.recording = false;
            this.facialAnalysis.completed = true;
            this.faceDetectionRunning = false;
            this.stopCameraStream();
            this.showCameraModal = false;
            this.showToast(`Face detected: ${this.facialAnalysis.mood} (${this.facialAnalysis.accuracy}%)`, 'success');
            this.checkAllModalsCompleted();
        },
        
        startFacialAnalysisSimulation() {
            this.facialAnalysis.recording = true;
            this.facialAnalysis.countdown = 10;
            this.recordingTimer = setInterval(() => {
                this.facialAnalysis.countdown--;
                if (this.facialAnalysis.countdown <= 0) {
                    clearInterval(this.recordingTimer);
                    this.facialAnalysis.recording = false;
                    this.facialAnalysis.completed = true;
                    const moods = ['Happy', 'Sad', 'Energetic', 'Calm', 'Stressed'];
                    this.facialAnalysis.mood = moods[Math.floor(Math.random() * moods.length)];
                    this.facialAnalysis.accuracy = Math.floor(Math.random() * 20) + 75;
                    this.showToast(`Face simulation: ${this.facialAnalysis.mood}`, 'success');
                    this.checkAllModalsCompleted();
                }
            }, 1000);
        },
        
        stopCameraStream() {
            if (this.cameraStream) {
                this.cameraStream.getTracks().forEach(track => track.stop());
                this.cameraStream = null;
            }
        },
        
        closeCameraModal() {
            this.stopCameraStream();
            this.showCameraModal = false;
            this.facialAnalysis.recording = false;
            this.faceDetectionRunning = false;
            if (this.recordingTimer) clearInterval(this.recordingTimer);
        },
        
        // ==================== VOICE ANALYSIS ====================
        
        startVoiceAnalysis() {
            this.showVoiceModal = true;
            this.voiceAnalysis.recording = true;
            this.isRecording = true;
            this.recordingTime = 0;
            this.audioChunks = [];
            
            navigator.mediaDevices.getUserMedia({ audio: true })
                .then(stream => {
                    this.mediaRecorder = new MediaRecorder(stream);
                    
                    this.mediaRecorder.ondataavailable = (event) => {
                        if (event.data.size > 0) this.audioChunks.push(event.data);
                    };
                    
                    this.mediaRecorder.onstop = async () => {
                        const audioBlob = new Blob(this.audioChunks, { type: 'audio/wav' });
                        const result = await analyzeVoiceEmotion(audioBlob);
                        this.voiceAnalysis.mood = result.mood;
                        this.voiceAnalysis.accuracy = result.confidence;
                        this.voiceAnalysis.recording = false;
                        this.voiceAnalysis.completed = true;
                        this.showVoiceModal = false;
                        this.showToast(`Voice detected: ${result.mood} (${result.confidence}%)`, 'success');
                        this.checkAllModalsCompleted();
                        stream.getTracks().forEach(track => track.stop());
                    };
                    
                    this.mediaRecorder.start();
                    this.startRecordingTimer();
                    this.startVoiceVisualization();
                    
                    setTimeout(() => {
                        if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
                            this.mediaRecorder.stop();
                            this.isRecording = false;
                            if (this.recordingInterval) clearInterval(this.recordingInterval);
                        }
                    }, 5000);
                })
                .catch(error => {
                    console.error('Microphone error:', error);
                    this.showToast('Could not access microphone. Using simulation.', 'error');
                    this.closeVoiceModal();
                    this.startVoiceAnalysisSimulation();
                });
        },
        
        startRecordingTimer() {
            this.recordingInterval = setInterval(() => {
                this.recordingTime++;
                const timerElement = document.querySelector('.recording-timer');
                if (timerElement) timerElement.textContent = `${this.recordingTime}s`;
            }, 1000);
        },
        
        startVoiceVisualization() {
            const waves = document.querySelectorAll('.voice-waves span');
            const interval = setInterval(() => {
                if (!this.isRecording) { clearInterval(interval); return; }
                const intensity = Math.random();
                waves.forEach((wave, i) => {
                    const height = 20 + intensity * 60 * (1 - i * 0.15);
                    wave.style.height = `${height}px`;
                });
            }, 100);
            this.voiceVisualizationInterval = interval;
        },
        
        startVoiceAnalysisSimulation() {
            this.voiceAnalysis.recording = true;
            setTimeout(() => {
                this.voiceAnalysis.recording = false;
                this.voiceAnalysis.completed = true;
                const moods = ['Happy', 'Sad', 'Energetic', 'Calm', 'Stressed'];
                this.voiceAnalysis.mood = moods[Math.floor(Math.random() * moods.length)];
                this.voiceAnalysis.accuracy = Math.floor(Math.random() * 20) + 70;
                this.showToast(`Voice simulation: ${this.voiceAnalysis.mood}`, 'success');
                this.checkAllModalsCompleted();
            }, 5000);
        },
        
        closeVoiceModal() {
            if (this.mediaRecorder && this.mediaRecorder.state === 'recording') this.mediaRecorder.stop();
            this.isRecording = false;
            this.voiceAnalysis.recording = false;
            this.showVoiceModal = false;
            if (this.recordingInterval) clearInterval(this.recordingInterval);
            if (this.voiceVisualizationInterval) clearInterval(this.voiceVisualizationInterval);
        },
        
        // ==================== TEXT ANALYSIS ====================
        
        async analyzeText() {
            if (!this.textAnalysis.input) {
                this.showToast('Please enter some text', 'error');
                return;
            }
            
            this.showToast('Analyzing your text...', 'success');
            const result = await analyzeTextSentiment(this.textAnalysis.input);
            
            this.textAnalysis.completed = true;
            this.textAnalysis.mood = result.mood;
            this.textAnalysis.accuracy = result.confidence;
            
            this.showToast(`Text analysis: ${result.mood} (${result.confidence}%)`, 'success');
            this.checkAllModalsCompleted();
        },
        
        // ==================== MOOD FUSION ====================
        
        checkAllModalsCompleted() {
            if (this.allModalsCompleted) {
                this.fuseModalities();
                this.fetchSpotifyRecommendations();
                this.updateDashboard();
            }
        },
        
        fuseModalities() {
            const moods = [this.facialAnalysis.mood, this.voiceAnalysis.mood, this.textAnalysis.mood];
            const accuracies = [this.facialAnalysis.accuracy, this.voiceAnalysis.accuracy, this.textAnalysis.accuracy];
            
            const weights = { Happy: 0, Sad: 0, Energetic: 0, Calm: 0, Stressed: 0 };
            moods.forEach((mood, index) => {
                if (mood && weights[mood] !== undefined) {
                    weights[mood] += accuracies[index];
                }
            });
            
            let fusedMood = 'Neutral';
            let maxWeight = 0;
            for (const [mood, weight] of Object.entries(weights)) {
                if (weight > maxWeight) {
                    maxWeight = weight;
                    fusedMood = mood;
                }
            }
            
            let totalAccuracy = 0;
            let count = 0;
            moods.forEach((mood, index) => {
                if (mood === fusedMood) {
                    totalAccuracy += accuracies[index];
                    count++;
                }
            });
            const confidence = count > 0 ? Math.round(totalAccuracy / count) : 70;
            
            const descriptions = {
                Happy: 'Your cheerful mood shines through! Playing uplifting Spotify tracks.',
                Sad: 'We hear you. Playing soulful Spotify tracks that may help.',
                Energetic: 'High energy detected! Playing powerful Spotify tracks.',
                Calm: 'Peaceful state detected. Playing soothing Spotify tracks.',
                Stressed: 'Playing calming Spotify tracks to help you relax.'
            };
            
            this.fusedMood = { 
                mood: fusedMood, 
                confidence, 
                description: descriptions[fusedMood] || 'Playing personalized Spotify tracks for you.'
            };
            
            this.showToast(`Final mood: ${fusedMood} (${confidence}%)`, 'success');
        },
        
        // ==================== SPOTIFY RECOMMENDATIONS ====================
        
        async fetchSpotifyRecommendations() {
            this.isLoadingRecommendations = true;
            this.showToast(`Finding ${this.fusedMood.mood} music on Spotify...`, 'success');
            
            try {
                const response = await window.apiRequest('/spotify/recommendations', {
                    method: 'POST',
                    body: JSON.stringify({ 
                        mood: this.fusedMood.mood,
                        confidence: this.fusedMood.confidence,
                        limit: 12
                    })
                });
                
                if (response.success && response.tracks && response.tracks.length > 0) {
                    this.recommendedTracks = response.tracks;
                    this.showToast(`Found ${response.tracks.length} Spotify tracks!`, 'success');
                } else {
                    // Use fallback mock data if Spotify fails
                    this.recommendedTracks = this.getMockTracks(this.fusedMood.mood);
                    this.showToast('Using demo tracks - connect Spotify for real music', 'error');
                }
            } catch (error) {
                console.error('Spotify error:', error);
                this.recommendedTracks = this.getMockTracks(this.fusedMood.mood);
                this.showToast('Using demo tracks - Spotify unavailable', 'error');
            }
            
            this.isLoadingRecommendations = false;
        },
        
        getMockTracks(mood) {
            const mockData = {
                Happy: [
                    { id: '1', name: 'Happy', artist: 'Pharrell Williams', albumArt: 'https://i.scdn.co/image/ab67616d0000b2735f16ef3d5e9d836e7cece49e', externalUrl: 'https://open.spotify.com/track/60nZcImufyMA1MKQY3dcCH', color: '#FFD700' },
                    { id: '2', name: 'Good Vibrations', artist: 'The Beach Boys', albumArt: 'https://i.scdn.co/image/ab67616d0000b273e1b2e82f2fcf9d3c5f5b5f5b', externalUrl: 'https://open.spotify.com/track/5hxukp7zZrA2cWf1Uq1Yg4', color: '#FFD700' }
                ],
                Sad: [
                    { id: '3', name: 'Someone Like You', artist: 'Adele', albumArt: 'https://i.scdn.co/image/ab67616d0000b2737fcead687e4a3c5f5b5f5b', externalUrl: 'https://open.spotify.com/track/3bNv3VuUOKgrf5hu3YcuRo', color: '#45B7D1' },
                    { id: '4', name: 'Fix You', artist: 'Coldplay', albumArt: 'https://i.scdn.co/image/ab67616d0000b273de3f5e9d836e7cece49e', externalUrl: 'https://open.spotify.com/track/7LVHVU3tWfcxj5aiPFEW4Q', color: '#45B7D1' }
                ],
                Energetic: [
                    { id: '5', name: 'Eye of the Tiger', artist: 'Survivor', albumArt: 'https://i.scdn.co/image/ab67616d0000b2735f16ef3d5e9d836e7cece49e', externalUrl: 'https://open.spotify.com/track/2KH16WveTQWT6KOG9Rg6e2', color: '#FF6B6B' },
                    { id: '6', name: 'Stronger', artist: 'Kanye West', albumArt: 'https://i.scdn.co/image/ab67616d0000b2735f16ef3d5e9d836e7cece49e', externalUrl: 'https://open.spotify.com/track/6F2QnPXF4m5cSqyqQk9cZf', color: '#FF6B6B' }
                ],
                Calm: [
                    { id: '7', name: 'Weightless', artist: 'Marconi Union', albumArt: 'https://i.scdn.co/image/ab67616d0000b2735f16ef3d5e9d836e7cece49e', externalUrl: 'https://open.spotify.com/track/6kkbVk5l4s5Q4q4q4q4q4q', color: '#96CEB4' },
                    { id: '8', name: 'Clair de Lune', artist: 'Claude Debussy', albumArt: 'https://i.scdn.co/image/ab67616d0000b2735f16ef3d5e9d836e7cece49e', externalUrl: 'https://open.spotify.com/track/5hxukp7zZrA2cWf1Uq1Yg4', color: '#96CEB4' }
                ],
                Stressed: [
                    { id: '9', name: 'Breathe', artist: 'Pink Floyd', albumArt: 'https://i.scdn.co/image/ab67616d0000b2735f16ef3d5e9d836e7cece49e', externalUrl: 'https://open.spotify.com/track/5hxukp7zZrA2cWf1Uq1Yg4', color: '#4ECDC4' },
                    { id: '10', name: 'Three Little Birds', artist: 'Bob Marley', albumArt: 'https://i.scdn.co/image/ab67616d0000b2735f16ef3d5e9d836e7cece49e', externalUrl: 'https://open.spotify.com/track/3bNv3VuUOKgrf5hu3YcuRo', color: '#4ECDC4' }
                ]
            };
            return mockData[mood] || mockData.Happy;
        },
        
        // ==================== SPOTIFY PLAYBACK ====================
        
        playSpotifyTrack(track) {
            if (!track.externalUrl) {
                this.showToast('No Spotify URL available', 'error');
                return;
            }
            
            window.open(track.externalUrl, '_blank');
            
            this.currentTrackName = track.name;
            this.currentArtist = track.artist;
            this.currentTrackId = track.id;
            this.isPlaying = true;
            
            this.showToast(`Opening ${track.name} on Spotify`, 'success');
        },
        
        togglePlayPause(track) {
            this.playSpotifyTrack(track);
        },
        
        setVolume(volumeValue) {
            this.audioVolume = volumeValue / 100;
            localStorage.setItem('audioVolume', this.audioVolume);
        },
        
        toggleVolumeSlider() { this.showVolumeSlider = !this.showVolumeSlider; },
        
        // ==================== DASHBOARD ====================
        
        async updateDashboard() {
            const now = new Date();
            const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            this.moodHistory.unshift({
                time: timeString,
                mood: this.fusedMood.mood,
                confidence: this.fusedMood.confidence
            });
            if (this.moodHistory.length > 10) this.moodHistory.pop();
            
            try {
                await window.apiRequest('/mood/save', {
                    method: 'POST',
                    body: JSON.stringify({
                        mood: this.fusedMood.mood,
                        confidence: this.fusedMood.confidence,
                        description: this.fusedMood.description
                    })
                });
            } catch (error) { 
                console.error('Failed to save mood:', error); 
            }
        },
        
        // ==================== RESET ====================
        
        resetAnalysis() {
            this.stopCameraStream();
            if (this.mediaRecorder && this.mediaRecorder.state === 'recording') this.mediaRecorder.stop();
            if (this.recordingInterval) clearInterval(this.recordingInterval);
            if (this.recordingTimer) clearInterval(this.recordingTimer);
            if (this.voiceVisualizationInterval) clearInterval(this.voiceVisualizationInterval);
            this.faceDetectionRunning = false;
            
            this.facialAnalysis = { recording: false, completed: false, countdown: 10, mood: '', accuracy: 0 };
            this.voiceAnalysis = { recording: false, completed: false, mood: '', accuracy: 0 };
            this.textAnalysis = { input: '', completed: false, mood: '', accuracy: 0 };
            this.fusedMood = { mood: '', confidence: 0, description: '' };
            this.recommendedTracks = [];
            this.showCameraModal = false;
            this.showVoiceModal = false;
            this.isRecording = false;
            this.isPlaying = false;
            this.currentTrackId = null;
        },
        
        // ==================== THEME ====================
        
        toggleThemeDropdown() { this.showThemeDropdown = !this.showThemeDropdown; },
        
        setTheme(theme) {
            this.darkMode = theme === 'dark';
            this.showThemeDropdown = false;
            localStorage.setItem('moodwave-theme', theme);
            this.applyTheme();
            this.showToast(`Switched to ${theme} mode`, 'success');
        },
        
        loadThemePreference() {
            const savedTheme = localStorage.getItem('moodwave-theme');
            if (savedTheme) { this.darkMode = savedTheme === 'dark'; this.applyTheme(); }
            const savedVolume = localStorage.getItem('audioVolume');
            if (savedVolume) this.audioVolume = parseFloat(savedVolume);
        },
        
        applyTheme() {
            document.body.classList.remove('dark-mode-auth');
            const appContainer = document.querySelector('.app-container');
            if (appContainer) {
                if (this.darkMode) appContainer.classList.add('dark-mode');
                else appContainer.classList.remove('dark-mode');
            }
            if (this.currentPage === 'login' || this.currentPage === 'register' || this.currentPage === 'loading') {
                if (this.darkMode) document.body.classList.add('dark-mode-auth');
            }
        },
        
        checkAuth() {
            const token = localStorage.getItem('token');
            const user = localStorage.getItem('user');
            if (token && user) {
                try {
                    const userData = JSON.parse(user);
                    this.currentUser = userData.username;
                    this.userId = userData.id;
                    this.currentPage = 'home';
                    this.startSessionTimer();
                    this.fetchMoodHistory();
                } catch (e) {
                    localStorage.removeItem('token');
                    localStorage.removeItem('user');
                }
            }
        }
    }
});