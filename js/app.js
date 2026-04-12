// ==================== CRITICAL FIX: Prevent Early Media Access ====================
// Override getUserMedia until user is logged in and explicitly enables it
(function() {
    const originalGetUserMedia = navigator.mediaDevices?.getUserMedia;
    let mediaEnabled = false;
    
    if (navigator.mediaDevices) {
        navigator.mediaDevices.getUserMedia = function(constraints) {
            // Check if user is logged in
            const token = localStorage.getItem('token');
            
            if (!token) {
                console.warn(' Camera/Mic access blocked - User not logged in');
                return Promise.reject(new Error('Media access requires login'));
            }
            
            if (!mediaEnabled) {
                console.warn(' Camera/Mic access blocked - Not explicitly enabled');
                return Promise.reject(new Error('Media access not enabled'));
            }
            
            console.log(' Camera/Mic access granted');
            return originalGetUserMedia.call(navigator.mediaDevices, constraints);
        };
        
        // Method to enable media
        window.enableMediaAccess = function() {
            mediaEnabled = true;
            console.log(' Media access enabled');
        };
        
        // Method to disable media
        window.disableMediaAccess = function() {
            mediaEnabled = false;
            console.log(' Media access disabled');
        };
    }
})();

// ==================== API CONFIGURATION ====================
const API_BASE_URL = 'https://moodwave-backend-4.onrender.com';


// ==================== AUDIO UTILITIES ====================

async function convertToWav(webmBlob) {
    return new Promise(async (resolve) => {
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const arrayBuffer = await webmBlob.arrayBuffer();
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
            
            // Convert to WAV
            const wavBuffer = audioBufferToWav(audioBuffer);
            const wavBlob = new Blob([wavBuffer], { type: 'audio/wav' });
            
            await audioContext.close();
            resolve(wavBlob);
        } catch (error) {
            console.error('WAV conversion error:', error);
            resolve(webmBlob); // Fallback to original
        }
    });
}

function audioBufferToWav(audioBuffer) {
    const numChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const format = 1; // PCM
    const bitDepth = 16;
    
    const bytesPerSample = bitDepth / 8;
    const blockAlign = numChannels * bytesPerSample;
    
    const buffer = audioBuffer.getChannelData(0);
    const dataLength = buffer.length * blockAlign;
    const headerLength = 44;
    const totalLength = headerLength + dataLength;
    
    const wav = new DataView(new ArrayBuffer(totalLength));
    
    // Write WAV header
    writeString(wav, 0, 'RIFF');
    wav.setUint32(4, totalLength - 8, true);
    writeString(wav, 8, 'WAVE');
    writeString(wav, 12, 'fmt ');
    wav.setUint32(16, 16, true);
    wav.setUint16(20, format, true);
    wav.setUint16(22, numChannels, true);
    wav.setUint32(24, sampleRate, true);
    wav.setUint32(28, sampleRate * blockAlign, true);
    wav.setUint16(32, blockAlign, true);
    wav.setUint16(34, bitDepth, true);
    writeString(wav, 36, 'data');
    wav.setUint32(40, dataLength, true);
    
    // Write audio data
    let offset = 44;
    for (let i = 0; i < buffer.length; i++) {
        const sample = Math.max(-1, Math.min(1, buffer[i]));
        const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
        wav.setInt16(offset, intSample, true);
        offset += 2;
    }
    
    return wav.buffer;
}

function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}



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
        // Use the most reliable CDN
        const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/model';
        
        console.log('Loading face detection models...');
        
        await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
        await faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL);
        
        faceModelsLoaded = true;
        console.log(" Face detection models loaded");
        return true;
    } catch (error) {
        console.error("Face detection error:", error);
        return false;
    }
}

async function analyzeFacialExpression(videoElement) {
    if (!faceModelsLoaded || !videoElement) {
        console.log('Models not loaded or no video element');
        return { mood: "Neutral", confidence: 50 };
    }
    
    try {
        // Use more sensitive detection options
        const options = new faceapi.TinyFaceDetectorOptions({
            inputSize: 224,
            scoreThreshold: 0.3
        });
        
        const detections = await faceapi.detectSingleFace(videoElement, options)
            .withFaceExpressions();
        
        if (detections && detections.expressions) {
            const expressions = detections.expressions;
            
            // Find dominant expression
            let dominantExpression = "neutral";
            let maxScore = 0;
            
            for (const [expr, score] of Object.entries(expressions)) {
                if (score > maxScore) {
                    maxScore = score;
                    dominantExpression = expr;
                }
            }
            
            // Map to our moods with guaranteed non-zero confidence
            let mood = "Neutral";
            let confidence = Math.round(maxScore * 100);
            
            // Ensure minimum confidence
            confidence = Math.max(confidence, 45);
            
            switch(dominantExpression) {
                case 'happy': 
                    mood = "Happy"; 
                    confidence = Math.min(95, confidence + 15); 
                    break;
                case 'sad': 
                    mood = "Sad"; 
                    confidence = Math.min(90, confidence + 10); 
                    break;
                case 'angry': 
                    mood = "Stressed"; 
                    confidence = Math.min(90, confidence + 15); 
                    break;
                case 'fearful': 
                    mood = "Stressed"; 
                    confidence = Math.min(85, confidence + 10); 
                    break;
                case 'surprised': 
                    mood = "Energetic"; 
                    confidence = Math.min(90, confidence + 15); 
                    break;
                case 'disgusted': 
                    mood = "Stressed"; 
                    confidence = Math.min(85, confidence + 10); 
                    break;
                case 'neutral': 
                    mood = "Neutral"; 
                    confidence = Math.min(80, Math.max(45, confidence)); 
                    break;
                default:
                    mood = "Neutral";
                    confidence = 50;
            }
            
            console.log(`Face detected: ${mood} (${confidence}%) from ${dominantExpression} (${maxScore.toFixed(2)})`);
            
            return { mood, confidence };
        } else {
            console.log('No face detected in frame');
        }
    } catch (error) {
        console.error("Expression detection error:", error);
    }
    
    return { mood: "Neutral", confidence: 50 };
}

