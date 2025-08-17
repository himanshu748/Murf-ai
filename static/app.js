/**
 * Main Application Controller for Murf AI Voice Agent - Day 15
 * Orchestrates WebSocket communication, audio recording, and UI interactions
 */

class VoiceAgent {
    constructor() {
        // Core components
        this.wsClient = null;
        this.audioVisualizer = null;
        this.mediaRecorder = null;
        this.audioStream = null;
        
        // State management
        this.isRecording = false;
        this.isProcessing = false;
        this.currentSessionId = null;
        this.conversationHistory = [];
        this.isStreaming = false;
        this.streamingMode = false;
        
        // DOM elements
        this.recordBtn = document.getElementById('recordBtn');
        this.recordText = this.recordBtn.querySelector('.record-text');
        this.statusMessage = document.getElementById('statusMessage');
        this.conversationHistory = document.getElementById('conversationHistory');
        this.processingStages = document.getElementById('processingStages');
        this.responseAudio = document.getElementById('responseAudio');
        this.loadingOverlay = document.getElementById('loadingOverlay');
        
        // Audio recording
        this.audioChunks = [];
        this.recordingStartTime = null;
        this.maxRecordingTime = 60000; // 60 seconds
        this.silenceTimer = null;
        this.silenceThreshold = 3000; // 3 seconds of silence
        
        this.init();
    }
    
    async init() {
        try {
            this.showLoading('Initializing Voice Agent...');
            
            // Initialize audio visualizer
            this.audioVisualizer = new AudioVisualizer('visualizerCanvas');
            
            // Initialize WebSocket client
            this.wsClient = new WebSocketClient();
            this.setupWebSocketEvents();
            
            // Setup DOM event listeners
            this.setupEventListeners();
            
            // Wait for WebSocket connection
            await this.waitForConnection();
            
            // Create initial session
            this.wsClient.createSession();
            
            // Check microphone permissions
            await this.checkMicrophonePermissions();
            
            this.hideLoading();
            this.updateStatus('Ready to listen - Click the microphone to start');
            
        } catch (error) {
            console.error('Failed to initialize voice agent:', error);
            this.hideLoading();
            this.showError('Failed to initialize voice agent. Please refresh the page.');
        }
    }
    
    setupWebSocketEvents() {
        // Connection events
        this.wsClient.on('connected', () => {
            this.updateStatus('Connected to voice agent');
        });
        
        this.wsClient.on('disconnected', () => {
            this.updateStatus('Disconnected from server');
        });
        
        this.wsClient.on('error', (error) => {
            this.showError('Connection error occurred');
        });
        
        // Session events
        this.wsClient.on('session_created', (data) => {
            this.currentSessionId = data.session_id;
            this.updateStatus('New session created - Ready to chat');
        });
        
        this.wsClient.on('session_joined', (data) => {
            this.currentSessionId = data.session_id;
            if (data.history && data.history.length > 0) {
                this.loadConversationHistory(data.history);
            }
            this.updateStatus('Session joined - Ready to continue');
        });
        
        // Processing events
        this.wsClient.on('processing_status', (data) => {
            this.updateProcessingStage(data.stage);
            this.updateStatus(data.message);
        });
        
        this.wsClient.on('transcription_complete', (data) => {
            this.addMessageToHistory('user', data.transcript);
        });
        
        this.wsClient.on('ai_response', (data) => {
            this.addMessageToHistory('assistant', data.text);
        });
        
        this.wsClient.on('voice_response', (data) => {
            this.playAudioResponse(data.audio_url, data.text);
            this.clearProcessingStages();
            this.updateStatus('Response complete - Ready for next message');
            this.isProcessing = false;
        });
        
        // Streaming events
        this.wsClient.on('streaming_started', (data) => {
            this.isStreaming = true;
            this.updateStatus(`Audio streaming started - ${data.filename}`);
            console.log('Streaming started:', data);
        });
        
        this.wsClient.on('streaming_stopped', (data) => {
            this.isStreaming = false;
            this.updateStatus(`Audio saved: ${data.stats.total_chunks} chunks, ${Math.round(data.stats.total_bytes/1024)}KB`);
            console.log('Streaming stopped:', data.stats);
        });
        
        this.wsClient.on('streaming_progress', (data) => {
            this.updateStatus(`Streaming... ${data.chunk_count} chunks (${Math.round(data.total_bytes/1024)}KB)`);
        });
    }
    
