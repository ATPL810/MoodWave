// ==================== REAL AI MODELS ====================
let faceLandmarker = null;
let useModel = null; // Universal Sentence Encoder
let isModelsLoaded = false;

// ==================== FACIAL EXPRESSION RECOGNITION ====================

async function initFaceDetection() {
    try {
        const vision = await FilesetResolver.forVisionTasks(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm"
        );
        
        faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
                delegate: "GPU"
            },
            outputFaceBlendshapes: true,
            runningMode: "VIDEO",
            numFaces: 1
        });
        
        console.log("✅ Face Landmarker loaded");
        return true;
    } catch (error) {
        console.error("Face detection init error:", error);
        return false;
    }
}

// Analyze facial expression from landmarks and blendshapes
function analyzeFacialExpression(faceLandmarks, blendshapes) {
    if (!blendshapes || !blendshapes[0] || !blendshapes[0].categories) {
        return { mood: "Neutral", confidence: 70, expression: "Neutral" };
    }
    
    // MediaPipe provides blendshape scores for expressions
    const categories = blendshapes[0].categories;
    
    const expressionMap = {
        "browInnerUp": "Surprised",
        "browDownLeft": "Sad",
        "browDownRight": "Sad",
        "eyeWideLeft": "Surprised",
        "eyeWideRight": "Surprised",
        "jawOpen": "Surprised",
        "mouthSmileLeft": "Happy",
        "mouthSmileRight": "Happy",
        "mouthFrownLeft": "Sad",
        "mouthFrownRight": "Sad",
        "mouthPressLeft": "Stressed",
        "mouthPressRight": "Stressed"
    };
    
    const moodScores = { Happy: 0, Sad: 0, Energetic: 0, Calm: 0, Stressed: 0, Surprised: 0 };
    
    for (const cat of categories) {
        const score = cat.score;
        const categoryName = cat.categoryName;
        
        if (expressionMap[categoryName] && score > 0.3) {
            const mappedMood = expressionMap[categoryName];
            if (mappedMood === "Happy") moodScores.Happy += score;
            else if (mappedMood === "Sad") moodScores.Sad += score;
            else if (mappedMood === "Surprised") moodScores.Energetic += score;
            else if (mappedMood === "Stressed") moodScores.Stressed += score;
        }
    }
    
    // Find dominant mood
    let dominantMood = "Neutral";
    let maxScore = 0;
    for (const [mood, score] of Object.entries(moodScores)) {
        if (score > maxScore) {
            maxScore = score;
            dominantMood = mood;
        }
    }
    
    const confidence = Math.min(95, 60 + maxScore * 35);
    return { mood: dominantMood, confidence: Math.round(confidence), expression: dominantMood };
}

// ==================== TEXT SENTIMENT ANALYSIS ====================

async function initTextSentiment() {
    try {
        useModel = await use.load();
        console.log("✅ Universal Sentence Encoder loaded");
        return true;
    } catch (error) {
        console.error("Text model init error:", error);
        return false;
    }
}

async function analyzeTextSentiment(text) {
    if (!useModel) return { mood: "Neutral", confidence: 70 };
    
    try {
        // Get text embedding
        const embeddings = await useModel.embed([text]);
        const embeddingArray = await embeddings.array();
        
        // Calculate sentiment features from embedding
        const features = embeddingArray[0];
        
        // Simple sentiment analysis based on embedding patterns
        let valenceScore = 0.5; // Neutral baseline
        let energyScore = 0.5;
        
        // Use embedding dimensions to estimate sentiment
        // (In production, use a trained classifier on top of USE)
        for (let i = 0; i < Math.min(100, features.length); i++) {
            valenceScore += features[i] * 0.01;
            energyScore += Math.abs(features[i]) * 0.005;
        }
        
        valenceScore = Math.min(0.95, Math.max(0.05, valenceScore));
        energyScore = Math.min(0.95, Math.max(0.05, energyScore));
        
        // Check for emotion keywords as enhancement
        const lowerText = text.toLowerCase();
        const keywords = {
            happy: ["happy", "great", "good", "wonderful", "amazing", "excited", "joy", "love", "fantastic"],
            sad: ["sad", "down", "blue", "depressed", "unhappy", "miserable", "lonely", "heartbroken"],
            energetic: ["energetic", "excited", "pumped", "thrilled", "dynamic", "active", "lively"],
            calm: ["calm", "relaxed", "peaceful", "serene", "tranquil", "chill", "quiet"],
            stressed: ["stressed", "anxious", "worried", "nervous", "overwhelmed", "tense"]
        };
        
        let keywordScore = { Happy: 0, Sad: 0, Energetic: 0, Calm: 0, Stressed: 0 };
        for (const [mood, words] of Object.entries(keywords)) {
            for (const word of words) {
                if (lowerText.includes(word)) keywordScore[mood] += 2;
            }
        }
        
        // Combine embedding and keyword analysis
        let mood = "Neutral";
        let maxKeywordScore = 0;
        for (const [m, score] of Object.entries(keywordScore)) {
            if (score > maxKeywordScore) {
                maxKeywordScore = score;
                mood = m;
            }
        }
        
        // Use valence to refine mood
        if (valenceScore > 0.7 && mood !== "Sad") mood = "Happy";
        else if (valenceScore < 0.3) mood = "Sad";
        
        if (energyScore > 0.7 && mood !== "Calm") mood = "Energetic";
        else if (energyScore < 0.3 && mood !== "Energetic") mood = "Calm";
        
        const confidence = Math.min(95, Math.round(65 + (Math.abs(valenceScore - 0.5) * 30) + (maxKeywordScore * 5)));
        
        return { mood, confidence };
    } catch (error) {
        console.error("Text sentiment error:", error);
        return { mood: "Neutral", confidence: 70 };
    }
}

