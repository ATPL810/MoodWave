new Vue({
    el: '#app',
    data: {
        // Current page state
        currentPage: 'login', // login, register, loading, home, music, about
        
        // Current logged in user
        currentUser: '',
        
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
            type: 'success' // success or error
        },
        
        // Mood history for dashboard
        moodHistory: [],
        
        // Facial analysis
        facialAnalysis: {
            recording: false,
            completed: false,
            countdown: 10,
            mood: '',
            accuracy: 0
        },
        
        // Voice analysis
        voiceAnalysis: {
            recording: false,
            completed: false,
            mood: '',
            accuracy: 0
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
        
        // Recommended tracks
        recommendedTracks: [],
        
        // Timer for recording countdown
        recordingTimer: null
    },
    
    computed: {
        // Check if all modals are completed
        allModalsCompleted() {
            return this.facialAnalysis.completed && 
                   this.voiceAnalysis.completed && 
                   this.textAnalysis.completed;
        }
    },
    
    methods: {
        // Navigation methods
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
        },
        
        // Clear form data
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
        
        // Handle login
        handleLogin() {
            // Validation
            if (!this.login.username || !this.login.password) {
                this.showToast('Please fill in all fields', 'error');
                return;
            }
            
            // Simulate login - In real app, this would call backend API
            // For demo, accept any credentials with password length >= 8
            if (this.login.password.length < 8) {
                this.showToast('Password must be at least 8 characters', 'error');
                return;
            }
            
            // Simulate successful login
            this.currentUser = this.login.username;
            this.showToast('Login successful!', 'success');
            
            // Show loading page then redirect to home
            setTimeout(() => {
                this.currentPage = 'loading';
                
                // After 5 seconds, go to home
                setTimeout(() => {
                    this.currentPage = 'home';
                }, 5000);
            }, 1000);
        },
        
        // Handle register
        handleRegister() {
            // Validation
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
            
            // Simulate successful registration
            this.showToast('Registration successful!', 'success');
            
            // Clear form and switch to login after 2 seconds
            setTimeout(() => {
                this.clearForms();
                this.currentPage = 'login';
            }, 2000);
        },
        
        // Logout
        logout() {
            this.currentUser = '';
            this.currentPage = 'login';
            this.clearForms();
            this.moodHistory = [];
            this.resetAnalysis();
            this.showToast('Logged out successfully', 'success');
        },
        
        // Show toast notification
        showToast(message, type) {
            this.toast = {
                show: true,
                message,
                type
            };
            
            // Auto hide after 3 seconds
            setTimeout(() => {
                this.toast.show = false;
            }, 3000);
        },
        
        // Reset all analysis
        resetAnalysis() {
            this.facialAnalysis = {
                recording: false,
                completed: false,
                countdown: 10,
                mood: '',
                accuracy: 0
            };
            
            this.voiceAnalysis = {
                recording: false,
                completed: false,
                mood: '',
                accuracy: 0
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
            
            if (this.recordingTimer) {
                clearInterval(this.recordingTimer);
            }
        },
        
        // Start facial analysis
        startFacialAnalysis() {
            this.facialAnalysis.recording = true;
            this.facialAnalysis.countdown = 10;
            
            this.recordingTimer = setInterval(() => {
                this.facialAnalysis.countdown--;
                
                if (this.facialAnalysis.countdown <= 0) {
                    clearInterval(this.recordingTimer);
                    this.completeFacialAnalysis();
                }
            }, 1000);
        },
        
        // Complete facial analysis
        completeFacialAnalysis() {
            this.facialAnalysis.recording = false;
            this.facialAnalysis.completed = true;
            
            // Simulate analysis result
            const moods = ['Happy', 'Sad', 'Energetic', 'Calm', 'Stressed'];
            const randomMood = moods[Math.floor(Math.random() * moods.length)];
            const accuracy = Math.floor(Math.random() * 20) + 75; // 75-95%
            
            this.facialAnalysis.mood = randomMood;
            this.facialAnalysis.accuracy = accuracy;
            
            // Check if all modals completed
            this.checkAllModalsCompleted();
        },
        
        // Start voice analysis
        startVoiceAnalysis() {
            this.voiceAnalysis.recording = true;
            
            // Simulate recording for 5 seconds
            setTimeout(() => {
                this.completeVoiceAnalysis();
            }, 5000);
        },
        
        // Complete voice analysis
        completeVoiceAnalysis() {
            this.voiceAnalysis.recording = false;
            this.voiceAnalysis.completed = true;
            
            // Simulate analysis result
            const moods = ['Happy', 'Sad', 'Energetic', 'Calm', 'Stressed'];
            const randomMood = moods[Math.floor(Math.random() * moods.length)];
            const accuracy = Math.floor(Math.random() * 20) + 70; // 70-90%
            
            this.voiceAnalysis.mood = randomMood;
            this.voiceAnalysis.accuracy = accuracy;
            
            // Check if all modals completed
            this.checkAllModalsCompleted();
        },
        
        // Analyze text
        analyzeText() {
            if (!this.textAnalysis.input) return;
            
            this.textAnalysis.completed = true;
            
            // Simulate analysis based on text input
            let mood = 'Neutral';
            const text = this.textAnalysis.input.toLowerCase();
            
            if (text.includes('happy') || text.includes('great') || text.includes('good')) {
                mood = 'Happy';
            } else if (text.includes('sad') || text.includes('down') || text.includes('blue')) {
                mood = 'Sad';
            } else if (text.includes('energetic') || text.includes('excited') || text.includes('pumped')) {
                mood = 'Energetic';
            } else if (text.includes('calm') || text.includes('relaxed') || text.includes('peaceful')) {
                mood = 'Calm';
            } else if (text.includes('stressed') || text.includes('anxious') || text.includes('worried')) {
                mood = 'Stressed';
            }
            
            const accuracy = Math.floor(Math.random() * 15) + 80; // 80-95%
            
            this.textAnalysis.mood = mood;
            this.textAnalysis.accuracy = accuracy;
            
            // Check if all modals completed
            this.checkAllModalsCompleted();
        },
        
        // Check if all modals completed and fuse results
        checkAllModalsCompleted() {
            if (this.allModalsCompleted) {
                this.fuseModalities();
                this.fetchRecommendations();
                this.updateDashboard();
            }
        },
        
        // Fuse modalities (confidence-weighted late fusion)
        fuseModalities() {
            // Simulate fusion logic
            const moods = [this.facialAnalysis.mood, this.voiceAnalysis.mood, this.textAnalysis.mood];
            const accuracies = [this.facialAnalysis.accuracy, this.voiceAnalysis.accuracy, this.textAnalysis.accuracy];
            
            // Count occurrences of each mood
            const moodCounts = {};
            moods.forEach(mood => {
                moodCounts[mood] = (moodCounts[mood] || 0) + 1;
            });
            
            // Find the most common mood (weighted by accuracy)
            let maxWeight = 0;
            let fusedMood = 'Neutral';
            
            moods.forEach((mood, index) => {
                const weight = accuracies[index] * (moodCounts[mood] || 1);
                if (weight > maxWeight) {
                    maxWeight = weight;
                    fusedMood = mood;
                }
            });
            
            // Calculate confidence (average of accuracies for the chosen mood)
            let totalAccuracy = 0;
            let count = 0;
            moods.forEach((mood, index) => {
                if (mood === fusedMood) {
                    totalAccuracy += accuracies[index];
                    count++;
                }
            });
            
            const confidence = Math.round(totalAccuracy / count);
            
            // Generate description based on mood
            let description = '';
            switch(fusedMood) {
                case 'Happy':
                    description = 'You seem happy! Here are some upbeat tracks to match your mood.';
                    break;
                case 'Sad':
                    description = 'Feeling down? These melancholic tracks might resonate with you.';
                    break;
                case 'Energetic':
                    description = 'High energy detected! Here are some pump-up tracks.';
                    break;
                case 'Calm':
                    description = 'In a calm state? These relaxing tracks will complement your mood.';
                    break;
                case 'Stressed':
                    description = 'Feeling stressed? These calming tracks might help you relax.';
                    break;
                default:
                    description = 'Based on your mood, we recommend these tracks.';
            }
            
            this.fusedMood = {
                mood: fusedMood,
                confidence: confidence,
                description: description
            };
        },
        
        // Fetch recommendations from Spotify API (simulated)
        fetchRecommendations() {
            // Simulate API call to Spotify
            // In real app, this would make an actual API call
            
            const tracks = {
                Happy: [
                    { name: 'Happy', artist: 'Pharrell Williams', color: '#FFD700' },
                    { name: 'Can\'t Stop the Feeling', artist: 'Justin Timberlake', color: '#FF6B6B' },
                    { name: 'Uptown Funk', artist: 'Mark Ronson ft. Bruno Mars', color: '#4ECDC4' }
                ],
                Sad: [
                    { name: 'Someone Like You', artist: 'Adele', color: '#45B7D1' },
                    { name: 'Fix You', artist: 'Coldplay', color: '#96CEB4' },
                    { name: 'Hurt', artist: 'Johnny Cash', color: '#FFEAA7' }
                ],
                Energetic: [
                    { name: 'Eye of the Tiger', artist: 'Survivor', color: '#FF6B6B' },
                    { name: 'Stronger', artist: 'Kanye West', color: '#4ECDC4' },
                    { name: 'Lose Yourself', artist: 'Eminem', color: '#45B7D1' }
                ],
                Calm: [
                    { name: 'Weightless', artist: 'Marconi Union', color: '#96CEB4' },
                    { name: 'Clair de Lune', artist: 'Debussy', color: '#FFEAA7' },
                    { name: 'Spiegel im Spiegel', artist: 'Arvo Pärt', color: '#FFD700' }
                ],
                Stressed: [
                    { name: 'Here Comes The Sun', artist: 'The Beatles', color: '#4ECDC4' },
                    { name: 'Three Little Birds', artist: 'Bob Marley', color: '#45B7D1' },
                    { name: 'What a Wonderful World', artist: 'Louis Armstrong', color: '#96CEB4' }
                ]
            };
            
            this.recommendedTracks = tracks[this.fusedMood.mood] || tracks.Happy;
        },
        
        // Update dashboard with new mood
        updateDashboard() {
            const now = new Date();
            const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            
            this.moodHistory.unshift({
                time: timeString,
                mood: this.fusedMood.mood,
                confidence: this.fusedMood.confidence
            });
            
            // Keep only last 10 entries
            if (this.moodHistory.length > 10) {
                this.moodHistory.pop();
            }
        },
        
        // Play track (simulated)
        playTrack(track) {
            this.showToast(`Now playing: ${track.name} by ${track.artist}`, 'success');
        }
    }
});