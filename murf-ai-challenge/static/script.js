console.log("🎤 30 Days of Voice Agents - Day 7: Echo Bot v2 (AssemblyAI + Murf)");

// Add some interactive functionality
document.addEventListener('DOMContentLoaded', function() {
    console.log("Voice Agents application loaded successfully!");
    
    // Add smooth scrolling for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });
    
    // Add loading animation to cards
    const cards = document.querySelectorAll('.hero-card, .tts-card, .info-card');
    cards.forEach((card, index) => {
        card.style.opacity = '0';
        card.style.transform = 'translateY(20px)';
        
        setTimeout(() => {
            card.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
            card.style.opacity = '1';
            card.style.transform = 'translateY(0)';
        }, index * 200);
    });
    
    // Add click tracking for API docs link
    const docsLink = document.querySelector('a[href="/docs"]');
    if (docsLink) {
        docsLink.addEventListener('click', function() {
            console.log("User clicked on API docs link");
        });
    }
    
    // TTS Interface Functionality
    initializeTTSInterface();
    
    // Echo Bot Functionality
    initializeEchoBot();
});

// Initialize TTS Interface
function initializeTTSInterface() {
    const textInput = document.getElementById('textInput');
    const voiceSelect = document.getElementById('voiceSelect');
    const generateBtn = document.getElementById('generateBtn');
    const resultSection = document.getElementById('result-section');
    const audioPlayer = document.getElementById('audioPlayer');
    const audioText = document.getElementById('audio-text');
    const errorSection = document.getElementById('error-section');
    const errorMessage = document.getElementById('error-message');
    const retryBtn = document.getElementById('retry-btn');
    const clearBtn = document.getElementById('clear-btn');
    const sampleBtn = document.getElementById('sample-btn');
    const charCounter = document.getElementById('char-counter');
    const statusIndicator = document.getElementById('status-indicator');
    const statusDot = statusIndicator?.querySelector('.status-dot');
    const statusText = statusIndicator?.querySelector('.status-text');
    const generationTime = document.getElementById('generation-time');
    const audioDuration = document.getElementById('audio-duration');
    
    let generationStartTime = null;
    
    // Initialize character counter
    updateCharCounter();
    
    // Add event listeners
    generateBtn.addEventListener('click', generateAudio);
    retryBtn?.addEventListener('click', generateAudio);
    clearBtn?.addEventListener('click', clearText);
    sampleBtn?.addEventListener('click', loadSampleText);
    textInput.addEventListener('input', updateCharCounter);
    
    // Add sample text on focus if empty
    textInput.addEventListener('focus', function() {
        if (!this.value.trim()) {
            this.value = "Hello! Welcome to Day 3 of the 30 Days of Voice Agents challenge. This is a test of the text-to-speech system.";
            updateCharCounter();
        }
    });
    
    // Generate audio function
    async function generateAudio() {
        const text = textInput.value.trim();
        const voiceId = voiceSelect.value;
        
        // Validate input
        if (!text) {
            showError("Please enter some text to generate audio.");
            return;
        }
        
        if (text.length > 500) {
            showError("Text is too long. Please keep it under 500 characters.");
            return;
        }
        
        // Show loading state
        setLoadingState(true);
        hideError();
        hideResult();
        generationStartTime = Date.now();
        
        try {
            console.log(`Generating audio for text: "${text}" with voice: ${voiceId}`);
            
            const response = await fetch('/api/tts/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    text: text,
                    voice_id: voiceId,
                    output_format: "mp3"
                })
            });
            
            const result = await response.json();
            
            if (response.ok && result.success) {
                // Success - play audio
                const audioUrl = result.audio_url;
                console.log('Audio generated successfully:', audioUrl);
                
                // Set audio source and show player
                audioPlayer.src = audioUrl;
                audioText.textContent = `"${text}"`;
                
                // Update generation time
                if (generationStartTime && generationTime) {
                    const duration = ((Date.now() - generationStartTime) / 1000).toFixed(1);
                    generationTime.textContent = `Generated in ${duration}s`;
                }
                
                showResult();
                
                // Auto-play audio
                audioPlayer.play().catch(e => {
                    console.log('Auto-play prevented:', e);
                });
                
            } else {
                // API error
                const errorMsg = result.detail || result.message || 'Failed to generate audio. Please try again.';
                showError(errorMsg);
                console.error('TTS API error:', result);
            }
            
        } catch (error) {
            console.error('Error generating audio:', error);
            showError('Network error. Please check your connection and try again.');
        } finally {
            setLoadingState(false);
        }
    }
    
    // Helper functions
    function setLoadingState(loading) {
        const btnContent = generateBtn.querySelector('.btn-content');
        const btnLoading = generateBtn.querySelector('.btn-loading');
        
        if (loading) {
            generateBtn.disabled = true;
            btnContent.style.display = 'none';
            btnLoading.style.display = 'flex';
            
            // Update status indicator
            if (statusDot && statusText) {
                statusDot.className = 'status-dot processing';
                statusText.textContent = 'Processing';
            }
        } else {
            generateBtn.disabled = false;
            btnContent.style.display = 'flex';
            btnLoading.style.display = 'none';
            
            // Update status indicator
            if (statusDot && statusText) {
                statusDot.className = 'status-dot ready';
                statusText.textContent = 'Ready';
            }
        }
    }
    
    function showResult() {
        resultSection.style.display = 'block';
        resultSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        startVisualizer();
    }
    
    function hideResult() {
        resultSection.style.display = 'none';
        stopVisualizer();
    }
    
    function showError(message) {
        errorMessage.textContent = message;
        errorSection.style.display = 'flex';
        errorSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    
    function hideError() {
        errorSection.style.display = 'none';
    }
    
    function updateCharCounter() {
        const length = textInput.value.length;
        charCounter.textContent = `${length} / 500`;
        
        if (length > 450) {
            charCounter.style.color = '#ef4444';
        } else if (length > 350) {
            charCounter.style.color = '#f59e0b';
        } else {
            charCounter.style.color = '#999';
        }
    }
    
    function clearText() {
        textInput.value = '';
        updateCharCounter();
        textInput.focus();
    }
    
    function loadSampleText() {
        const samples = [
            "Welcome to the future of voice technology! This is Day 3 of our amazing journey.",
            "Artificial intelligence is transforming how we interact with technology every day.",
            "The power of natural-sounding speech synthesis opens up endless possibilities.",
            "From podcasts to audiobooks, voice technology is reshaping digital content.",
            "Experience the magic of converting text to lifelike speech with just one click."
        ];
        
        const randomSample = samples[Math.floor(Math.random() * samples.length)];
        textInput.value = randomSample;
        updateCharCounter();
    }
    
    function startVisualizer() {
        const bars = document.querySelectorAll('.visualizer-bar');
        bars.forEach(bar => {
            bar.style.animationPlayState = 'running';
        });
    }
    
    function stopVisualizer() {
        const bars = document.querySelectorAll('.visualizer-bar');
        bars.forEach(bar => {
            bar.style.animationPlayState = 'paused';
        });
    }
    
    // Audio player event listeners
    audioPlayer?.addEventListener('loadedmetadata', function() {
        if (audioDuration) {
            const duration = Math.round(audioPlayer.duration);
            audioDuration.textContent = `Duration: ${duration}s`;
        }
    });
    
    audioPlayer?.addEventListener('play', startVisualizer);
    audioPlayer?.addEventListener('pause', stopVisualizer);
    audioPlayer?.addEventListener('ended', stopVisualizer);
}

