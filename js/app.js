// ==================== FACE DETECTION - IMPROVED ====================

let faceModelsLoaded = false;
let detectionInterval = null;

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
        return { mood: "Neutral", confidence: 50 };
    }
    
    try {
        const detections = await faceapi.detectSingleFace(videoElement, new faceapi.TinyFaceDetectorOptions())
            .withFaceExpressions();
        
        if (detections && detections.expressions) {
            const expressions = detections.expressions;
            
            // Get all expression scores
            const expressionScores = {
                happy: expressions.happy || 0,
                sad: expressions.sad || 0,
                angry: expressions.angry || 0,
                fearful: expressions.fearful || 0,
                disgusted: expressions.disgusted || 0,
                surprised: expressions.surprised || 0,
                neutral: expressions.neutral || 0
            };
            
            // Find dominant expression
            let dominantExpression = "neutral";
            let maxScore = 0;
            for (const [expr, score] of Object.entries(expressionScores)) {
                if (score > maxScore) {
                    maxScore = score;
                    dominantExpression = expr;
                }
            }
            
            // Map to moods with confidence weighting
            let mood = "Neutral";
            let confidence = Math.round(maxScore * 100);
            
            if (dominantExpression === "happy") {
                mood = "Happy";
                confidence = Math.min(95, confidence + 10);
            } else if (dominantExpression === "sad") {
                mood = "Sad";
                confidence = Math.min(90, confidence + 5);
            } else if (dominantExpression === "angry" || dominantExpression === "fearful") {
                mood = "Stressed";
                confidence = Math.min(90, confidence + 15);
            } else if (dominantExpression === "surprised") {
                mood = "Energetic";
                confidence = Math.min(90, confidence + 10);
            } else if (dominantExpression === "neutral") {
                mood = "Neutral";
                confidence = Math.max(40, confidence);
            }
            
            console.log(`Face: ${dominantExpression} (${confidence}%) → ${mood}`);
            return { mood, confidence };
        }
    } catch (error) {
        console.error("Expression detection error:", error);
    }
    
    return { mood: "Neutral", confidence: 50 };
}

// ==================== VOICE ANALYSIS - IMPROVED ====================

async function analyzeVoiceEmotion(audioBlob) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = async function() {
            try {
                const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                const arrayBuffer = reader.result;
                const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
                
                const channelData = audioBuffer.getChannelData(0);
                const features = extractAdvancedAudioFeatures(channelData, audioBuffer.sampleRate);
                const result = classifyAdvancedMoodFromFeatures(features);
                
                await audioContext.close();
                console.log(`Voice: ${result.mood} (${result.confidence}%) - Energy:${features.energy.toFixed(3)} ZCR:${features.zcr.toFixed(3)}`);
                resolve(result);
            } catch (error) {
                console.error("Voice analysis error:", error);
                resolve({ mood: "Neutral", confidence: 50 });
            }
        };
        reader.readAsArrayBuffer(audioBlob);
    });
}

function extractAdvancedAudioFeatures(samples, sampleRate) {
    let energy = 0;
    let rms = 0;
    let zcr = 0;
    let spectralCentroid = 0;
    let maxAmplitude = 0;
    
    for (let i = 0; i < samples.length; i++) {
        const amp = Math.abs(samples[i]);
        energy += samples[i] * samples[i];
        rms += amp;
        if (amp > maxAmplitude) maxAmplitude = amp;
    }
    energy = Math.sqrt(energy / samples.length);
    rms = rms / samples.length;
    
    // Zero crossing rate
    for (let i = 1; i < samples.length; i++) {
        if (samples[i] * samples[i-1] < 0) zcr++;
    }
    zcr = zcr / samples.length;
    
    // Simple spectral centroid
    for (let i = 0; i < Math.min(1024, samples.length); i++) {
        spectralCentroid += i * Math.abs(samples[i]);
    }
    spectralCentroid = spectralCentroid / (Math.min(1024, samples.length) || 1);
    spectralCentroid = spectralCentroid / 1024;
    
    return { energy, rms, zcr, spectralCentroid, maxAmplitude };
}

function classifyAdvancedMoodFromFeatures(features) {
    let scores = { Happy: 0, Sad: 0, Energetic: 0, Calm: 0, Stressed: 0 };
    
    // Energy-based scoring
    if (features.energy > 0.1) {
        scores.Energetic += features.energy * 60;
        scores.Happy += features.energy * 30;
    } else if (features.energy < 0.03) {
        scores.Calm += (0.03 - features.energy) * 70;
        scores.Sad += (0.03 - features.energy) * 30;
    } else {
        scores.Neutral = 40;
    }
    
    // ZCR-based scoring
    if (features.zcr > 0.07) {
        scores.Energetic += features.zcr * 50;
        scores.Happy += features.zcr * 25;
    } else if (features.zcr < 0.02) {
        scores.Calm += (0.02 - features.zcr) * 60;
        scores.Sad += (0.02 - features.zcr) * 20;
    }
    
    // Spectral centroid
    if (features.spectralCentroid > 0.5) {
        scores.Energetic += 20;
        scores.Happy += 15;
    } else if (features.spectralCentroid < 0.2) {
        scores.Calm += 25;
        scores.Sad += 15;
    }
    
    // Find dominant mood
    let dominantMood = "Neutral";
    let maxScore = 0;
    for (const [mood, score] of Object.entries(scores)) {
        if (score > maxScore) {
            maxScore = score;
            dominantMood = mood;
        }
    }
    
    // Calculate confidence (30-95 range)
    let confidence = Math.min(92, Math.max(45, Math.round(maxScore)));
    if (dominantMood === "Neutral") confidence = Math.min(70, confidence);
    
    return { mood: dominantMood, confidence };
}

