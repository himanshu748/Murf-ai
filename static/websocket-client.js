/**
 * WebSocket Client for Murf AI Voice Agent - Day 15
 * Handles real-time communication with the FastAPI backend
 */

class WebSocketClient {
    constructor() {
        this.ws = null;
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000;
        this.currentSessionId = null;
        this.messageQueue = [];
        this.eventListeners = new Map();
        
        this.connectionStatus = document.getElementById('connectionStatus');
        this.statusText = this.connectionStatus.querySelector('.status-text');
        this.debugLogs = document.getElementById('debugLogs');
        
        this.init();
    }
    
    init() {
        this.connect();
        this.setupEventListeners();
    }
    
    connect() {
        try {
            // Use wss:// for HTTPS, ws:// for HTTP
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${protocol}//${window.location.host}/ws`;
            
            this.log('info', `Connecting to WebSocket: ${wsUrl}`);
            this.updateConnectionStatus('connecting');
            
            this.ws = new WebSocket(wsUrl);
            this.setupWebSocketHandlers();
            
        } catch (error) {
            this.log('error', `Failed to create WebSocket connection: ${error.message}`);
            this.handleConnectionError();
        }
    }
    
    setupWebSocketHandlers() {
        this.ws.onopen = (event) => {
            this.log('success', 'WebSocket connection established');
            this.isConnected = true;
            this.reconnectAttempts = 0;
            this.updateConnectionStatus('connected');
            
            // Process queued messages
            this.processMessageQueue();
            
            // Trigger connected event
            this.emit('connected', event);
        };
        
        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.handleMessage(data);
            } catch (error) {
                this.log('error', `Failed to parse WebSocket message: ${error.message}`);
            }
        };
        
        this.ws.onclose = (event) => {
            this.log('warning', `WebSocket connection closed: ${event.code} - ${event.reason}`);
            this.isConnected = false;
            this.updateConnectionStatus('disconnected');
            
            // Attempt reconnection if not a normal closure
            if (event.code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
                this.attemptReconnection();
            }
            
            this.emit('disconnected', event);
        };
        
        this.ws.onerror = (error) => {
            this.log('error', `WebSocket error occurred`);
            this.updateConnectionStatus('disconnected');
            this.showErrorModal('WebSocket connection error. Retrying...');
            this.emit('error', error);
        };
    }
    
    handleMessage(data) {
        const messageType = data.type;
        this.log('info', `Received message: ${messageType}`);
        
        // Handle specific message types
        switch (messageType) {
            case 'connection':
                this.handleConnectionMessage(data);
                break;
            case 'session_created':
                this.handleSessionCreated(data);
                break;
            case 'session_joined':
                this.handleSessionJoined(data);
                break;
            case 'echo_response':
                this.handleEchoResponse(data);
                break;
            case 'transcription_complete':
                this.handleTranscriptionComplete(data);
                break;
            case 'ai_response':
                this.handleAIResponse(data);
                break;
            case 'voice_response':
                this.handleVoiceResponse(data);
                break;
            case 'processing_status':
                this.handleProcessingStatus(data);
                break;
            case 'error':
                this.handleError(data);
                break;
            case 'partial_transcript':
                // surface to app if not already handled
                break;
            case 'final_transcript':
                // surface to app if not already handled
                break;
            case 'turn_detected':
                this.log('success', `Turn detected`);
                break;
            default:
                this.log('warning', `Unknown message type: ${messageType}`);
        }
        
        // Emit generic message event
        this.emit('message', data);
        
        // Emit specific event for message type
        this.emit(messageType, data);
    }
    
    handleConnectionMessage(data) {
        this.log('success', data.message);
    }
    
    handleSessionCreated(data) {
        this.currentSessionId = data.session_id;
        this.updateSessionDisplay(data.session_id);
        this.log('success', `Session created: ${data.session_id}`);
    }
    
    handleSessionJoined(data) {
        this.currentSessionId = data.session_id;
        this.updateSessionDisplay(data.session_id);
        
        // Load conversation history if available
        if (data.history && data.history.length > 0) {
            this.emit('conversation_history', data.history);
        }
        
        this.log('success', `Joined session: ${data.session_id}`);
    }
    
    handleEchoResponse(data) {
        const echoResponse = document.getElementById('echoResponse');
        if (echoResponse) {
            echoResponse.innerHTML = `
                <strong>Echo Response:</strong><br>
                Original: "${data.original_message}"<br>
                Timestamp: ${new Date(data.timestamp).toLocaleTimeString()}
            `;
        }
        this.log('info', `Echo received: ${data.original_message}`);
    }
    
    handleTranscriptionComplete(data) {
        this.log('success', `Transcription: ${data.transcript}`);
    }
    
    handleAIResponse(data) {
        this.log('success', `AI Response: ${data.text.substring(0, 100)}...`);
    }
    
    handleVoiceResponse(data) {
        this.log('success', `Voice response generated: ${data.audio_url}`);
    }
    
    handleProcessingStatus(data) {
        this.log('info', `Processing stage: ${data.stage} - ${data.message}`);
    }
    
    handleError(data) {
        this.log('error', `Server error: ${data.message}`);
        this.showErrorModal(data.message);
    }
    
    // Send Methods
    sendMessage(message) {
        if (this.isConnected && this.ws.readyState === WebSocket.OPEN) {
            try {
                const messageString = JSON.stringify(message);
                this.ws.send(messageString);
                this.log('info', `Sent message: ${message.type}`);
                return true;
            } catch (error) {
                this.log('error', `Failed to send message: ${error.message}`);
                return false;
            }
        } else {
            // Queue message for later sending
            this.messageQueue.push(message);
            this.log('warning', `Message queued (not connected): ${message.type}`);
            return false;
        }
    }
    
    createSession() {
        return this.sendMessage({
            type: 'session_create',
            timestamp: new Date().toISOString()
        });
    }
    
    joinSession(sessionId) {
        return this.sendMessage({
            type: 'session_join',
            session_id: sessionId,
            timestamp: new Date().toISOString()
        });
    }
    
    sendEcho(message) {
        return this.sendMessage({
            type: 'echo',
            message: message,
            timestamp: new Date().toISOString()
        });
    }
    
    sendVoiceMessage(audioData, sessionId) {
        return this.sendMessage({
            type: 'voice_message',
            audio_data: audioData,
            session_id: sessionId || this.currentSessionId,
            timestamp: new Date().toISOString()
        });
    }
    
    sendTextMessage(text, sessionId) {
        return this.sendMessage({
            type: 'text_message',
            text: text,
            session_id: sessionId || this.currentSessionId,
            timestamp: new Date().toISOString()
        });
    }
    
    // Connection Management
    attemptReconnection() {
        this.reconnectAttempts++;
        const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
        
        this.log('warning', `Attempting reconnection ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`);
        this.updateConnectionStatus('reconnecting');
        
        setTimeout(() => {
            if (!this.isConnected) {
                this.connect();
            }
        }, delay);
    }
    
    disconnect() {
        if (this.ws) {
            this.ws.close(1000, 'User initiated disconnect');
        }
    }
    
    // Event System
    on(event, callback) {
        if (!this.eventListeners.has(event)) {
            this.eventListeners.set(event, []);
        }
        this.eventListeners.get(event).push(callback);
    }
    
    off(event, callback) {
        if (this.eventListeners.has(event)) {
            const listeners = this.eventListeners.get(event);
            const index = listeners.indexOf(callback);
            if (index > -1) {
                listeners.splice(index, 1);
            }
        }
    }
    
    emit(event, data) {
        if (this.eventListeners.has(event)) {
            this.eventListeners.get(event).forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    this.log('error', `Error in event listener for ${event}: ${error.message}`);
                }
            });
        }
    }
    
    // Utility Methods
    processMessageQueue() {
        while (this.messageQueue.length > 0 && this.isConnected) {
            const message = this.messageQueue.shift();
            this.sendMessage(message);
        }
    }
    
    updateConnectionStatus(status) {
        const statusMap = {
            connecting: { text: 'Connecting...', class: '', wsText: 'Connecting...' },
            connected: { text: 'Connected', class: 'connected', wsText: 'Connected' },
            disconnected: { text: 'Disconnected', class: 'error', wsText: 'Disconnected' },
            reconnecting: { text: 'Reconnecting...', class: '', wsText: 'Reconnecting...' }
        };
        
        if (this.connectionStatus && statusMap[status]) {
            this.statusText.textContent = statusMap[status].text;
            this.connectionStatus.className = `status-indicator ${statusMap[status].class}`;
            
            // Update WebSocket status
            const wsStatus = document.getElementById('wsStatus');
            if (wsStatus) {
                wsStatus.textContent = statusMap[status].wsText;
                wsStatus.className = `ws-status ${statusMap[status].class}`;
            }
        }
    }
    
    updateSessionDisplay(sessionId) {
        const sessionIdElement = document.getElementById('sessionId');
        if (sessionIdElement) {
            sessionIdElement.textContent = sessionId ? sessionId.substring(0, 8) + '...' : 'Not connected';
        }
    }
    
    showErrorModal(message) {
        const errorModal = document.getElementById('errorModal');
        const errorMessage = document.getElementById('errorMessage');
        
        if (errorModal && errorMessage) {
            errorMessage.textContent = message;
            errorModal.classList.add('show');
        }
    }
    
    hideErrorModal() {
        const errorModal = document.getElementById('errorModal');
        if (errorModal) {
            errorModal.classList.remove('show');
        }
    }
    
    handleConnectionError() {
        this.updateConnectionStatus('disconnected');
        this.showErrorModal('Failed to connect to the voice agent server. Please check your connection and try again.');
    }
    
    log(level, message) {
        const timestamp = new Date().toLocaleTimeString();
        const logEntry = `[${timestamp}] ${level.toUpperCase()}: ${message}`;
        
        console.log(logEntry);
        
        // Add to debug panel
        if (this.debugLogs) {
            const logElement = document.createElement('div');
            logElement.className = `debug-log-entry ${level}`;
            logElement.textContent = logEntry;
            
            this.debugLogs.appendChild(logElement);
            this.debugLogs.scrollTop = this.debugLogs.scrollHeight;
            
            // Keep only last 100 log entries
            while (this.debugLogs.children.length > 100) {
                this.debugLogs.removeChild(this.debugLogs.firstChild);
            }
        }
    }
    
    clearLogs() {
        if (this.debugLogs) {
            this.debugLogs.innerHTML = '';
        }
    }
    
    // Setup DOM Event Listeners
    setupEventListeners() {
        // New Session Button
        const newSessionBtn = document.getElementById('newSessionBtn');
        if (newSessionBtn) {
            newSessionBtn.addEventListener('click', () => {
                this.createSession();
            });
        }
        
        // Echo Test Button
        const echoBtn = document.getElementById('echoBtn');
        const echoInput = document.getElementById('echoInput');
        if (echoBtn && echoInput) {
            echoBtn.addEventListener('click', () => {
                const message = echoInput.value.trim();
                if (message) {
                    this.sendEcho(message);
                    echoInput.value = '';
                }
            });
            
            echoInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    echoBtn.click();
                }
            });
        }
        
        // Error Modal Buttons
        const retryBtn = document.getElementById('retryBtn');
        const dismissBtn = document.getElementById('dismissBtn');
        
        if (retryBtn) {
            retryBtn.addEventListener('click', () => {
                this.hideErrorModal();
                if (!this.isConnected) {
                    this.connect();
                }
            });
        }
        
        if (dismissBtn) {
            dismissBtn.addEventListener('click', () => {
                this.hideErrorModal();
            });
        }
        
        // Debug Panel Toggle
        const debugHeader = document.getElementById('debugHeader');
        const debugContent = document.getElementById('debugContent');
        const toggleDebug = document.getElementById('toggleDebug');
        
        if (debugHeader && debugContent && toggleDebug) {
            debugHeader.addEventListener('click', () => {
                debugContent.classList.toggle('expanded');
                toggleDebug.textContent = debugContent.classList.contains('expanded') ? '▲' : '▼';
            });
        }
        
        // Clear Logs Button
        const clearLogsBtn = document.getElementById('clearLogsBtn');
        if (clearLogsBtn) {
            clearLogsBtn.addEventListener('click', () => {
                this.clearLogs();
            });
        }
    }
    
    // Getters
    get connected() {
        return this.isConnected;
    }
    
    get sessionId() {
        return this.currentSessionId;
    }
    
    get readyState() {
        return this.ws ? this.ws.readyState : WebSocket.CLOSED;
    }
}

// Export for use in other scripts
window.WebSocketClient = WebSocketClient;
