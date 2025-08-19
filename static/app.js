/**
 * Main Application Controller for Murf AI Voice Agent - Day 17
 * Orchestrates WebSocket communication, audio recording, UI interactions, and real-time transcription
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
        
        // Day 17: Transcription state
        this.isTranscribing = false;
        this.transcriptionEnabled = false;
        
        // DOM elements
        this.recordBtn = document.getElementById('recordBtn');
        this.recordText = this.recordBtn.querySelector('.record-text');
        this.statusMessage = document.getElementById('statusMessage');
        this.conversationHistory = document.getElementById('conversationHistory');
        this.processingStages = document.getElementById('processingStages');
        this.responseAudio = document.getElementById('responseAudio');
        this.loadingOverlay = document.getElementById('loadingOverlay');
        
        // Day 17: Transcription DOM elements
        this.transcriptionToggle = document.getElementById('transcriptionToggle');
        this.transcriptionContainer = document.getElementById('transcriptionContainer');
        this.transcriptionIndicator = document.getElementById('transcriptionIndicator');
        this.transcriptionStatusText = document.getElementById('transcriptionStatusText');
        this.partialTranscript = document.getElementById('partialTranscript');
        this.finalTranscripts = document.getElementById('finalTranscripts');
        
        // Audio recording
        this.audioChunks = [];
        this.recordingStartTime = null;
        this.maxRecordingTime = 60000; // 60 seconds
        this.silenceTimer = null;
        this.silenceThreshold = 3000; // 3 seconds of silence

        // PCM streaming (for realtime STT)
        this.audioContext = null;
        this.scriptNode = null;
        this.pcmResampleState = {
            inputSampleRate: 0,
            leftover: new Float32Array(0)
        };
        
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
        
        // Day 17: Transcription events
        this.wsClient.on('transcription_started', (data) => {
            this.isTranscribing = true;
            this.updateTranscriptionStatus('active', 'Real-time transcription active');
            console.log('Transcription started for session:', data.session_id);
        });
        
        this.wsClient.on('transcription_stopped', (data) => {
            this.isTranscribing = false;
            this.updateTranscriptionStatus('inactive', 'Transcription stopped');
            console.log('Transcription stopped:', data.summary);
        });
        
        this.wsClient.on('partial_transcript', (data) => {
            this.displayPartialTranscript(data.text);
        });
        
        this.wsClient.on('final_transcript', (data) => {
            this.displayFinalTranscript(data);
        });

        // Turn detection event (from AssemblyAI or synthetic on final)
        this.wsClient.on('turn_detected', (data) => {
            // Auto-stop recording on detected turn if currently recording in streaming mode
            if (this.isRecording && this.streamingMode) {
                this.stopRecording();
            }
        });
        
        this.wsClient.on('transcription_error', (data) => {
            console.error('Transcription error:', data.error);
            this.updateTranscriptionStatus('error', 'Transcription error occurred');
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
        
        // Day 17: Transcription toggle
        if (this.transcriptionToggle) {
            this.transcriptionToggle.addEventListener('change', () => {
                this.toggleTranscription();
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
            
            this.audioChunks = [];
            this.recordingStartTime = Date.now();

            if (this.streamingMode && this.transcriptionEnabled) {
                // PCM16 streaming via WebAudio ScriptProcessor
                await this.startPCMStreaming();
            } else {
                // Setup media recorder for non-PCM streaming or traditional mode
                this.mediaRecorder = new MediaRecorder(this.audioStream, {
                    mimeType: this.getSupportedMimeType()
                });

                this.mediaRecorder.ondataavailable = (event) => {
                    if (event.data.size > 0) {
                        if (this.streamingMode) {
                            this.streamAudioChunk(event.data);
                        } else {
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

                if (this.streamingMode) {
                    // Start streaming session first for container streaming
                    this.startAudioStreaming({ data_format: 'webm' });
                    // Shorter intervals for streaming (50ms)
                    this.mediaRecorder.start(50);
                } else {
                    // Longer intervals for traditional recording (100ms)
                    this.mediaRecorder.start(100);
                }
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
            // Stop PCM streaming pipeline if active
            if (this.scriptNode) {
                this.stopPCMStreaming();
                // Ensure server-side streaming is stopped
                this.stopAudioStreaming();
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
    startAudioStreaming(opts = {}) {
        if (!this.currentSessionId) {
            console.error('No session ID available for streaming');
            return;
        }
        
        // Send start streaming message
        this.wsClient.sendMessage({
            type: 'start_streaming',
            session_id: this.currentSessionId,
            data_format: opts.data_format || (this.transcriptionEnabled ? 'pcm16' : 'webm')
        });
        
        console.log('Started audio streaming for session:', this.currentSessionId);
    }
    
    streamAudioChunk(audioBlob) {
        if (!this.isStreaming) {
            console.warn('Received audio chunk but streaming not active');
            return;
        }
        
        // If transcription is enabled, convert to PCM16 at 16kHz before sending
        if (this.transcriptionEnabled) {
            this.convertToPCM16(audioBlob).then(pcmBuffer => {
                if (this.wsClient && this.wsClient.ws && this.wsClient.ws.readyState === WebSocket.OPEN) {
                    this.wsClient.ws.send(pcmBuffer);
                }
            }).catch(error => {
                console.error('Error converting to PCM16:', error);
            });
        } else {
            // Otherwise send raw container data
            audioBlob.arrayBuffer().then(arrayBuffer => {
                if (this.wsClient && this.wsClient.ws && this.wsClient.ws.readyState === WebSocket.OPEN) {
                    this.wsClient.ws.send(arrayBuffer);
                }
            }).catch(error => {
                console.error('Error sending audio chunk:', error);
            });
        }
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

    async startPCMStreaming() {
        // Begin server-side streaming
        this.startAudioStreaming({ data_format: 'pcm16' });

        // Build processing graph
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const source = this.audioContext.createMediaStreamSource(this.audioStream);

        // Some browsers require connection to destination; use gain 0
        const gainNode = this.audioContext.createGain();
        gainNode.gain.value = 0.0;

        const bufferSize = 4096;
        this.scriptNode = this.audioContext.createScriptProcessor(bufferSize, 1, 1);
        this.pcmResampleState.inputSampleRate = this.audioContext.sampleRate;
        this.pcmResampleState.leftover = new Float32Array(0);

        this.scriptNode.onaudioprocess = (e) => {
            const inputBuffer = e.inputBuffer;
            const channelData = inputBuffer.getChannelData(0);
            const resampled = this.downsampleTo16k(channelData, this.pcmResampleState);
            if (resampled && resampled.length > 0) {
                const pcmBuffer = this.floatToPCM16(resampled);
                if (this.wsClient && this.wsClient.ws && this.wsClient.ws.readyState === WebSocket.OPEN) {
                    this.wsClient.ws.send(pcmBuffer);
                }
            }
        };

        source.connect(this.scriptNode);
        this.scriptNode.connect(gainNode);
        gainNode.connect(this.audioContext.destination);
    }

    stopPCMStreaming() {
        try {
            if (this.scriptNode) {
                this.scriptNode.disconnect();
            }
            this.scriptNode = null;
            if (this.audioContext) {
                this.audioContext.close();
            }
            this.audioContext = null;
            this.pcmResampleState.leftover = new Float32Array(0);
        } catch (e) {
            console.warn('Error stopping PCM streaming', e);
        }
    }

    downsampleTo16k(float32Audio, state) {
        const inputSampleRate = state.inputSampleRate || 48000;
        const targetSampleRate = 16000;
        const ratio = inputSampleRate / targetSampleRate;
        if (ratio === 1) {
            // Already 16k
            return float32Audio;
        }
        // Concatenate leftover from previous call
        let input;
        if (state.leftover && state.leftover.length > 0) {
            input = new Float32Array(state.leftover.length + float32Audio.length);
            input.set(state.leftover, 0);
            input.set(float32Audio, state.leftover.length);
        } else {
            input = float32Audio;
        }

        const outputLength = Math.floor(input.length / ratio);
        const output = new Float32Array(outputLength);
        let inputIndex = 0;
        let outputIndex = 0;
        while (outputIndex < outputLength) {
            const nextInputIndex = Math.floor((outputIndex + 1) * ratio);
            // Average samples between inputIndex and nextInputIndex
            let sum = 0;
            let count = 0;
            for (let i = inputIndex; i < nextInputIndex && i < input.length; i++) {
                sum += input[i];
                count++;
            }
            output[outputIndex] = count > 0 ? (sum / count) : 0;
            outputIndex++;
            inputIndex = nextInputIndex;
        }
        // Save leftover samples that were not consumed
        const consumed = Math.floor(outputLength * ratio);
        const remaining = input.length - consumed;
        if (remaining > 0) {
            state.leftover = input.slice(consumed);
        } else {
            state.leftover = new Float32Array(0);
        }
        return output;
    }

    floatToPCM16(float32Array) {
        const buffer = new ArrayBuffer(float32Array.length * 2);
        const view = new DataView(buffer);
        for (let i = 0; i < float32Array.length; i++) {
            let s = Math.max(-1, Math.min(1, float32Array[i]));
            view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
        }
        return buffer;
    }
    
    // Toggle between streaming and traditional recording modes
    toggleStreamingMode() {
        this.streamingMode = !this.streamingMode;
        const mode = this.streamingMode ? 'Streaming' : 'Traditional';
        this.updateStatus(`Recording mode: ${mode}`);
        console.log(`Switched to ${mode} recording mode`);
        return this.streamingMode;
    }
    
    // Day 17: Transcription Methods
    toggleTranscription() {
        this.transcriptionEnabled = !this.transcriptionEnabled;
        
        if (this.transcriptionEnabled) {
            this.transcriptionContainer.style.display = 'block';
            this.startTranscription();
        } else {
            this.transcriptionContainer.style.display = 'none';
            this.stopTranscription();
        }
        
        const status = this.transcriptionEnabled ? 'enabled' : 'disabled';
        console.log(`Transcription ${status}`);
    }
    
    startTranscription() {
        if (!this.currentSessionId) {
            console.error('No session ID available for starting transcription');
            return;
        }
        
        this.wsClient.sendMessage({
            type: 'start_transcription',
            session_id: this.currentSessionId
        });
        
        this.updateTranscriptionStatus('starting', 'Starting transcription...');
        console.log('Started transcription for session:', this.currentSessionId);
    }
    
    stopTranscription() {
        if (!this.currentSessionId) {
            console.error('No session ID available for stopping transcription');
            return;
        }
        
        this.wsClient.sendMessage({
            type: 'stop_transcription',
            session_id: this.currentSessionId
        });
        
        this.updateTranscriptionStatus('stopping', 'Stopping transcription...');
        console.log('Stopped transcription for session:', this.currentSessionId);
    }
    
    updateTranscriptionStatus(status, text) {
        if (!this.transcriptionIndicator || !this.transcriptionStatusText) return;
        
        this.transcriptionIndicator.className = 'transcription-indicator';
        this.transcriptionStatusText.textContent = text;
        
        switch (status) {
            case 'active':
                this.transcriptionIndicator.classList.add('active');
                break;
            case 'error':
                this.transcriptionIndicator.style.color = '#ff4444';
                break;
            default:
                this.transcriptionIndicator.style.color = '#666';
        }
    }
    
    displayPartialTranscript(text) {
        if (!this.partialTranscript) return;
        this.partialTranscript.textContent = text;
    }
    
    displayFinalTranscript(data) {
        if (!this.finalTranscripts) return;
        
        // Remove placeholder if it exists
        const placeholder = this.finalTranscripts.querySelector('.transcript-placeholder');
        if (placeholder) {
            placeholder.remove();
        }
        
        // Clear partial transcript
        if (this.partialTranscript) {
            this.partialTranscript.textContent = '';
        }
        
        // Create transcript item
        const transcriptItem = document.createElement('div');
        transcriptItem.className = 'transcript-item';
        
        const transcriptText = document.createElement('div');
        transcriptText.className = 'transcript-text';
        transcriptText.textContent = data.text;
        
        const transcriptMeta = document.createElement('div');
        transcriptMeta.className = 'transcript-meta';
        
        const timestamp = new Date(data.timestamp).toLocaleTimeString();
        const confidence = typeof data.confidence === 'number' ? 
            (data.confidence * 100).toFixed(1) + '%' : 'N/A';
        
        transcriptMeta.innerHTML = `
            <span class="transcript-time">${timestamp}</span>
            <span class="transcript-confidence">Confidence: ${confidence}</span>
        `;
        
        transcriptItem.appendChild(transcriptText);
        transcriptItem.appendChild(transcriptMeta);
        
        // Add to top of transcripts
        this.finalTranscripts.insertBefore(transcriptItem, this.finalTranscripts.firstChild);
        
        // Limit to 10 transcripts
        const transcripts = this.finalTranscripts.querySelectorAll('.transcript-item');
        if (transcripts.length > 10) {
            transcripts[transcripts.length - 1].remove();
        }
        
        // Scroll to show latest
        transcriptItem.scrollIntoView({ behavior: 'smooth' });
    }

    // Convert container audio blob to PCM16 16k mono ArrayBuffer
    async convertToPCM16(blob) {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
        const arrayBuffer = await blob.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

        // Downmix to mono by averaging channels
        const numChannels = audioBuffer.numberOfChannels;
        const length = audioBuffer.length;
        const mix = new Float32Array(length);
        for (let c = 0; c < numChannels; c++) {
            const channelData = audioBuffer.getChannelData(c);
            for (let i = 0; i < length; i++) {
                mix[i] += channelData[i];
            }
        }
        if (numChannels > 1) {
            for (let i = 0; i < length; i++) {
                mix[i] = mix[i] / numChannels;
            }
        }

        // Convert Float32 [-1,1] to PCM16 little-endian
        const pcmBuffer = new ArrayBuffer(length * 2);
        const view = new DataView(pcmBuffer);
        for (let i = 0; i < length; i++) {
            let s = Math.max(-1, Math.min(1, mix[i]));
            view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
        }

        await audioContext.close();
        return pcmBuffer;
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


