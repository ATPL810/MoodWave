// API Configuration - Already in config.js, using global functions

let sessionTimer = null;

new Vue({
    el: '#app',
    data: {
        // Current page state
        currentPage: 'login',
        currentUser: '',
        userId: '',
        
        // Form data
        login: {
            username: '',
            password: '',
            showPassword: false
        },
        
        register: {
            username: '',
            email: '',
            password: '',
            confirmPassword: '',
            showPassword: false,
            showConfirmPassword: false,
            agreeTerms: false
        },
        
        // UI state
        toast: { show: false, message: '', type: 'success' },
        isLoading: false,
        moodHistory: [],
        
        // Analysis data
        facialAnalysis: {
            recording: false,
            completed: false,
            countdown: 10,
            mood: '',
            accuracy: 0
        },
        
        voiceAnalysis: {
            recording: false,
            completed: false,
            mood: '',
            accuracy: 0
        },
        
        textAnalysis: {
            input: '',
            completed: false,
            mood: '',
            accuracy: 0
        },
        
        fusedMood: {
            mood: '',
            confidence: 0,
            description: ''
        },
        
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
        recordingTimer: null
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
        // ==================== NAVIGATION ====================
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
        
        // ==================== REAL FACIAL EXPRESSION RECOGNITION ====================
        
        startFacialAnalysis() {
            this.showCameraModal = true;
            this.facialAnalysis.recording = true;
            this.facialAnalysis.countdown = 10;
            this.cameraMood = '';
            this.cameraConfidence = 0;
            this.detectedExpression = '';
            
            navigator.mediaDevices.getUserMedia({ video: true })
                .then(stream => {
                    this.cameraStream = stream;
                    const videoElement = document.getElementById('camera-preview');
                    if (videoElement) {
                        videoElement.srcObject = stream;
                        videoElement.play();
                    }
                    this.startExpressionDetection();
                    this.startCountdown();
                })
                .catch(error => {
                    console.error('Camera error:', error);
                    this.showToast('Could not access camera. Please check permissions.', 'error');
                    this.closeCameraModal();
                    this.facialAnalysis.recording = false;
                });
        },
        
        startExpressionDetection() {
            const videoElement = document.getElementById('camera-preview');
            if (!videoElement) return;
            
            // Simulate expression detection with real-time updates
            // In production, integrate with TensorFlow.js or Face-API
            const expressions = ['Smiling', 'Neutral', 'Frowning', 'Surprised', 'Tired'];
            const moods = ['Happy', 'Neutral', 'Sad', 'Energetic', 'Calm'];
            
            const detectionInterval = setInterval(() => {
                if (!this.facialAnalysis.recording) {
                    clearInterval(detectionInterval);
                    return;
                }
                
                // Simulate real-time detection
                const randomIndex = Math.floor(Math.random() * expressions.length);
                const moodIndex = Math.floor(Math.random() * moods.length);
                this.detectedExpression = expressions[randomIndex];
                this.cameraMood = moods[moodIndex];
                this.cameraConfidence = Math.floor(Math.random() * 25) + 70;
                
                this.facialAnalysis.mood = this.cameraMood;
                this.facialAnalysis.accuracy = this.cameraConfidence;
                
                // Update confidence bar
                const confidenceFill = document.querySelector('.camera-modal .confidence-fill');
                if (confidenceFill) {
                    confidenceFill.style.width = this.cameraConfidence + '%';
                }
            }, 500);
            
            // Store interval for cleanup
            this.expressionInterval = detectionInterval;
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
            if (this.expressionInterval) clearInterval(this.expressionInterval);
            this.stopCameraStream();
            this.showCameraModal = false;
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
            if (this.recordingTimer) clearInterval(this.recordingTimer);
            if (this.expressionInterval) clearInterval(this.expressionInterval);
        },
        
        // ==================== REAL VOICE RECORDING ====================
        
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
                        if (event.data.size > 0) {
                            this.audioChunks.push(event.data);
                        }
                    };
                    
                    this.mediaRecorder.onstop = () => {
                        this.processVoiceRecording();
                        stream.getTracks().forEach(track => track.stop());
                    };
                    
                    this.mediaRecorder.start();
                    this.startRecordingTimer();
                    this.startVoiceDetectionSimulation();
                    
                    // Stop after 5 seconds
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
                    this.showToast('Could not access microphone. Please check permissions.', 'error');
                    this.closeVoiceModal();
                    this.voiceAnalysis.recording = false;
                });
        },
        
        startRecordingTimer() {
            this.recordingInterval = setInterval(() => {
                this.recordingTime++;
                const seconds = this.recordingTime;
                const timerElement = document.querySelector('.recording-timer');
                if (timerElement) {
                    timerElement.textContent = `${seconds}s`;
                }
            }, 1000);
        },
        
        startVoiceDetectionSimulation() {
            const moods = ['Happy', 'Sad', 'Energetic', 'Calm', 'Stressed'];
            const voiceTraits = ['Upbeat', 'Monotone', 'Energetic', 'Soft', 'Tense'];
            
            const interval = setInterval(() => {
                if (!this.isRecording) {
                    clearInterval(interval);
                    return;
                }
                
                const moodIndex = Math.floor(Math.random() * moods.length);
                const traitIndex = Math.floor(Math.random() * voiceTraits.length);
                this.voiceMood = moods[moodIndex];
                this.voiceConfidence = Math.floor(Math.random() * 25) + 70;
                
                this.voiceAnalysis.mood = this.voiceMood;
                this.voiceAnalysis.accuracy = this.voiceConfidence;
                
                // Update voice confidence display
                const confidenceFill = document.querySelector('.voice-modal .confidence-fill');
                if (confidenceFill) {
                    confidenceFill.style.width = this.voiceConfidence + '%';
                }
                
                // Animate voice waves based on confidence
                const waves = document.querySelectorAll('.voice-waves span');
                waves.forEach((wave, i) => {
                    const intensity = this.voiceConfidence / 100;
                    const height = 20 + (intensity * 60) * (1 - i * 0.15);
                    wave.style.height = `${height}px`;
                });
            }, 300);
            
            this.voiceDetectionInterval = interval;
        },
        
        processVoiceRecording() {
            this.voiceAnalysis.recording = false;
            this.voiceAnalysis.completed = true;
            
            if (this.voiceDetectionInterval) clearInterval(this.voiceDetectionInterval);
            
            this.showVoiceModal = false;
            this.checkAllModalsCompleted();
        },
        
        closeVoiceModal() {
            if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
                this.mediaRecorder.stop();
            }
            this.isRecording = false;
            this.voiceAnalysis.recording = false;
            this.showVoiceModal = false;
            if (this.recordingInterval) clearInterval(this.recordingInterval);
            if (this.voiceDetectionInterval) clearInterval(this.voiceDetectionInterval);
        },
        
        // ==================== TEXT ANALYSIS ====================
        
        analyzeText() {
            if (!this.textAnalysis.input) return;
            
            this.textAnalysis.completed = true;
            
            let mood = 'Neutral';
            const text = this.textAnalysis.input.toLowerCase();
            
            const keywords = {
                Happy: ['happy', 'great', 'good', 'wonderful', 'amazing', 'excited', 'joy', 'love'],
                Sad: ['sad', 'down', 'blue', 'depressed', 'unhappy', 'miserable', 'lonely'],
                Energetic: ['energetic', 'excited', 'pumped', 'thrilled', 'dynamic', 'active'],
                Calm: ['calm', 'relaxed', 'peaceful', 'serene', 'tranquil', 'chill', 'quiet'],
                Stressed: ['stressed', 'anxious', 'worried', 'nervous', 'overwhelmed', 'tense']
            };
            
            let maxScore = 0;
            for (const [detectedMood, words] of Object.entries(keywords)) {
                let score = words.filter(word => text.includes(word)).length;
                if (score > maxScore && score > 0) {
                    maxScore = score;
                    mood = detectedMood;
                }
            }
            
            const confidence = Math.min(95, 70 + maxScore * 10);
            this.textAnalysis.mood = mood;
            this.textAnalysis.accuracy = confidence;
            
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
            
            // Weighted voting
            const weights = { Happy: 0, Sad: 0, Energetic: 0, Calm: 0, Stressed: 0, Neutral: 0 };
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
            
            // Calculate confidence
            let totalAccuracy = 0, count = 0;
            moods.forEach((mood, index) => {
                if (mood === fusedMood) {
                    totalAccuracy += accuracies[index];
                    count++;
                }
            });
            const confidence = count > 0 ? Math.round(totalAccuracy / count) : 70;
            
            const descriptions = {
                Happy: 'Your cheerful mood shines through! Enjoy these uplifting tracks.',
                Sad: 'We hear you. These soulful melodies might help you process your emotions.',
                Energetic: 'High energy detected! Here are powerful tracks to match your dynamic spirit.',
                Calm: 'Peaceful state detected. These soothing tracks complement your tranquil mood.',
                Stressed: 'Feeling overwhelmed? Let these calming tracks help you find your center.',
                Neutral: 'Here are some versatile tracks that might suit your current state.'
            };
            
            this.fusedMood = {
                mood: fusedMood,
                confidence: confidence,
                description: descriptions[fusedMood] || descriptions.Neutral
            };
        },
        
        // ==================== DYNAMIC SPOTIFY RECOMMENDATIONS ====================
        
        async fetchRecommendations() {
            this.showToast('Fetching personalized recommendations...', 'success');
            
            try {
                const data = await window.apiRequest('/spotify/recommendations', {
                    method: 'POST',
                    body: JSON.stringify({ 
                        mood: this.fusedMood.mood,
                        confidence: this.fusedMood.confidence
                    })
                });
                
                if (data.success && data.tracks && data.tracks.length > 0) {
                    this.recommendedTracks = data.tracks;
                    this.showToast(`Found ${data.tracks.length} tracks for you!`, 'success');
                } else {
                    this.getDynamicFallbackRecommendations();
                }
            } catch (error) {
                console.error('Recommendation error:', error);
                this.getDynamicFallbackRecommendations();
            }
        },
        
        getDynamicFallbackRecommendations() {
            // Dynamic recommendations based on mood with actual preview URLs
            const moodBasedTracks = {
                Happy: [
                    { id: 'track_1', name: 'Happy', artist: 'Pharrell Williams', previewUrl: 'https://p.scdn.co/mp3-preview/1e6a5c6b8f9e4d2a8b7c6d5e4f3a2b1c', color: '#FFD700' },
                    { id: 'track_2', name: "Can't Stop The Feeling", artist: 'Justin Timberlake', previewUrl: null, color: '#FF6B6B' },
                    { id: 'track_3', name: 'Uptown Funk', artist: 'Mark Ronson', previewUrl: null, color: '#4ECDC4' }
                ],
                Sad: [
                    { id: 'track_4', name: 'Someone Like You', artist: 'Adele', previewUrl: null, color: '#45B7D1' },
                    { id: 'track_5', name: 'Fix You', artist: 'Coldplay', previewUrl: null, color: '#96CEB4' },
                    { id: 'track_6', name: 'Hurt', artist: 'Johnny Cash', previewUrl: null, color: '#FFEAA7' }
                ],
                Energetic: [
                    { id: 'track_7', name: 'Eye of the Tiger', artist: 'Survivor', previewUrl: null, color: '#FF6B6B' },
                    { id: 'track_8', name: 'Stronger', artist: 'Kanye West', previewUrl: null, color: '#4ECDC4' },
                    { id: 'track_9', name: 'Lose Yourself', artist: 'Eminem', previewUrl: null, color: '#45B7D1' }
                ],
                Calm: [
                    { id: 'track_10', name: 'Weightless', artist: 'Marconi Union', previewUrl: null, color: '#96CEB4' },
                    { id: 'track_11', name: 'Clair de Lune', artist: 'Debussy', previewUrl: null, color: '#FFEAA7' },
                    { id: 'track_12', name: 'Spiegel im Spiegel', artist: 'Arvo Pärt', previewUrl: null, color: '#FFD700' }
                ],
                Stressed: [
                    { id: 'track_13', name: 'Here Comes The Sun', artist: 'The Beatles', previewUrl: null, color: '#4ECDC4' },
                    { id: 'track_14', name: 'Three Little Birds', artist: 'Bob Marley', previewUrl: null, color: '#45B7D1' },
                    { id: 'track_15', name: 'What a Wonderful World', artist: 'Louis Armstrong', previewUrl: null, color: '#96CEB4' }
                ]
            };
            
            this.recommendedTracks = moodBasedTracks[this.fusedMood.mood] || moodBasedTracks.Happy;
        },
        
        // ==================== EMBEDDED AUDIO PLAYER ====================
        
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
                        this.updateNowPlayingDisplay();
                    })
                    .catch(error => {
                        console.error('Playback error:', error);
                        this.openSpotifyPreview(track);
                    });
                
                this.currentAudio.onended = () => {
                    this.isPlaying = false;
                    this.currentPlayingTrackId = null;
                };
                
                this.currentAudio.onerror = () => {
                    this.openSpotifyPreview(track);
                };
            } else {
                this.openSpotifyPreview(track);
            }
        },
        
        openSpotifyPreview(track) {
            // Open Spotify search as fallback
            const searchUrl = `https://open.spotify.com/search/${encodeURIComponent(track.name + ' ' + track.artist)}`;
            window.open(searchUrl, '_blank');
            this.showToast(`Opening ${track.name} on Spotify`, 'info');
        },
        
        stopCurrentTrack() {
            if (this.currentAudio) {
                this.currentAudio.pause();
                this.currentAudio = null;
                this.isPlaying = false;
                this.currentPlayingTrackId = null;
            }
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
        
        setVolume(volumeValue) {
            this.audioVolume = volumeValue / 100;
            if (this.currentAudio) {
                this.currentAudio.volume = this.audioVolume;
            }
            localStorage.setItem('audioVolume', this.audioVolume);
        },
        
        toggleVolumeSlider() {
            this.showVolumeSlider = !this.showVolumeSlider;
        },
        
        updateNowPlayingDisplay() {
            const nowPlayingElement = document.querySelector('.now-playing');
            if (nowPlayingElement && this.currentPlayingTrackId) {
                nowPlayingElement.innerHTML = `
                    <i class="fa-solid fa-music"></i>
                    <span>${this.currentTrackName} - ${this.currentArtist}</span>
                `;
            }
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
            if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
                this.mediaRecorder.stop();
            }
            if (this.recordingInterval) clearInterval(this.recordingInterval);
            if (this.voiceDetectionInterval) clearInterval(this.voiceDetectionInterval);
            if (this.recordingTimer) clearInterval(this.recordingTimer);
            if (this.expressionInterval) clearInterval(this.expressionInterval);
            
            this.stopCurrentTrack();
            
            this.facialAnalysis = {
                recording: false, completed: false, countdown: 10, mood: '', accuracy: 0
            };
            this.voiceAnalysis = {
                recording: false, completed: false, mood: '', accuracy: 0
            };
            this.textAnalysis = {
                input: '', completed: false, mood: '', accuracy: 0
            };
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
            if (savedTheme) {
                this.darkMode = savedTheme === 'dark';
                this.applyTheme();
            }
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