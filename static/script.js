// Murf AI Conversational Bot - Frontend JavaScript
// Days 10-14 Implementation with Royal Black Theme
// ===============================================

class MurfConversationalBot {
    constructor() {
        // Core properties
        this.isRecording = false;
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.audioStream = null;
        this.recordingTimer = null;
        this.recordingStartTime = null;
        this.autoPlay = true;
        this.sessionId = this.getSessionId();
        
        // Audio constraints
        this.audioConstraints = {
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                sampleRate: 44100
            }
        };
        
        // API endpoints
        this.endpoints = {
            chat: `/agent/chat/${this.sessionId}`,
            history: `/agent/history/${this.sessionId}`,
            clearHistory: `/agent/history/${this.sessionId}`
        };
        
        // Initialize the app
        this.init();
    }

    // Initialize the application
    async init() {
        try {
            await this.setupDOM();
            await this.requestMicrophonePermission();
            this.displaySessionId();
            this.updateStatus('Ready to chat! Click the microphone to start.');
            console.log('🎤 Murf AI Conversational Bot initialized successfully');
        } catch (error) {
            console.error('❌ Failed to initialize app:', error);
            this.showError('Failed to initialize. Please refresh the page.');
        }
    }

    // Set up DOM elements and event listeners
    async setupDOM() {
        // Get DOM elements
        this.elements = {
            recordButton: document.getElementById('record-button'),
            statusMessage: document.getElementById('status-message'),
            errorMessage: document.getElementById('error-message'),
            recordingStatus: document.getElementById('recording-status'),
            recordingTimer: document.getElementById('recording-timer'),
            audioSection: document.getElementById('audio-section'),
            audioPlayer: document.getElementById('audio-player'),
            chatHistory: document.getElementById('chat-history'),
            sessionId: document.getElementById('session-id'),
            loadingOverlay: document.getElementById('loading-overlay'),
            loadingText: document.getElementById('loading-text'),
            clearHistoryBtn: document.getElementById('clear-history'),
            toggleAudioBtn: document.getElementById('toggle-audio'),
            newSessionBtn: document.getElementById('new-session')
        };

        // Set up event listeners
        this.elements.recordButton.addEventListener('click', () => this.toggleRecording());
        this.elements.clearHistoryBtn.addEventListener('click', () => this.clearHistory());
        this.elements.toggleAudioBtn.addEventListener('click', () => this.toggleAutoPlay());
        this.elements.newSessionBtn.addEventListener('click', () => this.startNewSession());
        
        // Audio player event listeners
        this.elements.audioPlayer.addEventListener('ended', () => this.onAudioEnded());
        this.elements.audioPlayer.addEventListener('error', (e) => this.onAudioError(e));
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.handleKeyboardShortcuts(e));
        
        // Window events
        window.addEventListener('beforeunload', () => this.cleanup());
        window.addEventListener('focus', () => this.onWindowFocus());
    }

    // Request microphone permission
    async requestMicrophonePermission() {
        try {
            this.audioStream = await navigator.mediaDevices.getUserMedia(this.audioConstraints);
            this.elements.recordButton.disabled = false;
            this.updateRecordingStatus('Ready', 'ready');
        } catch (error) {
            console.error('❌ Microphone permission denied:', error);
            this.showError('Microphone access required. Please grant permission and refresh.');
            throw error;
        }
    }

    // Get or create session ID
    getSessionId() {
        const urlParams = new URLSearchParams(window.location.search);
        let sessionId = urlParams.get('session');
        
        if (!sessionId) {
            sessionId = this.generateUUID();
            const newUrl = `${window.location.pathname}?session=${sessionId}`;
            window.history.replaceState({}, '', newUrl);
        }
        
        return sessionId;
    }

    // Generate UUID for session
    generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    // Display session ID in UI
    displaySessionId() {
        const shortId = this.sessionId.substring(0, 8);
        this.elements.sessionId.textContent = shortId;
    }

    // Toggle recording state
    async toggleRecording() {
        if (this.isRecording) {
            await this.stopRecording();
        } else {
            await this.startRecording();
        }
    }

    // Start recording
    async startRecording() {
        try {
            this.showLoading('Listening...');
            
            // Reset audio chunks
            this.audioChunks = [];
            
            // Create media recorder
            this.mediaRecorder = new MediaRecorder(this.audioStream, {
                mimeType: 'audio/webm;codecs=opus'
            });
            
            // Set up event handlers
            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                }
            };
            
            this.mediaRecorder.onstop = () => this.processRecording();
            
            // Start recording
            this.mediaRecorder.start();
            this.isRecording = true;
            this.recordingStartTime = Date.now();
            
            // Update UI
            this.updateRecordingButton();
            this.startRecordingTimer();
            this.updateRecordingStatus('Recording', 'recording');
            this.hideLoading();
            
            console.log('🎙️ Recording started');
            
        } catch (error) {
            console.error('❌ Failed to start recording:', error);
            this.showError('Failed to start recording. Please try again.');
            this.hideLoading();
        }
    }

    // Stop recording
    async stopRecording() {
        if (!this.mediaRecorder || !this.isRecording) return;
        
        try {
            this.showLoading('Processing your message...');
            
            // Stop media recorder
            this.mediaRecorder.stop();
            this.isRecording = false;
            
            // Update UI
            this.updateRecordingButton();
            this.stopRecordingTimer();
            this.updateRecordingStatus('Processing', 'processing');
            
            console.log('⏹️ Recording stopped');
            
        } catch (error) {
            console.error('❌ Failed to stop recording:', error);
            this.showError('Failed to stop recording. Please try again.');
            this.hideLoading();
        }
    }

    // Process recorded audio
    async processRecording() {
        try {
            // Create audio blob
            const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
            
            if (audioBlob.size === 0) {
                throw new Error('No audio data recorded');
            }
            
            // Add user message to chat
            this.addMessageToChat('user', 'Audio message sent', true);
            
            // Send to server
            await this.sendAudioToServer(audioBlob);
            
        } catch (error) {
            console.error('❌ Failed to process recording:', error);
            this.showError('Failed to process your message. Please try again.');
            this.hideLoading();
            this.updateRecordingStatus('Ready', 'ready');
        }
    }

    // Send audio to server
    async sendAudioToServer(audioBlob) {
        try {
            this.updateLoadingText('Transcribing and thinking...');
            
            // Create form data
            const formData = new FormData();
            formData.append('audio', audioBlob, 'recording.webm');
            
            // Send request
            const response = await fetch(this.endpoints.chat, {
                method: 'POST',
                body: formData
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const result = await response.json();
            
            if (result.error) {
                throw new Error(result.error);
            }
            
            // Handle successful response
            await this.handleServerResponse(result);
            
        } catch (error) {
            console.error('❌ Server request failed:', error);
            await this.handleServerError(error);
        }
    }

    // Handle successful server response
    async handleServerResponse(result) {
        try {
            this.updateLoadingText('Generating voice response...');
            
            // Add AI response to chat
            if (result.transcript) {
                // Update the user message with actual transcript
                this.updateLastUserMessage(result.transcript);
            }
            
            if (result.response) {
                this.addMessageToChat('ai', result.response, false);
            }
            
            // Play audio response
            if (result.audio_url) {
                await this.playAudioResponse(result.audio_url);
            }
            
            this.hideLoading();
            this.updateRecordingStatus('Ready', 'ready');
            
            // Auto-start next recording if enabled
            if (this.autoPlay) {
                setTimeout(() => {
                    if (!this.isRecording) {
                        this.startRecording();
                    }
                }, 1000);
            }
            
        } catch (error) {
            console.error('❌ Failed to handle response:', error);
            this.showError('Received response but failed to process it.');
            this.hideLoading();
        }
    }

    // Handle server errors with fallback
    async handleServerError(error) {
        console.error('❌ Server error:', error);
        
        // Play fallback audio message
        const fallbackMessage = "I'm having trouble connecting right now. Please try again.";
        this.addMessageToChat('ai', fallbackMessage, false);
        
        // Try to generate fallback TTS (if available) or show text
        try {
            await this.playFallbackResponse(fallbackMessage);
        } catch (ttsError) {
            console.error('❌ Fallback TTS failed:', ttsError);
        }
        
        this.hideLoading();
        this.updateRecordingStatus('Ready', 'ready');
        this.showError(`Connection failed: ${error.message}`);
    }

    // Play audio response (Day 12: Hidden auto-playing audio)
    async playAudioResponse(audioUrl) {
        try {
            this.elements.audioPlayer.src = audioUrl;
            
            // Day 12 requirement: Hidden audio player with auto-play
            this.elements.audioSection.style.display = 'none';
            
            // Always auto-play for Day 12 conversational agent
            await this.elements.audioPlayer.play();
            
            console.log('🔊 Playing audio response (hidden player)');
            
        } catch (error) {
            console.error('❌ Failed to play audio:', error);
            this.showError('Failed to play audio response.');
        }
    }

    // Play fallback response using Web Speech API
    async playFallbackResponse(message) {
        if ('speechSynthesis' in window) {
            const utterance = new SpeechSynthesisUtterance(message);
            utterance.rate = 0.8;
            utterance.pitch = 1;
            utterance.volume = 0.8;
            
            // Try to use a pleasant voice
            const voices = speechSynthesis.getVoices();
            const preferredVoice = voices.find(voice => 
                voice.name.includes('Female') || voice.name.includes('Samantha')
            );
            if (preferredVoice) {
                utterance.voice = preferredVoice;
            }
            
            speechSynthesis.speak(utterance);
        }
    }

    // Add message to chat history
    addMessageToChat(sender, content, isAudio = false) {
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message-bubble ' + (sender === 'ai' ? 'ai-message' : 'user-message');
        
        const avatar = document.createElement('div');
        avatar.className = 'message-avatar';
        avatar.innerHTML = sender === 'ai' ? '<i class="fas fa-robot"></i>' : '<i class="fas fa-user"></i>';
        
        const messageContent = document.createElement('div');
        messageContent.className = 'message-content';
        
        const paragraph = document.createElement('p');
        paragraph.textContent = content;
        messageContent.appendChild(paragraph);
        
        if (isAudio && sender === 'user') {
            messageContent.setAttribute('data-is-audio', 'true');
        }
        
        messageDiv.appendChild(avatar);
        messageDiv.appendChild(messageContent);
        
        // Remove welcome message if it exists
        const welcomeMessage = this.elements.chatHistory.querySelector('.welcome-message');
        if (welcomeMessage) {
            welcomeMessage.remove();
        }
        
        this.elements.chatHistory.appendChild(messageDiv);
        this.elements.chatHistory.scrollTop = this.elements.chatHistory.scrollHeight;
        
        console.log(`💬 Added ${sender} message:`, content);
    }

    // Update last user message with transcript
    updateLastUserMessage(transcript) {
        const userMessages = this.elements.chatHistory.querySelectorAll('.user-message');
        if (userMessages.length > 0) {
            const lastMessage = userMessages[userMessages.length - 1];
            const content = lastMessage.querySelector('.message-content p');
            if (content && lastMessage.querySelector('.message-content[data-is-audio="true"]')) {
                content.textContent = transcript;
            }
        }
    }

    // Update recording button state
    updateRecordingButton() {
        const button = this.elements.recordButton;
        const buttonText = button.querySelector('.button-text');
        const icon = button.querySelector('i');
        
        if (this.isRecording) {
            button.classList.add('recording');
            buttonText.textContent = 'Stop Recording';
            icon.className = 'fas fa-stop';
        } else {
            button.classList.remove('recording');
            buttonText.textContent = 'Click to Start';
            icon.className = 'fas fa-microphone';
        }
    }

    // Start recording timer
    startRecordingTimer() {
        this.elements.recordingTimer.style.display = 'block';
        
        this.recordingTimer = setInterval(() => {
            const elapsed = Date.now() - this.recordingStartTime;
            const seconds = Math.floor(elapsed / 1000);
            const minutes = Math.floor(seconds / 60);
            const displaySeconds = seconds % 60;
            
            this.elements.recordingTimer.textContent = 
                `${minutes.toString().padStart(2, '0')}:${displaySeconds.toString().padStart(2, '0')}`;
        }, 1000);
    }

    // Stop recording timer
    stopRecordingTimer() {
        if (this.recordingTimer) {
            clearInterval(this.recordingTimer);
            this.recordingTimer = null;
        }
        this.elements.recordingTimer.style.display = 'none';
    }

    // Update recording status
    updateRecordingStatus(label, state) {
        const statusLabel = this.elements.recordingStatus.querySelector('.status-label');
        const statusDot = this.elements.recordingStatus.querySelector('.status-dot');
        
        statusLabel.textContent = label;
        
        // Remove all state classes
        statusDot.classList.remove('ready', 'recording', 'processing');
        statusDot.classList.add(state);
    }

    // Update status message
    updateStatus(message, showSpinner = false) {
        const spinner = this.elements.statusMessage.querySelector('.fa-spin');
        const textSpan = this.elements.statusMessage.querySelector('span');
        
        textSpan.textContent = message;
        spinner.style.display = showSpinner ? 'inline' : 'none';
        
        // Hide error message
        this.elements.errorMessage.style.display = 'none';
    }

    // Show error message
    showError(message) {
        this.elements.errorMessage.textContent = message;
        this.elements.errorMessage.style.display = 'block';
        
        // Auto-hide after 10 seconds
        setTimeout(() => {
            this.elements.errorMessage.style.display = 'none';
        }, 10000);
    }

    // Show loading overlay
    showLoading(message) {
        this.updateLoadingText(message);
        this.elements.loadingOverlay.style.display = 'flex';
    }

    // Hide loading overlay
    hideLoading() {
        this.elements.loadingOverlay.style.display = 'none';
    }

    // Update loading text
    updateLoadingText(message) {
        this.elements.loadingText.textContent = message;
    }

    // Clear chat history
    async clearHistory() {
        try {
            const response = await fetch(this.endpoints.clearHistory, {
                method: 'DELETE'
            });
            
            if (response.ok) {
                // Clear UI
                this.elements.chatHistory.innerHTML = `
                    <div class="welcome-message">
                        <div class="message-bubble ai-message">
                            <div class="message-avatar">
                                <i class="fas fa-robot"></i>
                            </div>
                            <div class="message-content">
                                <p>Chat history cleared! How can I help you today?</p>
                            </div>
                        </div>
                    </div>
                `;
                
                this.updateStatus('Chat history cleared. Ready for new conversation!');
                console.log('🗑️ Chat history cleared');
            } else {
                throw new Error('Failed to clear history');
            }
        } catch (error) {
            console.error('❌ Failed to clear history:', error);
            this.showError('Failed to clear chat history.');
        }
    }

    // Toggle auto-play
    toggleAutoPlay() {
        this.autoPlay = !this.autoPlay;
        
        const button = this.elements.toggleAudioBtn;
        const icon = button.querySelector('i');
        const text = button.childNodes[button.childNodes.length - 1];
        
        if (this.autoPlay) {
            icon.className = 'fas fa-volume-up';
            text.textContent = ' Auto-play: On';
        } else {
            icon.className = 'fas fa-volume-mute';
            text.textContent = ' Auto-play: Off';
        }
        
        console.log(`🔊 Auto-play ${this.autoPlay ? 'enabled' : 'disabled'}`);
    }

    // Start new session
    startNewSession() {
        const newSessionId = this.generateUUID();
        const newUrl = `${window.location.pathname}?session=${newSessionId}`;
        window.location.href = newUrl;
    }

    // Handle audio ended event
    onAudioEnded() {
        console.log('🔊 Audio playback completed');
        
        // Auto-start recording if enabled and not already recording
        if (this.autoPlay && !this.isRecording) {
            setTimeout(() => {
                this.startRecording();
            }, 1000);
        }
    }

    // Handle audio error
    onAudioError(event) {
        console.error('❌ Audio playback error:', event);
        this.showError('Failed to play audio response.');
    }

    // Handle keyboard shortcuts
    handleKeyboardShortcuts(event) {
        // Space bar to toggle recording
        if (event.code === 'Space' && !event.target.matches('input, textarea')) {
            event.preventDefault();
            this.toggleRecording();
        }
        
        // Escape to stop recording
        if (event.code === 'Escape' && this.isRecording) {
            event.preventDefault();
            this.stopRecording();
        }
    }

    // Handle window focus
    onWindowFocus() {
        // Refresh session display
        this.displaySessionId();
    }

    // Cleanup resources
    cleanup() {
        if (this.mediaRecorder && this.isRecording) {
            this.mediaRecorder.stop();
        }
        
        if (this.audioStream) {
            this.audioStream.getTracks().forEach(track => track.stop());
        }
        
        if (this.recordingTimer) {
            clearInterval(this.recordingTimer);
        }
        
        console.log('🧹 Cleanup completed');
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.murfBot = new MurfConversationalBot();
});

// Add CSS for dynamic status states
const style = document.createElement('style');
style.textContent = `
    .status-dot.ready {
        background: var(--accent-green);
    }
    
    .status-dot.recording {
        background: var(--accent-red);
        animation: status-pulse 1s infinite;
    }
    
    .status-dot.processing {
        background: var(--royal-gold);
        animation: status-pulse 0.5s infinite;
    }
`;
document.head.appendChild(style);

// Export for potential external use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MurfConversationalBot;
}
