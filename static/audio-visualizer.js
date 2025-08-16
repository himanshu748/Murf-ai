/**
 * Audio Visualizer for Murf AI Voice Agent
 * Provides real-time audio visualization during recording
 */

class AudioVisualizer {
    constructor(canvasId, options = {}) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        
        // Configuration
        this.options = {
            fftSize: 256,
            smoothingTimeConstant: 0.8,
            backgroundColor: '#0a0a0a',
            primaryColor: '#007acc',
            secondaryColor: '#40a9ff',
            lineWidth: 2,
            barWidth: 4,
            barSpacing: 2,
            sensitivity: 1.5,
            ...options
        };
        
        // Audio context and analyzer
        this.audioContext = null;
        this.analyzer = null;
        this.microphone = null;
        this.dataArray = null;
        this.bufferLength = 0;
        
        // Animation
        this.animationId = null;
        this.isActive = false;
        this.noiseFloor = 10;
        this.peakLevel = 0;
        this.peakDecay = 0.95;
        
        // Canvas setup
        this.setupCanvas();
        
        // Initialize static visualization
        this.drawStaticVisualization();
    }
    
    setupCanvas() {
        // Set up high DPI canvas
        const rect = this.canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        
        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        
        this.ctx.scale(dpr, dpr);
        this.canvas.style.width = rect.width + 'px';
        this.canvas.style.height = rect.height + 'px';
        
        // Set rendering properties
        this.ctx.lineJoin = 'round';
        this.ctx.lineCap = 'round';
    }
    
    async startVisualization(stream) {
        try {
            // Create audio context
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            // Create analyzer
            this.analyzer = this.audioContext.createAnalyser();
            this.analyzer.fftSize = this.options.fftSize;
            this.analyzer.smoothingTimeConstant = this.options.smoothingTimeConstant;
            
            // Connect microphone to analyzer
            this.microphone = this.audioContext.createMediaStreamSource(stream);
            this.microphone.connect(this.analyzer);
            
            // Set up data array
            this.bufferLength = this.analyzer.frequencyBinCount;
            this.dataArray = new Uint8Array(this.bufferLength);
            
            // Start animation
            this.isActive = true;
            this.animate();
            
            console.log('Audio visualization started');
            
        } catch (error) {
            console.error('Failed to start audio visualization:', error);
            this.drawErrorVisualization();
        }
    }
    
    stopVisualization() {
        this.isActive = false;
        
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        
        if (this.microphone) {
            this.microphone.disconnect();
            this.microphone = null;
        }
        
        if (this.audioContext && this.audioContext.state !== 'closed') {
            this.audioContext.close();
            this.audioContext = null;
        }
        
        this.analyzer = null;
        this.dataArray = null;
        
        // Return to static visualization
        this.drawStaticVisualization();
        
        console.log('Audio visualization stopped');
    }
    
    animate() {
        if (!this.isActive) return;
        
        this.animationId = requestAnimationFrame(() => this.animate());
        
        // Get frequency data
        this.analyzer.getByteFrequencyData(this.dataArray);
        
        // Calculate average level
        const average = this.dataArray.reduce((sum, value) => sum + value, 0) / this.bufferLength;
        const normalizedLevel = Math.max(0, (average - this.noiseFloor) / (255 - this.noiseFloor));
        
        // Update peak level
        if (normalizedLevel > this.peakLevel) {
            this.peakLevel = normalizedLevel;
        } else {
            this.peakLevel *= this.peakDecay;
        }
        
        // Choose visualization type based on activity
        if (normalizedLevel > 0.05) {
            this.drawFrequencyBars();
        } else {
            this.drawWaveform();
        }
        
        // Update volume indicator
        this.updateVolumeIndicator(normalizedLevel);
    }
    
    drawFrequencyBars() {
        const width = this.canvas.width / (window.devicePixelRatio || 1);
        const height = this.canvas.height / (window.devicePixelRatio || 1);
        
        // Clear canvas
        this.ctx.fillStyle = this.options.backgroundColor;
        this.ctx.fillRect(0, 0, width, height);
        
        // Calculate bar dimensions
        const barCount = Math.min(64, Math.floor(this.bufferLength / 2));
        const totalBarWidth = width * 0.8;
        const barWidth = totalBarWidth / barCount;
        const startX = (width - totalBarWidth) / 2;
        
        // Draw frequency bars
        for (let i = 0; i < barCount; i++) {
            const dataIndex = Math.floor((i / barCount) * this.bufferLength);
            const barHeight = (this.dataArray[dataIndex] / 255) * height * 0.8 * this.options.sensitivity;
            
            const x = startX + i * barWidth;
            const y = height - barHeight;
            
            // Create gradient for bars
            const gradient = this.ctx.createLinearGradient(0, height, 0, y);
            gradient.addColorStop(0, this.options.primaryColor);
            gradient.addColorStop(0.5, this.options.secondaryColor);
            gradient.addColorStop(1, this.options.primaryColor);
            
            this.ctx.fillStyle = gradient;
            this.ctx.fillRect(x, y, barWidth - 1, barHeight);
            
            // Add glow effect for high frequencies
            if (barHeight > height * 0.5) {
                this.ctx.shadowColor = this.options.primaryColor;
                this.ctx.shadowBlur = 10;
                this.ctx.fillRect(x, y, barWidth - 1, barHeight);
                this.ctx.shadowBlur = 0;
            }
        }
    }
    
    drawWaveform() {
        const width = this.canvas.width / (window.devicePixelRatio || 1);
        const height = this.canvas.height / (window.devicePixelRatio || 1);
        
        // Clear canvas
        this.ctx.fillStyle = this.options.backgroundColor;
        this.ctx.fillRect(0, 0, width, height);
        
        // Get time domain data for waveform
        const timeDataArray = new Uint8Array(this.analyzer.fftSize);
        this.analyzer.getByteTimeDomainData(timeDataArray);
        
        // Draw waveform
        this.ctx.strokeStyle = this.options.primaryColor;
        this.ctx.lineWidth = this.options.lineWidth;
        this.ctx.beginPath();
        
        const sliceWidth = width / timeDataArray.length;
        let x = 0;
        
        for (let i = 0; i < timeDataArray.length; i++) {
            const v = timeDataArray[i] / 128.0;
            const y = (v * height) / 2;
            
            if (i === 0) {
                this.ctx.moveTo(x, y);
            } else {
                this.ctx.lineTo(x, y);
            }
            
            x += sliceWidth;
        }
        
        this.ctx.stroke();
        
        // Add center line
        this.ctx.strokeStyle = this.options.secondaryColor;
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.moveTo(0, height / 2);
        this.ctx.lineTo(width, height / 2);
        this.ctx.stroke();
    }
    
    drawStaticVisualization() {
        const width = this.canvas.width / (window.devicePixelRatio || 1);
        const height = this.canvas.height / (window.devicePixelRatio || 1);
        
        // Clear canvas
        this.ctx.fillStyle = this.options.backgroundColor;
        this.ctx.fillRect(0, 0, width, height);
        
        // Draw static waveform pattern
        this.ctx.strokeStyle = this.options.primaryColor;
        this.ctx.lineWidth = this.options.lineWidth;
        this.ctx.globalAlpha = 0.3;
        
        this.ctx.beginPath();
        for (let x = 0; x < width; x += 4) {
            const y = height / 2 + Math.sin(x * 0.05) * 10 + Math.sin(x * 0.1) * 5;
            if (x === 0) {
                this.ctx.moveTo(x, y);
            } else {
                this.ctx.lineTo(x, y);
            }
        }
        this.ctx.stroke();
        
        this.ctx.globalAlpha = 1;
        
        // Draw center indicator
        this.ctx.fillStyle = this.options.primaryColor;
        this.ctx.beginPath();
        this.ctx.arc(width / 2, height / 2, 3, 0, 2 * Math.PI);
        this.ctx.fill();
        
        // Add text overlay
        this.ctx.fillStyle = this.options.secondaryColor;
        this.ctx.font = '12px Inter, sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('Click to start recording', width / 2, height - 10);
    }
    
    drawErrorVisualization() {
        const width = this.canvas.width / (window.devicePixelRatio || 1);
        const height = this.canvas.height / (window.devicePixelRatio || 1);
        
        // Clear canvas
        this.ctx.fillStyle = this.options.backgroundColor;
        this.ctx.fillRect(0, 0, width, height);
        
        // Draw error indicator
        this.ctx.fillStyle = '#ff4444';
        this.ctx.font = '14px Inter, sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('Audio visualization unavailable', width / 2, height / 2);
        
        // Draw error icon
        this.ctx.fillStyle = '#ff4444';
        this.ctx.beginPath();
        this.ctx.arc(width / 2, height / 2 - 30, 15, 0, 2 * Math.PI);
        this.ctx.fill();
        
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = '20px Inter, sans-serif';
        this.ctx.fillText('!', width / 2, height / 2 - 25);
    }
    
    drawProcessingVisualization() {
        const width = this.canvas.width / (window.devicePixelRatio || 1);
        const height = this.canvas.height / (window.devicePixelRatio || 1);
        
        // Clear canvas
        this.ctx.fillStyle = this.options.backgroundColor;
        this.ctx.fillRect(0, 0, width, height);
        
        // Draw processing animation
        const time = Date.now() * 0.005;
        const barCount = 32;
        const totalBarWidth = width * 0.8;
        const barWidth = totalBarWidth / barCount;
        const startX = (width - totalBarWidth) / 2;
        
        for (let i = 0; i < barCount; i++) {
            const phase = (i / barCount) * Math.PI * 2;
            const barHeight = (Math.sin(time + phase) * 0.5 + 0.5) * height * 0.6;
            
            const x = startX + i * barWidth;
            const y = height - barHeight;
            
            // Create gradient
            const gradient = this.ctx.createLinearGradient(0, height, 0, y);
            gradient.addColorStop(0, '#ffaa00');
            gradient.addColorStop(1, '#ff8800');
            
            this.ctx.fillStyle = gradient;
            this.ctx.fillRect(x, y, barWidth - 1, barHeight);
        }
        
        // Add processing text
        this.ctx.fillStyle = '#ffaa00';
        this.ctx.font = '12px Inter, sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('Processing...', width / 2, 20);
    }
    
    updateVolumeIndicator(level) {
        const volumeIndicator = document.getElementById('volumeIndicator');
        if (volumeIndicator) {
            if (level > 0.1) {
                volumeIndicator.classList.add('active');
                volumeIndicator.style.transform = `scale(${1 + level})`;
                volumeIndicator.style.opacity = Math.min(1, level * 2);
            } else {
                volumeIndicator.classList.remove('active');
                volumeIndicator.style.transform = 'scale(1)';
                volumeIndicator.style.opacity = '0';
            }
        }
    }
    
    // Public methods for different states
    showProcessing() {
        this.isActive = false;
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }
        
        const animate = () => {
            this.drawProcessingVisualization();
            if (this.isProcessing) {
                requestAnimationFrame(animate);
            }
        };
        
        this.isProcessing = true;
        animate();
    }
    
    hideProcessing() {
        this.isProcessing = false;
        this.drawStaticVisualization();
    }
    
    resize() {
        this.setupCanvas();
        if (!this.isActive) {
            this.drawStaticVisualization();
        }
    }
    
    destroy() {
        this.stopVisualization();
        this.canvas = null;
        this.ctx = null;
    }
}

// Export for use in other scripts
window.AudioVisualizer = AudioVisualizer;