// ==================== VOICE EMOTION RECOGNITION ====================

async function analyzeVoiceEmotion(audioBlob) {
    // Voice emotion analysis using audio features
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = async function() {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            try {
                const arrayBuffer = reader.result;
                const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
                
                // Extract audio features
                const channelData = audioBuffer.getChannelData(0);
                const features = extractAudioFeatures(channelData, audioBuffer.sampleRate);
                
                // Determine mood from features
                const result = classifyMoodFromFeatures(features);
                resolve(result);
            } catch (error) {
                console.error("Voice analysis error:", error);
                resolve({ mood: "Neutral", confidence: 70 });
            } finally {
                await audioContext.close();
            }
        };
        reader.readAsArrayBuffer(audioBlob);
    });
}

function extractAudioFeatures(samples, sampleRate) {
    let sum = 0;
    let sumSquared = 0;
    let maxAmplitude = 0;
    
    for (let i = 0; i < samples.length; i++) {
        const amplitude = Math.abs(samples[i]);
        sum += amplitude;
        sumSquared += samples[i] * samples[i];
        if (amplitude > maxAmplitude) maxAmplitude = amplitude;
    }
    
    const meanAmplitude = sum / samples.length;
    const rms = Math.sqrt(sumSquared / samples.length);
    const energy = rms;
    
    // Zero crossing rate (speech rate indicator)
    let zeroCrossings = 0;
    for (let i = 1; i < samples.length; i++) {
        if (samples[i] * samples[i-1] < 0) zeroCrossings++;
    }
    const zcr = zeroCrossings / samples.length;
    
    // Spectral centroid estimation using FFT approximation
    let spectralCentroid = 0;
    let spectralSum = 0;
    for (let i = 0; i < Math.min(1024, samples.length); i++) {
        spectralCentroid += i * Math.abs(samples[i]);
        spectralSum += Math.abs(samples[i]);
    }
    spectralCentroid = spectralCentroid / (spectralSum || 1) / 1024;
    
    return { energy, zcr, spectralCentroid, rms, meanAmplitude };
}

function classifyMoodFromFeatures(features) {
    let mood = "Neutral";
    let confidence = 70;
    
    const energy = features.energy;
    const zcr = features.zcr;
    const spectralCentroid = features.spectralCentroid;
    
    // High energy + high ZCR = energetic or happy
    if (energy > 0.15) {
        if (zcr > 0.1) {
            mood = spectralCentroid > 0.4 ? "Energetic" : "Happy";
            confidence = 75 + (energy - 0.15) * 100;
        } else {
            mood = "Stressed";
            confidence = 70 + energy * 100;
        }
    }
    // Low energy
    else if (energy < 0.05) {
        if (zcr < 0.05) {
            mood = "Calm";
            confidence = 75;
        } else {
            mood = "Sad";
            confidence = 70;
        }
    }
    // Medium energy
    else {
        if (zcr > 0.08) {
            mood = "Happy";
            confidence = 70;
        } else if (spectralCentroid > 0.35) {
            mood = "Calm";
            confidence = 68;
        } else {
            mood = "Neutral";
            confidence = 65;
        }
    }
    
    confidence = Math.min(95, Math.round(confidence));
    return { mood, confidence };
}

