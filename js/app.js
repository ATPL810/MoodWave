// ==================== SPOTIFY PLAYBACK ====================
let spotifyPlayer = null;
let spotifyDeviceId = null;
let isSpotifyReady = false;

// Initialize Spotify Player
async function initSpotifyPlayer(token) {
    return new Promise((resolve) => {
        window.onSpotifyWebPlaybackSDKReady = () => {
            spotifyPlayer = new Spotify.Player({
                name: 'MoodWave Music Player',
                getOAuthToken: cb => { cb(token); },
                volume: 0.7
            });
            
            spotifyPlayer.addListener('ready', ({ device_id }) => {
                console.log('✅ Spotify Player ready with Device ID:', device_id);
                spotifyDeviceId = device_id;
                isSpotifyReady = true;
                resolve(true);
            });
            
            spotifyPlayer.addListener('not_ready', ({ device_id }) => {
                console.log('⚠️ Spotify Player not ready:', device_id);
                isSpotifyReady = false;
            });
            
            spotifyPlayer.addListener('player_state_changed', (state) => {
                if (state && state.track_window) {
                    console.log('Now playing:', state.track_window.current_track.name);
                }
            });
            
            spotifyPlayer.connect();
        };
        
        // Timeout after 10 seconds
        setTimeout(() => resolve(false), 10000);
    });
}

// Play track using Spotify Web Playback SDK
async function playSpotifyTrack(trackUri, token) {
    if (!isSpotifyReady || !spotifyDeviceId) {
        console.log('Spotify player not ready, trying to initialize...');
        await initSpotifyPlayer(token);
        if (!isSpotifyReady) {
            return false;
        }
    }
    
    try {
        const response = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${spotifyDeviceId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                uris: [trackUri]
            })
        });
        
        if (response.ok) {
            console.log('✅ Playing track:', trackUri);
            return true;
        } else {
            console.error('Playback failed:', await response.text());
            return false;
        }
    } catch (error) {
        console.error('Playback error:', error);
        return false;
    }
}

// ==================== FACE DETECTION ====================

let faceModelsLoaded = false;

async function initFaceDetection() {
    try {
        const MODEL_URL = 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights';
        
        await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
        await faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL);
        await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
        
        faceModelsLoaded = true;
        console.log("✅ Face detection models loaded");
        return true;
    } catch (error) {
        console.error("Face detection error:", error);
        return false;
    }
}

async function analyzeFacialExpressionML(videoElement) {
    if (!faceModelsLoaded || !videoElement) {
        return { mood: "Neutral", confidence: 50, valence: 0.5, energy: 0.5 };
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
            
            // Map to moods with valence and energy values
            let mood = "Neutral";
            let valence = 0.5;
            let energy = 0.5;
            let confidence = Math.round(maxScore * 100);
            
            switch(dominantExpression) {
                case 'happy':
                    mood = "Happy";
                    valence = 0.85;
                    energy = 0.7;
                    confidence += 10;
                    break;
                case 'sad':
                    mood = "Sad";
                    valence = 0.2;
                    energy = 0.3;
                    confidence += 5;
                    break;
                case 'angry':
                    mood = "Stressed";
                    valence = 0.3;
                    energy = 0.8;
                    confidence += 15;
                    break;
                case 'fearful':
                    mood = "Stressed";
                    valence = 0.25;
                    energy = 0.7;
                    confidence += 10;
                    break;
                case 'surprised':
                    mood = "Energetic";
                    valence = 0.7;
                    energy = 0.85;
                    confidence += 10;
                    break;
                case 'neutral':
                    mood = "Neutral";
                    valence = 0.5;
                    energy = 0.5;
                    break;
            }
            
            confidence = Math.min(95, Math.max(40, confidence));
            
            console.log(`Face: ${dominantExpression} → ${mood} (${confidence}%, valence:${valence}, energy:${energy})`);
            return { mood, confidence, valence, energy };
        }
    } catch (error) {
        console.error("Expression detection error:", error);
    }
    
    return { mood: "Neutral", confidence: 50, valence: 0.5, energy: 0.5 };
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
                const features = extractAudioFeatures(channelData, audioBuffer.sampleRate);
                const result = classifyMoodFromFeatures(features);
                
                await audioContext.close();
                console.log(`Voice: ${result.mood} (${result.confidence}%, valence:${result.valence}, energy:${result.energy})`);
                resolve(result);
            } catch (error) {
                console.error("Voice analysis error:", error);
                resolve({ mood: "Neutral", confidence: 50, valence: 0.5, energy: 0.5 });
            }
        };
        reader.readAsArrayBuffer(audioBlob);
    });
}

