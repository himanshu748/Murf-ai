// static/script.js - Enhanced UI version

document.addEventListener("DOMContentLoaded", async () => {
    // --- SESSION MANAGEMENT ---
    const urlParams = new URLSearchParams(window.location.search);
    let sessionId = urlParams.get('session_id');
    if (!sessionId) {
        sessionId = crypto.randomUUID();
        window.history.replaceState({}, '', `?session_id=${sessionId}`);
    }

    // --- Enhanced UI Elements ---
    let audioContext = null;
    let source = null;
    let processor = null;
    let isRecording = false;
    let socket = null;

    const recordBtn = document.getElementById("recordBtn");
    const statusDisplay = document.getElementById("statusDisplay");
    const transcriptionDisplay = document.getElementById("transcriptionDisplay");
    const currentTranscript = document.getElementById("currentTranscript");
    const transcriptionHistory = document.getElementById("transcriptionHistory");
    const audioVisualizer = document.getElementById("audioVisualizer");
    const debugInfo = document.getElementById("debugInfo");
    
    // Status indicator dots
    const micDot = document.getElementById("micDot");
    const connectionDot = document.getElementById("connectionDot");
    const transcriptionDot = document.getElementById("transcriptionDot");

    // Enhanced status management
    const updateStatus = (type, active) => {
        const dots = { mic: micDot, connection: connectionDot, transcription: transcriptionDot };
        if (dots[type]) {
            if (active) {
                dots[type].classList.add("active");
            } else {
                dots[type].classList.remove("active");
            }
        }
    };

    // Enhanced visual feedback
    const setRecordingState = (recording) => {
        if (recording) {
            recordBtn.classList.add("recording");
            recordBtn.innerHTML = '<i class="fas fa-stop"></i>';
            statusDisplay.classList.add("recording");
            updateStatus('mic', true);
            audioVisualizer.classList.remove("d-none");
        } else {
            recordBtn.classList.remove("recording");
            recordBtn.innerHTML = '<i class="fas fa-microphone"></i>';
            statusDisplay.classList.remove("recording");
            updateStatus('mic', false);
            audioVisualizer.classList.add("d-none");
        }
    };

    const startRecording = async () => {
        if (!navigator.mediaDevices?.getUserMedia) {
            alert("🚫 Audio recording not supported in this browser.");
            return;
        }

        console.log("🎤 Starting recording session...");
        isRecording = true;
        setRecordingState(true);
        statusDisplay.textContent = "🎤 Initializing... Please wait.";
        
        // Show transcription area with enhanced styling
        currentTranscript.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Connecting to transcription service...';
        transcriptionDisplay.classList.remove("d-none");

        try {
            // Establish WebSocket connection
            const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
            const wsUrl = `${wsProtocol}//${window.location.host}/ws`;
            console.log("🔗 Connecting to WebSocket:", wsUrl);
            
            socket = new WebSocket(wsUrl);

            socket.onopen = async () => {
                console.log("✅ WebSocket connection established for enhanced streaming transcription.");
                statusDisplay.innerHTML = '<i class="fas fa-headphones"></i> Connected! Grant microphone access...';
                updateStatus('connection', true);

                try {
                    // Get microphone access with enhanced error handling
                    const stream = await navigator.mediaDevices.getUserMedia({ 
                        audio: {
                            echoCancellation: true,
                            noiseSuppression: true,
                            autoGainControl: true,
                            sampleRate: 16000,
                            channelCount: 1
                        } 
                    });
                    
                    // Create AudioContext with 16kHz sample rate (required by AssemblyAI)
                    audioContext = new (window.AudioContext || window.webkitAudioContext)({ 
                        sampleRate: 16000 
                    });
                    
                    // Resume audio context if suspended
                    if (audioContext.state === 'suspended') {
                        await audioContext.resume();
                    }
                    
                    source = audioContext.createMediaStreamSource(stream);
                    
                    // Create ScriptProcessorNode for processing audio chunks
                    processor = audioContext.createScriptProcessor(1024, 1, 1); // Smaller buffer for better real-time performance

                    processor.onaudioprocess = (event) => {
                        if (!socket || socket.readyState !== WebSocket.OPEN) return;
                        
                        const inputData = event.inputBuffer.getChannelData(0);
                        
                        // Convert float32 (-1.0 to 1.0) to 16-bit PCM
                        const pcmData = new Int16Array(inputData.length);
                        for (let i = 0; i < inputData.length; i++) {
                            const sample = Math.max(-1, Math.min(1, inputData[i]));
                            pcmData[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
                        }
                        
                        // Send PCM data to server
                        try {
                            socket.send(pcmData.buffer);
                        } catch (error) {
                            console.error("Error sending audio data:", error);
                        }
                    };

                    // Connect the audio nodes
                    source.connect(processor);
                    processor.connect(audioContext.destination);

                    // Store the stream for cleanup
                    recordBtn.mediaStream = stream;
                    updateStatus('transcription', true);
                    currentTranscript.innerHTML = '<i class="fas fa-ear-listen"></i> Ready! Start speaking now...';
                    statusDisplay.innerHTML = '<i class="fas fa-microphone"></i> Listening... Speak clearly and I\'ll transcribe in real-time!';

                    console.log("🎵 Audio processing setup complete. Ready to receive speech!");

                } catch (micError) {
                    console.error("❌ Error accessing microphone:", micError);
                    alert("🚫 Could not access microphone. Please check permissions and try again.");
                    stopRecording();
                }
            };

            // Enhanced message handling with better UI feedback
            socket.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    console.log("📨 Received message:", data);
                    
                    if (data.type === "partial_transcription") {
                        // Show partial transcriptions in real-time
                        console.log(`🔄 Partial transcription: ${data.text}`);
                        currentTranscript.innerHTML = `<i class="fas fa-microphone-alt fa-pulse"></i> ${data.text}<span class="text-muted"> (speaking...)</span>`;
                        currentTranscript.classList.remove("final-transcript");
                        currentTranscript.classList.add("partial-transcript");
                        
                        // Update status to show we're receiving speech
                        statusDisplay.innerHTML = '<i class="fas fa-volume-up"></i> Hearing you speak...';
                        updateStatus('transcription', true);
                        debugInfo.textContent = "Partial";
                        debugInfo.className = "badge bg-warning ms-2 small";
                        
                    } else if (data.type === "transcription" && data.end_of_turn) {
                        // Enhanced transcription display with animations
                        console.log(`🎯 End of turn transcription: ${data.text}`);
                        
                        // Update current transcript with success styling
                        currentTranscript.innerHTML = `<i class="fas fa-check-circle"></i> ${data.text}`;
                        currentTranscript.classList.remove("partial-transcript");
                        currentTranscript.classList.add("final-transcript");
                        
                        // Add to enhanced history with timestamp
                        addToTranscriptionHistory(data.text);
                        
                        // Enhanced status update
                        statusDisplay.innerHTML = '<i class="fas fa-check"></i> Turn completed! Continue speaking or stop recording.';
                        debugInfo.textContent = "Final";
                        debugInfo.className = "badge bg-success ms-2 small";
                        
                    } else if (data.type === "turn_end") {
                        console.log("🔄 Turn end detected:", data.message);
                        statusDisplay.innerHTML = '<i class="fas fa-clock"></i> Turn detected. Ready for next speech...';
                        
                        // Reset for next turn with smooth transition
                        setTimeout(() => {
                            currentTranscript.innerHTML = '<i class="fas fa-ear-listen"></i> Listening for next speech...';
                            currentTranscript.classList.remove("final-transcript", "partial-transcript");
                            debugInfo.textContent = "Listening";
                            debugInfo.className = "badge bg-info ms-2 small";
                        }, 1500);
                        
                    } else if (data.type === "error") {
                        console.error("❌ Transcription error:", data.message);
                        statusDisplay.innerHTML = `<i class="fas fa-exclamation-triangle"></i> Error: ${data.message}`;
                        statusDisplay.classList.add("text-danger");
                        updateStatus('transcription', false);
                        
                    } else if (data.type === "status") {
                        console.log("ℹ️ Status message:", data.message);
                        statusDisplay.innerHTML = `<i class="fas fa-info-circle"></i> ${data.message}`;
                        updateStatus('transcription', true);
                        debugInfo.textContent = "Connected";
                        debugInfo.className = "badge bg-primary ms-2 small";
                    }
                } catch (err) {
                    console.error("❌ Error parsing WebSocket message:", err);
                }
            };

            socket.onclose = () => {
                console.log("🔌 WebSocket connection closed.");
                statusDisplay.innerHTML = '<i class="fas fa-plug"></i> Transcription session ended.';
                updateStatus('connection', false);
                updateStatus('transcription', false);
            };

            socket.onerror = (error) => {
                console.error("❌ WebSocket error:", error);
                statusDisplay.innerHTML = '<i class="fas fa-wifi"></i> Connection error occurred.';
                statusDisplay.classList.add("text-danger");
                updateStatus('connection', false);
            };

        } catch (err) {
            console.error("❌ Error starting recording:", err);
            alert("🚫 Failed to start recording session. Please try again.");
            stopRecording();
        }
    };

    // Enhanced history management with better styling
    const addToTranscriptionHistory = (text) => {
        if (!transcriptionHistory) return;
        
        // Clear placeholder if this is the first entry
        if (transcriptionHistory.children.length === 1 && 
            transcriptionHistory.querySelector('.text-muted')) {
            transcriptionHistory.innerHTML = '';
        }
        
        const historyItem = document.createElement("div");
        historyItem.className = "transcription-history-item";
        historyItem.style.opacity = "0";
        historyItem.style.transform = "translateY(20px)";
        
        const timestamp = new Date().toLocaleTimeString('en-US', {
            hour12: true,
            hour: 'numeric',
            minute: '2-digit',
            second: '2-digit'
        });
        
        historyItem.innerHTML = `
            <div class="history-timestamp">
                <i class="fas fa-clock"></i> ${timestamp}
            </div>
            <div class="history-text">
                <i class="fas fa-quote-left"></i> ${text}
            </div>
        `;
        
        transcriptionHistory.appendChild(historyItem);
        
        // Smooth animation
        setTimeout(() => {
            historyItem.style.transition = "all 0.5s ease";
            historyItem.style.opacity = "1";
            historyItem.style.transform = "translateY(0)";
        }, 100);
        
        // Scroll to bottom with smooth behavior
        transcriptionHistory.scrollTo({
            top: transcriptionHistory.scrollHeight,
            behavior: 'smooth'
        });
    };

    const stopRecording = () => {
        if (!isRecording) return;

        isRecording = false;
        setRecordingState(false);
        statusDisplay.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Stopping recording...';
        statusDisplay.classList.remove("text-danger");

        // Clean up audio processing
        if (processor) {
            processor.disconnect();
            processor = null;
        }
        
        if (source) {
            source.disconnect();
            source = null;
        }
        
        if (audioContext) {
            audioContext.close();
            audioContext = null;
        }

        // Stop media stream tracks
        if (recordBtn.mediaStream) {
            recordBtn.mediaStream.getTracks().forEach(track => track.stop());
            recordBtn.mediaStream = null;
        }

        // Send EOF and close WebSocket
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send("EOF");
            socket.close();
        }
        socket = null;

        // Reset all status indicators
        updateStatus('mic', false);
        updateStatus('connection', false);
        updateStatus('transcription', false);
        
        statusDisplay.innerHTML = '<i class="fas fa-check"></i> Ready to chat again!';
    };

    // Enhanced button interaction
    recordBtn.addEventListener("click", () => {
        if (isRecording) {
            stopRecording();
        } else {
            startRecording();
        }
    });

    // Enhanced keyboard shortcuts
    document.addEventListener('keydown', (event) => {
        if (event.code === 'Space' && !event.repeat) {
            event.preventDefault();
            if (!isRecording) {
                startRecording();
            }
        }
    });

    document.addEventListener('keyup', (event) => {
        if (event.code === 'Space') {
            event.preventDefault();
            if (isRecording) {
                stopRecording();
            }
        }
    });

    // Enhanced cleanup on page unload
    window.addEventListener('beforeunload', () => {
        if (isRecording) {
            stopRecording();
        }
    });

    // Show keyboard shortcut hint
    setTimeout(() => {
        if (!isRecording) {
            statusDisplay.innerHTML = '<i class="fas fa-keyboard"></i> Tip: Hold SPACE to record, or click the button!';
        }
    }, 3000);
});