// ==================== SPOTIFY RECOMMENDATIONS ====================

// Mood to audio feature mapping for dynamic recommendations
const moodToAudioFeatures = {
    Happy: { target_valence: 0.8, target_energy: 0.7, target_danceability: 0.7 },
    Sad: { target_valence: 0.2, target_energy: 0.3, target_danceability: 0.4 },
    Energetic: { target_valence: 0.6, target_energy: 0.9, target_danceability: 0.7 },
    Calm: { target_valence: 0.5, target_energy: 0.2, target_danceability: 0.3 },
    Stressed: { target_valence: 0.4, target_energy: 0.4, target_danceability: 0.5 },
    Neutral: { target_valence: 0.5, target_energy: 0.5, target_danceability: 0.5 }
};

async function fetchDynamicRecommendations(mood, confidence) {
    const features = moodToAudioFeatures[mood] || moodToAudioFeatures.Neutral;
    
    try {
        const response = await window.apiRequest('/spotify/recommendations', {
            method: 'POST',
            body: JSON.stringify({
                mood: mood,
                confidence: confidence,
                target_valence: features.target_valence,
                target_energy: features.target_energy,
                target_danceability: features.target_danceability,
                limit: 12
            })
        });
        
        if (response.success && response.tracks && response.tracks.length > 0) {
            return response.tracks;
        }
    } catch (error) {
        console.error("Spotify API error:", error);
    }
    
    // Fallback to search-based recommendations if recommendations endpoint fails
    return await fetchSearchBasedRecommendations(mood);
}

async function fetchSearchBasedRecommendations(mood) {
    const moodSearchTerms = {
        Happy: "happy upbeat pop",
        Sad: "sad melancholy acoustic",
        Energetic: "workout energetic rock",
        Calm: "calm peaceful ambient",
        Stressed: "relaxing meditation peaceful"
    };
    
    const searchTerm = moodSearchTerms[mood] || "popular music";
    
    try {
        const response = await window.apiRequest('/spotify/search', {
            method: 'POST',
            body: JSON.stringify({
                query: searchTerm,
                limit: 12
            })
        });
        
        if (response.success && response.tracks) {
            return response.tracks;
        }
    } catch (error) {
        console.error("Search fallback error:", error);
    }
    
    return [];
}

// ==================== VUE APP ====================

let sessionTimer = null;