// ==================== TEXT ANALYSIS - IMPROVED ====================

async function analyzeTextSentiment(text) {
    const lowerText = text.toLowerCase();
    
    // Expanded keyword database with weights
    const moodKeywords = {
        Happy: { words: ["happy", "great", "good", "wonderful", "amazing", "excited", "joy", "love", "fantastic", "awesome", "beautiful", "perfect", "glad", "delighted", "cheerful", "joyful"], weight: 2 },
        Sad: { words: ["sad", "down", "blue", "depressed", "unhappy", "miserable", "lonely", "heartbroken", "crying", "hurt", "pain", "grief", "sorrow", "gloomy", "hopeless"], weight: 2 },
        Energetic: { words: ["energetic", "excited", "pumped", "thrilled", "dynamic", "active", "lively", "enthusiastic", "ready", "power", "strong", "unstoppable", "hyped"], weight: 1.8 },
        Calm: { words: ["calm", "relaxed", "peaceful", "serene", "tranquil", "chill", "quiet", "meditative", "soothing", "gentle", "still", "restful", "mellow"], weight: 1.8 },
        Stressed: { words: ["stressed", "anxious", "worried", "nervous", "overwhelmed", "tense", "frustrated", "panic", "pressure", "anxiety", "burnout", "exhausted", "drained"], weight: 2 }
    };
    
    let scores = { Happy: 0, Sad: 0, Energetic: 0, Calm: 0, Stressed: 0 };
    let totalMatches = 0;
    
    for (const [mood, data] of Object.entries(moodKeywords)) {
        for (const word of data.words) {
            if (lowerText.includes(word)) {
                let score = data.weight;
                
                // Check for intensity
                if (lowerText.includes("very " + word) || lowerText.includes("extremely " + word) || lowerText.includes("so " + word)) {
                    score *= 1.5;
                }
                if (lowerText.includes("not " + word) || lowerText.includes("don't " + word)) {
                    score *= 0.3;
                }
                
                scores[mood] += score;
                totalMatches++;
            }
        }
    }
    
    // Punctuation and emoji indicators
    if (text.includes("!")) {
        scores.Energetic += 5;
        scores.Happy += 3;
    }
    if (text.includes("...")) {
        scores.Calm += 4;
        scores.Sad += 2;
    }
    if (text.includes("?")) {
        scores.Stressed += 3;
    }
    if (text.toUpperCase() === text && text.length > 5) {
        scores.Energetic += 8;
        scores.Stressed += 5;
    }
    
    // Find dominant mood
    let dominantMood = "Neutral";
    let maxScore = 0;
    for (const [mood, score] of Object.entries(scores)) {
        if (score > maxScore) {
            maxScore = score;
            dominantMood = mood;
        }
    }
    
    // Calculate confidence based on matches and text length
    const wordCount = text.split(/\s+/).length;
    let confidence = 50;
    
    if (totalMatches > 0) {
        const matchDensity = Math.min(1, totalMatches / Math.max(5, wordCount));
        confidence = Math.min(92, 55 + (matchDensity * 35) + (maxScore * 2));
    } else if (wordCount > 10) {
        // Longer text with no keywords - likely neutral
        confidence = 55;
        dominantMood = "Neutral";
    } else {
        confidence = 45;
    }
    
    console.log(`Text: ${dominantMood} (${Math.round(confidence)}%) - Matches: ${totalMatches}`);
    return { mood: dominantMood, confidence: Math.round(confidence) };
}

// ==================== VUE APP ====================