function extractAudioFeatures(samples, sampleRate) {
    let energy = 0;
    let zcr = 0;
    let rms = 0;
    
    for (let i = 0; i < samples.length; i++) {
        energy += samples[i] * samples[i];
        rms += Math.abs(samples[i]);
    }
    energy = Math.sqrt(energy / samples.length);
    rms = rms / samples.length;
    
    for (let i = 1; i < samples.length; i++) {
        if (samples[i] * samples[i-1] < 0) zcr++;
    }
    zcr = zcr / samples.length;
    
    return { energy, zcr, rms };
}

function classifyMoodFromFeatures(features) {
    let mood = "Neutral";
    let confidence = 50;
    let valence = 0.5;
    let energy = features.energy;
    
    if (features.energy > 0.12) {
        if (features.zcr > 0.08) {
            mood = "Energetic";
            valence = 0.7;
            confidence = 75 + (features.energy - 0.12) * 100;
        } else {
            mood = "Happy";
            valence = 0.75;
            confidence = 70 + features.energy * 80;
        }
    } else if (features.energy < 0.04) {
        if (features.zcr < 0.03) {
            mood = "Calm";
            valence = 0.55;
            confidence = 70 + (0.04 - features.energy) * 100;
        } else {
            mood = "Sad";
            valence = 0.3;
            confidence = 65 + (0.04 - features.energy) * 80;
        }
    } else {
        if (features.zcr > 0.07) {
            mood = "Stressed";
            valence = 0.4;
            energy = 0.6;
            confidence = 65;
        }
    }
    
    confidence = Math.min(90, Math.max(45, Math.round(confidence)));
    return { mood, confidence, valence, energy };
}

// ==================== TEXT ANALYSIS ====================

async function analyzeTextSentiment(text) {
    const lowerText = text.toLowerCase();
    
    const moodKeywords = {
        Happy: { words: ["happy", "great", "good", "wonderful", "amazing", "excited", "joy", "love", "fantastic", "awesome"], valence: 0.85, energy: 0.7 },
        Sad: { words: ["sad", "down", "blue", "depressed", "unhappy", "miserable", "lonely", "heartbroken"], valence: 0.2, energy: 0.3 },
        Energetic: { words: ["energetic", "excited", "pumped", "thrilled", "dynamic", "active", "lively"], valence: 0.65, energy: 0.85 },
        Calm: { words: ["calm", "relaxed", "peaceful", "serene", "tranquil", "chill", "quiet"], valence: 0.55, energy: 0.25 },
        Stressed: { words: ["stressed", "anxious", "worried", "nervous", "overwhelmed", "tense", "frustrated"], valence: 0.35, energy: 0.6 }
    };
    
    let scores = { Happy: 0, Sad: 0, Energetic: 0, Calm: 0, Stressed: 0 };
    let valenceSum = 0;
    let energySum = 0;
    let matchCount = 0;
    
    for (const [mood, data] of Object.entries(moodKeywords)) {
        for (const word of data.words) {
            if (lowerText.includes(word)) {
                scores[mood] += 2;
                valenceSum += data.valence;
                energySum += data.energy;
                matchCount++;
            }
        }
    }
    
    if (text.includes("!")) {
        scores.Energetic += 3;
        valenceSum += 0.7;
        energySum += 0.8;
        matchCount++;
    }
    if (text.includes("...")) {
        scores.Calm += 2;
        valenceSum += 0.5;
        energySum += 0.3;
        matchCount++;
    }
    
    let dominantMood = "Neutral";
    let maxScore = 0;
    for (const [mood, score] of Object.entries(scores)) {
        if (score > maxScore) {
            maxScore = score;
            dominantMood = mood;
        }
    }
    
    const valence = matchCount > 0 ? valenceSum / matchCount : 0.5;
    const energy = matchCount > 0 ? energySum / matchCount : 0.5;
    let confidence = maxScore > 0 ? Math.min(90, 55 + maxScore * 3) : 50;
    
    console.log(`Text: ${dominantMood} (${confidence}%, valence:${valence.toFixed(2)}, energy:${energy.toFixed(2)})`);
    return { mood: dominantMood, confidence, valence, energy };
}