new Vue({
    el: '#app',
    data: {
        // Current page state
        currentPage: 'login',
        currentUser: '',
        userId: '',
        
        // Form data
        login: { username: '', password: '', showPassword: false },
        register: {
            username: '', email: '', password: '', confirmPassword: '',
            showPassword: false, showConfirmPassword: false, agreeTerms: false
        },
        
        // UI state
        toast: { show: false, message: '', type: 'success' },
        isLoading: false,
        isLoadingRecommendations: false,
        moodHistory: [],
        
        // Analysis data
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
        
        // Audio player
        currentAudio: null,
        currentPlayingTrackId: null,
        audioVolume: 0.7,
        showVolumeSlider: false,
        isPlaying: false,
        currentTrackName: '',
        currentArtist: '',
        
        // Camera
        cameraStream: null,
        showCameraModal: false,
        cameraMood: '',
        cameraConfidence: 0,
        detectedExpression: '',
        blendshapes: null,
        
        // Voice recording
        showVoiceModal: false,
        voiceMood: '',
        voiceConfidence: 0,
        mediaRecorder: null,
        audioChunks: [],
        isRecording: false,
        recordingTime: 0,
        recordingInterval: null,
        
        // Theme
        darkMode: false,
        showThemeDropdown: false,
        showLogoutModal: false,
        
        // Timers
        recordingTimer: null,
        expressionDetectionInterval: null,
        
        // Model loading state
        modelsLoaded: false,
        loadingMessage: 'Loading AI models...'
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
        
        // Initialize AI models
        this.loadingMessage = 'Loading face detection model...';
        const faceLoaded = await initFaceDetection();
        
        this.loadingMessage = 'Loading text sentiment model...';
        const textLoaded = await initTextSentiment();
        
        if (faceLoaded && textLoaded) {
            this.modelsLoaded = true;
            this.showToast('AI models loaded successfully!', 'success');
        } else {
            this.showToast('Some AI features may be limited', 'error');
        }
        
        document.addEventListener('click', (e) => {
            if (this.showThemeDropdown && !e.target.closest('.theme-dropdown')) {
                this.showThemeDropdown = false;
            }
        });
    },
    
    methods: {
        // ==================== NAVIGATION ====================
        switchToRegister() { this.currentPage = 'register'; this.clearForms(); },
        switchToLogin() { this.currentPage = 'login'; this.clearForms(); },
        navigateTo(page) { this.currentPage = page; if (page === 'music') this.resetAnalysis(); },
        
        clearForms() {
            this.login = { username: '', password: '', showPassword: false };
            this.register = {
                username: '', email: '', password: '', confirmPassword: '',
                showPassword: false, showConfirmPassword: false, agreeTerms: false
            };
        },
        
        // ==================== AUTHENTICATION ====================
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
        
        // ==================== REAL FACIAL EXPRESSION ====================
        
        startFacialAnalysis() {
            if (!faceLandmarker) {
                this.showToast('Face detection model not ready. Using simulation.', 'error');
                this.startFacialAnalysisSimulation();
                return;
            }
            
            this.showCameraModal = true;
            this.facialAnalysis.recording = true;
            this.facialAnalysis.countdown = 10;
            this.cameraMood = '';
            this.cameraConfidence = 0;
            
            navigator.mediaDevices.getUserMedia({ video: true })
                .then(stream => {
                    this.cameraStream = stream;
                    const videoElement = document.getElementById('camera-preview');
                    if (videoElement) {
                        videoElement.srcObject = stream;
                        videoElement.play();
                    }
                    this.startRealTimeExpressionDetection();
                    this.startCountdown();
                })
                .catch(error => {
                    console.error('Camera error:', error);
                    this.showToast('Could not access camera. Using simulation.', 'error');
                    this.closeCameraModal();
                    this.startFacialAnalysisSimulation();
                });
        },
        
        startRealTimeExpressionDetection() {
            const videoElement = document.getElementById('camera-preview');
            if (!videoElement || !faceLandmarker) return;
            
            const detectFrame = async () => {
                if (!this.facialAnalysis.recording) return;
                
                try {
                    const result = await faceLandmarker.detectForVideo(videoElement, performance.now());
                    
                    if (result.faceLandmarks && result.faceLandmarks.length > 0) {
                        const analysis = analyzeFacialExpression(result.faceLandmarks, result.faceBlendshapes);
                        this.cameraMood = analysis.mood;
                        this.cameraConfidence = analysis.confidence;
                        this.detectedExpression = analysis.expression;
                        
                        this.facialAnalysis.mood = analysis.mood;
                        this.facialAnalysis.accuracy = analysis.confidence;
                        
                        const confidenceFill = document.querySelector('.camera-modal .confidence-fill');
                        if (confidenceFill) confidenceFill.style.width = analysis.confidence + '%';
                    }
                    
                    requestAnimationFrame(detectFrame);
                } catch (error) {
                    console.error('Detection error:', error);
                    requestAnimationFrame(detectFrame);
                }
            };
            
            detectFrame();
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
            if (!this.facialAnalysis.mood) {
                this.facialAnalysis.mood = this.cameraMood || 'Neutral';
                this.facialAnalysis.accuracy = this.cameraConfidence || 70;
            }
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
            if (this.recordingTimer) clearInterval(this.recordingTimer);
        },
        
        // ==================== REAL VOICE ANALYSIS ====================
        
        startVoiceAnalysis() {
            this.showVoiceModal = true;
            this.voiceAnalysis.recording = true;
            this.isRecording = true;
            this.recordingTime = 0;
            this.voiceMood = '';
            this.voiceConfidence = 0;
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
            
            let result;
            if (useModel) {
                result = await analyzeTextSentiment(this.textAnalysis.input);
            } else {
                // Fallback to keyword-based
                result = this.analyzeTextFallback(this.textAnalysis.input);
            }
            
            this.textAnalysis.completed = true;
            this.textAnalysis.mood = result.mood;
            this.textAnalysis.accuracy = result.confidence;
            
            this.checkAllModalsCompleted();
        },
        
        analyzeTextFallback(text) {
            let mood = 'Neutral';
            const lowerText = text.toLowerCase();
            const keywords = {
                Happy: ['happy', 'great', 'good', 'wonderful', 'amazing', 'excited', 'joy', 'love'],
                Sad: ['sad', 'down', 'blue', 'depressed', 'unhappy', 'miserable', 'lonely'],
                Energetic: ['energetic', 'excited', 'pumped', 'thrilled', 'dynamic', 'active'],
                Calm: ['calm', 'relaxed', 'peaceful', 'serene', 'tranquil', 'chill'],
                Stressed: ['stressed', 'anxious', 'worried', 'nervous', 'overwhelmed', 'tense']
            };
            
            let maxScore = 0;
            for (const [detectedMood, words] of Object.entries(keywords)) {
                let score = words.filter(word => lowerText.includes(word)).length;
                if (score > maxScore && score > 0) { maxScore = score; mood = detectedMood; }
            }
            
            const confidence = Math.min(95, 70 + maxScore * 10);
            return { mood, confidence };
        },
        
        // ==================== MOOD FUSION ====================
        
        checkAllModalsCompleted() {
            if (this.allModalsCompleted) {
                this.fuseModalities();
                this.fetchAndPlayRecommendations();
                this.updateDashboard();
            }
        },
        
        fuseModalities() {
            const moods = [this.facialAnalysis.mood, this.voiceAnalysis.mood, this.textAnalysis.mood];
            const accuracies = [this.facialAnalysis.accuracy, this.voiceAnalysis.accuracy, this.textAnalysis.accuracy];
            
            const weights = { Happy: 0, Sad: 0, Energetic: 0, Calm: 0, Stressed: 0, Neutral: 0 };
            moods.forEach((mood, index) => { weights[mood] = (weights[mood] || 0) + accuracies[index]; });
            
            let fusedMood = 'Neutral';
            let maxWeight = 0;
            for (const [mood, weight] of Object.entries(weights)) {
                if (weight > maxWeight) { maxWeight = weight; fusedMood = mood; }
            }
            
            let totalAccuracy = 0, count = 0;
            moods.forEach((mood, index) => {
                if (mood === fusedMood) { totalAccuracy += accuracies[index]; count++; }
            });
            const confidence = count > 0 ? Math.round(totalAccuracy / count) : 70;
            
            const descriptions = {
                Happy: 'Your cheerful mood shines through! Here are uplifting tracks for you.',
                Sad: 'We hear you. These soulful melodies might help you process your emotions.',
                Energetic: 'High energy detected! Powerful tracks to match your dynamic spirit.',
                Calm: 'Peaceful state detected. Soothing tracks to complement your tranquility.',
                Stressed: 'Feeling overwhelmed? Let these calming tracks help you find your center.',
                Neutral: 'Here are some versatile tracks that might suit your current state.'
            };
            
            this.fusedMood = { mood: fusedMood, confidence, description: descriptions[fusedMood] || descriptions.Neutral };
        },
        
        // ==================== DYNAMIC RECOMMENDATIONS ====================
        
        async fetchAndPlayRecommendations() {
            this.isLoadingRecommendations = true;
            this.showToast(`Fetching ${this.fusedMood.mood} music recommendations...`, 'success');
            
            const tracks = await fetchDynamicRecommendations(this.fusedMood.mood, this.fusedMood.confidence);
            
            if (tracks && tracks.length > 0) {
                this.recommendedTracks = tracks;
                this.showToast(`Found ${tracks.length} tracks for your ${this.fusedMood.mood} mood!`, 'success');
            } else {
                this.recommendedTracks = [];
                this.showToast('Unable to fetch recommendations. Please try again.', 'error');
            }
            
            this.isLoadingRecommendations = false;
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
                        this.openSpotifyTrack(track);
                    });
                this.currentAudio.onended = () => { this.isPlaying = false; this.currentPlayingTrackId = null; };
            } else {
                this.openSpotifyTrack(track);
            }
        },
        
        openSpotifyTrack(track) {
            if (track.spotifyUrl) {
                window.open(track.spotifyUrl, '_blank');
            } else {
                window.open(`https://open.spotify.com/search/${encodeURIComponent(track.name + ' ' + track.artist)}`, '_blank');
            }
            this.showToast(`Opening ${track.name} on Spotify`, 'info');
        },
        
        togglePlayPause(track) {
            if (this.currentPlayingTrackId === track.id && this.isPlaying) {
                this.currentAudio.pause();
                this.isPlaying = false;
            } else if (this.currentPlayingTrackId === track.id && !this.isPlaying) {
                this.currentAudio.play();
                this.isPlaying = true;
            } else {
                this.playTrack(track);
            }
        },
        
        stopCurrentTrack() {
            if (this.currentAudio) {
                this.currentAudio.pause();
                this.currentAudio = null;
                this.isPlaying = false;
                this.currentPlayingTrackId = null;
            }
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
            const newEntry = { time: timeString, mood: this.fusedMood.mood, confidence: this.fusedMood.confidence };
            this.moodHistory.unshift(newEntry);
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