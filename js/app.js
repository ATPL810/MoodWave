// NO API URL DEFINITION HERE - It's already in config.js
// The config.js is loaded before app.js, so API_BASE_URL is already available globally

// Session timer management
let sessionTimer = null;

new Vue({
    el: '#app',
    data: {
        // Current page state
        currentPage: 'login',
        
        // Current logged in user
        currentUser: '',
        userId: '',
        
        // Login form data
        login: {
            username: '',
            password: '',
            showPassword: false
        },
        
        // Register form data
        register: {
            username: '',
            email: '',
            password: '',
            confirmPassword: '',
            showPassword: false,
            showConfirmPassword: false,
            agreeTerms: false
        },
        
        // Toast notification
        toast: {
            show: false,
            message: '',
            type: 'success'
        },
        
        // Loading state for async operations
        isLoading: false,
        
        // Mood history for dashboard
        moodHistory: [],
        
        // Facial analysis
        facialAnalysis: {
            recording: false,
            completed: false,
            countdown: 10,
            mood: '',
            accuracy: 0,
            videoStream: null,
            mediaRecorder: null,
            recordedChunks: []
        },
        
        // Voice analysis
        voiceAnalysis: {
            recording: false,
            completed: false,
            mood: '',
            accuracy: 0,
            mediaRecorder: null,
            recordedChunks: []
        },
        
        // Text analysis
        textAnalysis: {
            input: '',
            completed: false,
            mood: '',
            accuracy: 0
        },
        
        // Fused mood result
        fusedMood: {
            mood: '',
            confidence: 0,
            description: ''
        },
        
        // Recommended tracks with audio preview
        recommendedTracks: [],
        currentAudio: null,
        currentPlayingTrackId: null,
        audioVolume: 0.7,
        showVolumeSlider: false,
        
        // Timer for recording countdown
        recordingTimer: null,
        
        // Camera stream for facial detection
        cameraStream: null,
        
        // Theme management
        darkMode: false,
        showThemeDropdown: false,
        
        // Logout confirmation modal
        showLogoutModal: false,
        
        // Camera modal for facial detection
        showCameraModal: false,
        cameraConfidence: 0,
        cameraMood: '',
        detectedExpression: '',
        
        // Voice recording modal
        showVoiceModal: false,
        voiceConfidence: 0,
        voiceMood: '',
        
        // TensorFlow models
        faceDetectionModel: null,
        faceLandmarksModel: null,
        
        // Audio context for voice analysis
        audioContext: null,
        mediaStream: null,
        analyser: null,
        voiceDetectionInterval: null
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
                this.$nextTick(() => {
                    this.applyTheme();
                });
            }
        }
    },
    
    methods: {
        // ==================== NAVIGATION METHODS ====================
        switchToRegister() {
            this.currentPage = 'register';
            this.clearForms();
        },
        
        switchToLogin() {
            this.currentPage = 'login';
            this.clearForms();
        },
        
        navigateTo(page) {
            this.currentPage = page;
            if (page === 'music') {
                this.resetAnalysis();
            }
        },
        
        clearForms() {
            this.login = {
                username: '',
                password: '',
                showPassword: false
            };
            
            this.register = {
                username: '',
                email: '',
                password: '',
                confirmPassword: '',
                showPassword: false,
                showConfirmPassword: false,
                agreeTerms: false
            };
        },
        
        // ==================== AUTHENTICATION METHODS ====================
        
        async handleLogin() {
            if (!this.login.username || !this.login.password) {
                this.showToast('Please fill in all fields', 'error');
                return;
            }
            
            this.isLoading = true;
            
            try {
                // Using the global apiRequest function from config.js
                const data = await window.apiRequest('/auth/login', {
                    method: 'POST',
                    body: JSON.stringify({
                        username: this.login.username,
                        password: this.login.password
                    })
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
                    
                    setTimeout(() => {
                        this.currentPage = 'home';
                        this.isLoading = false;
                    }, 5000);
                }
            } catch (error) {
                this.showToast(error.message, 'error');
                this.isLoading = false;
            }
        },
        
        async handleRegister() {
            if (!this.register.username || !this.register.email || 
                !this.register.password || !this.register.confirmPassword) {
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
                    
                    setTimeout(() => {
                        this.clearForms();
                        this.currentPage = 'login';
                        this.isLoading = false;
                    }, 2000);
                }
            } catch (error) {
                this.showToast(error.message, 'error');
                this.isLoading = false;
            }
        },
        
        startSessionTimer() {
            if (sessionTimer) clearInterval(sessionTimer);
            
            sessionTimer = setInterval(async () => {
                try {
                    await window.apiRequest('/auth/verify');
                } catch (error) {
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
                if (data.success) {
                    this.moodHistory = data.history;
                }
            } catch (error) {
                console.error('Failed to fetch mood history:', error);
            }
        },
        
        confirmLogout() {
            this.showLogoutModal = true;
        },
        
        cancelLogout() {
            this.showLogoutModal = false;
        },
        
        async logout() {
            this.showLogoutModal = false;
            
            try {
                await window.apiRequest('/auth/logout', { method: 'POST' });
            } catch (error) {
                console.error('Logout API error:', error);
            }
            
            if (sessionTimer) {
                clearInterval(sessionTimer);
                sessionTimer = null;
            }
            
            if (this.currentAudio) {
                this.currentAudio.pause();
                this.currentAudio = null;
            }
            
            if (this.cameraStream) {
                this.stopCameraStream();
            }
            
            window.clearAuthToken();
            localStorage.removeItem('user');
            
            this.currentUser = '';
            this.userId = '';
            this.currentPage = 'login';
            this.clearForms();
            this.moodHistory = [];
            this.resetAnalysis();
            this.showToast('Logged out successfully', 'success');
        },
        
        // ==================== TOAST NOTIFICATION ====================
        showToast(message, type) {
            this.toast = {
                show: true,
                message,
                type
            };
            
            setTimeout(() => {
                this.toast.show = false;
            }, 3000);
        },
        
        // ==================== REAL FACIAL EXPRESSION ANALYSIS ====================
        
        async initFaceDetection() {
            try {
                if (typeof faceDetection !== 'undefined') {
                    this.faceDetectionModel = await faceDetection.createDetector(
                        faceDetection.SupportedModels.MediaPipeFaceDetector,
                        { runtime: 'tfjs' }
                    );
                    
                    this.faceLandmarksModel = await faceLandmarksDetection.createDetector(
                        faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh,
                        { runtime: 'tfjs' }
                    );
                    
                    console.log('Face detection models loaded');
                    return true;
                }
                return false;
            } catch (error) {
                console.error('Failed to load face detection models:', error);
                return false;
            }
        },
        
        async startRealFacialAnalysis() {
            this.showCameraModal = true;
            this.cameraConfidence = 0;
            this.cameraMood = '';
            this.facialAnalysis.recording = true;
            this.facialAnalysis.countdown = 10;
            
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: true });
                this.cameraStream = stream;
                const videoElement = document.getElementById('camera-preview');
                if (videoElement) {
                    videoElement.srcObject = stream;
                    await videoElement.play();
                }
                
                this.startRealTimeExpressionDetection();
                
                // Countdown timer
                this.recordingTimer = setInterval(() => {
                    this.facialAnalysis.countdown--;
                    if (this.facialAnalysis.countdown <= 0) {
                        clearInterval(this.recordingTimer);
                        this.stopRealFacialAnalysis();
                    }
                }, 1000);
                
            } catch (error) {
                console.error('Camera error:', error);
                this.showToast('Could not access camera. Using simulation mode.', 'error');
                this.showCameraModal = false;
                this.startFacialAnalysisSimulation();
            }
        },
        
        async startRealTimeExpressionDetection() {
            const videoElement = document.getElementById('camera-preview');
            if (!videoElement || !this.faceLandmarksModel) return;
            
            const detectExpressions = async () => {
                if (!this.facialAnalysis.recording || !this.faceLandmarksModel) {
                    return;
                }
                
                try {
                    const faces = await this.faceLandmarksModel.estimateFaces(videoElement);
                    
                    if (faces && faces.length > 0) {
                        const face = faces[0];
                        const landmarks = face.keypoints;
                        
                        const expression = this.analyzeFacialFeatures(landmarks);
                        const confidence = this.calculateExpressionConfidence(expression, landmarks);
                        
                        this.cameraMood = expression.mood;
                        this.detectedExpression = expression.name;
                        this.cameraConfidence = confidence;
                        
                        this.facialAnalysis.mood = expression.mood;
                        this.facialAnalysis.accuracy = confidence;
                    }
                    
                    requestAnimationFrame(detectExpressions);
                } catch (error) {
                    console.error('Expression detection error:', error);
                    requestAnimationFrame(detectExpressions);
                }
            };
            
            detectExpressions();
        },
        
        analyzeFacialFeatures(landmarks) {
            const leftEye = landmarks.find(l => l.name === 'leftEye') || landmarks[33];
            const rightEye = landmarks.find(l => l.name === 'rightEye') || landmarks[263];
            const leftMouth = landmarks.find(l => l.name === 'lipsLowerOuter') || landmarks[291];
            const rightMouth = landmarks.find(l => l.name === 'lipsUpperOuter') || landmarks[61];
            const leftEyebrow = landmarks.find(l => l.name === 'leftEyebrowOuter') || landmarks[70];
            const rightEyebrow = landmarks.find(l => l.name === 'rightEyebrowOuter') || landmarks[336];
            
            const eyeDistance = Math.abs(leftEye.y - rightEye.y);
            const mouthWidth = Math.abs(leftMouth.x - rightMouth.x);
            const eyebrowHeight = (leftEyebrow.y + rightEyebrow.y) / 2;
            const eyeHeight = (leftEye.y + rightEye.y) / 2;
            
            let mood = 'Neutral';
            let expressionName = 'Neutral';
            
            if (mouthWidth > eyeDistance * 1.5) {
                expressionName = 'Smiling';
                mood = 'Happy';
            }
            
            if (eyebrowHeight < eyeHeight - 5) {
                if (expressionName === 'Smiling') {
                    mood = 'Energetic';
                    expressionName = 'Excited';
                } else {
                    expressionName = 'Surprised';
                    mood = 'Energetic';
                }
            }
            
            if (eyebrowHeight > eyeHeight + 8) {
                expressionName = 'Frowning';
                mood = 'Stressed';
            }
            
            if (eyeDistance < 15) {
                expressionName = 'Squinting';
                mood = 'Stressed';
            }
            
            if (eyeHeight > 25) {
                expressionName = 'Droopy Eyes';
                mood = 'Sad';
            }
            
            return { mood, name: expressionName };
        },
        
        calculateExpressionConfidence(expression, landmarks) {
            let baseConfidence = 70;
            
            if (expression.name === 'Smiling') baseConfidence = 85;
            else if (expression.name === 'Excited') baseConfidence = 80;
            else if (expression.name === 'Frowning') baseConfidence = 75;
            
            const validLandmarks = landmarks.filter(l => l && l.x && l.y).length;
            const qualityBoost = Math.min(15, validLandmarks / 10);
            
            return Math.min(98, baseConfidence + qualityBoost);
        },
        
        stopRealFacialAnalysis() {
            this.facialAnalysis.recording = false;
            this.facialAnalysis.completed = true;
            
            if (!this.facialAnalysis.mood) {
                this.facialAnalysis.mood = this.cameraMood || 'Happy';
                this.facialAnalysis.accuracy = this.cameraConfidence || 85;
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
                    this.completeFacialAnalysisSimulation();
                }
            }, 1000);
        },
        
        completeFacialAnalysisSimulation() {
            this.facialAnalysis.recording = false;
            this.facialAnalysis.completed = true;
            
            const moods = ['Happy', 'Sad', 'Energetic', 'Calm', 'Stressed'];
            const randomMood = moods[Math.floor(Math.random() * moods.length)];
            const accuracy = Math.floor(Math.random() * 20) + 75;
            
            this.facialAnalysis.mood = randomMood;
            this.facialAnalysis.accuracy = accuracy;
            
            this.checkAllModalsCompleted();
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
            if (this.recordingTimer) {
                clearInterval(this.recordingTimer);
                this.recordingTimer = null;
            }
        },
        
        // ==================== REAL VOICE ANALYSIS ====================
        
        async startRealVoiceAnalysis() {
            this.showVoiceModal = true;
            this.voiceAnalysis.recording = true;
            this.voiceConfidence = 0;
            this.voiceMood = '';
            
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                this.mediaStream = stream;
                
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
                this.analyser = this.audioContext.createAnalyser();
                const source = this.audioContext.createMediaStreamSource(stream);
                source.connect(this.analyser);
                
                this.analyser.fftSize = 256;
                const bufferLength = this.analyser.frequencyBinCount;
                const dataArray = new Uint8Array(bufferLength);
                
                this.voiceAnalysis.mediaRecorder = new MediaRecorder(stream);
                this.voiceAnalysis.recordedChunks = [];
                
                this.voiceAnalysis.mediaRecorder.ondataavailable = (event) => {
                    if (event.data.size > 0) {
                        this.voiceAnalysis.recordedChunks.push(event.data);
                    }
                };
                
                this.voiceAnalysis.mediaRecorder.start();
                
                this.voiceDetectionInterval = setInterval(() => {
                    if (!this.voiceAnalysis.recording) return;
                    
                    this.analyser.getByteFrequencyData(dataArray);
                    const audioFeatures = this.analyzeAudioFeatures(dataArray);
                    const emotion = this.detectVoiceEmotion(audioFeatures);
                    
                    this.voiceMood = emotion.mood;
                    this.voiceConfidence = emotion.confidence;
                    
                    this.voiceAnalysis.mood = emotion.mood;
                    this.voiceAnalysis.accuracy = emotion.confidence;
                    
                    this.updateVoiceWaves(audioFeatures.energy);
                    
                }, 100);
                
                setTimeout(() => {
                    this.stopRealVoiceAnalysis();
                }, 5000);
                
            } catch (error) {
                console.error('Microphone error:', error);
                this.showToast('Could not access microphone. Using simulation mode.', 'error');
                this.showVoiceModal = false;
                this.startVoiceAnalysisSimulation();
            }
        },
        
        analyzeAudioFeatures(frequencyData) {
            let sum = 0;
            let lowFreqSum = 0;
            let highFreqSum = 0;
            const lowFreqCutoff = Math.floor(frequencyData.length * 0.3);
            const highFreqCutoff = Math.floor(frequencyData.length * 0.7);
            
            for (let i = 0; i < frequencyData.length; i++) {
                sum += frequencyData[i];
                if (i < lowFreqCutoff) {
                    lowFreqSum += frequencyData[i];
                } else if (i > highFreqCutoff) {
                    highFreqSum += frequencyData[i];
                }
            }
            
            const averageAmplitude = sum / frequencyData.length;
            const energy = averageAmplitude / 255;
            const lowFreqRatio = lowFreqSum / (sum || 1);
            const highFreqRatio = highFreqSum / (sum || 1);
            
            let weightedSum = 0;
            for (let i = 0; i < frequencyData.length; i++) {
                weightedSum += i * frequencyData[i];
            }
            const spectralCentroid = weightedSum / (sum || 1) / frequencyData.length;
            
            let variation = 0;
            for (let i = 1; i < frequencyData.length; i++) {
                variation += Math.abs(frequencyData[i] - frequencyData[i-1]);
            }
            const tremor = variation / (frequencyData.length - 1) / 255;
            
            return { energy, lowFreqRatio, highFreqRatio, spectralCentroid, tremor, averageAmplitude };
        },
        
        detectVoiceEmotion(features) {
            let mood = 'Neutral';
            let confidence = 70;
            
            if (features.energy > 0.7) {
                if (features.spectralCentroid > 0.6) {
                    mood = 'Energetic';
                    confidence = 85 + (features.energy - 0.7) * 30;
                } else {
                    mood = 'Happy';
                    confidence = 80 + features.energy * 15;
                }
            } else if (features.energy < 0.3) {
                if (features.lowFreqRatio > 0.5) {
                    mood = 'Sad';
                    confidence = 75 + (0.3 - features.energy) * 50;
                } else {
                    mood = 'Calm';
                    confidence = 70 + (0.3 - features.energy) * 40;
                }
            } else {
                if (features.tremor > 0.4) {
                    mood = 'Stressed';
                    confidence = 80 + features.tremor * 15;
                } else if (features.spectralCentroid > 0.5) {
                    mood = 'Happy';
                    confidence = 75;
                } else if (features.lowFreqRatio > 0.6) {
                    mood = 'Calm';
                    confidence = 72;
                }
            }
            
            const clarityScore = (1 - features.tremor) * features.energy;
            confidence = Math.min(98, confidence + clarityScore * 10);
            
            return { mood, confidence: Math.round(confidence) };
        },
        
        updateVoiceWaves(energy) {
            const waves = document.querySelectorAll('.voice-waves span');
            if (waves) {
                const intensity = Math.min(1, energy * 1.5);
                waves.forEach((wave, index) => {
                    const height = 20 + (intensity * 60) * (1 - index * 0.15);
                    wave.style.height = `${height}px`;
                });
            }
        },
        
        async stopRealVoiceAnalysis() {
            this.voiceAnalysis.recording = false;
            
            if (this.voiceDetectionInterval) {
                clearInterval(this.voiceDetectionInterval);
                this.voiceDetectionInterval = null;
            }
            
            if (this.voiceAnalysis.mediaRecorder && this.voiceAnalysis.mediaRecorder.state === 'recording') {
                this.voiceAnalysis.mediaRecorder.stop();
            }
            
            if (this.audioContext) {
                await this.audioContext.close();
                this.audioContext = null;
            }
            
            if (this.mediaStream) {
                this.mediaStream.getTracks().forEach(track => track.stop());
                this.mediaStream = null;
            }
            
            this.voiceAnalysis.completed = true;
            this.showVoiceModal = false;
            this.checkAllModalsCompleted();
        },
        
        startVoiceAnalysisSimulation() {
            this.voiceAnalysis.recording = true;
            
            setTimeout(() => {
                this.completeVoiceAnalysisSimulation();
            }, 5000);
        },
        
        completeVoiceAnalysisSimulation() {
            this.voiceAnalysis.recording = false;
            this.voiceAnalysis.completed = true;
            
            const moods = ['Happy', 'Sad', 'Energetic', 'Calm', 'Stressed'];
            const randomMood = moods[Math.floor(Math.random() * moods.length)];
            const accuracy = Math.floor(Math.random() * 20) + 70;
            
            this.voiceAnalysis.mood = randomMood;
            this.voiceAnalysis.accuracy = accuracy;
            
            this.checkAllModalsCompleted();
        },
        
        closeVoiceModal() {
            if (this.voiceAnalysis.mediaRecorder && this.voiceAnalysis.recording) {
                this.voiceAnalysis.mediaRecorder.stop();
            }
            this.voiceAnalysis.recording = false;
            this.showVoiceModal = false;
        },
        
        // ==================== TEXT ANALYSIS ====================
        
        analyzeText() {
            if (!this.textAnalysis.input) return;
            
            this.textAnalysis.completed = true;
            
            let mood = 'Neutral';
            let confidence = 85;
            const text = this.textAnalysis.input.toLowerCase();
            
            const moodKeywords = {
                Happy: ['happy', 'great', 'good', 'wonderful', 'amazing', 'excited', 'joy', 'love', 'fantastic', 'awesome'],
                Sad: ['sad', 'down', 'blue', 'depressed', 'unhappy', 'miserable', 'gloomy', 'lonely', 'heartbroken'],
                Energetic: ['energetic', 'excited', 'pumped', 'thrilled', 'dynamic', 'active', 'lively', 'enthusiastic'],
                Calm: ['calm', 'relaxed', 'peaceful', 'serene', 'tranquil', 'chill', 'quiet', 'meditative', 'soothing'],
                Stressed: ['stressed', 'anxious', 'worried', 'nervous', 'overwhelmed', 'tense', 'frustrated', 'panic']
            };
            
            let maxScore = 0;
            
            for (const [detectedMood, keywords] of Object.entries(moodKeywords)) {
                let score = 0;
                keywords.forEach(keyword => {
                    if (text.includes(keyword)) {
                        score += 2;
                    }
                });
                
                if (text.includes('very') || text.includes('extremely') || text.includes('so')) {
                    score *= 1.5;
                }
                
                if (score > maxScore && score > 0) {
                    maxScore = score;
                    mood = detectedMood;
                    confidence = Math.min(95, 70 + score * 5);
                }
            }
            
            this.textAnalysis.mood = mood;
            this.textAnalysis.accuracy = Math.floor(confidence);
            
            this.checkAllModalsCompleted();
        },
        
        // ==================== MOOD FUSION ====================
        
        checkAllModalsCompleted() {
            if (this.allModalsCompleted) {
                this.fuseModalities();
                this.fetchRecommendations();
                this.updateDashboard();
            }
        },
        
        fuseModalities() {
            const moods = [this.facialAnalysis.mood, this.voiceAnalysis.mood, this.textAnalysis.mood];
            const accuracies = [this.facialAnalysis.accuracy, this.voiceAnalysis.accuracy, this.textAnalysis.accuracy];
            
            const weights = { Happy: 0, Sad: 0, Energetic: 0, Calm: 0, Stressed: 0 };
            
            moods.forEach((mood, index) => {
                weights[mood] = (weights[mood] || 0) + accuracies[index];
            });
            
            let fusedMood = 'Neutral';
            let maxWeight = 0;
            
            for (const [mood, weight] of Object.entries(weights)) {
                if (weight > maxWeight) {
                    maxWeight = weight;
                    fusedMood = mood;
                }
            }
            
            if (maxWeight === 0 || moods[0] !== moods[1] && moods[1] !== moods[2] && moods[0] !== moods[2]) {
                fusedMood = moods.reduce((a, b) => weights[a] > weights[b] ? a : b);
            }
            
            const matchingAccuracies = [];
            moods.forEach((mood, index) => {
                if (mood === fusedMood) {
                    matchingAccuracies.push(accuracies[index]);
                }
            });
            
            const confidence = matchingAccuracies.length > 0 
                ? Math.round(matchingAccuracies.reduce((a, b) => a + b, 0) / matchingAccuracies.length)
                : 70;
            
            const descriptions = {
                Happy: 'Your cheerful mood shines through! Enjoy these uplifting tracks that match your positive energy.',
                Sad: 'We hear you. These soulful melodies might help you process your emotions.',
                Energetic: 'High energy detected! Here are some powerful tracks to match your dynamic spirit.',
                Calm: 'Peaceful state detected. These soothing tracks will complement your tranquil mood.',
                Stressed: 'Feeling overwhelmed? Let these calming tracks help you find your center.'
            };
            
            this.fusedMood = {
                mood: fusedMood,
                confidence: confidence,
                description: descriptions[fusedMood] || 'Based on your emotional state, we recommend these tracks.'
            };
        },
        
        // ==================== SPOTIFY RECOMMENDATIONS ====================
        
        async fetchRecommendations() {
            try {
                const data = await window.apiRequest('/spotify/recommendations', {
                    method: 'POST',
                    body: JSON.stringify({ mood: this.fusedMood.mood })
                });
                
                if (data.success && data.tracks && data.tracks.length > 0) {
                    this.recommendedTracks = data.tracks;
                } else {
                    this.getFallbackRecommendations();
                }
            } catch (error) {
                console.error('Failed to fetch recommendations:', error);
                this.getFallbackRecommendations();
            }
        },
        
        getFallbackRecommendations() {
            const fallbackTracks = {
                Happy: [
                    { id: '1', name: 'Happy', artist: 'Pharrell Williams', previewUrl: null, color: '#FFD700' },
                    { id: '2', name: 'Can\'t Stop The Feeling', artist: 'Justin Timberlake', previewUrl: null, color: '#FF6B6B' },
                    { id: '3', name: 'Uptown Funk', artist: 'Mark Ronson', previewUrl: null, color: '#4ECDC4' },
                    { id: '4', name: 'Good as Hell', artist: 'Lizzo', previewUrl: null, color: '#FFD700' },
                    { id: '5', name: 'Shake It Off', artist: 'Taylor Swift', previewUrl: null, color: '#FF6B6B' }
                ],
                Sad: [
                    { id: '6', name: 'Someone Like You', artist: 'Adele', previewUrl: null, color: '#45B7D1' },
                    { id: '7', name: 'Fix You', artist: 'Coldplay', previewUrl: null, color: '#96CEB4' },
                    { id: '8', name: 'Hurt', artist: 'Johnny Cash', previewUrl: null, color: '#FFEAA7' }
                ],
                Energetic: [
                    { id: '9', name: 'Eye of the Tiger', artist: 'Survivor', previewUrl: null, color: '#FF6B6B' },
                    { id: '10', name: 'Stronger', artist: 'Kanye West', previewUrl: null, color: '#4ECDC4' },
                    { id: '11', name: 'Lose Yourself', artist: 'Eminem', previewUrl: null, color: '#45B7D1' }
                ],
                Calm: [
                    { id: '12', name: 'Weightless', artist: 'Marconi Union', previewUrl: null, color: '#96CEB4' },
                    { id: '13', name: 'Clair de Lune', artist: 'Debussy', previewUrl: null, color: '#FFEAA7' },
                    { id: '14', name: 'Spiegel im Spiegel', artist: 'Arvo Pärt', previewUrl: null, color: '#FFD700' }
                ],
                Stressed: [
                    { id: '15', name: 'Here Comes The Sun', artist: 'The Beatles', previewUrl: null, color: '#4ECDC4' },
                    { id: '16', name: 'Three Little Birds', artist: 'Bob Marley', previewUrl: null, color: '#45B7D1' },
                    { id: '17', name: 'What a Wonderful World', artist: 'Louis Armstrong', previewUrl: null, color: '#96CEB4' }
                ]
            };
            
            this.recommendedTracks = fallbackTracks[this.fusedMood.mood] || fallbackTracks.Happy;
        },
        
        // ==================== AUDIO PLAYER ====================
        
        playTrack(track) {
            if (this.currentAudio) {
                this.currentAudio.pause();
                this.currentAudio = null;
                this.currentPlayingTrackId = null;
            }
            
            if (track.previewUrl) {
                this.currentAudio = new Audio(track.previewUrl);
                this.currentAudio.volume = this.audioVolume;
                this.currentAudio.play()
                    .then(() => {
                        this.currentPlayingTrackId = track.id;
                        this.showToast(`Now playing: ${track.name}`, 'success');
                    })
                    .catch(error => {
                        console.error('Playback error:', error);
                        this.showToast('Preview not available for this track', 'error');
                    });
                
                this.currentAudio.onended = () => {
                    this.currentPlayingTrackId = null;
                    this.currentAudio = null;
                };
            } else {
                window.open(`https://open.spotify.com/search/${encodeURIComponent(track.name)}`, '_blank');
                this.showToast(`Opening ${track.name} on Spotify`, 'success');
            }
        },
        
        stopCurrentTrack() {
            if (this.currentAudio) {
                this.currentAudio.pause();
                this.currentAudio = null;
                this.currentPlayingTrackId = null;
            }
        },
        
        setVolume(volume) {
            this.audioVolume = volume / 100;
            if (this.currentAudio) {
                this.currentAudio.volume = this.audioVolume;
            }
        },
        
        toggleVolumeSlider() {
            this.showVolumeSlider = !this.showVolumeSlider;
        },
        
        // ==================== DASHBOARD ====================
        
        async updateDashboard() {
            const now = new Date();
            const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            
            const newEntry = {
                time: timeString,
                mood: this.fusedMood.mood,
                confidence: this.fusedMood.confidence
            };
            
            this.moodHistory.unshift(newEntry);
            
            if (this.moodHistory.length > 10) {
                this.moodHistory.pop();
            }
            
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
        
        // ==================== RESET ANALYSIS ====================
        
        resetAnalysis() {
            if (this.cameraStream) {
                this.stopCameraStream();
            }
            
            if (this.voiceAnalysis.mediaRecorder && this.voiceAnalysis.recording) {
                this.voiceAnalysis.mediaRecorder.stop();
            }
            
            if (this.voiceDetectionInterval) {
                clearInterval(this.voiceDetectionInterval);
                this.voiceDetectionInterval = null;
            }
            
            if (this.audioContext) {
                this.audioContext.close();
                this.audioContext = null;
            }
            
            this.stopCurrentTrack();
            
            this.facialAnalysis = {
                recording: false,
                completed: false,
                countdown: 10,
                mood: '',
                accuracy: 0,
                videoStream: null,
                mediaRecorder: null,
                recordedChunks: []
            };
            
            this.voiceAnalysis = {
                recording: false,
                completed: false,
                mood: '',
                accuracy: 0,
                mediaRecorder: null,
                recordedChunks: []
            };
            
            this.textAnalysis = {
                input: '',
                completed: false,
                mood: '',
                accuracy: 0
            };
            
            this.fusedMood = {
                mood: '',
                confidence: 0,
                description: ''
            };
            
            this.recommendedTracks = [];
            this.showCameraModal = false;
            this.showVoiceModal = false;
            
            if (this.recordingTimer) {
                clearInterval(this.recordingTimer);
                this.recordingTimer = null;
            }
        },
        
        // ==================== THEME MANAGEMENT ====================
        
        toggleThemeDropdown() {
            this.showThemeDropdown = !this.showThemeDropdown;
        },
        
        setTheme(theme) {
            this.darkMode = theme === 'dark';
            this.showThemeDropdown = false;
            localStorage.setItem('moodwave-theme', theme);
            this.applyTheme();
            this.showToast(`Switched to ${theme} mode`, 'success');
        },
        
        loadThemePreference() {
            const savedTheme = localStorage.getItem('moodwave-theme');
            if (savedTheme) {
                this.darkMode = savedTheme === 'dark';
                this.applyTheme();
            }
        },
        
        applyTheme() {
            document.body.classList.remove('dark-mode-auth');
            
            const appContainer = document.querySelector('.app-container');
            if (appContainer) {
                if (this.darkMode) {
                    appContainer.classList.add('dark-mode');
                } else {
                    appContainer.classList.remove('dark-mode');
                }
            }
            
            if (this.currentPage === 'login' || this.currentPage === 'register' || this.currentPage === 'loading') {
                if (this.darkMode) {
                    document.body.classList.add('dark-mode-auth');
                }
            }
        },
        
        // ==================== CHECK AUTH ON LOAD ====================
        
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
        },
        
        // ==================== FACIAL ANALYSIS ENTRY POINT ====================
        
        async startFacialAnalysis() {
            const modelsLoaded = await this.initFaceDetection();
            if (modelsLoaded) {
                this.startRealFacialAnalysis();
            } else {
                this.startFacialAnalysisSimulation();
            }
        },
        
        // ==================== VOICE ANALYSIS ENTRY POINT ====================
        
        startVoiceAnalysis() {
            this.startRealVoiceAnalysis();
        }
    },
    
    mounted() {
        this.loadThemePreference();
        this.checkAuth();
        
        document.addEventListener('click', (e) => {
            if (this.showThemeDropdown && !e.target.closest('.theme-dropdown')) {
                this.showThemeDropdown = false;
            }
        });
    }
});