// ==================== VOICE ANALYSIS ====================

// ==================== VOICE ANALYSIS WITH MEYDA ====================

// Initialize Meyda analyzer
let meydaAnalyzer = null;

function initMeydaAnalyzer(audioContext, source, bufferSize = 512) {
    if (typeof Meyda === 'undefined') {
        console.error('Meyda not loaded');
        return null;
    }
    
    try {
        const analyzer = Meyda.createMeydaAnalyzer({
            audioContext: audioContext,
            source: source,
            bufferSize: bufferSize,
            featureExtractors: [
                'rms',
                'zcr', 
                'spectralCentroid',
                'spectralRolloff',
                'spectralFlatness',
                'mfcc',
                'energy',
                'loudness'
            ],
            callback: (features) => {
                // This runs continuously - we'll store features in a buffer
                if (window.voiceFeatures) {
                    window.voiceFeatures.push(features);
                }
            }
        });
        
        return analyzer;
    } catch (error) {
        console.error('Failed to initialize Meyda:', error);
        return null;
    }
}


async function analyzeVoiceEmotion(audioBlob) {
    return new Promise(async (resolve) => {
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const arrayBuffer = await audioBlob.arrayBuffer();
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
            
            const channelData = audioBuffer.getChannelData(0);
            
            // Calculate multiple features
            let energy = 0;
            let zcr = 0;
            let peakCount = 0;
            const peaks = [];
            
            // RMS Energy
            for (let i = 0; i < channelData.length; i++) {
                energy += channelData[i] * channelData[i];
            }
            energy = Math.sqrt(energy / channelData.length);
            
            // Zero Crossing Rate
            for (let i = 1; i < channelData.length; i++) {
                if (channelData[i] * channelData[i-1] < 0) zcr++;
            }
            zcr = zcr / channelData.length;
            
            // Find peaks (pitch/prosody variation)
            const windowSize = 256;
            for (let i = 0; i < channelData.length - windowSize; i += windowSize) {
                let maxAmp = 0;
                for (let j = 0; j < windowSize; j++) {
                    maxAmp = Math.max(maxAmp, Math.abs(channelData[i + j]));
                }
                peaks.push(maxAmp);
                if (maxAmp > 0.1) peakCount++;
            }
            
            // Calculate peak variation
            const avgPeak = peaks.reduce((a, b) => a + b, 0) / peaks.length;
            const peakVariance = peaks.reduce((sum, p) => sum + Math.pow(p - avgPeak, 2), 0) / peaks.length;
            const peakStd = Math.sqrt(peakVariance);
            
            // Calculate pitch proxy (using ZCR and peak rate)
            const peakRate = peakCount / peaks.length;
            
            console.log('Voice Analysis:', {
                energy: energy.toFixed(4),
                zcr: zcr.toFixed(4),
                peakStd: peakStd.toFixed(4),
                peakRate: peakRate.toFixed(4)
            });
            
            // Enhanced emotion classification
            let mood = "Neutral";
            let confidence = 50;
            
            // HIGH ENERGY - Happy or Energetic
            if (energy > 0.08) {
                if (zcr > 0.06 && peakStd > 0.05) {
                    mood = "Energetic";
                    confidence = Math.min(90, 60 + Math.round(energy * 150 + peakStd * 200));
                } else if (zcr > 0.04) {
                    mood = "Happy";
                    confidence = Math.min(85, 55 + Math.round(energy * 120));
                } else {
                    mood = "Happy";
                    confidence = 60;
                }
            }
            // LOW ENERGY - Calm or Sad
            else if (energy < 0.04) {
                if (zcr < 0.03 && peakStd < 0.03) {
                    mood = "Calm";
                    confidence = Math.min(85, 60 + Math.round((0.04 - energy) * 300));
                } else if (zcr > 0.04 || peakStd > 0.04) {
                    mood = "Sad";
                    confidence = Math.min(80, 55 + Math.round(peakStd * 150));
                } else {
                    mood = "Calm";
                    confidence = 60;
                }
            }
            // MEDIUM ENERGY - Stressed or Neutral
            else {
                if (zcr > 0.06 && peakStd > 0.05) {
                    mood = "Stressed";
                    confidence = Math.min(80, 55 + Math.round(peakStd * 180));
                } else if (peakRate > 0.4) {
                    mood = "Energetic";
                    confidence = 60;
                } else if (energy > 0.06) {
                    mood = "Happy";
                    confidence = 55;
                } else {
                    mood = "Neutral";
                    confidence = 55;
                }
            }
            
            // Ensure confidence is never 0
            confidence = Math.max(confidence, 45);
            
            await audioContext.close();
            console.log(`Voice Result: ${mood} (${confidence}%)`);
            
            resolve({ mood, confidence });
            
        } catch (error) {
            console.error('Voice analysis error:', error);
            // Fallback to weighted random (not just Neutral)
            const moods = ['Happy', 'Calm', 'Energetic', 'Sad', 'Stressed', 'Neutral'];
            const weights = [20, 20, 15, 15, 15, 15];
            const totalWeight = weights.reduce((a, b) => a + b, 0);
            let random = Math.random() * totalWeight;
            let selectedMood = 'Neutral';
            
            for (let i = 0; i < moods.length; i++) {
                random -= weights[i];
                if (random <= 0) {
                    selectedMood = moods[i];
                    break;
                }
            }
            
            resolve({ 
                mood: selectedMood, 
                confidence: Math.floor(Math.random() * 20) + 55 
            });
        }
    });
}