    setupEventListeners() {
        // Record button
        this.recordBtn.addEventListener('click', () => {
            if (this.isRecording) {
                this.stopRecording();
            } else if (!this.isProcessing) {
                this.startRecording();
            }
        });
        
        // Clear chat button
        const clearChatBtn = document.getElementById('clearChatBtn');
        if (clearChatBtn) {
            clearChatBtn.addEventListener('click', () => {
                this.clearConversation();
            });
        }
        
        // Streaming mode toggle
        const streamingToggle = document.getElementById('streamingToggle');
        const modeDescription = document.getElementById('modeDescription');
        if (streamingToggle && modeDescription) {
            streamingToggle.addEventListener('change', () => {
                this.toggleStreamingMode();
                if (this.streamingMode) {
                    modeDescription.textContent = 'Streaming: Real-time audio to file';
                } else {
                    modeDescription.textContent = 'Traditional: Record → Process → Response';
                }
            });
        }
        
        // Audio response events
        this.responseAudio.addEventListener('ended', () => {
            // Auto-start recording after response finishes
            if (!this.isRecording && !this.isProcessing) {
                setTimeout(() => {
                    this.startRecording();
                }, 1000); // 1 second delay
            }
        });
        
        this.responseAudio.addEventListener('error', (e) => {
            console.error('Audio playback error:', e);
            this.updateStatus('Audio playback failed - Ready for next message');
        });
        
        // Window events
        window.addEventListener('beforeunload', () => {
            this.cleanup();
        });
        
        window.addEventListener('resize', () => {
            if (this.audioVisualizer) {
                this.audioVisualizer.resize();
            }
        });
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Space bar to toggle recording
            if (e.code === 'Space' && !e.target.matches('input, textarea')) {
                e.preventDefault();
                if (this.isRecording) {
                    this.stopRecording();
                } else if (!this.isProcessing) {
                    this.startRecording();
                }
            }
        });
    }
    
    async startRecording() {
        try {
            if (this.isProcessing) {
                this.updateStatus('Please wait for current processing to complete');
                return;
            }
            
            // Check if mediaDevices is supported
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error('MediaDevices API not supported in this browser');
            }
            
            this.updateStatus('Requesting microphone access...');
            
            // Get user media with better error handling
            this.audioStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    sampleRate: 44100
                }
            });
            
            // Setup media recorder
            this.mediaRecorder = new MediaRecorder(this.audioStream, {
                mimeType: this.getSupportedMimeType()
            });
            
            this.audioChunks = [];
            this.recordingStartTime = Date.now();
            
            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    if (this.streamingMode) {
                        // Stream audio chunks in real-time
                        this.streamAudioChunk(event.data);
                    } else {
                        // Accumulate chunks for traditional processing
                        this.audioChunks.push(event.data);
                    }
                }
            };
            
            this.mediaRecorder.onstop = () => {
                if (this.streamingMode) {
                    this.stopAudioStreaming();
                } else {
                    this.processRecording();
                }
            };
            
            // Start recording with appropriate interval
            if (this.streamingMode) {
                // Start streaming session first
                this.startAudioStreaming();
                // Shorter intervals for streaming (50ms)
                this.mediaRecorder.start(50);
            } else {
                // Longer intervals for traditional recording (100ms)
                this.mediaRecorder.start(100);
            }
            this.isRecording = true;
            
            // Update UI
            this.recordBtn.classList.add('recording');
            this.recordText.textContent = 'Recording...';
            this.updateStatus('Listening... Click again to stop');
            
            // Start audio visualization
            this.audioVisualizer.startVisualization(this.audioStream);
            
            // Auto-stop recording after max time
            setTimeout(() => {
                if (this.isRecording) {
                    this.stopRecording();
                }
            }, this.maxRecordingTime);
            
            console.log('Recording started');
            
        } catch (error) {
            console.error('Failed to start recording:', error);
            
            // Provide specific error messages based on error type
            let errorMessage = 'Microphone access failed';
            let statusMessage = 'Please check microphone permissions';
            
            if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
                errorMessage = 'Microphone access denied. Please click the 🔒 lock icon in your browser address bar and allow microphone access, then refresh the page.';
                statusMessage = 'Microphone permission denied';
            } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
                errorMessage = 'No microphone found. Please connect a microphone and try again.';
                statusMessage = 'No microphone detected';
            } else if (error.name === 'NotSupportedError') {
                errorMessage = 'Your browser does not support microphone access. Please try using Chrome, Firefox, or Safari.';
                statusMessage = 'Browser not supported';
            } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
                errorMessage = 'Microphone is being used by another application. Please close other apps using the microphone and try again.';
                statusMessage = 'Microphone in use';
            } else if (error.message.includes('secure')) {
                errorMessage = 'Microphone access requires HTTPS. Please enable microphone permissions for localhost or try the HTTPS version.';
                statusMessage = 'HTTPS required for microphone';
            } else {
                errorMessage = `Microphone error: ${error.message}. Please check your microphone settings and try again.`;
                statusMessage = 'Microphone setup failed';
            }
            
            this.updateStatus(statusMessage);
            this.showError(errorMessage);
            this.resetRecordingState();
        }
    }
    
    stopRecording() {
        if (!this.isRecording) return;
        
        try {
            // Stop media recorder
            if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
                this.mediaRecorder.stop();
            }
            
            // Stop audio stream
            if (this.audioStream) {
                this.audioStream.getTracks().forEach(track => track.stop());
                this.audioStream = null;
            }
            
            // Stop visualization
            this.audioVisualizer.stopVisualization();
            
            // Update state
            this.isRecording = false;
            
            // Update UI
            this.recordBtn.classList.remove('recording');
            this.recordBtn.classList.add('processing');
            this.recordText.textContent = 'Processing...';
            this.updateStatus('Processing your message...');
            
            console.log('Recording stopped');
            
        } catch (error) {
            console.error('Error stopping recording:', error);
            this.resetRecordingState();
        }
    }
    
    async processRecording() {
        try {
            if (this.audioChunks.length === 0) {
                this.updateStatus('No audio recorded - Please try again');
                this.resetRecordingState();
                return;
            }
            
            // Create audio blob
            const audioBlob = new Blob(this.audioChunks, { 
                type: this.getSupportedMimeType() 
            });
            
            // Check minimum recording duration
            const recordingDuration = Date.now() - this.recordingStartTime;
            if (recordingDuration < 500) {
                this.updateStatus('Recording too short - Please speak longer');
                this.resetRecordingState();
                return;
            }
            
            // Convert to base64
            const audioBase64 = await this.blobToBase64(audioBlob);
            
            // Send via WebSocket
            this.isProcessing = true;
            this.audioVisualizer.showProcessing();
            
            const success = this.wsClient.sendVoiceMessage(audioBase64, this.currentSessionId);
            
            if (!success) {
                this.updateStatus('Failed to send message - Please try again');
                this.resetRecordingState();
                return;
            }
            
            this.updateStatus('Message sent - Waiting for response...');
            
        } catch (error) {
            console.error('Error processing recording:', error);
            this.updateStatus('Failed to process recording - Please try again');
            this.resetRecordingState();
        }
    }
    
    async playAudioResponse(audioUrl, text = '') {
        try {
            // Check if we should use browser TTS fallback
            if (audioUrl === 'browser_tts' || !audioUrl) {
                this.playBrowserTTS(text);
                return;
            }
            
            this.responseAudio.src = audioUrl;
            this.responseAudio.currentTime = 0;
            
            // Play audio
            const playPromise = this.responseAudio.play();
            
            if (playPromise !== undefined) {
                await playPromise;
                console.log('Audio response playing');
            }
            
            this.audioVisualizer.hideProcessing();
            this.resetRecordingState();
            
        } catch (error) {
            console.error('Failed to play audio response:', error);
            this.updateStatus('Audio playback failed - Using browser voice');
            // Fallback to browser TTS
            this.playBrowserTTS(text);
        }
    }
    
    playBrowserTTS(text) {
        try {
            if (!text || typeof text !== 'string') {
                this.resetRecordingState();
                return;
            }
            
            // Update service indicator
            this.updateServiceStatus('browser', 'Browser Voice', 'Speaking...');
            
            // Use browser's speech synthesis as fallback
            const utterance = new SpeechSynthesisUtterance(text);
            
            // Configure for male voice if available
            const voices = speechSynthesis.getVoices();
            const maleVoice = voices.find(voice => 
                voice.name.toLowerCase().includes('male') ||
                voice.name.toLowerCase().includes('daniel') ||
                voice.name.toLowerCase().includes('david') ||
                voice.name.toLowerCase().includes('alex')
            );
            
            if (maleVoice) {
                utterance.voice = maleVoice;
            }
            
            utterance.rate = 0.9;
            utterance.pitch = 0.8;
            utterance.volume = 0.8;
            
            utterance.onend = () => {
                this.audioVisualizer.hideProcessing();
                this.updateServiceStatus('ready', 'Voice Service', 'Ready');
                this.resetRecordingState();
                
                // Auto-start recording after browser TTS finishes
                setTimeout(() => {
                    if (!this.isRecording && !this.isProcessing) {
                        this.startRecording();
                    }
                }, 1000);
            };
            
            utterance.onerror = (error) => {
                console.error('Browser TTS error:', error);
                this.updateServiceStatus('ready', 'Voice Service', 'Ready');
                this.resetRecordingState();
            };
            
            speechSynthesis.speak(utterance);
            this.updateStatus('Playing response with browser voice...');
            
        } catch (error) {
            console.error('Browser TTS failed:', error);
            this.updateStatus('Voice synthesis failed - Ready for next message');
            this.updateServiceStatus('ready', 'Voice Service', 'Ready');
            this.resetRecordingState();
        }
    }
    
    updateServiceStatus(type, name, status) {
        const indicator = document.getElementById('ttsIndicator');
        if (indicator) {
            // Remove existing classes
            indicator.classList.remove('murf', 'browser');
            
            // Add appropriate class
            if (type === 'murf') {
                indicator.classList.add('murf');
            } else if (type === 'browser') {
                indicator.classList.add('browser');
            }
            
            // Update content
            const nameElement = indicator.querySelector('.service-name');
            const statusElement = indicator.querySelector('.service-status-text');
            
            if (nameElement) nameElement.textContent = name;
            if (statusElement) statusElement.textContent = status;
        }
    }
    
    // UI Management
    updateStatus(message) {
        if (this.statusMessage) {
            this.statusMessage.textContent = message;
        }
    }
    
    updateProcessingStage(stage) {
        // Clear all active stages
        const stages = this.processingStages.querySelectorAll('.stage');
        stages.forEach(s => s.classList.remove('active'));
        
        // Activate current stage
        const currentStage = this.processingStages.querySelector(`[data-stage="${stage}"]`);
        if (currentStage) {
            currentStage.classList.add('active');
        }
    }
    
    clearProcessingStages() {
        const stages = this.processingStages.querySelectorAll('.stage');
        stages.forEach(s => s.classList.remove('active'));
    }
    
    addMessageToHistory(role, content) {
        const messageElement = document.createElement('div');
        messageElement.className = `message ${role}`;
        
        const contentElement = document.createElement('div');
        contentElement.className = 'message-content';
        contentElement.textContent = content;
        
        const timeElement = document.createElement('div');
        timeElement.className = 'message-time';
        timeElement.textContent = new Date().toLocaleTimeString();
        
        messageElement.appendChild(contentElement);
        messageElement.appendChild(timeElement);
        
        // Remove welcome message if it exists
        const welcomeMessage = this.conversationHistory.querySelector('.welcome-message');
        if (welcomeMessage) {
            welcomeMessage.remove();
        }
        
        this.conversationHistory.appendChild(messageElement);
        this.conversationHistory.scrollTop = this.conversationHistory.scrollHeight;
    }
    
    loadConversationHistory(history) {
        // Clear existing messages
        this.conversationHistory.innerHTML = '';
        
        // Add historical messages
        history.forEach(message => {
            this.addMessageToHistory(message.role, message.content);
        });
    }
    
    clearConversation() {
        this.conversationHistory.innerHTML = `
            <div class="welcome-message">
                <div class="message-content">
                    Conversation cleared. Click the microphone to start a new conversation.
                </div>
            </div>
        `;
    }
    
    resetRecordingState() {
        this.isRecording = false;
        this.isProcessing = false;
        
        this.recordBtn.classList.remove('recording', 'processing');
        this.recordText.textContent = 'Click to Start';
        
        this.clearProcessingStages();
        this.audioVisualizer.hideProcessing();
        
        // Clear audio chunks
        this.audioChunks = [];
        this.recordingStartTime = null;
    }
    
    // Utility methods
    async checkMicrophonePermissions() {
        try {
            // Check if the Permissions API is supported
            if (navigator.permissions && navigator.permissions.query) {
                const permission = await navigator.permissions.query({ name: 'microphone' });
                
                if (permission.state === 'denied') {
                    this.showError('Microphone access is blocked. Please click the 🔒 lock icon in your browser address bar, allow microphone access, and refresh the page.');
                    return;
                } else if (permission.state === 'prompt') {
                    // Permission will be requested when user clicks microphone
                    this.updateStatus('Ready to listen - Microphone permission will be requested');
                    return;
                }
            }
            
            // Check if MediaDevices API is supported
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                this.showError('Your browser does not support microphone access. Please use Chrome, Firefox, or Safari.');
                return;
            }
            
            // Check if we're on HTTPS or localhost
            const isSecure = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
            if (!isSecure) {
                this.showError('Microphone access requires HTTPS. Please enable HTTPS or run on localhost.');
                return;
            }
            
        } catch (error) {
            console.warn('Could not check microphone permissions:', error);
            // Don't show error for permission check failure, just log it
        }
    }
    
    async waitForConnection(timeout = 10000) {
        return new Promise((resolve, reject) => {
            const checkConnection = () => {
                if (this.wsClient.connected) {
                    resolve();
                } else {
                    setTimeout(checkConnection, 100);
                }
            };
            
            checkConnection();
            
            setTimeout(() => {
                reject(new Error('Connection timeout'));
            }, timeout);
        });
    }
    
    getSupportedMimeType() {
        const types = [
            'audio/webm;codecs=opus',
            'audio/webm',
            'audio/mp4',
            'audio/wav'
        ];
        
        for (const type of types) {
            if (MediaRecorder.isTypeSupported(type)) {
                return type;
            }
        }
        
        return 'audio/webm'; // Fallback
    }
    
    async blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const result = reader.result;
                const base64 = result.split(',')[1]; // Remove data:audio/webm;base64,
                resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }
    
    showLoading(message = 'Loading...') {
        if (this.loadingOverlay) {
            const loadingText = this.loadingOverlay.querySelector('.loading-text');
            if (loadingText) {
                loadingText.textContent = message;
            }
            this.loadingOverlay.classList.remove('hidden');
        }
    }
    
    hideLoading() {
        if (this.loadingOverlay) {
            this.loadingOverlay.classList.add('hidden');
        }
    }
    
    showError(message) {
        console.error('Voice Agent Error:', message);
        this.updateStatus(`Error: ${message.split('.')[0]}`); // Show first sentence in status
        
        // Show error modal with detailed message
        const errorModal = document.getElementById('errorModal');
        const errorMessage = document.getElementById('errorMessage');
        
        if (errorModal && errorMessage) {
            // Add helpful instructions for common errors
            let enhancedMessage = message;
            
            if (message.includes('microphone access') || message.includes('permission')) {
                enhancedMessage += '\n\n📍 Quick Fix:\n1. Look for 🔒 or ⚠️ icon in your browser address bar\n2. Click it and select "Site Settings"\n3. Set Microphone to "Allow"\n4. Refresh this page (F5)';
            }
            
            errorMessage.style.whiteSpace = 'pre-line'; // Allow line breaks
            errorMessage.textContent = enhancedMessage;
            errorModal.classList.add('show');
        }
    }
    
    // Audio Streaming Methods
    startAudioStreaming() {
        if (!this.currentSessionId) {
            console.error('No session ID available for streaming');
            return;
        }
        
        // Send start streaming message
        this.wsClient.sendMessage({
            type: 'start_streaming',
            session_id: this.currentSessionId
        });
        
        console.log('Started audio streaming for session:', this.currentSessionId);
    }
    
    streamAudioChunk(audioBlob) {
        if (!this.isStreaming) {
            console.warn('Received audio chunk but streaming not active');
            return;
        }
        
        // Convert blob to array buffer and send as binary data
        audioBlob.arrayBuffer().then(arrayBuffer => {
            if (this.wsClient && this.wsClient.ws && this.wsClient.ws.readyState === WebSocket.OPEN) {
                this.wsClient.ws.send(arrayBuffer);
            }
        }).catch(error => {
            console.error('Error sending audio chunk:', error);
        });
    }
    
    stopAudioStreaming() {
        if (!this.currentSessionId) {
            console.error('No session ID available for stopping streaming');
            return;
        }
        
        // Send stop streaming message
        this.wsClient.sendMessage({
            type: 'stop_streaming',
            session_id: this.currentSessionId
        });
        
        console.log('Stopped audio streaming for session:', this.currentSessionId);
    }
    
    // Toggle between streaming and traditional recording modes
    toggleStreamingMode() {
        this.streamingMode = !this.streamingMode;
        const mode = this.streamingMode ? 'Streaming' : 'Traditional';
        this.updateStatus(`Recording mode: ${mode}`);
        console.log(`Switched to ${mode} recording mode`);
        return this.streamingMode;
    }
    
    cleanup() {
        // Stop recording if active
        if (this.isRecording) {
            this.stopRecording();
        }
        
        // Cleanup audio stream
        if (this.audioStream) {
            this.audioStream.getTracks().forEach(track => track.stop());
        }
        
        // Cleanup WebSocket
        if (this.wsClient) {
            this.wsClient.disconnect();
        }
        
        // Cleanup visualizer
        if (this.audioVisualizer) {
            this.audioVisualizer.destroy();
        }
    }
}

// Initialize application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    try {
        window.voiceAgent = new VoiceAgent();
        console.log('Murf AI Voice Agent initialized successfully');
        

    } catch (error) {
        console.error('Failed to initialize Voice Agent:', error);
        
        // Show fallback error message
        const errorMessage = document.createElement('div');
        errorMessage.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: #ff4444;
            color: white;
            padding: 20px;
            border-radius: 10px;
            text-align: center;
            z-index: 9999;
        `;
        errorMessage.innerHTML = `
            <h3>Initialization Failed</h3>
            <p>Please refresh the page to try again.</p>
            <button onclick="location.reload()" style="
                background: white;
                color: #ff4444;
                border: none;
                padding: 8px 16px;
                border-radius: 5px;
                cursor: pointer;
                margin-top: 10px;
            ">Refresh Page</button>
        `;
        document.body.appendChild(errorMessage);
    }
});