let sessionTimer = null;

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
        detectedExpression: '',
        
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
                    this.showToast('Face detection ready! Look at the camera.', 'success');
                } else {
                    this.showToast('Face detection unavailable. Using simulation.', 'error');
                }
            }
        }, 500);
        
        setTimeout(() => {
            clearInterval(waitForFaceApi);
        }, 15000);
        
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
                    this.showToast('Registration successful! Redirecting to login...', 'success');
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
            this.stopCurrentTrack();
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
            if (!this.modelsReady) {
                this.showToast('Face model loading, please wait...', 'error');
                this.startFacialAnalysisSimulation();
                return;
            }
            
            this.showCameraModal = true;
            this.facialAnalysis.recording = true;
            this.facialAnalysis.countdown = 10;
            this.cameraMood = '';
            this.cameraConfidence = 0;
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
                this.detectedExpression = result.mood;
                this.facialAnalysis.mood = result.mood;
                this.facialAnalysis.accuracy = result.confidence;
                
                // Update UI
                const moodSpan = document.querySelector('.detected-mood');
                const confidenceFill = document.querySelector('.camera-modal .confidence-fill');
                const confidenceText = document.querySelector('.confidence-text');
                
                if (moodSpan) moodSpan.textContent = result.mood;
                if (confidenceFill) confidenceFill.style.width = result.confidence + '%';
                if (confidenceText) confidenceText.textContent = result.confidence + '%';
                
                requestAnimationFrame(detect);
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
            if (!this.facialAnalysis.mood) {
                this.facialAnalysis.mood = this.cameraMood || 'Neutral';
                this.facialAnalysis.accuracy = this.cameraConfidence || 65;
            }
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
                    this.showToast(`Face detected: ${this.facialAnalysis.mood} (${this.facialAnalysis.accuracy}%)`, 'success');
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
                this.showToast(`Voice detected: ${this.voiceAnalysis.mood} (${this.voiceAnalysis.accuracy}%)`, 'success');
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
            
            // Weighted voting
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
            
            // Calculate final confidence
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
                Happy: '🎵 Your cheerful mood shines through! Enjoy these uplifting tracks.',
                Sad: '🎵 We hear you. These soulful melodies might help you process your emotions.',
                Energetic: '🎵 High energy detected! Powerful tracks to match your dynamic spirit.',
                Calm: '🎵 Peaceful state detected. Soothing tracks to complement your tranquility.',
                Stressed: '🎵 Feeling overwhelmed? Let these calming tracks help you find your center.'
            };
            
            this.fusedMood = { 
                mood: fusedMood, 
                confidence, 
                description: descriptions[fusedMood] || '🎵 Here are personalized tracks for your mood.'
            };
            
            this.showToast(`Final mood: ${fusedMood} (${confidence}% confidence)`, 'success');
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
            // Curated tracks that work with preview URLs
            this.recommendedTracks = [
                { id: '1', name: 'Happy Vibes', artist: 'MoodWave', previewUrl: 'https://actions.google.com/sound/zip/happy-birthday.mp3', color: '#FFD700' },
                { id: '2', name: 'Calm Meditation', artist: 'MoodWave', previewUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3', color: '#96CEB4' },
                { id: '3', name: 'Energy Boost', artist: 'MoodWave', previewUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3', color: '#FF6B6B' }
            ];
            this.showToast('Curated tracks ready for you!', 'success');
        },
        
        // ==================== AUDIO PLAYER ====================
        
        playTrack(track) {
            this.stopCurrentTrack();
            
            this.currentTrackName = track.name;
            this.currentArtist = track.artist;
            
            if (track.previewUrl) {
                this.currentAudio = new Audio(track.previewUrl);
                this.currentAudio.volume = this.audioVolume;
                
                this.currentAudio.play()
                    .then(() => {
                        this.currentPlayingTrackId = track.id;
                        this.isPlaying = true;
                        this.showToast(`Now playing: ${track.name}`, 'success');
                    })
                    .catch(error => {
                        console.error('Playback error:', error);
                        this.showToast('Cannot play preview', 'error');
                    });
                
                this.currentAudio.onended = () => {
                    this.isPlaying = false;
                    this.currentPlayingTrackId = null;
                };
            } else {
                this.showToast('No preview available', 'error');
            }
        },
        
        togglePlayPause(track) {
            if (this.currentPlayingTrackId === track.id && this.isPlaying) {
                this.currentAudio.pause();
                this.isPlaying = false;
            } 
            else if (this.currentPlayingTrackId === track.id && !this.isPlaying) {
                this.currentAudio.play();
                this.isPlaying = true;
            } 
            else {
                this.playTrack(track);
            }
        },
        
        stopCurrentTrack() {
            if (this.currentAudio) {
                this.currentAudio.pause();
                this.currentAudio = null;
            }
            this.isPlaying = false;
            this.currentPlayingTrackId = null;
        },
        
        setVolume(volumeValue) {
            this.audioVolume = volumeValue / 100;
            if (this.currentAudio) this.currentAudio.volume = this.audioVolume;
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
            
            this.facialAnalysis = { recording: false, completed: false, countdown: 10, mood: '', accuracy: 0 };
            this.voiceAnalysis = { recording: false, completed: false, mood: '', accuracy: 0 };
            this.textAnalysis = { input: '', completed: false, mood: '', accuracy: 0 };
            this.fusedMood = { mood: '', confidence: 0, description: '' };
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
                this.currentPage = 'home';
                this.startSessionTimer();
                this.fetchMoodHistory();
            }
        }
    }
});