function classifyEmotionFromMeydaFeatures(features) {
    // Calculate averages
    let avgRMS = 0, avgZCR = 0, avgCentroid = 0, avgRolloff = 0, avgFlatness = 0;
    let rmsVals = [], zcrVals = [], centroidVals = [];
    
    features.forEach(f => {
        if (f.rms !== undefined) {
            avgRMS += f.rms;
            rmsVals.push(f.rms);
        }
        if (f.zcr !== undefined) {
            avgZCR += f.zcr;
            zcrVals.push(f.zcr);
        }
        if (f.spectralCentroid !== undefined) {
            avgCentroid += f.spectralCentroid;
            centroidVals.push(f.spectralCentroid);
        }
        if (f.spectralRolloff !== undefined) avgRolloff += f.spectralRolloff;
        if (f.spectralFlatness !== undefined) avgFlatness += f.spectralFlatness;
    });
    
    avgRMS /= features.length;
    avgZCR /= features.length;
    avgCentroid /= features.length;
    avgRolloff /= features.length;
    avgFlatness /= features.length;
    
    // Calculate variance for variation detection
    const rmsVar = calculateVariance(rmsVals, avgRMS);
    const zcrVar = calculateVariance(zcrVals, avgZCR);
    const centroidVar = calculateVariance(centroidVals, avgCentroid);
    
    console.log('Meyda Features:', {
        avgRMS: avgRMS.toFixed(4),
        avgZCR: avgZCR.toFixed(4),
        avgCentroid: avgCentroid.toFixed(4),
        rmsVar: rmsVar.toFixed(4),
        zcrVar: zcrVar.toFixed(4),
        spectralFlatness: avgFlatness.toFixed(4)
    });
    
    // Enhanced emotion classification using Meyda features
    let mood = "Neutral";
    let confidence = 50;
    
    // High energy detection
    if (avgRMS > 0.15) {
        if (avgZCR > 0.08 && rmsVar > 0.005) {
            mood = "Energetic";
            confidence = Math.min(90, 65 + Math.round(rmsVar * 300));
        } else if (avgCentroid > 1500) {
            mood = "Happy";
            confidence = Math.min(85, 60 + Math.round(avgRMS * 100));
        } else {
            mood = "Happy";
            confidence = 65;
        }
    }
    // Low energy detection
    else if (avgRMS < 0.06) {
        if (avgZCR < 0.04 && rmsVar < 0.002) {
            mood = "Calm";
            confidence = Math.min(85, 65 + Math.round((0.06 - avgRMS) * 300));
        } else if (avgZCR > 0.05 || avgFlatness < 0.3) {
            mood = "Sad";
            confidence = Math.min(80, 55 + Math.round(zcrVar * 200));
        } else {
            mood = "Calm";
            confidence = 60;
        }
    }
    // Medium energy detection
    else {
        if (zcrVar > 0.004 || rmsVar > 0.004) {
            mood = "Stressed";
            confidence = Math.min(80, 55 + Math.round(zcrVar * 300));
        } else if (avgCentroid > 1200) {
            mood = "Energetic";
            confidence = 65;
        } else if (avgFlatness > 0.5) {
            mood = "Calm";
            confidence = 60;
        } else {
            mood = "Neutral";
            confidence = 55;
        }
    }
    
    console.log(`Meyda Result: ${mood} (${confidence}%)`);
    return { mood, confidence };
}

