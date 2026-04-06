// API Configuration
const API_BASE_URL = 'http://localhost:5000/api'; // Change to your Render URL when deploying
// Example: const API_BASE_URL = 'https://moodwave-backend.onrender.com/api';

// Helper function for API calls
async function apiRequest(endpoint, options = {}) {
    const token = localStorage.getItem('token');
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };
    
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
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
        voiceMood: ''
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
                const data = await apiRequest('/auth/login', {
                    method: 'POST',
                    body: JSON.stringify({
                        username: this.login.username,
                        password: this.login.password
                    })
                });
                
                if (data.success) {
                    localStorage.setItem('token', data.token);
                    localStorage.setItem('user', JSON.stringify(data.user));
                    
                    this.currentUser = data.user.username;
                    this.userId = data.user.id;
                    this.showToast('Login successful!', 'success');
                    
                    // Start session timer
                    this.startSessionTimer();
                    
                    // Fetch mood history
                    await this.fetchMoodHistory();
                    
                    // Show loading page
                    this.currentPage = 'loading';
                    
                    // After 5 seconds, go to home
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
                const data = await apiRequest('/auth/register', {
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
        
        // Session management
        startSessionTimer() {
            if (sessionTimer) clearInterval(sessionTimer);
            
            // Check token validity every minute
            sessionTimer = setInterval(async () => {
                try {
                    await apiRequest('/auth/verify');
                } catch (error) {
                    if (error.message.includes('expired')) {
                        this.showToast('Session expired. Please login again.', 'error');
                        this.logout();
                    }
                }
            }, 60000); // Check every minute
            
            // Auto logout after 1 hour
            setTimeout(() => {
                if (this.currentPage !== 'login' && this.currentPage !== 'register') {
                    this.showToast('Session expired. Please login again.', 'error');
                    this.logout();
                }
            }, 60 * 60 * 1000); // 1 hour
        },
        
        async fetchMoodHistory() {
            try {
                const data = await apiRequest('/mood/history');
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
                await apiRequest('/auth/logout', { method: 'POST' });
            } catch (error) {
                console.error('Logout API error:', error);
            }
            
            // Clear session timer
            if (sessionTimer) {
                clearInterval(sessionTimer);
                sessionTimer = null;
            }
            
            // Stop any playing audio
            if (this.currentAudio) {
                this.currentAudio.pause();
                this.currentAudio = null;
            }
            
            // Stop camera stream if active
            if (this.cameraStream) {
                this.stopCameraStream();
            }
            
            localStorage.removeItem('token');
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
        
        // ==================== FACIAL EXPRESSION ANALYSIS ====================
        
        startFacialAnalysis() {
            this.showCameraModal = true;
            this.cameraConfidence = 0;
            this.cameraMood = '';
            this.detectedExpression = '';
            
            // Request camera access
            navigator.mediaDevices.getUserMedia({ video: true })
                .then(stream => {
                    this.cameraStream = stream;
                    const videoElement = document.getElementById('camera-preview');
                    if (videoElement) {
                        videoElement.srcObject = stream;
                        videoElement.play();
                    }
                    this.startFacialDetection();
                })
                .catch(error => {
                    console.error('Camera error:', error);
                    this.showToast('Could not access camera. Please check permissions.', 'error');
                    this.showCameraModal = false;
                });
        },
        
        startFacialDetection() {
            this.facialAnalysis.recording = true;
            this.facialAnalysis.countdown = 10;
            
            // Simulate facial expression detection
            // In production, integrate with TensorFlow.js or a facial recognition API
            const moods = ['Happy', 'Sad', 'Energetic', 'Calm', 'Stressed'];
            const expressions = ['Smiling', 'Neutral', 'Frowning', 'Surprised', 'Tired'];
            
            this.recordingTimer = setInterval(() => {
                this.facialAnalysis.countdown--;
                
                // Simulate real-time confidence updates
                const randomMood = moods[Math.floor(Math.random() * moods.length)];
                const randomExpression = expressions[Math.floor(Math.random() * expressions.length)];
                const randomConfidence = Math.floor(Math.random() * 30) + 65;
                
                this.cameraMood = randomMood;
                this.detectedExpression = randomExpression;
                this.cameraConfidence = randomConfidence;
                
                if (this.facialAnalysis.countdown <= 0) {
                    clearInterval(this.recordingTimer);
                    this.completeFacialAnalysis();
                }
            }, 1000);
        },
        
        completeFacialAnalysis() {
            this.facialAnalysis.recording = false;
            this.facialAnalysis.completed = true;
            this.facialAnalysis.mood = this.cameraMood || 'Happy';
            this.facialAnalysis.accuracy = this.cameraConfidence || 85;
            
            // Stop camera stream
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
            if (this.recordingTimer) {
                clearInterval(this.recordingTimer);
            }
        },
        
        // ==================== VOICE ANALYSIS ====================
        
        startVoiceAnalysis() {
            this.showVoiceModal = true;
            this.voiceConfidence = 0;
            this.voiceMood = '';
            
            // Request microphone access
            navigator.mediaDevices.getUserMedia({ audio: true })
                .then(stream => {
                    this.voiceAnalysis.mediaRecorder = new MediaRecorder(stream);
                    this.voiceAnalysis.recordedChunks = [];
                    
                    this.voiceAnalysis.mediaRecorder.ondataavailable = (event) => {
                        if (event.data.size > 0) {
                            this.voiceAnalysis.recordedChunks.push(event.data);
                        }
                    };
                    
                    this.voiceAnalysis.mediaRecorder.onstop = () => {
                        this.processVoiceRecording();
                    };
                    
                    this.voiceAnalysis.mediaRecorder.start();
                    this.voiceAnalysis.recording = true;
                    
                    // Simulate real-time voice analysis
                    this.startVoiceDetection();
                    
                    // Stop after 5 seconds
                    setTimeout(() => {
                        if (this.voiceAnalysis.mediaRecorder && this.voiceAnalysis.recording) {
                            this.voiceAnalysis.mediaRecorder.stop();
                            stream.getTracks().forEach(track => track.stop());
                        }
                    }, 5000);
                })
                .catch(error => {
                    console.error('Microphone error:', error);
                    this.showToast('Could not access microphone. Please check permissions.', 'error');
                    this.showVoiceModal = false;
                });
        },
        
        startVoiceDetection() {
            const moods = ['Happy', 'Sad', 'Energetic', 'Calm', 'Stressed'];
            const voiceTraits = ['Upbeat tone', 'Monotone', 'Energetic pitch', 'Soft spoken', 'Tense voice'];
            
            const interval = setInterval(() => {
                if (!this.voiceAnalysis.recording) {
                    clearInterval(interval);
                    return;
                }
                
                const randomMood = moods[Math.floor(Math.random() * moods.length)];
                const randomTrait = voiceTraits[Math.floor(Math.random() * voiceTraits.length)];
                const randomConfidence = Math.floor(Math.random() * 25) + 70;
                
                this.voiceMood = randomMood;
                this.voiceConfidence = randomConfidence;
            }, 500);
        },
        
        processVoiceRecording() {
            this.voiceAnalysis.recording = false;
            this.voiceAnalysis.completed = true;
            this.voiceAnalysis.mood = this.voiceMood || 'Calm';
            this.voiceAnalysis.accuracy = this.voiceConfidence || 80;
            
            this.showVoiceModal = false;
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
            
            // Advanced text sentiment analysis
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
                
                // Check for intensity words
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
            
            // Weighted majority voting
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
            
            // If no clear winner or all different, use weighted average
            if (maxWeight === 0 || moods[0] !== moods[1] && moods[1] !== moods[2] && moods[0] !== moods[2]) {
                fusedMood = moods.reduce((a, b) => weights[a] > weights[b] ? a : b);
            }
            
            // Calculate confidence
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
                const data = await apiRequest('/spotify/recommendations', {
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
                    { id: '8', name: 'Hurt', artist: 'Johnny Cash', previewUrl: null, color: '#FFEAA7' },
                    { id: '9', name: 'All I Want', artist: 'Kodaline', previewUrl: null, color: '#45B7D1' }
                ],
                Energetic: [
                    { id: '10', name: 'Eye of the Tiger', artist: 'Survivor', previewUrl: null, color: '#FF6B6B' },
                    { id: '11', name: 'Stronger', artist: 'Kanye West', previewUrl: null, color: '#4ECDC4' },
                    { id: '12', name: 'Lose Yourself', artist: 'Eminem', previewUrl: null, color: '#45B7D1' }
                ],
                Calm: [
                    { id: '13', name: 'Weightless', artist: 'Marconi Union', previewUrl: null, color: '#96CEB4' },
                    { id: '14', name: 'Clair de Lune', artist: 'Debussy', previewUrl: null, color: '#FFEAA7' },
                    { id: '15', name: 'Spiegel im Spiegel', artist: 'Arvo Pärt', previewUrl: null, color: '#FFD700' }
                ],
                Stressed: [
                    { id: '16', name: 'Here Comes The Sun', artist: 'The Beatles', previewUrl: null, color: '#4ECDC4' },
                    { id: '17', name: 'Three Little Birds', artist: 'Bob Marley', previewUrl: null, color: '#45B7D1' },
                    { id: '18', name: 'What a Wonderful World', artist: 'Louis Armstrong', previewUrl: null, color: '#96CEB4' }
                ]
            };
            
            this.recommendedTracks = fallbackTracks[this.fusedMood.mood] || fallbackTracks.Happy;
        },
        
        // ==================== AUDIO PLAYER ====================
        
        playTrack(track) {
            // Stop currently playing track
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
                // Open in Spotify if no preview available
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
            
            // Save to backend
            try {
                await apiRequest('/mood/save', {
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
            // Stop camera if active
            if (this.cameraStream) {
                this.stopCameraStream();
            }
            
            // Stop voice recording if active
            if (this.voiceAnalysis.mediaRecorder && this.voiceAnalysis.recording) {
                this.voiceAnalysis.mediaRecorder.stop();
            }
            
            // Stop audio playback
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
        }
    },
    
    mounted() {
        this.loadThemePreference();
        this.checkAuth();
        
        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (this.showThemeDropdown && !e.target.closest('.theme-dropdown')) {
                this.showThemeDropdown = false;
            }
        });
    }
});