// Function to test the TTS API (can be called from browser console)
async function testTTSAPI(text = "Hello, this is a test of the TTS API!") {
    try {
        const response = await fetch('/api/tts/generate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                text: text,
                voice_id: "en-US-cooper",
                output_format: "mp3"
            })
        });
        
        const result = await response.json();
            console.log('TTS API Response:', result);
    return result;
} catch (error) {
    console.error('Error testing TTS API:', error);
    return null;
}
}

// Initialize Echo Bot Interface
function initializeEchoBot() {
    const startRecordingBtn = document.getElementById('startRecordingBtn');
    const stopRecordingBtn = document.getElementById('stopRecordingBtn');
    const recordingIndicator = document.getElementById('recordingIndicator');
    const echoResultSection = document.getElementById('echo-result-section');
    const echoAudioPlayer = document.getElementById('echoAudioPlayer');
    const echoErrorSection = document.getElementById('echo-error-section');
    const echoErrorMessage = document.getElementById('echo-error-message');
    const echoRetryBtn = document.getElementById('echo-retry-btn');
    const downloadBtn = document.getElementById('download-btn');
    const uploadBtn = document.getElementById('upload-btn');
    const newRecordingBtn = document.getElementById('new-recording-btn');
    const echoStatus = document.getElementById('echo-status');
    const echoStatusDot = echoStatus?.querySelector('.status-dot');
    const echoStatusText = echoStatus?.querySelector('.status-text');
    const recordingDuration = document.getElementById('recording-duration');
    const recordingSize = document.getElementById('recording-size');
    const uploadStatus = document.getElementById('upload-status');
    const uploadStatusText = document.getElementById('upload-status-text');
    const transcribeBtn = document.getElementById('transcribe-btn');
    const echoBtn = document.getElementById('echo-btn');
    const echoVoiceSelect = document.getElementById('echoVoiceSelect');
    const transcriptionSection = document.getElementById('transcription-section');
    const transcriptionText = document.getElementById('transcription-text');
    const transcriptionConfidence = document.getElementById('transcription-confidence');
    const transcriptionDuration = document.getElementById('transcription-duration');
    const transcriptionWords = document.getElementById('transcription-words');
    const copyTranscriptionBtn = document.getElementById('copy-transcription-btn');
    const transcribeAgainBtn = document.getElementById('transcribe-again-btn');
    
    let mediaRecorder = null;
    let audioChunks = [];
    let recordingStartTime = null;
    let audioBlob = null;
    
    // Check if browser supports MediaRecorder
    if (!navigator.mediaDevices || !window.MediaRecorder) {
        showEchoError("Your browser doesn't support audio recording. Please use a modern browser like Chrome, Firefox, or Safari.");
        startRecordingBtn.disabled = true;
        return;
    }
    
    // Add event listeners
    startRecordingBtn.addEventListener('click', startRecording);
    stopRecordingBtn.addEventListener('click', stopRecording);
    echoRetryBtn?.addEventListener('click', startRecording);
    downloadBtn?.addEventListener('click', downloadRecording);
    uploadBtn?.addEventListener('click', uploadRecording);
    transcribeBtn?.addEventListener('click', transcribeRecording);
    echoBtn?.addEventListener('click', echoWithMurf);
    // Voice is selected server-side; hide client selector if present
    if (echoVoiceSelect) echoVoiceSelect.closest('.voice-group')?.remove();
    copyTranscriptionBtn?.addEventListener('click', copyTranscription);
    transcribeAgainBtn?.addEventListener('click', transcribeRecording);
    newRecordingBtn?.addEventListener('click', resetRecording);
    
    async function startRecording() {
        try {
            console.log("Starting recording...");
            
            // Request microphone permission
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                } 
            });
            
            // Create MediaRecorder
            mediaRecorder = new MediaRecorder(stream, {
                mimeType: 'audio/webm;codecs=opus'
            });
            
            audioChunks = [];
            recordingStartTime = Date.now();
            
            // Set up event listeners for MediaRecorder
            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunks.push(event.data);
                }
            };
            
            mediaRecorder.onstop = () => {
                // Create audio blob (do not auto-play the raw recording)
                audioBlob = new Blob(audioChunks, { type: 'audio/webm' });

                // Calculate duration and size
                const duration = ((Date.now() - recordingStartTime) / 1000).toFixed(1);
                const size = formatFileSize(audioBlob.size);
                
                recordingDuration.textContent = `Duration: ${duration}s`;
                recordingSize.textContent = `Size: ${size}`;
                
                // Show result
                showEchoResult();
                
                // Stop all tracks
                stream.getTracks().forEach(track => track.stop());
                
                console.log("Recording completed successfully");
            };
            
            mediaRecorder.onerror = (event) => {
                console.error("MediaRecorder error:", event);
                showEchoError("Recording failed. Please try again.");
                stream.getTracks().forEach(track => track.stop());
            };
            
            // Start recording
            mediaRecorder.start();
            
            // Update UI
            setRecordingState(true);
            hideEchoError();
            
            console.log("Recording started successfully");
            
        } catch (error) {
            console.error("Error starting recording:", error);
            
            if (error.name === 'NotAllowedError') {
                showEchoError("Microphone access denied. Please allow microphone access and try again.");
            } else if (error.name === 'NotFoundError') {
                showEchoError("No microphone found. Please connect a microphone and try again.");
            } else {
                showEchoError("Failed to start recording. Please try again.");
            }
        }
    }
    
    function stopRecording() {
        if (mediaRecorder && mediaRecorder.state === 'recording') {
            console.log("Stopping recording...");
            mediaRecorder.stop();
            setRecordingState(false);
        }
    }
    
    function setRecordingState(recording) {
        if (recording) {
            startRecordingBtn.style.display = 'none';
            stopRecordingBtn.style.display = 'flex';
            recordingIndicator.style.display = 'flex';
            
            if (echoStatusDot) {
                echoStatusDot.className = 'status-dot processing';
            }
            if (echoStatusText) {
                echoStatusText.textContent = 'Recording...';
            }
        } else {
            startRecordingBtn.style.display = 'flex';
            stopRecordingBtn.style.display = 'none';
            recordingIndicator.style.display = 'none';
            
            if (echoStatusDot) {
                echoStatusDot.className = 'status-dot ready';
            }
            if (echoStatusText) {
                echoStatusText.textContent = 'Ready to Record';
            }
        }
    }
    
    function showEchoResult() {
        echoResultSection.style.display = 'block';
        echoErrorSection.style.display = 'none';
    }
    
    function hideEchoResult() {
        echoResultSection.style.display = 'none';
    }
    
    function showEchoError(message) {
        echoErrorMessage.textContent = message;
        echoErrorSection.style.display = 'block';
        echoResultSection.style.display = 'none';
        setRecordingState(false);
    }
    
    function hideEchoError() {
        echoErrorSection.style.display = 'none';
    }
    
    function downloadRecording() {
        if (audioBlob) {
            const url = URL.createObjectURL(audioBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `echo-recording-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.webm`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            console.log("Recording downloaded successfully");
        }
    }
    
    async function uploadRecording() {
        if (!audioBlob) {
            showEchoError("No recording available to upload. Please record something first.");
            return;
        }
        
        try {
            console.log("Starting upload...");
            
            // Show upload status
            showUploadStatus("Uploading audio file...");
            
            // Create FormData
            const formData = new FormData();
            formData.append('audio_file', audioBlob, `recording-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.webm`);
            
            // Upload to server
            const response = await fetch('/api/upload/audio', {
                method: 'POST',
                body: formData
            });
            
            const result = await response.json();
            
            if (response.ok && result.success) {
                // Upload successful
                showUploadStatus(`Upload successful! File: ${result.filename}, Size: ${result.size_formatted}`, 'success');
                console.log("Upload successful:", result);
                
                // Auto-hide success message after 5 seconds
                setTimeout(() => {
                    hideUploadStatus();
                }, 5000);
                
            } else {
                // Upload failed
                const errorMsg = result.detail || result.message || 'Upload failed. Please try again.';
                showUploadStatus(errorMsg, 'error');
                console.error('Upload error:', result);
            }
            
        } catch (error) {
            console.error('Error uploading audio:', error);
            showUploadStatus('Network error. Please check your connection and try again.', 'error');
        }
    }

    async function echoWithMurf() {
        if (!audioBlob) {
            showEchoError("No recording available to echo. Please record something first.");
            return;
        }
        try {
            // Visual feedback
            showUploadStatus("Generating Murf echo...", 'uploading');

            const formData = new FormData();
            formData.append('audio_file', audioBlob, `recording-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.webm`);
            // Server will pick the voice; no client voice parameter

            const response = await fetch('/tts/echo', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();
            if (response.ok && result.success) {
                // Play Murf audio URL instead of local blob
                echoAudioPlayer.src = result.audio_url;
                echoAudioPlayer.play().catch(() => {});

                // Show transcript in transcription panel
                showTranscriptionResult({
                    transcription: result.transcript,
                    confidence: 1,
                    audio_duration: result.audio_length || 0,
                    words: result.transcript ? result.transcript.split(/\s+/).length : 0
                });

                showUploadStatus("Echo ready! Playing Murf audio...", 'success');
                setTimeout(() => hideUploadStatus(), 4000);
            } else {
                const errorMsg = result.detail || result.message || 'Echo failed. Please try again.';
                showUploadStatus(errorMsg, 'error');
            }
        } catch (err) {
            console.error('Echo error:', err);
            showUploadStatus('Network error during echo. Please try again.', 'error');
        }
    }

    // Removed client-side voice fetching; simplified per backend-only request
    
    async function transcribeRecording() {
        if (!audioBlob) {
            showEchoError("No recording available to transcribe. Please record something first.");
            return;
        }
        
        try {
            console.log("Starting transcription...");
            
            // Show transcription status
            showTranscriptionStatus("Transcribing audio...");
            
            // Create FormData
            const formData = new FormData();
            formData.append('audio_file', audioBlob, `recording-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.webm`);
            
            // Send to transcription endpoint
            const response = await fetch('/api/transcribe/file', {
                method: 'POST',
                body: formData
            });
            
            const result = await response.json();
            
            if (response.ok && result.success) {
                // Transcription successful
                showTranscriptionResult(result);
                console.log("Transcription successful:", result);
                
            } else {
                // Transcription failed
                const errorMsg = result.detail || result.message || 'Transcription failed. Please try again.';
                showTranscriptionError(errorMsg);
                console.error('Transcription error:', result);
            }
            
        } catch (error) {
            console.error('Error transcribing audio:', error);
            showTranscriptionError('Network error. Please check your connection and try again.');
        }
    }
    
    function resetRecording() {
        hideEchoResult();
        hideEchoError();
        hideUploadStatus();
        hideTranscription();
        audioBlob = null;
        audioChunks = [];
        recordingStartTime = null;
        
        if (echoAudioPlayer.src) {
            URL.revokeObjectURL(echoAudioPlayer.src);
            echoAudioPlayer.src = '';
        }
        
        console.log("Recording reset successfully");
    }
    
    function startEchoVisualizer() {
        const visualizer = echoAudioPlayer.parentElement.querySelector('.audio-visualizer');
        if (visualizer) {
            visualizer.style.display = 'flex';
        }
    }
    
    function formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    function showUploadStatus(message, type = 'uploading') {
        if (uploadStatus && uploadStatusText) {
            uploadStatusText.textContent = message;
            uploadStatus.className = `upload-status ${type}`;
            uploadStatus.style.display = 'block';
        }
    }
    
    function hideUploadStatus() {
        if (uploadStatus) {
            uploadStatus.style.display = 'none';
        }
    }
    
    function showTranscriptionStatus(message) {
        if (transcriptionSection && transcriptionText) {
            transcriptionText.textContent = message;
            transcriptionSection.style.display = 'block';
            transcriptionSection.className = 'transcription-section processing';
        }
    }
    
    function showTranscriptionResult(result) {
        if (transcriptionSection && transcriptionText) {
            transcriptionText.textContent = result.transcription;
            transcriptionSection.style.display = 'block';
            transcriptionSection.className = 'transcription-section';
            
            // Update metadata
            if (transcriptionConfidence) {
                transcriptionConfidence.textContent = `Confidence: ${(result.confidence * 100).toFixed(1)}%`;
            }
            if (transcriptionDuration) {
                transcriptionDuration.textContent = `Duration: ${result.audio_duration.toFixed(1)}s`;
            }
            if (transcriptionWords) {
                transcriptionWords.textContent = `Words: ${result.words}`;
            }
        }
    }
    
    function showTranscriptionError(message) {
        if (transcriptionSection && transcriptionText) {
            transcriptionText.textContent = `Error: ${message}`;
            transcriptionSection.style.display = 'block';
            transcriptionSection.className = 'transcription-section error';
        }
    }
    
    function hideTranscription() {
        if (transcriptionSection) {
            transcriptionSection.style.display = 'none';
        }
    }
    
    function copyTranscription() {
        if (transcriptionText && transcriptionText.textContent) {
            navigator.clipboard.writeText(transcriptionText.textContent).then(() => {
                // Show a brief success message
                const originalText = copyTranscriptionBtn.innerHTML;
                copyTranscriptionBtn.innerHTML = '<span>✅</span><span>Copied!</span>';
                setTimeout(() => {
                    copyTranscriptionBtn.innerHTML = originalText;
                }, 2000);
            }).catch(err => {
                console.error('Failed to copy text: ', err);
                showEchoError('Failed to copy transcription to clipboard.');
            });
        }
    }
    
    // Audio player event listeners
    echoAudioPlayer?.addEventListener('loadedmetadata', function() {
        if (recordingDuration) {
            const duration = this.duration.toFixed(1);
            recordingDuration.textContent = `Duration: ${duration}s`;
        }
    });
    
    echoAudioPlayer?.addEventListener('play', startEchoVisualizer);
    echoAudioPlayer?.addEventListener('pause', function() {
        const visualizer = this.parentElement.querySelector('.audio-visualizer');
        if (visualizer) {
            visualizer.style.display = 'none';
        }
    });
    echoAudioPlayer?.addEventListener('ended', function() {
        const visualizer = this.parentElement.querySelector('.audio-visualizer');
        if (visualizer) {
            visualizer.style.display = 'none';
        }
    });
}