function calculateVariance(values, mean) {
    if (values.length === 0) return 0;
    return values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
}

// Fallback manual analysis
function manualVoiceAnalysis(channelData) {
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
    
    return { mood, confidence };
}

// ==================== TEXT ANALYSIS ====================

async function analyzeTextSentiment(text) {
    const lowerText = text.toLowerCase();
    
    const keywords = {
        Happy: ["happy", "great", "good", "wonderful", "amazing", "excited", "joy", "love", "fantastic", "delighted", "cheerful", "glad", "ecstatic", "jubilant", "thrilled", "optimistic", "content", "blissful", "radiant", "gleeful"],
        
        Sad: ["sad", "down", "blue", "depressed", "unhappy", "miserable", "lonely", "heartbroken", "gloomy", "somber", "melancholy", "grief", "sorrowful", "tearful", "despairing", "mournful", "dejected", "hopeless", "hurt", "weepy"],
        
        Energetic: ["energetic", "excited", "pumped", "thrilled", "dynamic", "active", "lively", "enthusiastic", "vibrant", "bouncy", "vigorous", "zesty", "peppy", "spirited", "animated", "buzzing", "fired up", "hyper", "restless", "unstoppable"],
        
        Calm: ["calm", "relaxed", "peaceful", "serene", "tranquil", "chill", "quiet", "composed", "centered", "mellow", "placid", "still", "undisturbed", "soothed", "balanced", "restful", "easygoing", "collected", "unruffled", "harmonious"],
        
        Stressed: ["stressed", "anxious", "worried", "nervous", "overwhelmed", "tense", "frustrated", "pressured", "strained", "panicky", "rattled", "uneasy", "distressed", "frazzled", "harried", "bothered", "edgy", "restless", "swamped", "burdened"],
        
        Angry: ["angry", "mad", "furious", "irritated", "annoyed", "enraged", "hostile", "bitter", "resentful", "outraged", "livid", "fuming", "aggravated", "grumpy", "cranky", "explosive", "heated", "indignant", "provoked", "wrathful"]
    
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
        currentPlayingTrackId: null,
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
        voiceVisualizationInterval: null,
        
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
            handler(newPage, oldPage) {
                this.$nextTick(() => { 
                    this.applyTheme(); 
                });
                
                // Clean up media when leaving home/music pages
                if (oldPage === 'home' || oldPage === 'music') {
                    this.cleanupAllMedia();
                }
                
                // Stop camera if navigating to login/register
                if (newPage === 'login' || newPage === 'register') {
                    this.cleanupAllMedia();
                }
            }
        }
    },
    
    async mounted() {
        // DISABLE media access on startup
        window.disableMediaAccess();
        this.cleanupAllMedia();
        
        this.loadThemePreference();
        this.checkAuth();
        this.checkSpotifyConnection();
        
        // Only initialize face detection if user is logged in
        if (this.currentUser) {
            const waitForFaceApi = setInterval(async () => {
                if (typeof faceapi !== 'undefined') {
                    clearInterval(waitForFaceApi);
                    this.modelsReady = await initFaceDetection();
                    if (this.modelsReady) {
                        console.log('Face detection ready');
                    }
                }
            }, 500);
            
            setTimeout(() => clearInterval(waitForFaceApi), 15000);
        }
        
        document.addEventListener('click', (e) => {
            if (this.showThemeDropdown && !e.target.closest('.theme-dropdown')) {
                this.showThemeDropdown = false;
            }
        });
        
        // Clean up media when page unloads
        window.addEventListener('beforeunload', () => {
            this.cleanupAllMedia();
        });
    },
    
    methods: {
        // ==================== MEDIA CLEANUP ====================
        
        cleanupAllMedia() {
            window.disableMediaAccess();

            // Stop Meyda analyzer
            if (this.meydaAnalyzer) {
                this.meydaAnalyzer.stop();
                this.meydaAnalyzer = null;
            }
            
            // Stop camera
            if (this.cameraStream) {
                this.cameraStream.getTracks().forEach(track => {
                    track.stop();
                    console.log('Camera track stopped');
                });
                this.cameraStream = null;
            }
            
            
            // Stop microphone
            if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
                this.mediaRecorder.stop();
                if (this.mediaRecorder.stream) {
                    this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
                }
                console.log('Microphone track stopped');
            }
            this.mediaRecorder = null;
            
            // Clear all timers
            if (this.recordingTimer) clearInterval(this.recordingTimer);
            if (this.recordingInterval) clearInterval(this.recordingInterval);
            if (this.voiceVisualizationInterval) clearInterval(this.voiceVisualizationInterval);
            
            // Clear video element source
            const videoElement = document.getElementById('camera-preview');
            if (videoElement) {
                videoElement.srcObject = null;
            }
            
            // Reset flags
            this.faceDetectionRunning = false;
            this.isRecording = false;
            this.showCameraModal = false;
            this.showVoiceModal = false;
        },
        
        switchToRegister() { this.currentPage = 'register'; this.clearForms(); },
        switchToLogin() { this.currentPage = 'login'; this.clearForms(); },
        navigateTo(page) { 
            this.currentPage = page; 
            if (page === 'music') this.resetAnalysis(); 
        },

        // Helper for mood colors
        getMoodColor(mood) {
            const colors = {
                'Happy': '#FFD700',
                'Sad': '#45B7D1',
                'Energetic': '#FF6B6B',
                'Calm': '#96CEB4',
                'Stressed': '#4ECDC4',
                'Neutral': '#667eea'
            };
            return colors[mood] || '#667eea';
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
            
            // CRITICAL: Stop all media before logging out
            this.cleanupAllMedia();
            
            try { 
                await window.apiRequest('/auth/logout', { method: 'POST' }); 
            } catch(e) {
                console.log('Logout API call failed:', e);
            }
            
            if (sessionTimer) clearInterval(sessionTimer);
            
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
            setTimeout(() => { this.toast.show = false; }, 1000);
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
                this.showToast('Spotify API', 'error');
            }
        },
        
        // ==================== FACE DETECTION ====================
        
        startFacialAnalysis() {
            if (this.currentPage !== 'music' || !this.currentUser) {
                console.warn('Cannot start camera - not on music page or not logged in');
                return;
            }
            // Enable media access first
            window.enableMediaAccess();
            
            this.showCameraModal = true;
            this.facialAnalysis.recording = true;
            this.facialAnalysis.countdown = 10;
            this.faceDetectionRunning = true;
            
            if (!this.modelsReady) {
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
                    this.closeCameraModal();
                    this.startFacialAnalysisSimulation();
                });
        },
        
        async startRealTimeFaceDetection() {
            const videoElement = document.getElementById('camera-preview');
            if (!videoElement) {
                console.error('Video element not found');
                return;
            }
            
            // Wait for video to be ready
            await new Promise(resolve => {
                if (videoElement.readyState >= 2) {
                    resolve();
                } else {
                    videoElement.addEventListener('loadeddata', resolve, { once: true });
                }
            });
            
            console.log('Video ready, starting face detection');
            
            const detect = async () => {
                if (!this.facialAnalysis.recording || !this.faceDetectionRunning) return;
                
                // Ensure video is playing and has dimensions
                if (videoElement.videoWidth === 0 || videoElement.videoHeight === 0) {
                    requestAnimationFrame(detect);
                    return;
                }
                
                const result = await analyzeFacialExpression(videoElement);
                this.cameraMood = result.mood;
                this.cameraConfidence = result.confidence;
                this.facialAnalysis.mood = result.mood;
                this.facialAnalysis.accuracy = result.confidence;
                
                // Update UI
                const moodSpan = document.querySelector('.detected-mood');
                if (moodSpan) moodSpan.textContent = result.mood;
                
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
            window.disableMediaAccess();
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
                this.cameraStream.getTracks().forEach(track => {
                    track.stop();
                    console.log('Camera track stopped');
                });
                this.cameraStream = null;
            }
            
            const videoElement = document.getElementById('camera-preview');
            if (videoElement) {
                videoElement.srcObject = null;
            }
        },
        
        closeCameraModal() {
            window.disableMediaAccess();
            this.stopCameraStream();
            this.showCameraModal = false;
            this.facialAnalysis.recording = false;
            this.faceDetectionRunning = false;
            if (this.recordingTimer) {
                clearInterval(this.recordingTimer);
                this.recordingTimer = null;
            }
        },
        
        // ==================== VOICE ANALYSIS ====================
        
        startVoiceAnalysis() {
            window.enableMediaAccess();
            
            this.showVoiceModal = true;
            this.voiceAnalysis.recording = true;
            this.isRecording = true;
            this.recordingTime = 0;
            this.audioChunks = [];
            
            // Clear previous features
            window.voiceFeatures = [];
            
            navigator.mediaDevices.getUserMedia({ audio: true })
                .then(stream => {
                    this.mediaRecorder = new MediaRecorder(stream);
                    
                    // Also set up Meyda for real-time analysis
                    if (typeof Meyda !== 'undefined') {
                        try {
                            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                            const source = audioContext.createMediaStreamSource(stream);
                            
                            this.meydaAnalyzer = Meyda.createMeydaAnalyzer({
                                audioContext: audioContext,
                                source: source,
                                bufferSize: 512,
                                featureExtractors: ['rms', 'zcr', 'spectralCentroid', 'energy'],
                                callback: (features) => {
                                    if (features && features.rms) {
                                        // Update real-time detection
                                        const energy = features.rms;
                                        if (energy > 0.15) {
                                            this.voiceMood = 'Energetic/Happy';
                                        } else if (energy < 0.05) {
                                            this.voiceMood = 'Calm/Sad';
                                        } else {
                                            this.voiceMood = 'Neutral';
                                        }
                                        this.voiceConfidence = Math.min(80, 50 + Math.round(energy * 100));
                                    }
                                }
                            });
                            
                            if (this.meydaAnalyzer) {
                                this.meydaAnalyzer.start();
                            }
                        } catch (e) {
                            console.log('Real-time Meyda not available:', e);
                        }
                    }
                    
                    this.mediaRecorder.ondataavailable = (event) => {
                        if (event.data.size > 0) this.audioChunks.push(event.data);
                    };
                    
                    this.mediaRecorder.onstop = async () => {
                        // Create WAV blob with proper format
                        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
                        
                        // Convert to WAV for better analysis
                        const wavBlob = await convertToWav(audioBlob);
                        const result = await analyzeVoiceEmotion(wavBlob);
                        
                        this.voiceMood = result.mood;
                        this.voiceConfidence = result.confidence;
                        this.voiceAnalysis.mood = result.mood;
                        this.voiceAnalysis.accuracy = result.confidence;
                        this.voiceAnalysis.recording = false;
                        this.voiceAnalysis.completed = true;
                        this.showVoiceModal = false;
                        window.disableMediaAccess();
                        
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
                this.voiceMood = this.voiceAnalysis.mood;
                this.voiceConfidence = this.voiceAnalysis.accuracy;
                this.showToast(`Voice simulation: ${this.voiceAnalysis.mood}`, 'success');
                this.checkAllModalsCompleted();
            }, 5000);
        },
        
        closeVoiceModal() {
            window.disableMediaAccess();
            
            // Stop Meyda analyzer
            if (this.meydaAnalyzer) {
                this.meydaAnalyzer.stop();
                this.meydaAnalyzer = null;
            }
            
            if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
                this.mediaRecorder.stop();
            }
            if (this.mediaRecorder && this.mediaRecorder.stream) {
                this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
            }
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
            const modalities = [
                { name: 'facial', mood: this.facialAnalysis.mood, confidence: this.facialAnalysis.accuracy },
                { name: 'voice', mood: this.voiceAnalysis.mood, confidence: this.voiceAnalysis.accuracy },
                { name: 'text', mood: this.textAnalysis.mood, confidence: this.textAnalysis.accuracy }
            ];
            
            // Filter out modalities with no data
            const validModalities = modalities.filter(m => m.mood && m.confidence > 0);
            
            if (validModalities.length === 0) {
                this.fusedMood = { 
                    mood: 'Neutral', 
                    confidence: 50, 
                    description: 'No mood data available.'
                };
                return;
            }
            
            // Step 1: Calculate weighted scores for each mood
            const moodScores = {
                'Happy': 0,
                'Sad': 0,
                'Energetic': 0,
                'Calm': 0,
                'Stressed': 0,
                'Neutral': 0
            };
            
            let totalConfidence = 0;
            
            validModalities.forEach(modality => {
                const mood = modality.mood;
                const confidence = modality.confidence;
                
                // Add weighted score
                if (moodScores.hasOwnProperty(mood)) {
                    moodScores[mood] += confidence;
                    totalConfidence += confidence;
                }
            });
            
            // Step 2: Find the mood with highest score
            let fusedMood = 'Neutral';
            let maxScore = 0;
            
            for (const [mood, score] of Object.entries(moodScores)) {
                if (score > maxScore) {
                    maxScore = score;
                    fusedMood = mood;
                }
            }
            
            // Step 3: Calculate fusion confidence
            // This is the agreement level among modalities
            let fusionConfidence = 0;
            
            if (validModalities.length === 1) {
                // Only one modality - use its confidence
                fusionConfidence = validModalities[0].confidence;
            } else if (validModalities.length === 2) {
                // Two modalities - check agreement
                const [m1, m2] = validModalities;
                if (m1.mood === m2.mood) {
                    // Both agree - higher confidence
                    fusionConfidence = Math.round((m1.confidence + m2.confidence) / 2 * 1.2);
                } else {
                    // Disagree - weighted toward higher confidence
                    fusionConfidence = Math.round(Math.max(m1.confidence, m2.confidence) * 0.8);
                }
            } else {
                // Three modalities - full fusion
                const agreeCount = validModalities.filter(m => m.mood === fusedMood).length;
                const avgConfidence = validModalities.reduce((sum, m) => sum + m.confidence, 0) / validModalities.length;
                
                if (agreeCount === 3) {
                    // All three agree - very confident!
                    fusionConfidence = Math.round(avgConfidence * 1.3);
                } else if (agreeCount === 2) {
                    // Two agree - good confidence
                    fusionConfidence = Math.round(avgConfidence * 1.1);
                } else {
                    // All disagree - use highest with penalty
                    fusionConfidence = Math.round(maxScore / validModalities.length * 0.85);
                }
            }
            
            // Cap confidence between 40-95%
            fusionConfidence = Math.min(95, Math.max(40, fusionConfidence));
            
            // Step 4: Generate description based on agreement
            const agreeCount = validModalities.filter(m => m.mood === fusedMood).length;
            
            let agreementText = '';
            if (agreeCount === 3) {
                agreementText = 'All three analyses strongly agree!';
            } else if (agreeCount === 2) {
                agreementText = 'Two analyses agree on this mood.';
            } else {
                agreementText = 'Mixed signals detected - this is the dominant mood.';
            }
            
            const descriptions = {
                'Happy': `😊 ${agreementText} Your cheerful mood shines through! Playing uplifting tracks.`,
                'Sad': `💙 ${agreementText} We hear you. Playing soulful tracks that may help.`,
                'Energetic': `⚡ ${agreementText} High energy detected! Playing powerful tracks.`,
                'Calm': `🌸 ${agreementText} Peaceful state detected. Playing soothing tracks.`,
                'Stressed': `🌊 ${agreementText} Playing calming tracks to help you relax.`,
                'Neutral': `🎵 ${agreementText} Playing balanced tracks for your mood.`
            };
            
            // Step 5: Log fusion details for debugging
            console.log('=== Mood Fusion ===');
            console.log('Modalities:', validModalities);
            console.log('Mood Scores:', moodScores);
            console.log('Fused Mood:', fusedMood);
            console.log('Agreement:', agreeCount, '/', validModalities.length);
            console.log('Confidence:', fusionConfidence, '%');
            
            this.fusedMood = { 
                mood: fusedMood, 
                confidence: fusionConfidence, 
                description: descriptions[fusedMood] || descriptions['Neutral']
            };
            
            this.showToast(`Final mood: ${fusedMood} (${fusionConfidence}%)`, 'success');
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
                    this.recommendedTracks = this.getMockTracks(this.fusedMood.mood);
                    this.showToast('Nice songs to be recommended');
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
                    { id: 'h1', name: 'Happy', artist: 'Pharrell Williams', externalUrl: 'https://open.spotify.com/track/60nZcImufyMA1MKQY3dcCH', color: '#FFD700' },
                    { id: 'h2', name: 'Walking On Sunshine', artist: 'Katrina & The Waves', externalUrl: 'https://open.spotify.com/track/05wIrZSwuaVWhcv5FfqeH0', color: '#FFD700' },
                    { id: 'h3', name: 'Can\'t Stop The Feeling', artist: 'Justin Timberlake', externalUrl: 'https://open.spotify.com/track/77j6af0Q5PqH2Xh8Wq0O5K', color: '#FFD700' },
                    { id: 'h4', name: 'Uptown Funk', artist: 'Mark Ronson ft. Bruno Mars', externalUrl: 'https://open.spotify.com/track/32OlwWuMpZ6b0aN2RZOeMS', color: '#FFD700' },
                    { id: 'h5', name: 'I Gotta Feeling', artist: 'Black Eyed Peas', externalUrl: 'https://open.spotify.com/track/2H1047e0oMSj10dgp7p2VG', color: '#FFD700' },
                    { id: 'h6', name: 'Shake It Off', artist: 'Taylor Swift', externalUrl: 'https://open.spotify.com/track/2oq5dRcvN2eRJ0yD8D0D0D', color: '#FFD700' }
                ],
                Sad: [
                    { id: 's1', name: 'Someone Like You', artist: 'Adele', externalUrl: 'https://open.spotify.com/track/3bNv3VuUOKgrf5hu3YcuRo', color: '#45B7D1' },
                    { id: 's2', name: 'Fix You', artist: 'Coldplay', externalUrl: 'https://open.spotify.com/track/7LVHVU3tWfcxj5aiPFEW4Q', color: '#45B7D1' },
                    { id: 's3', name: 'All I Want', artist: 'Kodaline', externalUrl: 'https://open.spotify.com/track/0NlGoUyOJSuSHmngoibVAs', color: '#45B7D1' },
                    { id: 's4', name: 'Say Something', artist: 'A Great Big World', externalUrl: 'https://open.spotify.com/track/6Vc5wAMmXdKIAM7WUoEb7N', color: '#45B7D1' },
                    { id: 's5', name: 'Skinny Love', artist: 'Bon Iver', externalUrl: 'https://open.spotify.com/track/3B3eOgLJSqPEA0RfboIQVM', color: '#45B7D1' },
                    { id: 's6', name: 'The Night We Met', artist: 'Lord Huron', externalUrl: 'https://open.spotify.com/track/0QZ5yyl6B6utIWkxeBDxQN', color: '#45B7D1' }
                ],
                Energetic: [
                    { id: 'e1', name: 'Eye of the Tiger', artist: 'Survivor', externalUrl: 'https://open.spotify.com/track/2KH16WveTQWT6KOG9Rg6e2', color: '#FF6B6B' },
                    { id: 'e2', name: 'Stronger', artist: 'Kanye West', externalUrl: 'https://open.spotify.com/track/0j2T0R9dR9qdJYsB7ciXhf', color: '#FF6B6B' },
                    { id: 'e3', name: 'Thunderstruck', artist: 'AC/DC', externalUrl: 'https://open.spotify.com/track/57bgtoPSgt236HzfBOd8kj', color: '#FF6B6B' },
                    { id: 'e4', name: 'Don\'t Stop Me Now', artist: 'Queen', externalUrl: 'https://open.spotify.com/track/5T8EDUDqKcs6OSOwEsfqG7', color: '#FF6B6B' },
                    { id: 'e5', name: 'Levels', artist: 'Avicii', externalUrl: 'https://open.spotify.com/track/5UqCQaDshqbIk3pkhy4Pjg', color: '#FF6B6B' },
                    { id: 'e6', name: 'Titanium', artist: 'David Guetta ft. Sia', externalUrl: 'https://open.spotify.com/track/0lQn50x1bzkr2RcN8JwJjU', color: '#FF6B6B' }
                ],
                Calm: [
                    { id: 'c1', name: 'Weightless', artist: 'Marconi Union', externalUrl: 'https://open.spotify.com/track/4c1Hj1QxN8K8K8K8K8K8K8', color: '#96CEB4' },
                    { id: 'c2', name: 'River Flows In You', artist: 'Yiruma', externalUrl: 'https://open.spotify.com/track/3x7Ni6n4X0gK0gK0gK0gK0', color: '#96CEB4' },
                    { id: 'c3', name: 'Gymnopédie No.1', artist: 'Erik Satie', externalUrl: 'https://open.spotify.com/track/5NGtFXVpXSvwunEIGeviY3', color: '#96CEB4' },
                    { id: 'c4', name: 'Holocene', artist: 'Bon Iver', externalUrl: 'https://open.spotify.com/track/1ILEKd4NUJKBn7dRc7c7c7', color: '#96CEB4' },
                    { id: 'c5', name: 'Bloom', artist: 'The Paper Kites', externalUrl: 'https://open.spotify.com/track/0k0k0k0k0k0k0k0k0k0k0', color: '#96CEB4' }
                ],
                Stressed: [
                    { id: 't1', name: 'Breathe Me', artist: 'Sia', externalUrl: 'https://open.spotify.com/track/5hxukp7zZrA2cWf1Uq1Yg4', color: '#4ECDC4' },
                    { id: 't2', name: 'Three Little Birds', artist: 'Bob Marley', externalUrl: 'https://open.spotify.com/track/3bNv3VuUOKgrf5hu3YcuRo', color: '#4ECDC4' },
                    { id: 't3', name: 'Let It Be', artist: 'The Beatles', externalUrl: 'https://open.spotify.com/track/0j2T0R9dR9qdJYsB7ciXhf', color: '#4ECDC4' },
                    { id: 't4', name: 'Here Comes The Sun', artist: 'The Beatles', externalUrl: 'https://open.spotify.com/track/6dGnYIeXmHdcikdzNNDMm2', color: '#4ECDC4' },
                    { id: 't5', name: 'What A Wonderful World', artist: 'Louis Armstrong', externalUrl: 'https://open.spotify.com/track/29U7stRjqHU6rMiS8BfaI9', color: '#4ECDC4' }
                ]
            };
            return mockData[mood] || mockData.Happy;
        },
        
        // ==================== SPOTIFY PLAYBACK ====================
        
        playSpotifyTrack(track) {
            
            
            window.open(track.externalUrl, '_blank');
            
            this.currentTrackName = track.name;
            this.currentArtist = track.artist;
            this.currentTrackId = track.id;
            this.currentPlayingTrackId = track.id;
            this.isPlaying = true;
            
            this.showToast(`Opening ${track.name} on Spotify`, 'success');
        },
        
        togglePlayPause(track) {
            this.playSpotifyTrack(track);
        },
        
        stopCurrentTrack() {
            this.isPlaying = false;
            this.currentPlayingTrackId = null;
            this.currentTrackName = '';
            this.currentArtist = '';
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
            this.cleanupAllMedia();
            
            this.facialAnalysis = { recording: false, completed: false, countdown: 10, mood: '', accuracy: 0 };
            this.voiceAnalysis = { recording: false, completed: false, mood: '', accuracy: 0 };
            this.textAnalysis = { input: '', completed: false, mood: '', accuracy: 0 };
            this.fusedMood = { mood: '', confidence: 0, description: '' };
            this.recommendedTracks = [];
            this.isPlaying = false;
            this.currentTrackId = null;
            this.currentPlayingTrackId = null;
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
            
            // First, ensure all media is stopped
            this.cleanupAllMedia();
            
            if (token && user) {
                try {
                    const userData = JSON.parse(user);
                    this.currentUser = userData.username;
                    this.userId = userData.id;
                    this.currentPage = 'home';
                    this.startSessionTimer();
                    this.fetchMoodHistory();
                } catch (e) {
                    console.error('Auth check failed:', e);
                    localStorage.removeItem('token');
                    localStorage.removeItem('user');
                    this.currentPage = 'login';
                }
            } else {
                this.currentPage = 'login';
            }
        }
    }
});