/**
 * Perplexity-Style Voice Mode Implementation
 * Smooth, minimal interface with proper microphone handling
 */

class PerplexityVoiceBot {
    constructor() {
        this.state = {
            isListening: false,
            isProcessing: false,
            isPlaying: false,
            sessionId: null,
            mediaRecorder: null,
            audioStream: null,
            audioChunks: [],
            audioContext: null,
            analyser: null,
            isInitialized: false,
            currentAudio: null
        };

        this.config = {
            audioConstraints: {
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    sampleRate: 44100
                }
            },
            endpoints: {
                chat: '/agent/chat/',
                health: '/health'
            }
        };

        this.init();
    }

    async init() {
        try {
            console.log('🎤 Initializing Perplexity-style Voice Bot...');
            
            // Create session ID
            this.state.sessionId = this.generateSessionId();
            
            // Setup DOM
            this.setupDOM();
            
            // Setup event listeners
            this.setupEventListeners();
            
            // Check if we're on HTTPS or localhost (required for getUserMedia)
            if (!this.isSecureContext()) {
                this.showError('Voice mode requires HTTPS or localhost. Please use a secure connection.');
                return;
            }
            
            // Initialize audio context (user interaction required)
            this.showInitialState();
            
            console.log('✅ Perplexity Voice Bot initialized');
            
        } catch (error) {
            console.error('❌ Failed to initialize:', error);
            this.showError('Failed to initialize voice mode. Please refresh and try again.');
        }
    }

    isSecureContext() {
        return location.protocol === 'https:' || 
               location.hostname === 'localhost' || 
               location.hostname === '127.0.0.1';
    }

    generateSessionId() {
        return 'perplexity_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 9);
    }

    setupDOM() {
        // Get existing elements or create new ones
        this.elements = {
            voiceButton: document.getElementById('voice-button') || this.createVoiceButton(),
            statusText: document.getElementById('voice-status') || this.createStatusText(),
            transcript: document.getElementById('transcript') || this.createTranscript(),
            response: document.getElementById('response') || this.createResponse(),
            waveform: document.getElementById('waveform') || this.createWaveform()
        };
    }

    createVoiceButton() {
        const button = document.createElement('button');
        button.id = 'voice-button';
        button.className = 'perplexity-voice-btn';
        button.innerHTML = `
            <div class="voice-btn-content">
                <div class="voice-icon">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                        <line x1="12" y1="19" x2="12" y2="23"></line>
                        <line x1="8" y1="23" x2="16" y2="23"></line>
                    </svg>
                </div>
                <span class="voice-text">Click to speak</span>
            </div>
            <div class="voice-pulse"></div>
        `;
        
        // Insert into main content area
        const mainContent = document.querySelector('.main-content') || document.body;
        mainContent.appendChild(button);
        
        return button;
    }

    createStatusText() {
        const status = document.createElement('div');
        status.id = 'voice-status';
        status.className = 'voice-status';
        status.textContent = 'Ready to listen';
        
        this.elements.voiceButton.parentNode.appendChild(status);
        return status;
    }

    createTranscript() {
        const transcript = document.createElement('div');
        transcript.id = 'transcript';
        transcript.className = 'voice-transcript';
        transcript.style.display = 'none';
        
        this.elements.voiceButton.parentNode.appendChild(transcript);
        return transcript;
    }

    createResponse() {
        const response = document.createElement('div');
        response.id = 'response';
        response.className = 'voice-response';
        response.style.display = 'none';
        
        this.elements.voiceButton.parentNode.appendChild(response);
        return response;
    }

    createWaveform() {
        const canvas = document.createElement('canvas');
        canvas.id = 'waveform';
        canvas.className = 'voice-waveform';
        canvas.width = 200;
        canvas.height = 60;
        canvas.style.display = 'none';
        
        this.elements.voiceButton.parentNode.appendChild(canvas);
        return canvas;
    }

    setupEventListeners() {
        // Voice button click
        this.elements.voiceButton.addEventListener('click', () => this.handleVoiceButtonClick());
        
        // Keyboard shortcuts (like Perplexity)
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Space' && !e.target.matches('input, textarea')) {
                e.preventDefault();
                this.handleVoiceButtonClick();
            }
            if (e.code === 'Escape') {
                this.stopListening();
            }
        });

        // Handle page visibility changes
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && this.state.isListening) {
                this.stopListening();
            }
        });
    }

    showInitialState() {
        this.updateStatus('Click the microphone or press Space to start');
        this.elements.voiceButton.classList.remove('listening', 'processing');
        this.elements.waveform.style.display = 'none';
    }

    async handleVoiceButtonClick() {
        try {
            if (this.state.isListening) {
                await this.stopListening();
            } else if (this.state.isProcessing) {
                // Can't interrupt processing
                return;
            } else {
                await this.startListening();
            }
        } catch (error) {
            console.error('Voice button click error:', error);
            this.showError('Voice mode error. Please try again.');
        }
    }

    async startListening() {
        try {
            if (!this.state.isInitialized) {
                await this.initializeAudio();
            }

            if (!this.state.audioStream) {
                this.showError('Microphone not available. Please check permissions.');
                return;
            }

            this.state.isListening = true;
            this.state.audioChunks = [];

            // Update UI to listening state (like Perplexity)
            this.elements.voiceButton.classList.add('listening');
            this.updateStatus('Listening... speak now');
            this.updateVoiceButtonText('Listening...');
            this.elements.waveform.style.display = 'block';

            // Create media recorder
            this.state.mediaRecorder = new MediaRecorder(this.state.audioStream, {
                mimeType: 'audio/webm;codecs=opus'
            });

            this.state.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.state.audioChunks.push(event.data);
                }
            };

            this.state.mediaRecorder.onstop = () => {
                this.processAudio();
            };

            this.state.mediaRecorder.start();
            this.startWaveformAnimation();

            console.log('🎤 Started listening');

        } catch (error) {
            console.error('Failed to start listening:', error);
            this.showError('Could not start listening. Please check microphone permissions.');
            this.resetState();
        }
    }

    async stopListening() {
        if (!this.state.isListening || !this.state.mediaRecorder) {
            return;
        }

        try {
            this.state.isListening = false;
            this.state.isProcessing = true;

            // Update UI to processing state
            this.elements.voiceButton.classList.remove('listening');
            this.elements.voiceButton.classList.add('processing');
            this.updateStatus('Processing your question...');
            this.updateVoiceButtonText('Processing...');
            this.elements.waveform.style.display = 'none';

            this.state.mediaRecorder.stop();
            this.stopWaveformAnimation();

            console.log('⏹️ Stopped listening, processing audio');

        } catch (error) {
            console.error('Failed to stop listening:', error);
            this.resetState();
        }
    }

    async initializeAudio() {
        try {
            console.log('🎤 Requesting microphone access...');
            this.updateStatus('Requesting microphone access...');

            // Check if getUserMedia is available
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error('getUserMedia not supported in this browser');
            }

            this.state.audioStream = await navigator.mediaDevices.getUserMedia(this.config.audioConstraints);

            // Initialize Web Audio API for visualization
            this.state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const source = this.state.audioContext.createMediaStreamSource(this.state.audioStream);
            this.state.analyser = this.state.audioContext.createAnalyser();
            this.state.analyser.fftSize = 256;
            source.connect(this.state.analyser);

            this.state.isInitialized = true;
            this.updateStatus('Ready to listen');

            console.log('✅ Audio initialized successfully');

        } catch (error) {
            console.error('Failed to initialize audio:', error);
            
            let message = 'Microphone access failed. ';
            if (error.name === 'NotAllowedError') {
                message += 'Please allow microphone access and refresh the page.';
            } else if (error.name === 'NotFoundError') {
                message += 'No microphone found.';
            } else if (error.message.includes('getUserMedia not supported')) {
                message += 'Your browser does not support voice features.';
            } else {
                message += 'Please check your microphone settings.';
            }
            
            this.showError(message);
            throw error;
        }
    }

    async processAudio() {
        try {
            if (this.state.audioChunks.length === 0) {
                this.showError('No audio recorded. Please try again.');
                this.resetState();
                return;
            }

            // Create audio blob
            const audioBlob = new Blob(this.state.audioChunks, { type: 'audio/webm' });
            
            if (audioBlob.size === 0) {
                this.showError('No audio data recorded. Please try again.');
                this.resetState();
                return;
            }

            console.log(`🎵 Processing audio blob: ${audioBlob.size} bytes`);

            // Send to server (Perplexity-style)
            await this.sendAudioToServer(audioBlob);

        } catch (error) {
            console.error('Failed to process audio:', error);
            this.showError('Failed to process your voice. Please try again.');
            this.resetState();
        }
    }

    async sendAudioToServer(audioBlob) {
        try {
            this.updateStatus('Understanding your question...');

            const formData = new FormData();
            formData.append('audio', audioBlob, 'voice.webm');

            const response = await fetch(`${this.config.endpoints.chat}${this.state.sessionId}`, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                throw new Error(`Server error: ${response.status}`);
            }

            const result = await response.json();

            if (!result.success) {
                throw new Error(result.error || 'Server processing failed');
            }

            // Display results (Perplexity-style)
            this.displayResults(result);

        } catch (error) {
            console.error('Server request failed:', error);
            this.showError(`Server error: ${error.message}`);
            this.resetState();
        }
    }

    displayResults(result) {
        try {
            // Show transcript (like Perplexity)
            if (result.transcript) {
                this.elements.transcript.textContent = `You: "${result.transcript}"`;
                this.elements.transcript.style.display = 'block';
            }

            // Show response
            if (result.response) {
                this.elements.response.textContent = result.response;
                this.elements.response.style.display = 'block';
                
                // Play audio response if available
                if (result.audio_url) {
                    this.playAudioResponse(result.audio_url);
                } else {
                    this.resetState();
                }
            }

            this.updateStatus('Response ready');

        } catch (error) {
            console.error('Failed to display results:', error);
            this.resetState();
        }
    }

    async playAudioResponse(audioUrl) {
        try {
            this.state.isPlaying = true;
            this.updateStatus('Playing response...');
            this.updateVoiceButtonText('Playing...');

            if (this.state.currentAudio) {
                this.state.currentAudio.pause();
            }

            this.state.currentAudio = new Audio(audioUrl);
            
            this.state.currentAudio.onended = () => {
                this.state.isPlaying = false;
                this.resetState();
            };

            this.state.currentAudio.onerror = () => {
                console.error('Audio playback failed');
                this.resetState();
            };

            await this.state.currentAudio.play();

        } catch (error) {
            console.error('Failed to play audio:', error);
            this.resetState();
        }
    }

    startWaveformAnimation() {
        if (!this.state.analyser) return;

        const canvas = this.elements.waveform;
        const ctx = canvas.getContext('2d');
        const bufferLength = this.state.analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        const draw = () => {
            if (!this.state.isListening) return;

            requestAnimationFrame(draw);
            
            this.state.analyser.getByteFrequencyData(dataArray);
            
            ctx.fillStyle = 'rgb(13, 13, 13)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            const barWidth = (canvas.width / bufferLength) * 2.5;
            let x = 0;
            
            ctx.fillStyle = 'rgb(59, 130, 246)'; // Perplexity blue
            
            for (let i = 0; i < bufferLength; i++) {
                const barHeight = (dataArray[i] / 255) * canvas.height;
                ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
                x += barWidth + 1;
            }
        };

        draw();
    }

    stopWaveformAnimation() {
        // Animation stops automatically when isListening becomes false
    }

    updateStatus(message) {
        this.elements.statusText.textContent = message;
        console.log(`Status: ${message}`);
    }

    updateVoiceButtonText(text) {
        const textElement = this.elements.voiceButton.querySelector('.voice-text');
        if (textElement) {
            textElement.textContent = text;
        }
    }

    showError(message) {
        this.updateStatus(`Error: ${message}`);
        console.error(message);
        
        // Auto-clear error after 5 seconds
        setTimeout(() => {
            if (this.elements.statusText.textContent.startsWith('Error:')) {
                this.updateStatus('Ready to listen');
            }
        }, 5000);
    }

    resetState() {
        this.state.isListening = false;
        this.state.isProcessing = false;
        this.state.isPlaying = false;
        
        this.elements.voiceButton.classList.remove('listening', 'processing');
        this.updateStatus('Ready to listen');
        this.updateVoiceButtonText('Click to speak');
        this.elements.waveform.style.display = 'none';
        
        // Keep transcript and response visible for user reference
        // They'll be hidden on next interaction
    }

    cleanup() {
        if (this.state.audioStream) {
            this.state.audioStream.getTracks().forEach(track => track.stop());
        }
        if (this.state.currentAudio) {
            this.state.currentAudio.pause();
        }
        console.log('🧹 Perplexity Voice Bot cleaned up');
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Clean up any existing instances
    if (window.perplexityVoiceBot) {
        window.perplexityVoiceBot.cleanup();
    }
    
    window.perplexityVoiceBot = new PerplexityVoiceBot();
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (window.perplexityVoiceBot) {
        window.perplexityVoiceBot.cleanup();
    }
});