// ==================== VUE APP ====================

let sessionTimer = null;

new Vue({
    el: '#app',
    data: {
        currentPage: 'login',
        currentUser: '',
        userId: '',
        spotifyToken: null,
        
        login: { username: '', password: '', showPassword: false },
        register: {
            username: '', email: '', password: '', confirmPassword: '',
            showPassword: false, showConfirmPassword: false, agreeTerms: false
        },
        
        toast: { show: false, message: '', type: 'success' },
        isLoading: false,
        moodHistory: [],
        
        facialAnalysis: {
            recording: false, completed: false, countdown: 10, mood: '', accuracy: 0, valence: 0.5, energy: 0.5
        },
        voiceAnalysis: {
            recording: false, completed: false, mood: '', accuracy: 0, valence: 0.5, energy: 0.5
        },
        textAnalysis: {
            input: '', completed: false, mood: '', accuracy: 0, valence: 0.5, energy: 0.5
        },
        
        fusedMood: { mood: '', confidence: 0, valence: 0.5, energy: 0.5, description: '' },
        recommendedTracks: [],
        
        currentAudio: null,
        currentPlayingTrackId: null,
        audioVolume: 0.7,
        showVolumeSlider: false,
        isPlaying: false,
        currentTrackName: '',
        currentArtist: '',
        
        cameraStream: null,
        showCameraModal: false,
        cameraMood: '',
        cameraConfidence: 0,
        
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
        isSpotifyPlaying: false,
        
        darkMode: false,
        showThemeDropdown: false,
        showLogoutModal: false,
        
        recordingTimer: null,
        faceDetectionRunning: false
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
        
        // Initialize face detection
        const waitForFaceApi = setInterval(async () => {
            if (typeof faceapi !== 'undefined') {
                clearInterval(waitForFaceApi);
                this.modelsReady = await initFaceDetection();
                if (this.modelsReady) {
                    this.showToast('Face detection ready!', 'success');
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
                    this.spotifyToken = data.token;
                    window.setAuthToken(data.token);
                    localStorage.setItem('user', JSON.stringify(data.user));
                    this.currentUser = data.user.username;
                    this.userId = data.user.id;
                    
                    // Initialize Spotify player
                    await initSpotifyPlayer(data.token);
                    
                    this.showToast('Login successful!', 'success');
                    this.startSessionTimer();
                    await this.fetchMoodHistory();
                    this.currentPage = 'loading';
                    setTimeout(() => { this.currentPage = 'home'; this.isLoading = false; }, 5000);
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
                    this.showToast('Registration successful!', 'success');
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
            if (spotifyPlayer) spotifyPlayer.disconnect();
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
        
        // ==================== FACE DETECTION ====================
        
        startFacialAnalysis() {
            this.showCameraModal = true;
            this.facialAnalysis.recording = true;
            this.facialAnalysis.countdown = 10;
            this.faceDetectionRunning = true;
            
            navigator.mediaDevices.getUserMedia({ video: true })
                .then(stream => {
                    this.cameraStream = stream;
                    const videoElement = document.getElementById('camera-preview');
                    if (videoElement) {
                        videoElement.srcObject = stream;
                        videoElement.play();
                    }
                    this.startRealTimeFaceDetection();
                    this.startCountdown();
                })
                .catch(error => {
                    console.error('Camera error:', error);
                    this.showToast('Could not access camera.', 'error');
                    this.closeCameraModal();
                    this.startFacialAnalysisSimulation();
                });
        },
        
        async startRealTimeFaceDetection() {
            const videoElement = document.getElementById('camera-preview');
            if (!videoElement) return;
            
            const detect = async () => {
                if (!this.facialAnalysis.recording || !this.faceDetectionRunning) return;
                
                const result = await analyzeFacialExpressionML(videoElement);
                this.cameraMood = result.mood;
                this.cameraConfidence = result.confidence;
                this.facialAnalysis.mood = result.mood;
                this.facialAnalysis.accuracy = result.confidence;
                this.facialAnalysis.valence = result.valence;
                this.facialAnalysis.energy = result.energy;
                
                const confidenceFill = document.querySelector('.camera-modal .confidence-fill');
                if (confidenceFill) confidenceFill.style.width = result.confidence + '%';
                
                requestAnimationFrame(detect);
            };
            
            detect();
        },
        
        startCountdown() {
            this.recordingTimer = setInterval(() => {
                this.facialAnalysis.countdown--;
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
                    this.facialAnalysis.valence = 0.5 + Math.random() * 0.4;
                    this.facialAnalysis.energy = 0.3 + Math.random() * 0.6;
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
                        this.voiceAnalysis.valence = result.valence;
                        this.voiceAnalysis.energy = result.energy;
                        this.voiceAnalysis.recording = false;
                        this.voiceAnalysis.completed = true;
                        this.showVoiceModal = false;
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
                    this.showToast('Could not access microphone.', 'error');
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
                this.voiceAnalysis.valence = 0.5 + Math.random() * 0.4;
                this.voiceAnalysis.energy = 0.3 + Math.random() * 0.6;
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
            if (!this.textAnalysis.input) return;
            
            this.showToast('Analyzing your text...', 'success');
            const result = await analyzeTextSentiment(this.textAnalysis.input);
            
            this.textAnalysis.completed = true;
            this.textAnalysis.mood = result.mood;
            this.textAnalysis.accuracy = result.confidence;
            this.textAnalysis.valence = result.valence;
            this.textAnalysis.energy = result.energy;
            
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
            // Calculate weighted average for mood
            const moods = [this.facialAnalysis.mood, this.voiceAnalysis.mood, this.textAnalysis.mood];
            const accuracies = [this.facialAnalysis.accuracy, this.voiceAnalysis.accuracy, this.textAnalysis.accuracy];
            
            const weights = { Happy: 0, Sad: 0, Energetic: 0, Calm: 0, Stressed: 0 };
            moods.forEach((mood, index) => {
                if (weights[mood] !== undefined) {
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
            
            // Calculate weighted valence and energy
            let totalValence = 0;
            let totalEnergy = 0;
            let totalWeight = 0;
            
            const analyses = [
                { valence: this.facialAnalysis.valence, energy: this.facialAnalysis.energy, weight: this.facialAnalysis.accuracy },
                { valence: this.voiceAnalysis.valence, energy: this.voiceAnalysis.energy, weight: this.voiceAnalysis.accuracy },
                { valence: this.textAnalysis.valence, energy: this.textAnalysis.energy, weight: this.textAnalysis.accuracy }
            ];
            
            analyses.forEach(a => {
                if (a.valence && a.energy && a.weight > 0) {
                    totalValence += a.valence * a.weight;
                    totalEnergy += a.energy * a.weight;
                    totalWeight += a.weight;
                }
            });
            
            const finalValence = totalWeight > 0 ? totalValence / totalWeight : 0.5;
            const finalEnergy = totalWeight > 0 ? totalEnergy / totalWeight : 0.5;
            
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
                valence: finalValence,
                energy: finalEnergy,
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
                        valence: this.fusedMood.valence,
                        energy: this.fusedMood.energy,
                        limit: 12
                    })
                });
                
                if (response.success && response.tracks && response.tracks.length > 0) {
                    this.recommendedTracks = response.tracks;
                    this.showToast(`Found ${response.tracks.length} tracks! Click play to listen.`, 'success');
                } else {
                    this.showToast('Using curated tracks for your mood.', 'info');
                    this.getCuratedTracks();
                }
            } catch (error) {
                console.error('Spotify error:', error);
                this.getCuratedTracks();
            }
            
            this.isLoadingRecommendations = false;
        },
        
        getCuratedTracks() {
            this.recommendedTracks = [
                { id: '1', name: 'Happy Vibes Selection', artist: 'Spotify', spotifyUri: 'spotify:track:4iV5W9uYEdYUVa79Axb7Rh', color: '#FFD700' },
                { id: '2', name: 'Calm Meditation Mix', artist: 'Spotify', spotifyUri: 'spotify:track:3f9zJnRrCvJ6Wl2VDfZ8fG', color: '#96CEB4' },
                { id: '3', name: 'Energy Boost Workout', artist: 'Spotify', spotifyUri: 'spotify:track:6rqhFgbbKwnb9MLmUQDhG6', color: '#FF6B6B' }
            ];
            this.showToast('Click play to listen on Spotify!', 'success');
        },
        
        // ==================== SPOTIFY PLAYBACK ====================
        
        async playSpotifyTrack(track) {
            if (!track.spotifyUri) {
                this.showToast('No Spotify URI available', 'error');
                return;
            }
            
            if (!this.spotifyToken) {
                const token = localStorage.getItem('token');
                if (token) {
                    this.spotifyToken = token;
                    await initSpotifyPlayer(token);
                }
            }
            
            this.showToast(`Playing ${track.name} on Spotify...`, 'success');
            
            const success = await playSpotifyTrack(track.spotifyUri, this.spotifyToken);
            
            if (success) {
                this.currentTrackName = track.name;
                this.currentArtist = track.artist;
                this.currentPlayingTrackId = track.id;
                this.isPlaying = true;
                this.isSpotifyPlaying = true;
                this.showToast(`Now playing: ${track.name}`, 'success');
            } else {
                // Fallback: Open in new tab
                if (track.externalUrl) {
                    window.open(track.externalUrl, '_blank');
                    this.showToast(`Opening ${track.name} on Spotify Web Player`, 'info');
                } else {
                    this.showToast('Could not play track. Please try another.', 'error');
                }
            }
        },
        
        togglePlayPause(track) {
            if (this.currentPlayingTrackId === track.id && this.isPlaying) {
                // Pause not supported in Web Playback SDK easily, just stop
                this.isPlaying = false;
                this.showToast('Paused', 'success');
            } else {
                this.playSpotifyTrack(track);
            }
        },
        
        stopCurrentTrack() {
            this.isPlaying = false;
            this.currentPlayingTrackId = null;
            this.isSpotifyPlaying = false;
        },
        
        setVolume(volumeValue) {
            this.audioVolume = volumeValue / 100;
            if (spotifyPlayer) {
                spotifyPlayer.setVolume(this.audioVolume);
            }
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
                        valence: this.fusedMood.valence,
                        energy: this.fusedMood.energy,
                        description: this.fusedMood.description
                    })
                });
            } catch (error) { console.error('Failed to save mood:', error); }
        },
        
        // ==================== RESET ====================
        
        resetAnalysis() {
            this.stopCameraStream();
            if (this.mediaRecorder && this.mediaRecorder.state === 'recording') this.mediaRecorder.stop();
            if (this.recordingInterval) clearInterval(this.recordingInterval);
            if (this.recordingTimer) clearInterval(this.recordingTimer);
            if (this.voiceVisualizationInterval) clearInterval(this.voiceVisualizationInterval);
            this.stopCurrentTrack();
            this.faceDetectionRunning = false;
            
            this.facialAnalysis = { recording: false, completed: false, countdown: 10, mood: '', accuracy: 0, valence: 0.5, energy: 0.5 };
            this.voiceAnalysis = { recording: false, completed: false, mood: '', accuracy: 0, valence: 0.5, energy: 0.5 };
            this.textAnalysis = { input: '', completed: false, mood: '', accuracy: 0, valence: 0.5, energy: 0.5 };
            this.fusedMood = { mood: '', confidence: 0, valence: 0.5, energy: 0.5, description: '' };
            this.recommendedTracks = [];
            this.showCameraModal = false;
            this.showVoiceModal = false;
            this.isRecording = false;
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
                const userData = JSON.parse(user);
                this.currentUser = userData.username;
                this.userId = userData.id;
                this.spotifyToken = token;
                this.currentPage = 'home';
                this.startSessionTimer();
                this.fetchMoodHistory();
                // Initialize Spotify player in background
                initSpotifyPlayer(token);
            }
        }
    }
});