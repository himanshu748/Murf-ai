/**
 * Enhanced Murf AI Conversational Bot - Frontend JavaScript
 * Refactored with Rich Visual Feedback and Advanced Features
 * ========================================================
 */

class EnhancedMurfBot {
    constructor() {
        // Core state management
        this.state = {
            isRecording: false,
            isProcessing: false,
            connectionStatus: 'disconnected',
            currentSessionId: null,
            selectedVoice: null,
            autoPlay: true,
            retryCount: 0,
            maxRetries: 3,
            audioLevel: 0,
            isConnected: false
        };

        // Audio components
        this.audio = {
            mediaRecorder: null,
            audioStream: null,
            audioChunks: [],
            audioContext: null,
            analyser: null,
            recordingTimer: null,
            startTime: null
        };

        // Configuration
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
                chat: (sessionId) => `/agent/chat/${sessionId}`,
                history: (sessionId) => `/agent/history/${sessionId}`,
                clearHistory: (sessionId) => `/agent/history/${sessionId}`,
                voices: '/voices',
                voicePreview: '/voices/preview',
                debug: (sessionId) => `/debug/session/${sessionId}`,
                logs: '/debug/logs',
                health: '/health'
            },
            ui: {
                waveformCanvasId: 'waveform-canvas',
                levelMeterCanvasId: 'level-meter-canvas',
                progressBarId: 'progress-bar',
                debugPanelId: 'debug-panel'
            }
        };

        // Initialize the application
        this.init();
    }

    /**
     * Initialize the enhanced bot application
     */
    async init() {
        try {
            console.log('🚀 Initializing Enhanced Murf AI Bot...');
            
            // Setup DOM and event listeners
            await this.setupDOM();
            
            // Initialize session management
            await this.initializeSession();
            
            // Setup audio visualization
            await this.setupAudioVisualization();
            
            // Load voice options
            await this.loadVoiceOptions();
            
            // Request microphone permission
            await this.requestMicrophonePermission();
            
            // Setup connection monitoring
            this.startConnectionMonitoring();
            
            // Show ready status
            this.updateConnectionStatus('connected');
            this.showStatus('🎤 Enhanced AI Bot ready! Click record to start.', 'success');
            
            console.log('✅ Enhanced Murf AI Bot initialized successfully');
            
        } catch (error) {
            console.error('❌ Failed to initialize Enhanced Murf AI Bot:', error);
            this.showError(`Initialization failed: ${error.message}`, true);
        }
    }

    /**
     * Setup DOM elements and enhanced event listeners
     */
    async setupDOM() {
        // Get all DOM elements
        this.elements = {
            // Core elements
            recordButton: document.getElementById('record-button'),
            statusMessage: document.getElementById('status-message'),
            errorMessage: document.getElementById('error-message'),
            chatHistory: document.getElementById('chat-history'),
            loadingOverlay: document.getElementById('loading-overlay'),
            loadingText: document.getElementById('loading-text'),

            // Enhanced UI elements
            sessionInfo: document.getElementById('session-info'),
            voiceSelector: document.getElementById('voice-selector'),
            connectionIndicator: document.getElementById('connection-indicator'),
            audioLevelMeter: document.getElementById('audio-level-meter'),
            waveformDisplay: document.getElementById('waveform-display'),
            progressBar: document.getElementById('progress-bar'),
            debugPanel: document.getElementById('debug-panel'),
            errorDetails: document.getElementById('error-details'),

            // Controls
            clearHistoryBtn: document.getElementById('clear-history'),
            toggleAudioBtn: document.getElementById('toggle-audio'),
            newSessionBtn: document.getElementById('new-session'),
            debugToggleBtn: document.getElementById('debug-toggle'),
            voicePreviewBtn: document.getElementById('voice-preview'),
            reconnectBtn: document.getElementById('reconnect-btn')
        };

        // Create missing elements if they don't exist
        await this.createMissingUIElements();

        // Setup enhanced event listeners
        this.setupEventListeners();

        // Setup keyboard shortcuts
        this.setupKeyboardShortcuts();

        console.log('✅ Enhanced DOM setup completed');
    }

    /**
     * Create missing UI elements for enhanced features
     */
    async createMissingUIElements() {
        // Create voice selector if it doesn't exist
        if (!this.elements.voiceSelector) {
            const voiceSection = document.createElement('div');
            voiceSection.className = 'voice-section';
            voiceSection.innerHTML = `
                <div class="voice-controls">
                    <label for="voice-selector">AI Voice:</label>
                    <select id="voice-selector" class="voice-dropdown">
                        <option value="">Loading voices...</option>
                    </select>
                    <button id="voice-preview" class="voice-preview-btn" title="Preview selected voice">
                        <i class="fas fa-play"></i>
                    </button>
                </div>
            `;
            
            const agentSection = document.querySelector('.agent-section');
            if (agentSection) {
                agentSection.appendChild(voiceSection);
                this.elements.voiceSelector = document.getElementById('voice-selector');
                this.elements.voicePreviewBtn = document.getElementById('voice-preview');
            }
        }

        // Create audio visualizations if they don't exist
        if (!this.elements.waveformDisplay) {
            const visualSection = document.createElement('div');
            visualSection.className = 'audio-visualizations';
            visualSection.innerHTML = `
                <div class="waveform-container">
                    <canvas id="waveform-display" width="400" height="100"></canvas>
                    <div class="audio-level-container">
                        <div class="level-label">Audio Level:</div>
                        <div id="audio-level-meter" class="level-meter">
                            <div class="level-bar"></div>
                        </div>
                    </div>
                </div>
            `;

            const recordingSection = document.querySelector('.recording-section');
            if (recordingSection) {
                recordingSection.appendChild(visualSection);
                this.elements.waveformDisplay = document.getElementById('waveform-display');
                this.elements.audioLevelMeter = document.getElementById('audio-level-meter');
            }
        }

        // Create connection status indicator
        if (!this.elements.connectionIndicator) {
            const connectionDiv = document.createElement('div');
            connectionDiv.id = 'connection-indicator';
            connectionDiv.className = 'connection-indicator';
            connectionDiv.innerHTML = `
                <span class="connection-dot"></span>
                <span class="connection-text">Connecting...</span>
                <button id="reconnect-btn" class="reconnect-btn" style="display: none;">
                    <i class="fas fa-sync-alt"></i> Reconnect
                </button>
            `;

            const header = document.querySelector('.header-content');
            if (header) {
                header.appendChild(connectionDiv);
                this.elements.connectionIndicator = connectionDiv;
                this.elements.reconnectBtn = document.getElementById('reconnect-btn');
            }
        }

        // Create debug panel
        if (!this.elements.debugPanel) {
            const debugDiv = document.createElement('div');
            debugDiv.id = 'debug-panel';
            debugDiv.className = 'debug-panel';
            debugDiv.style.display = 'none';
            debugDiv.innerHTML = `
                <div class="debug-header">
                    <h3>Debug Information</h3>
                    <button id="debug-close" class="debug-close">×</button>
                </div>
                <div class="debug-content">
                    <div class="debug-section">
                        <h4>Connection Status</h4>
                        <div id="debug-connection"></div>
                    </div>
                    <div class="debug-section">
                        <h4>Session Info</h4>
                        <div id="debug-session"></div>
                    </div>
                    <div class="debug-section">
                        <h4>Recent Errors</h4>
                        <div id="debug-errors"></div>
                    </div>
                    <div class="debug-section">
                        <h4>System Logs</h4>
                        <div id="debug-logs"></div>
                    </div>
                </div>
            `;

            document.body.appendChild(debugDiv);
            this.elements.debugPanel = debugDiv;
        }

        // Create enhanced error display
        if (!this.elements.errorDetails && this.elements.errorMessage) {
            const errorDetails = document.createElement('div');
            errorDetails.id = 'error-details';
            errorDetails.className = 'error-details';
            errorDetails.style.display = 'none';
            this.elements.errorMessage.parentNode.appendChild(errorDetails);
            this.elements.errorDetails = errorDetails;
        }
    }

    /**
     * Setup enhanced event listeners
     */
    setupEventListeners() {
        // Core functionality
        this.elements.recordButton?.addEventListener('click', () => this.toggleRecording());
        this.elements.clearHistoryBtn?.addEventListener('click', () => this.clearHistory());
        this.elements.toggleAudioBtn?.addEventListener('click', () => this.toggleAutoPlay());
        this.elements.newSessionBtn?.addEventListener('click', () => this.startNewSession());

        // Enhanced features
        this.elements.voiceSelector?.addEventListener('change', (e) => this.selectVoice(e.target.value));
        this.elements.voicePreviewBtn?.addEventListener('click', () => this.previewVoice());
        this.elements.reconnectBtn?.addEventListener('click', () => this.reconnect());

        // Debug functionality
        const debugToggle = document.getElementById('debug-toggle') || this.createDebugToggle();
        debugToggle?.addEventListener('click', () => this.toggleDebugPanel());
        
        const debugClose = document.getElementById('debug-close');
        debugClose?.addEventListener('click', () => this.hideDebugPanel());

        // Window events
        window.addEventListener('beforeunload', () => this.cleanup());
        window.addEventListener('focus', () => this.onWindowFocus());
        window.addEventListener('online', () => this.onConnectionChange(true));
        window.addEventListener('offline', () => this.onConnectionChange(false));

        console.log('✅ Enhanced event listeners setup completed');
    }

    /**
     * Create debug toggle button if it doesn't exist
     */
    createDebugToggle() {
        const debugBtn = document.createElement('button');
        debugBtn.id = 'debug-toggle';
        debugBtn.className = 'control-button';
        debugBtn.innerHTML = '<i class="fas fa-bug"></i> Debug';
        debugBtn.title = 'Show debug information';
        
        const chatControls = document.querySelector('.chat-controls');
        if (chatControls) {
            chatControls.appendChild(debugBtn);
        }
        
        return debugBtn;
    }

    /**
     * Setup keyboard shortcuts with enhanced functionality
     */
    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Don't trigger shortcuts when typing in input fields
            if (e.target.matches('input, textarea, select')) return;

            switch (e.code) {
                case 'Space':
                    e.preventDefault();
                    this.toggleRecording();
                    break;
                case 'Escape':
                    if (this.state.isRecording) {
                        e.preventDefault();
                        this.stopRecording();
                    } else if (this.elements.debugPanel.style.display === 'block') {
                        this.hideDebugPanel();
                    }
                    break;
                case 'KeyD':
                    if (e.ctrlKey || e.metaKey) {
                        e.preventDefault();
                        this.toggleDebugPanel();
                    }
                    break;
                case 'KeyR':
                    if ((e.ctrlKey || e.metaKey) && e.shiftKey) {
                        e.preventDefault();
                        this.reconnect();
                    }
                    break;
            }
        });

        console.log('✅ Enhanced keyboard shortcuts setup completed');
    }

    // [Continue in next part due to length...]
    
    /**
     * Initialize session management with persistence
     */
    async initializeSession() {
        try {
            // Try to restore session from localStorage first
            const savedSessionId = localStorage.getItem('murf_session_id');
            const savedSessionData = localStorage.getItem('murf_session_data');

            if (savedSessionId && savedSessionData) {
                try {
                    const sessionData = JSON.parse(savedSessionData);
                    const sessionAge = Date.now() - sessionData.timestamp;
                    
                    // Use saved session if it's less than 24 hours old
                    if (sessionAge < 24 * 60 * 60 * 1000) {
                        this.state.currentSessionId = savedSessionId;
                        this.showStatus(`Restored session: ${savedSessionId.substring(0, 8)}`, 'info');
                        console.log('✅ Restored session from localStorage');
                        return;
                    }
                } catch (e) {
                    console.warn('Failed to parse saved session data:', e);
                }
            }

            // Create new session
            this.state.currentSessionId = this.generateSessionId();
            this.saveSessionToStorage();
            
            // Update endpoints with new session
            this.updateEndpoints();
            
            this.showStatus(`New session created: ${this.state.currentSessionId.substring(0, 8)}`, 'info');
            console.log('✅ New session initialized');
            
        } catch (error) {
            console.error('Failed to initialize session:', error);
            throw error;
        }
    }

    /**
     * Generate a unique session ID
     */
    generateSessionId() {
        return 'session_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 9);
    }

    /**
     * Save session data to localStorage
     */
    saveSessionToStorage() {
        try {
            localStorage.setItem('murf_session_id', this.state.currentSessionId);
            localStorage.setItem('murf_session_data', JSON.stringify({
                timestamp: Date.now(),
                selectedVoice: this.state.selectedVoice,
                autoPlay: this.state.autoPlay
            }));
        } catch (error) {
            console.warn('Failed to save session to localStorage:', error);
        }
    }

    /**
     * Update API endpoints with current session
     */
    updateEndpoints() {
        this.endpoints = {
            chat: this.config.endpoints.chat(this.state.currentSessionId),
            history: this.config.endpoints.history(this.state.currentSessionId),
            clearHistory: this.config.endpoints.clearHistory(this.state.currentSessionId),
            debug: this.config.endpoints.debug(this.state.currentSessionId)
        };
    }

    /**
     * Setup audio visualization components
     */
    async setupAudioVisualization() {
        try {
            // Setup Web Audio API for visualization
            this.audio.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            console.log('✅ Audio visualization setup completed');
        } catch (error) {
            console.warn('Audio visualization not available:', error);
        }
    }

    /**
     * Load available voice options
     */
    async loadVoiceOptions() {
        try {
            const response = await fetch(this.config.endpoints.voices);
            const result = await response.json();
            
            if (result.success && result.voices) {
                this.populateVoiceSelector(result.voices);
                this.state.selectedVoice = result.default_voice;
            } else {
                console.warn('Failed to load voices, using default options');
                this.createDefaultVoiceOptions();
            }
        } catch (error) {
            console.error('Failed to load voice options:', error);
            this.createDefaultVoiceOptions();
        }
    }

    /**
     * Populate voice selector with available options
     */
    populateVoiceSelector(voices) {
        const selector = this.elements.voiceSelector;
        if (!selector) return;

        selector.innerHTML = '';
        
        voices.forEach(voice => {
            const option = document.createElement('option');
            option.value = voice.id;
            option.textContent = `${voice.name} (${voice.language}) - ${voice.style || voice.description || ''}`;
            selector.appendChild(option);
        });

        console.log(`✅ Loaded ${voices.length} voice options`);
    }

    /**
     * Create default voice options as fallback
     */
    createDefaultVoiceOptions() {
        const defaultVoices = [
            { id: 'en-US-aileen', name: 'Aileen', language: 'en-US', style: 'friendly' },
            { id: 'en-US-adrian', name: 'Adrian', language: 'en-US', style: 'professional' },
            { id: 'en-US-davis', name: 'Davis', language: 'en-US', style: 'casual' }
        ];
        
        this.populateVoiceSelector(defaultVoices);
        this.state.selectedVoice = defaultVoices[0].id;
    }

    /**
     * Request microphone permission with enhanced error handling
     */
    async requestMicrophonePermission() {
        try {
            this.showStatus('Requesting microphone permission...', 'info');
            
            this.audio.audioStream = await navigator.mediaDevices.getUserMedia(this.config.audioConstraints);
            
            // Setup audio analysis for level meter
            if (this.audio.audioContext && this.audio.audioStream) {
                const source = this.audio.audioContext.createMediaStreamSource(this.audio.audioStream);
                this.audio.analyser = this.audio.audioContext.createAnalyser();
                this.audio.analyser.fftSize = 256;
                source.connect(this.audio.analyser);
                
                this.startAudioLevelMonitoring();
            }
            
            // Enable record button
            if (this.elements.recordButton) {
                this.elements.recordButton.disabled = false;
            }
            
            this.showStatus('Microphone ready! You can start talking.', 'success');
            console.log('✅ Microphone permission granted');
            
        } catch (error) {
            console.error('Microphone permission failed:', error);
            
            let errorMessage = 'Microphone access required. ';
            if (error.name === 'NotAllowedError') {
                errorMessage += 'Please allow microphone access and refresh the page.';
            } else if (error.name === 'NotFoundError') {
                errorMessage += 'No microphone found. Please connect a microphone.';
            } else {
                errorMessage += 'Please check your microphone settings.';
            }
            
            this.showError(errorMessage, true);
            throw error;
        }
    }

    /**
     * Start monitoring audio levels for visualization
     */
    startAudioLevelMonitoring() {
        if (!this.audio.analyser) return;
        
        const bufferLength = this.audio.analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        
        const updateLevel = () => {
            if (!this.audio.analyser) return;
            
            this.audio.analyser.getByteFrequencyData(dataArray);
            
            // Calculate average audio level
            let sum = 0;
            for (let i = 0; i < bufferLength; i++) {
                sum += dataArray[i];
            }
            const average = sum / bufferLength;
            this.state.audioLevel = average / 255; // Normalize to 0-1
            
            // Update level meter
            this.updateAudioLevelMeter(this.state.audioLevel);
            
            // Update waveform if recording
            if (this.state.isRecording) {
                this.updateWaveform(dataArray);
            }
            
            requestAnimationFrame(updateLevel);
        };
        
        updateLevel();
    }

    /**
     * Update audio level meter display
     */
    updateAudioLevelMeter(level) {
        const levelBar = this.elements.audioLevelMeter?.querySelector('.level-bar');
        if (levelBar) {
            levelBar.style.width = `${level * 100}%`;
        }
    }

    /**
     * Update waveform visualization
     */
    updateWaveform(dataArray) {
        const canvas = this.elements.waveformDisplay;
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        
        // Clear canvas
        ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
        ctx.fillRect(0, 0, width, height);
        
        // Draw waveform
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#d4af37'; // Royal gold
        ctx.beginPath();
        
        const sliceWidth = width / dataArray.length;
        let x = 0;
        
        for (let i = 0; i < dataArray.length; i++) {
            const v = dataArray[i] / 128.0;
            const y = (v * height) / 2;
            
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
            
            x += sliceWidth;
        }
        
        ctx.stroke();
    }

    /**
     * Start connection monitoring
     */
    startConnectionMonitoring() {
        // Check connection every 30 seconds
        setInterval(() => {
            this.checkConnection();
        }, 30000);
        
        // Initial connection check
        this.checkConnection();
    }

    /**
     * Check server connection
     */
    async checkConnection() {
        try {
            const response = await fetch(this.config.endpoints.health, {
                method: 'GET',
                timeout: 5000
            });
            
            if (response.ok) {
                this.updateConnectionStatus('connected');
                this.state.isConnected = true;
            } else {
                throw new Error(`Server responded with ${response.status}`);
            }
        } catch (error) {
            console.warn('Connection check failed:', error);
            this.updateConnectionStatus('disconnected');
            this.state.isConnected = false;
        }
    }

    /**
     * Update connection status display
     */
    updateConnectionStatus(status) {
        this.state.connectionStatus = status;
        
        const indicator = this.elements.connectionIndicator;
        const dot = indicator?.querySelector('.connection-dot');
        const text = indicator?.querySelector('.connection-text');
        const reconnectBtn = this.elements.reconnectBtn;
        
        if (!dot || !text) return;
        
        // Remove all status classes
        dot.classList.remove('connected', 'connecting', 'disconnected');
        
        switch (status) {
            case 'connected':
                dot.classList.add('connected');
                text.textContent = 'Connected';
                if (reconnectBtn) reconnectBtn.style.display = 'none';
                break;
            case 'connecting':
                dot.classList.add('connecting');
                text.textContent = 'Connecting...';
                if (reconnectBtn) reconnectBtn.style.display = 'none';
                break;
            case 'disconnected':
                dot.classList.add('disconnected');
                text.textContent = 'Disconnected';
                if (reconnectBtn) reconnectBtn.style.display = 'inline-block';
                break;
        }
    }

    /**
     * Toggle recording with enhanced state management
     */
    async toggleRecording() {
        if (this.state.isRecording) {
            await this.stopRecording();
        } else {
            await this.startRecording();
        }
    }

    /**
     * Start recording with enhanced feedback
     */
    async startRecording() {
        try {
            if (!this.state.isConnected) {
                this.showError('Cannot record: not connected to server. Please try reconnecting.', false);
                return;
            }
            
            this.state.isRecording = true;
            this.audio.audioChunks = [];
            this.audio.startTime = Date.now();
            
            // Create media recorder
            this.audio.mediaRecorder = new MediaRecorder(this.audio.audioStream, {
                mimeType: 'audio/webm;codecs=opus'
            });
            
            // Setup event handlers
            this.audio.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.audio.audioChunks.push(event.data);
                }
            };
            
            this.audio.mediaRecorder.onstop = () => this.processRecording();
            
            // Start recording
            this.audio.mediaRecorder.start();
            
            // Update UI
            this.updateRecordingButton('recording');
            this.startRecordingTimer();
            this.showStatus('🎙️ Listening... speak now!', 'success');
            
            console.log('🎙️ Recording started');
            
        } catch (error) {
            console.error('Failed to start recording:', error);
            this.showError(`Failed to start recording: ${error.message}`, true);
            this.state.isRecording = false;
        }
    }

    /**
     * Stop recording
     */
    async stopRecording() {
        if (!this.audio.mediaRecorder || !this.state.isRecording) return;
        
        try {
            this.state.isRecording = false;
            this.state.isProcessing = true;
            
            // Stop media recorder
            this.audio.mediaRecorder.stop();
            
            // Update UI
            this.updateRecordingButton('processing');
            this.stopRecordingTimer();
            this.showStatus('Processing your message...', 'info');
            
            console.log('⏹️ Recording stopped');
            
        } catch (error) {
            console.error('Failed to stop recording:', error);
            this.showError(`Failed to stop recording: ${error.message}`, true);
        }
    }

    // Additional methods to be implemented...
    
    selectVoice(voiceId) {
        this.state.selectedVoice = voiceId;
        this.saveSessionToStorage();
        console.log(`Selected voice: ${voiceId}`);
    }
    
    async previewVoice() {
        // Implementation for voice preview
        console.log('Voice preview not yet implemented');
    }
    
    toggleDebugPanel() {
        const panel = this.elements.debugPanel;
        if (panel) {
            panel.style.display = panel.style.display === 'block' ? 'none' : 'block';
        }
    }
    
    hideDebugPanel() {
        const panel = this.elements.debugPanel;
        if (panel) {
            panel.style.display = 'none';
        }
    }
    
    showStatus(message, type = 'info') {
        const statusElement = this.elements.statusMessage?.querySelector('span');
        if (statusElement) {
            statusElement.textContent = message;
            // Add type class for styling
            const parent = this.elements.statusMessage;
            parent.className = `status-text ${type}`;
        }
        console.log(`Status [${type}]: ${message}`);
    }
    
    showError(message, detailed = false) {
        const errorElement = this.elements.errorMessage;
        if (errorElement) {
            errorElement.textContent = message;
            errorElement.style.display = 'block';
            
            // Auto-hide after 10 seconds
            setTimeout(() => {
                errorElement.style.display = 'none';
            }, 10000);
        }
        console.error(`Error: ${message}`);
    }
    
    updateRecordingButton(state) {
        const button = this.elements.recordButton;
        if (!button) return;
        
        // Remove all state classes
        button.classList.remove('recording', 'processing', 'listening');
        
        const icon = button.querySelector('i');
        const text = button.querySelector('.button-text');
        
        switch (state) {
            case 'recording':
                button.classList.add('recording');
                if (icon) icon.className = 'fas fa-stop';
                if (text) text.textContent = 'Stop Recording';
                break;
            case 'processing':
                button.classList.add('processing');
                if (icon) icon.className = 'fas fa-cog fa-spin';
                if (text) text.textContent = 'Processing...';
                button.disabled = true;
                break;
            default:
                if (icon) icon.className = 'fas fa-microphone';
                if (text) text.textContent = 'Click to Start';
                button.disabled = false;
                break;
        }
    }
    
    startRecordingTimer() {
        const timerElement = document.getElementById('recording-timer');
        if (timerElement) {
            timerElement.style.display = 'block';
            
            this.audio.recordingTimer = setInterval(() => {
                const elapsed = Date.now() - this.audio.startTime;
                const seconds = Math.floor(elapsed / 1000);
                const minutes = Math.floor(seconds / 60);
                const displaySeconds = seconds % 60;
                
                timerElement.textContent = 
                    `${minutes.toString().padStart(2, '0')}:${displaySeconds.toString().padStart(2, '0')}`;
            }, 1000);
        }
    }
    
    stopRecordingTimer() {
        if (this.audio.recordingTimer) {
            clearInterval(this.audio.recordingTimer);
            this.audio.recordingTimer = null;
        }
        
        const timerElement = document.getElementById('recording-timer');
        if (timerElement) {
            timerElement.style.display = 'none';
        }
    }
    
    async processRecording() {
        // Implementation similar to original but enhanced
        console.log('Processing recording...');
        this.state.isProcessing = false;
        this.updateRecordingButton('ready');
    }
    
    onConnectionChange(isOnline) {
        if (isOnline) {
            this.checkConnection();
        } else {
            this.updateConnectionStatus('disconnected');
        }
    }
    
    onWindowFocus() {
        // Refresh connection status when window gains focus
        this.checkConnection();
    }
    
    async reconnect() {
        this.updateConnectionStatus('connecting');
        await this.checkConnection();
    }
    
    async clearHistory() {
        console.log('Clear history not yet fully implemented');
    }
    
    toggleAutoPlay() {
        this.state.autoPlay = !this.state.autoPlay;
        console.log(`Auto-play ${this.state.autoPlay ? 'enabled' : 'disabled'}`);
    }
    
    startNewSession() {
        // Clear current session and create new one
        localStorage.removeItem('murf_session_id');
        localStorage.removeItem('murf_session_data');
        location.reload();
    }
    
    cleanup() {
        // Clean up resources
        if (this.audio.mediaRecorder && this.state.isRecording) {
            this.audio.mediaRecorder.stop();
        }
        
        if (this.audio.audioStream) {
            this.audio.audioStream.getTracks().forEach(track => track.stop());
        }
        
        if (this.audio.recordingTimer) {
            clearInterval(this.audio.recordingTimer);
        }
        
        console.log('🧹 Enhanced bot cleanup completed');
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Replace the old bot with enhanced version
    if (window.murfBot) {
        window.murfBot.cleanup();
    }
    
    window.enhancedMurfBot = new EnhancedMurfBot();
    
    // Keep reference to old bot for compatibility
    window.murfBot = window.enhancedMurfBot;
});

// Export for potential external use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = EnhancedMurfBot;
}
