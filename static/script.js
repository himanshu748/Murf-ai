(() => {
  const sidEl = document.getElementById('sid');
  const tokensEl = document.getElementById('tokens');
  const historyEl = document.getElementById('history');
  const progressEl = document.getElementById('progress');
  const dotEl = document.getElementById('conn-dot');
  const connTextEl = document.getElementById('conn-text');
  const btnEcho = document.getElementById('btn-echo');
  const btnRec = document.getElementById('btn-rec');
  const btnClear = document.getElementById('btn-clear');
  const typingUi = document.getElementById('typing');
  const btnToggleTokens = document.getElementById('btn-toggle-tokens');
  const btnToggleDebug = document.getElementById('btn-toggle-debug');
  const tokensWrapEl = document.getElementById('tokens-wrap');
  const debugCardEl = document.getElementById('debug-card');
  
  // New UI elements for improved design
  const modeValueEl = document.getElementById('mode-value');
  const recValueEl = document.getElementById('rec-value');
  const sttValueEl = document.getElementById('stt-value');
  const murfValueEl = document.getElementById('murf-value');
  const vadValueEl = document.getElementById('vad-value');
  const meterBarEl = document.getElementById('meter-bar');
  const micTimerEl = document.getElementById('mic-timer');
  const audioEl = document.getElementById('tts-audio');
  const waveCanvas = document.getElementById('wave-canvas');
  const waveCtx = waveCanvas ? waveCanvas.getContext('2d') : null;
  

  let ws = null;
  let connected = false;
  let streamingMode = true;
  let sessionId = window.SESSION_ID || (new URLSearchParams(location.search).get('session'));
  let mediaRecorder = null; // legacy recorder to backend (fallback)
  let mediaStream = null;
  let isRecording = false;

  // AssemblyAI Realtime STT state
  let aaiWs = null;
  let aaiConnected = false;
  let audioContext = null;
  let sourceNode = null;
  let processorNode = null;

  // TTS playback state
  let ttsAudioEl = audioEl || null;
  let lastAudioUrl = null;
  let currentPlaybackRate = 1.0;
  
  if (ttsAudioEl) {
    // Fixed playback rate per README scope
    try { ttsAudioEl.playbackRate = currentPlaybackRate; } catch {}
    ttsAudioEl.addEventListener('playing', () => {
      setMurf('streaming');
      // Update UI to show audio is playing
      if (murfValueEl) murfValueEl.style.color = 'var(--primary)';
    });
    
    const backToConn = () => {
      setMurf(connected ? 'connected' : 'disconnected');
      // Update UI to show audio stopped
      if (murfValueEl) murfValueEl.style.color = connected ? 'var(--success)' : 'var(--danger)';
    };
    
    ttsAudioEl.addEventListener('pause', backToConn);
    ttsAudioEl.addEventListener('ended', backToConn);
    ttsAudioEl.addEventListener('error', (e) => {
      console.error('Audio playback error:', e);
      appendHistory('error', 'Audio playback failed');
      backToConn();
    });
    
      // Add volume control
  ttsAudioEl.volume = 0.8; // Set default volume
  
  // Add keyboard shortcuts for audio control
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    
    switch(e.code) {
      case 'Space':
        e.preventDefault();
        if (ttsAudioEl.paused) {
          ttsAudioEl.play();
        } else {
          ttsAudioEl.pause();
        }
        break;
      case 'ArrowRight':
        e.preventDefault();
        ttsAudioEl.currentTime = Math.min(ttsAudioEl.duration, ttsAudioEl.currentTime + 5);
        break;
      case 'ArrowLeft':
        e.preventDefault();
        ttsAudioEl.currentTime = Math.max(0, ttsAudioEl.currentTime - 5);
        break;
      case 'ArrowUp':
        e.preventDefault();
        ttsAudioEl.volume = Math.min(1, ttsAudioEl.volume + 0.1);
        break;
      case 'ArrowDown':
        e.preventDefault();
        ttsAudioEl.volume = Math.max(0, ttsAudioEl.volume - 0.1);
        break;
      case 'KeyM':
        e.preventDefault();
        ttsAudioEl.muted = !ttsAudioEl.muted;
        break;
      case 'KeyR':
        e.preventDefault();
        if (isRecording) {
          stopRecording();
        } else {
          startRecording();
        }
        break;
    }
  });
  
  // Add tooltip for keyboard shortcuts
  const tooltip = document.createElement('div');
  tooltip.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: rgba(0, 0, 0, 0.8);
    color: white;
    padding: 10px;
    border-radius: 8px;
    font-size: 12px;
    z-index: 1000;
    opacity: 0;
    transition: opacity 0.3s ease;
    pointer-events: none;
  `;
  tooltip.innerHTML = `
    <strong>Keyboard Shortcuts:</strong><br>
    Space: Play/Pause<br>
    ←→: Seek ±5s<br>
    ↑↓: Volume ±10%<br>
    M: Mute/Unmute<br>
    R: Start/Stop Recording
  `;
  document.body.appendChild(tooltip);
  
  // Show tooltip on hover over audio controls
  const audioControls = document.querySelector('.audio-controls');
  if (audioControls) {
    audioControls.addEventListener('mouseenter', () => {
      tooltip.style.opacity = '1';
    });
    audioControls.addEventListener('mouseleave', () => {
      tooltip.style.opacity = '0';
    });
  }
  }

  // Mic meter + timer state
  let recTimerId = null;
  let recStartedAt = 0;
  // Waveform + VAD + Murf status timers
  let analyser = null;
  let waveAnimId = 0;
  let vadState = 'idle';
  let vadLastChange = 0;
  let murfStatusTimeout = null;
  // Client-side accumulator for streamed base64 audio chunks
  let ttsChunkBuffer = [];
  // Expose for debugging/inspection in DevTools
  try { window.ttsChunkBuffer = ttsChunkBuffer; } catch {}
  // Pruning thresholds to prevent unbounded memory growth
  const TTS_BUFFER_MAX = 300;
  const TTS_BUFFER_PRUNE_TO = 200;

  // Streaming TTS playback via Web Audio API
  let ttsUseWebAudio = true; // feature flag
  let ttsCtx = null;        // dedicated playback context
  let ttsGain = null;       // master gain
  let ttsPlayhead = 0;      // scheduled time of the end of last chunk
  let ttsContextId = null;  // Murf context we're currently rendering
  let ttsNodes = [];        // scheduled BufferSource nodes
  let ttsPrerollSec = 0.15; // reduced preroll for faster response
  let ttsMinLeadSec = 0.05; // reduced minimum lead for tighter timing
  let ttsCompleteTimer = null; // timer to reset status after final chunk plays out
  let ttsChunkQueue = [];   // queue for chunks that arrive before context is ready
  let ttsIsPlaying = false; // track if audio is currently playing
  let ttsFadeInGain = null; // fade-in gain for smooth start
  let ttsFadeOutGain = null; // fade-out gain for smooth end
  
  // Enhanced streaming audio state for seamless playback
  let ttsStreamingStatus = 'idle'; // 'idle', 'buffering', 'playing', 'finalizing'
  let ttsChunkCount = 0;
  let ttsTotalBytes = 0;
  let ttsStartTime = 0;
  let ttsLastChunkTime = 0;
  let ttsAudioQuality = 'good'; // 'good', 'degraded', 'poor'
  let ttsDropoutCount = 0;
  let ttsLatencyHistory = [];
  
  // Seamless audio playback state
  let ttsAudioBuffer = [];        // Circular buffer for audio chunks
  let ttsBufferSize = 10;         // Number of chunks to buffer before playing
  let ttsIsBuffering = true;      // Whether we're in buffering mode
  let ttsPlaybackStarted = false; // Whether playback has actually started
  let ttsCrossfadeDuration = 0.05; // Crossfade duration for seamless transitions
  let ttsLastChunkEndTime = 0;    // End time of the last played chunk
  
  // Parsed WAV format state (for manual PCM fallback)
  let wavFmt = null; // { sampleRate, channels, bitsPerSample, audioFormat }

  function wsUrl() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${location.host}/ws?session=${encodeURIComponent(sessionId)}`;
    }

  function setConnected(on) {
    connected = on;
    if (on) {
      if (dotEl) {
        dotEl.classList.add('ok');
        try { dotEl.classList.remove('err'); } catch {}
      }
      if (connTextEl) connTextEl.textContent = 'Connected';
    } else {
      if (dotEl) {
        dotEl.classList.remove('ok');
        try { dotEl.classList.add('err'); } catch {}
      }
      if (connTextEl) connTextEl.textContent = 'Disconnected';
    }
  }

  // -------- Streaming TTS (Web Audio) --------
  function resumeStreamingAudio() {
    try {
      if (!ttsUseWebAudio) return;
      const ctx = getTtsCtx();
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().then(() => {
          console.log('Audio context resumed successfully');
          // Process any queued chunks
          if (ttsChunkQueue && ttsChunkQueue.length > 0) {
            processAudioQueue();
          }
        }).catch(err => {
          console.warn('Failed to resume audio context:', err);
        });
      }
      
      // Optimize audio context for streaming
      if (ctx && ctx.state === 'running') {
        // Set optimal latency hint for streaming
        if (ctx.baseLatency) {
          console.log('Audio context base latency:', ctx.baseLatency);
        }
        
        // Process any queued chunks
        if (ttsChunkQueue && ttsChunkQueue.length > 0) {
          processAudioQueue();
        }
      }
    } catch (err) {
      console.warn('Error resuming streaming audio:', err);
    }
  }

  // Enhanced streaming status management
  function updateStreamingStatus(status, data = {}) {
    ttsStreamingStatus = status;
    
    // Update UI elements
    const statusEl = document.getElementById('streaming-status');
    const barsEl = document.getElementById('audio-bars');
    
    if (statusEl) {
      switch (status) {
        case 'idle':
          statusEl.textContent = 'Waiting for audio...';
          statusEl.style.color = 'var(--text3)';
          break;
        case 'buffering':
          statusEl.textContent = `Buffering... (${data.chunks || 0} chunks)`;
          statusEl.style.color = 'var(--warning)';
          break;
        case 'playing':
          statusEl.textContent = `Playing (${data.chunks || 0} chunks, ${data.duration || 0}s)`;
          statusEl.style.color = 'var(--success)';
          break;
        case 'finalizing':
          statusEl.textContent = `Finalizing... (${data.chunks || 0} chunks)`;
          statusEl.style.color = 'var(--primary)';
          break;
      }
    }
    
    // Update visual bars
    if (barsEl) {
      if (status === 'playing' || status === 'finalizing') {
        barsEl.classList.add('active');
      } else {
        barsEl.classList.remove('active');
      }
    }
    
    // Update Murf status badge
    if (status === 'playing' || status === 'finalizing') {
      setMurf('streaming');
    } else if (status === 'buffering') {
      setMurf('buffering');
    }
    
    // Update streaming indicators
    updateStreamingIndicators();
  }
  
  // Update streaming audio indicators
  function updateStreamingIndicators() {
    const qualityEl = document.getElementById('quality-indicator');
    const bufferEl = document.getElementById('buffer-indicator');
    const dropoutEl = document.getElementById('dropout-indicator');
    
    if (qualityEl) {
      const qualityColors = {
        'good': '🟢',
        'degraded': '🟡',
        'poor': '🔴'
      };
      qualityEl.textContent = `${qualityColors[ttsAudioQuality] || '⚪'} ${ttsAudioQuality}`;
      qualityEl.style.color = ttsAudioQuality === 'good' ? 'var(--success)' : 
                             ttsAudioQuality === 'degraded' ? 'var(--warning)' : 'var(--danger)';
    }
    
    if (bufferEl) {
      const bufferStatus = ttsIsBuffering ? 
        `Buffering (${ttsAudioBuffer.length}/${ttsBufferSize})` : 
        `${ttsBufferSize} chunks`;
      bufferEl.textContent = bufferStatus;
      bufferEl.style.color = ttsIsBuffering ? 'var(--warning)' : 'var(--success)';
    }
    
    if (dropoutEl) {
      dropoutEl.textContent = ttsDropoutCount.toString();
      dropoutEl.style.color = ttsDropoutCount > 5 ? 'var(--danger)' : 
                              ttsDropoutCount > 2 ? 'var(--warning)' : 'var(--success)';
    }
    
    // Update streaming status with buffer information
    const statusEl = document.getElementById('streaming-status');
    if (statusEl && ttsStreamingStatus === 'buffering') {
      statusEl.textContent = `Buffering... (${ttsAudioBuffer.length}/${ttsBufferSize} chunks)`;
    }
  }
  
  // Enhanced streaming progress display with seamless playback metrics
  function updateStreamingProgress() {
    if (!progressEl) return;
    
    if (ttsStreamingStatus === 'idle') {
      progressEl.textContent = 'chunks=0 bytes=0 duration=0s quality=idle buffer=0';
    } else {
      const totalDuration = ttsStartTime > 0 ? (Date.now() - ttsStartTime) / 1000 : 0;
      const qualityColor = ttsAudioQuality === 'good' ? '🟢' : 
                          ttsAudioQuality === 'degraded' ? '🟡' : '🔴';
      const bufferStatus = ttsIsBuffering ? 'buffering' : 'ready';
      const crossfadeMs = (ttsCrossfadeDuration * 1000).toFixed(1);
      
      progressEl.textContent = `chunks=${ttsChunkCount} bytes=${ttsTotalBytes} duration=${totalDuration.toFixed(1)}s quality=${qualityColor}${ttsAudioQuality} buffer=${bufferStatus} crossfade=${crossfadeMs}ms`;
    }
  }

  function getTtsCtx() {
    if (!ttsUseWebAudio) return null;
    if (!ttsCtx) {
      try {
        // Separate context from STT capture context with optimized settings
        const AC = window.AudioContext || window.webkitAudioContext;
        ttsCtx = new AC({
          latencyHint: 'interactive',
          sampleRate: 44100,
          sampleSize: 16
        });
        
        // Optimize for low-latency streaming
        if (ttsCtx.destination.maxChannelCount > 0) {
          ttsCtx.destination.channelCount = 2; // Stereo output
        }
        
        ttsGain = ttsCtx.createGain();
        ttsGain.gain.value = 1.0;
        ttsGain.connect(ttsCtx.destination);
        
        // Create fade controls for smooth audio transitions
        ttsFadeInGain = ttsCtx.createGain();
        ttsFadeOutGain = ttsCtx.createGain();
        ttsFadeInGain.gain.value = 0;
        ttsFadeOutGain.gain.value = 1.0;
        
        // Connect fade chain: source -> fadeIn -> fadeOut -> master -> destination
        ttsFadeInGain.connect(ttsFadeOutGain);
        ttsFadeOutGain.connect(ttsGain);
        
        // Create a compressor for better audio quality
        try {
          const compressor = ttsCtx.createDynamicsCompressor();
          compressor.threshold.value = -24;
          compressor.knee.value = 30;
          compressor.ratio.value = 12;
          compressor.attack.value = 0.003;
          compressor.release.value = 0.25;
          
          // Insert compressor in the chain
          ttsFadeOutGain.disconnect();
          ttsFadeOutGain.connect(compressor);
          compressor.connect(ttsGain);
        } catch (e) {
          // Compressor not supported, continue without it
          console.warn('Audio compressor not supported:', e);
        }
        
        ttsPlayhead = 0;
      } catch (e) {
        // If AudioContext cannot be created, disable streaming path
        ttsUseWebAudio = false;
        ttsCtx = null;
      }
    }
    return ttsCtx;
  }

  function resetStreamingTts(hard = false) {
    try { if (ttsCompleteTimer) clearTimeout(ttsCompleteTimer); } catch {}
    ttsCompleteTimer = null;
    // Stop any scheduled nodes
    try {
      ttsNodes.forEach(n => { try { n.stop(0); } catch {} });
    } catch {}
    ttsNodes = [];
    ttsPlayhead = 0;
    ttsContextId = null;
    ttsIsPlaying = false;
    ttsChunkQueue = [];
    
    // Reset enhanced streaming state
    ttsStreamingStatus = 'idle';
    ttsChunkCount = 0;
    ttsTotalBytes = 0;
    ttsStartTime = 0;
    ttsLastChunkTime = 0;
    ttsAudioQuality = 'good';
    ttsDropoutCount = 0;
    ttsLatencyHistory = [];
    
    // Reset seamless playback state
    ttsAudioBuffer = [];
    ttsIsBuffering = true;
    ttsPlaybackStarted = false;
    ttsLastChunkEndTime = 0;
    
    // Clear remembered WAV format so future headerless chunks don't reuse stale format
    wavFmt = null;
    
    // On hard resets, also clear accumulated debug buffer without breaking the reference
    if (hard) {
      try { if (Array.isArray(ttsChunkBuffer)) ttsChunkBuffer.length = 0; } catch {}
    }
    if (hard) {
      try { if (ttsCtx && ttsCtx.state !== 'closed') ttsCtx.close(); } catch {}
      ttsCtx = null; ttsGain = null; ttsFadeInGain = null; ttsFadeOutGain = null;
    }
    
    // Update UI status
    updateStreamingStatus('idle');
    
    console.log('[Seamless] Streaming system reset');
  }

  function decodeAudioBuffer(ctx, arrayBuffer) {
    return new Promise((resolve, reject) => {
      try {
        // Safari may only support callback form
        ctx.decodeAudioData(arrayBuffer, (buf) => resolve(buf), (err) => reject(err));
      } catch (e) {
        // Some browsers support promise form
        try {
          ctx.decodeAudioData(arrayBuffer).then(resolve).catch(reject);
        } catch (err) {
          reject(err);
        }
      }
    });
  }

  // -------- Enhanced Audio Chunk Management --------
  function queueAudioChunk(chunk) {
    if (!ttsChunkQueue) ttsChunkQueue = [];
    ttsChunkQueue.push(chunk);
    
    // Track streaming statistics
    ttsChunkCount++;
    ttsTotalBytes += (chunk.b64 || '').length;
    
    if (ttsStartTime === 0) {
      ttsStartTime = Date.now();
    }
    ttsLastChunkTime = Date.now();
    
    // Add to seamless audio buffer
    if (!ttsAudioBuffer) ttsAudioBuffer = [];
    ttsAudioBuffer.push(chunk);
    
    // Maintain circular buffer size
    if (ttsAudioBuffer.length > ttsBufferSize * 2) {
      ttsAudioBuffer = ttsAudioBuffer.slice(-ttsBufferSize);
    }
    
    // Update streaming status
    if (ttsStreamingStatus === 'idle') {
      updateStreamingStatus('buffering', { chunks: ttsChunkCount });
    } else if (ttsStreamingStatus === 'buffering') {
      updateStreamingStatus('buffering', { chunks: ttsChunkCount });
    }
    
    // Check if we have enough chunks to start seamless playback
    if (ttsIsBuffering && ttsAudioBuffer.length >= ttsBufferSize) {
      ttsIsBuffering = false;
      console.log(`[Seamless] Buffer filled with ${ttsAudioBuffer.length} chunks, starting playback`);
      updateStreamingStatus('playing', { chunks: ttsChunkCount });
    }
    
    // Process queue if context is ready
    if (ttsCtx && ttsCtx.state === 'running') {
      processAudioQueue();
    }
  }
  
  // Enhanced audio queue processing with seamless playback
  async function processAudioQueue() {
    if (!ttsChunkQueue || ttsChunkQueue.length === 0) return;
    
    // If we're still buffering, wait for more chunks
    if (ttsIsBuffering && ttsAudioBuffer.length < ttsBufferSize) {
      console.log(`[Seamless] Buffering: ${ttsAudioBuffer.length}/${ttsBufferSize} chunks`);
      return;
    }
    
    while (ttsChunkQueue.length > 0) {
      const chunk = ttsChunkQueue.shift();
      await handleAudioChunkStreaming(chunk);
    }
  }
  
  // Advanced audio buffering for seamless playback
  function createAudioBufferPool(ctx, sampleRate = 44100, channels = 2) {
    const pool = [];
    const bufferSize = 4096; // Optimal buffer size for streaming
    
    for (let i = 0; i < 4; i++) {
      const buffer = ctx.createBuffer(channels, bufferSize, sampleRate);
      pool.push(buffer);
    }
    
    return pool;
  }
  
  function getOptimalBufferSize(sampleRate) {
    // Calculate optimal buffer size based on sample rate
    const targetLatency = 0.1; // 100ms target latency
    return Math.pow(2, Math.ceil(Math.log2(sampleRate * targetLatency)));
  }
  
  // -------- WAV/PCM manual decode fallback (for chunked WAV without full headers) --------
  function _str4(bytes, off) {
    return String.fromCharCode(bytes[off], bytes[off+1], bytes[off+2], bytes[off+3]);
  }
  function _u16(bytes, off) { return (bytes[off]) | (bytes[off+1] << 8); }
  function _u32(bytes, off) { return (bytes[off]) | (bytes[off+1] << 8) | (bytes[off+2] << 16) | (bytes[off+3] << 24); }

  function parseWavHeader(bytes) {
    try {
      if (!bytes || bytes.length < 12) return null;
      if (_str4(bytes, 0) !== 'RIFF' || _str4(bytes, 8) !== 'WAVE') return null;
      let off = 12;
      let fmt = null;
      let dataOffset = null;
      let dataSize = null;
      while (off + 8 <= bytes.length) {
        const id = _str4(bytes, off);
        const size = _u32(bytes, off + 4);
        off += 8;
        if (id === 'fmt ') {
          const audioFormat = _u16(bytes, off + 0);
          const channels = _u16(bytes, off + 2) || 1;
          const sampleRate = _u32(bytes, off + 4) || 44100;
          const bitsPerSample = _u16(bytes, off + 14) || 16;
          fmt = { audioFormat, channels, sampleRate, bitsPerSample };
        } else if (id === 'data') {
          dataOffset = off;
          dataSize = Math.max(0, Math.min(size, bytes.length - off));
          break; // assume data is last we care about
        }
        off += size + (size % 2); // chunks are word-aligned
      }
      if (!fmt || dataOffset == null) return null;
      return { fmt, dataOffset, dataSize };
    } catch { return null; }
  }

  function pcmBytesToAudioBuffer(ctx, bytes, fmt) {
    const ch = Math.max(1, fmt.channels || 1);
    const bps = Math.max(8, fmt.bitsPerSample || 16);
    const bytesPerSample = bps / 8;
    if (!bytes || bytes.length < ch * bytesPerSample) return null;
    const totalFrames = Math.floor(bytes.length / (ch * bytesPerSample));
    if (totalFrames <= 0) return null;
    const sampleRate = Math.max(8000, fmt.sampleRate || 44100);

    const abuf = ctx.createBuffer(ch, totalFrames, sampleRate);

    // Use DataView for aligned reads (supports Float32 and int parsing)
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const isFloat = (fmt.audioFormat === 3) || (bps === 32 && fmt.float === true);

    for (let c = 0; c < ch; c++) {
      const chData = abuf.getChannelData(c);
      let ptr = c * bytesPerSample; // interleaved
      for (let i = 0; i < totalFrames; i++, ptr += ch * bytesPerSample) {
        let v = 0;
        if (isFloat && bytesPerSample === 4) {
          v = dv.getFloat32(ptr, true);
        } else {
          // Assume signed PCM little-endian
          if (bytesPerSample === 2) {
            v = dv.getInt16(ptr, true) / 0x8000;
          } else if (bytesPerSample === 3) {
            // 24-bit PCM
            const b0 = dv.getUint8(ptr);
            const b1 = dv.getUint8(ptr + 1);
            const b2 = dv.getUint8(ptr + 2);
            let s = (b0 | (b1 << 8) | (b2 << 16));
            if (s & 0x800000) s |= 0xFF000000;
            v = s / 0x800000;
          } else if (bytesPerSample === 4) {
            v = dv.getInt32(ptr, true) / 0x80000000;
          } else {
            // Unsupported depth, default to silence
            v = 0;
          }
        }
        chData[i] = Math.max(-1, Math.min(1, v));
      }
    }
    
    // Apply subtle crossfade preparation for seamless transitions
    if (totalFrames > 100) {
      const fadeSamples = Math.min(50, Math.floor(totalFrames * 0.1));
      for (let c = 0; c < ch; c++) {
        const chData = abuf.getChannelData(c);
        // Fade in
        for (let i = 0; i < fadeSamples; i++) {
          const fade = i / fadeSamples;
          chData[i] *= fade;
        }
        // Fade out
        for (let i = 0; i < fadeSamples; i++) {
          const fade = (fadeSamples - i) / fadeSamples;
          const idx = totalFrames - fadeSamples + i;
          if (idx >= 0 && idx < totalFrames) {
            chData[idx] *= fade;
          }
        }
      }
    }
    
    return abuf;
  }

  // Provide user guidance for streaming issues
  function provideStreamingGuidance() {
    const guidance = [];
    
    if (ttsDropoutCount > 5) {
      guidance.push('Multiple audio dropouts detected. Try refreshing the page.');
    }
    
    if (ttsAudioQuality === 'poor') {
      guidance.push('Audio quality is poor. Check your internet connection.');
    }
    
    if (ttsMinLeadSec > 0.2) {
      guidance.push('High buffer size detected. Audio may have delays.');
    }
    
    if (guidance.length > 0) {
      const guidanceText = guidance.join(' ');
      appendHistory('error', guidanceText);
      
      // Also show in streaming status
      const statusEl = document.getElementById('streaming-status');
      if (statusEl) {
        statusEl.textContent += ' - ' + guidanceText;
        statusEl.style.color = 'var(--danger)';
      }
    }
  }
  
  // Enhanced error handling with user guidance
  function handleStreamingError(error, context = '') {
    console.error(`[Streaming Error] ${context}:`, error);
    
    // Increment dropout counter
    ttsDropoutCount++;
    
    // Update audio quality based on error frequency
    if (ttsDropoutCount > 10) {
      ttsAudioQuality = 'poor';
    } else if (ttsDropoutCount > 5) {
      ttsAudioQuality = 'degraded';
    }
    
    // Provide user feedback
    if (ttsDropoutCount === 1) {
      appendHistory('error', 'Audio streaming issue detected. Attempting to recover...');
    } else if (ttsDropoutCount === 5) {
      appendHistory('error', 'Multiple audio issues detected. Consider refreshing the page.');
    }
    
    // Attempt recovery by adjusting buffer size
    ttsMinLeadSec = Math.min(0.3, ttsMinLeadSec * 1.2);
    
    // Update streaming status
    updateStreamingStatus('buffering', { chunks: ttsChunkCount });
    
    // Log recovery attempt
    console.log(`[Streaming] Recovery attempt: increased buffer to ${ttsMinLeadSec.toFixed(3)}s`);
    
    // Provide guidance after multiple errors
    if (ttsDropoutCount >= 3) {
      provideStreamingGuidance();
    }
  }
  
  // Enhanced error handling in audio chunk processing
  async function handleAudioChunkStreaming(msg) {
    if (!ttsUseWebAudio) return;
    const b64 = msg?.b64 || '';
    if (!b64) return;
    const ctxId = msg?.context_id || null;
    const ctx = getTtsCtx();
    if (!ctx) return;

    // If a new Murf context arrives, stop current playback and start fresh
    if (ctxId && ttsContextId && ctxId !== ttsContextId) {
      console.log('[Streaming] New context detected, resetting playback');
      resetStreamingTts(true);
    }
    if (!ttsContextId && ctxId) {
      ttsContextId = ctxId;
      // Provide a small preroll buffer before first sound
      ttsPlayhead = Math.max(ttsPlayhead, ctx.currentTime + ttsPrerollSec);
    }

    try {
      const bytes = base64ToUint8(b64);
      let audioBuf = null;

      // Prefer fast manual WAV/PCM path if header present or format known
      let dataBytes = null;
      const hdr = parseWavHeader(bytes);
      if (hdr && hdr.fmt) {
        wavFmt = hdr.fmt; // remember for subsequent headerless chunks
        dataBytes = bytes.subarray(hdr.dataOffset, hdr.dataOffset + (hdr.dataSize || (bytes.length - hdr.dataOffset)));
      } else if (wavFmt) {
        dataBytes = bytes; // subsequent raw PCM continuation
      }

      if (dataBytes && wavFmt) {
        audioBuf = pcmBytesToAudioBuffer(ctx, dataBytes, wavFmt);
      }

      if (!audioBuf) {
        // Fallback: try general decoder (works if each chunk is self-contained)
        const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
        try {
          audioBuf = await decodeAudioBuffer(ctx, buf);
        } catch (e) {
          // As last resort, drop chunk quietly (avoid crashing stream)
          console.warn('Streaming chunk undecodable (no WAV header and decodeAudioData failed)');
          handleStreamingError(e, 'Audio decode failed');
          return;
        }
      }

      // Calculate precise timing for seamless playback
      const now = ctx.currentTime;
      let startAt;
      
      if (!ttsPlaybackStarted) {
        // First chunk - start immediately with preroll
        startAt = Math.max(now + ttsPrerollSec, ttsPlayhead);
        ttsPlaybackStarted = true;
        ttsLastChunkEndTime = startAt;
      } else {
        // Subsequent chunks - ensure seamless connection
        startAt = Math.max(ttsLastChunkEndTime, now + ttsMinLeadSec);
        
        // Add small overlap to prevent gaps
        const overlap = Math.min(ttsCrossfadeDuration, audioBuf.duration * 0.1);
        startAt -= overlap;
      }
      
      // Create buffer source and connect through fade chain
      const node = ctx.createBufferSource();
      node.buffer = audioBuf;
      
      // Apply playback rate based on current UI selection
      try { 
        node.playbackRate.value = Number.isFinite(currentPlaybackRate) ? currentPlaybackRate : 1.0; 
      } catch {}
      
      // Create individual gain node for this chunk for crossfading
      const chunkGain = ctx.createGain();
      chunkGain.gain.value = 1.0;
      
      // Connect: source -> chunkGain -> fadeIn -> fadeOut -> master -> destination
      try { 
        node.connect(chunkGain);
        chunkGain.connect(ttsFadeInGain); 
      } catch { 
        try { 
          node.connect(chunkGain);
          chunkGain.connect(ttsGain); 
        } catch {} 
      }
      
      // Schedule the audio with precise timing
      try { 
        node.start(startAt); 
        ttsIsPlaying = true;
      } catch (e) { 
        console.warn('Failed to start audio node:', e);
        handleStreamingError(e, 'Audio node start failed');
        return;
      }
      
      ttsNodes.push(node);
      const rate = Number.isFinite(currentPlaybackRate) ? currentPlaybackRate : 1.0;
      const chunkDuration = audioBuf.duration / rate;
      
      // Update playhead and last chunk end time for seamless connection
      ttsPlayhead = startAt + chunkDuration;
      ttsLastChunkEndTime = startAt + chunkDuration;

      // Apply crossfading for seamless transitions
      if (ttsPlaybackStarted && ttsNodes.length > 1) {
        // Crossfade with previous chunk
        const crossfadeStart = startAt;
        const crossfadeEnd = startAt + ttsCrossfadeDuration;
        
        // Fade in current chunk
        chunkGain.gain.setValueAtTime(0, crossfadeStart);
        chunkGain.gain.linearRampToValueAtTime(1.0, crossfadeEnd);
        
        // Fade out previous chunk if it's still playing
        if (ttsNodes.length > 1) {
          const prevNode = ttsNodes[ttsNodes.length - 2];
          if (prevNode && prevNode.buffer) {
            const prevGain = prevNode.gain || ttsFadeOutGain;
            if (prevGain) {
              prevGain.gain.setValueAtTime(1.0, crossfadeStart);
              prevGain.gain.linearRampToValueAtTime(0, crossfadeEnd);
            }
          }
        }
      } else {
        // First chunk - simple fade in
        chunkGain.gain.setValueAtTime(0, startAt);
        chunkGain.gain.linearRampToValueAtTime(1.0, startAt + 0.1);
      }

      // Apply fade-out effect for final chunk
      if (msg?.final) {
        const fadeOutStart = ttsLastChunkEndTime - 0.1;
        chunkGain.gain.setValueAtTime(1.0, fadeOutStart);
        chunkGain.gain.linearRampToValueAtTime(0, ttsLastChunkEndTime);
      }

      // Update streaming status
      if (msg?.final) {
        updateStreamingStatus('finalizing', { 
          chunks: ttsChunkCount, 
          duration: Math.round((ttsLastChunkEndTime - ttsStartTime / 1000) * 10) / 10 
        });
      } else {
        updateStreamingStatus('playing', { 
          chunks: ttsChunkCount, 
          duration: Math.round((ttsLastChunkEndTime - ttsStartTime / 1000) * 10) / 10 
        });
      }

      // Monitor audio quality and timing
      const latency = startAt - now;
      ttsLatencyHistory.push(latency);
      if (ttsLatencyHistory.length > 10) {
        ttsLatencyHistory.shift();
      }
      
      // Calculate average latency and adjust buffer size
      const avgLatency = ttsLatencyHistory.reduce((a, b) => a + b, 0) / ttsLatencyHistory.length;
      if (avgLatency > 0.2) {
        ttsAudioQuality = 'poor';
        ttsMinLeadSec = Math.min(0.3, ttsMinLeadSec * 1.1);
      } else if (avgLatency > 0.1) {
        ttsAudioQuality = 'degraded';
        ttsMinLeadSec = Math.min(0.2, ttsMinLeadSec * 1.05);
      } else {
        ttsAudioQuality = 'good';
        ttsMinLeadSec = Math.max(0.02, ttsMinLeadSec * 0.98);
      }

      if (msg?.final) {
        // After final chunk is scheduled, return status once playback finishes
        try { if (ttsCompleteTimer) clearTimeout(ttsCompleteTimer); } catch {}
        const remainSec = Math.max(0, ttsLastChunkEndTime - ctx.currentTime);
        ttsCompleteTimer = setTimeout(() => {
          setMurf(connected ? 'connected' : 'disconnected');
          ttsIsPlaying = false;
          updateStreamingStatus('idle');
          
          // Log streaming statistics
          const totalDuration = (Date.now() - ttsStartTime) / 1000;
          console.log(`[Streaming] Complete: ${ttsChunkCount} chunks, ${ttsTotalBytes} bytes, ${totalDuration.toFixed(2)}s, Quality: ${ttsAudioQuality}, Dropouts: ${ttsDropoutCount}`);
          
          // Log comprehensive seamless performance summary
          logSeamlessPerformance();
        }, Math.max(100, Math.floor(remainSec * 1000) + 80));
      }
    } catch (err) {
      // Decoding failed; keep logging for debugging but don't crash UI
      console.warn('Streaming audio decode failed', err);
      handleStreamingError(err, 'General audio processing error');
    }
  }

  function appendToken(t) {
    if (!tokensEl) return;
    const span = document.createElement('span');
    span.textContent = t;
    tokensEl.appendChild(span);
    tokensEl.scrollTop = tokensEl.scrollHeight;
  }

  function appendHistory(role, content) {
    const div = document.createElement('div');
    div.className = `msg ${role}`;
    div.textContent = content;
    historyEl.appendChild(div);
    historyEl.scrollTop = historyEl.scrollHeight;
  }

  function setTyping(on) {
    if (!typingUi) return;
    typingUi.style.display = on ? '' : 'none';
  }

  function base64ToUint8(b64) {
    const binary = atob(b64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function playTtsAudio(b64, mime = 'audio/mpeg') {
    try {
      if (!ttsAudioEl) {
        // If UI <audio> missing, fallback to invisible auto-play element
        ttsAudioEl = new Audio();
        ttsAudioEl.autoplay = true;
      }
      // Prefer direct data URL to avoid atob issues in some environments
      const dataUrl = `data:${mime || 'audio/mpeg'};base64,${b64}`;
      if (lastAudioUrl) {
        // Best effort cleanup if previous was an object URL
        try { URL.revokeObjectURL(lastAudioUrl); } catch {}
        lastAudioUrl = null;
      }
      ttsAudioEl.src = dataUrl;
      try { ttsAudioEl.playbackRate = currentPlaybackRate; } catch {}
      const p = ttsAudioEl.play();
      if (p && typeof p.catch === 'function') {
        p.catch(() => {
          appendHistory('tts', 'Autoplay blocked; click anywhere to allow audio.');
        });
      }
    } catch (e) {
      // Fallback: base64 -> Uint8Array -> Blob -> object URL
      try {
        const bytes = base64ToUint8(b64);
        const blob = new Blob([bytes], { type: mime || 'audio/mpeg' });
        const url = URL.createObjectURL(blob);
        if (lastAudioUrl) { try { URL.revokeObjectURL(lastAudioUrl); } catch {} }
        lastAudioUrl = url;
        ttsAudioEl.src = url;
        try { ttsAudioEl.playbackRate = currentPlaybackRate; } catch {}
        const p = ttsAudioEl.play();
        if (p && typeof p.catch === 'function') {
          p.catch(() => {
            appendHistory('tts', 'Autoplay blocked; click anywhere to allow audio.');
          });
        }
      } catch (err) {
        appendHistory('error', 'Failed to play TTS audio');
      }
    }
  }

  function updateMeter(level01) {
    if (!meterBarEl) return;
    const pct = Math.max(0, Math.min(1, level01)) * 100;
    
    // Smooth meter updates for better visual experience
    const currentWidth = parseFloat(meterBarEl.style.width) || 0;
    const targetWidth = pct;
    const smoothWidth = currentWidth + (targetWidth - currentWidth) * 0.3;
    
    meterBarEl.style.width = `${smoothWidth.toFixed(0)}%`;
    
    // Update meter color based on level
    if (smoothWidth > 80) {
      meterBarEl.style.background = 'linear-gradient(90deg, var(--danger), var(--warning))';
    } else if (smoothWidth > 50) {
      meterBarEl.style.background = 'linear-gradient(90deg, var(--warning), var(--primary))';
    } else {
      meterBarEl.style.background = 'linear-gradient(90deg, var(--success), var(--primary))';
    }
    
    updateVAD(level01);
    
    // Adaptive buffering based on audio level
    if (ttsIsPlaying && level01 > 0.1) {
      // Reduce buffer size when there's background noise for better responsiveness
      ttsMinLeadSec = Math.max(0.02, ttsMinLeadSec * 0.95);
    } else if (ttsIsPlaying) {
      // Increase buffer size in quiet environments for smoother playback
      ttsMinLeadSec = Math.min(0.1, ttsMinLeadSec * 1.05);
    }
  }

  function setSttBadge(text) {
    if (sttValueEl) sttValueEl.textContent = text;
  }

  function setMurf(status) {
    if (!murfValueEl) return;
    murfValueEl.textContent = status;
    try {
      // Update visual state for streaming
      if (status === 'streaming') {
        murfValueEl.style.color = 'var(--primary)';
        murfValueEl.style.textShadow = '0 0 8px rgba(99, 102, 241, 0.5)';
      } else if (status === 'buffering') {
        murfValueEl.style.color = 'var(--warning)';
        murfValueEl.style.textShadow = '0 0 8px rgba(245, 158, 11, 0.5)';
        murfValueEl.style.animation = 'pulse 1s ease-in-out infinite';
      } else if (status === 'connected') {
        murfValueEl.style.color = 'var(--success)';
        murfValueEl.style.textShadow = 'none';
        murfValueEl.style.animation = 'none';
      } else if (status === 'disconnected') {
        murfValueEl.style.color = 'var(--danger)';
        murfValueEl.style.textShadow = 'none';
        murfValueEl.style.animation = 'none';
      } else {
        murfValueEl.style.color = 'var(--text)';
        murfValueEl.style.textShadow = 'none';
        murfValueEl.style.animation = 'none';
      }
    } catch {}
  }

  function updateVAD(level) {
    if (!vadValueEl) return;
    if (!isRecording) {
      vadValueEl.textContent = 'Idle';
      vadValueEl.style.color = 'var(--text3)';
      vadState = 'idle';
      return;
    }
    const now = Date.now();
    const threshold = 0.25; // tuned for RMS*4 scaling
    const newState = level > threshold ? 'Speech' : 'Silence';
    if (newState !== vadState && (now - vadLastChange) > 150) {
      vadState = newState;
      vadLastChange = now;
      vadValueEl.textContent = newState;
      vadValueEl.style.color = newState === 'Speech' ? 'var(--success)' : 'var(--text2)';
    }
  }

  function startWaveformDraw() {
    if (!waveCanvas || !waveCtx || !analyser) return;
    // Match canvas width to CSS size
    try { waveCanvas.width = waveCanvas.clientWidth; } catch {}
    const bufferLength = analyser.fftSize;
    const dataArray = new Uint8Array(bufferLength);
    const freqArray = new Uint8Array(analyser.frequencyBinCount);
    
    const w = () => {
      if (!analyser) return; // stopped
      waveAnimId = requestAnimationFrame(w);
      
      // Get both time domain and frequency data for richer visualization
      analyser.getByteTimeDomainData(dataArray);
      analyser.getByteFrequencyData(freqArray);
      
      const W = waveCanvas.width, H = waveCanvas.height;
      waveCtx.clearRect(0, 0, W, H);
      
      // Create gradient background
      const gradient = waveCtx.createLinearGradient(0, 0, 0, H);
      gradient.addColorStop(0, 'rgba(99, 102, 241, 0.1)');
      gradient.addColorStop(1, 'rgba(99, 102, 241, 0.05)');
      waveCtx.fillStyle = gradient;
      waveCtx.fillRect(0, 0, W, H);
      
      // Draw frequency spectrum bars
      waveCtx.fillStyle = 'rgba(99, 102, 241, 0.3)';
      const barWidth = W / freqArray.length;
      for (let i = 0; i < freqArray.length; i++) {
        const barHeight = (freqArray[i] / 255) * H * 0.3;
        const x = i * barWidth;
        const y = H - barHeight;
        waveCtx.fillRect(x, y, barWidth - 1, barHeight);
      }
      
      // Draw waveform
      waveCtx.strokeStyle = '#ffffff';
      waveCtx.globalAlpha = 0.8;
      waveCtx.lineWidth = 2;
      waveCtx.beginPath();
      const slice = W / bufferLength;
      let x = 0;
      let sumSq = 0;
      
      for (let i = 0; i < bufferLength; i++) {
        const v8 = dataArray[i];
        const v = (v8 - 128) / 128.0; // convert to -1..1
        const y = ((v + 1) * 0.5) * H; // map -1..1 to 0..H
        sumSq += v * v;
        if (i === 0) waveCtx.moveTo(x, y); else waveCtx.lineTo(x, y);
        x += slice;
      }
      
      waveCtx.stroke();
      
      // Calculate RMS and update meter
      const rms = Math.sqrt(sumSq / bufferLength) || 0;
      const level = Math.min(1, rms * 4);
      updateMeter(level);
      
      // Add visual feedback for recording state
      if (isRecording) {
        waveCtx.strokeStyle = 'rgba(239, 68, 68, 0.6)';
        waveCtx.lineWidth = 1;
        waveCtx.strokeRect(2, 2, W - 4, H - 4);
      }
    };
    cancelAnimationFrame(waveAnimId);
    w();
  }

  function stopWaveformDraw() {
    try { cancelAnimationFrame(waveAnimId); } catch {}
    if (waveCtx && waveCanvas) waveCtx.clearRect(0, 0, waveCanvas.width, waveCanvas.height);
    waveAnimId = 0;
  }

  function startTimer() {
    if (!micTimerEl) return;
    recStartedAt = Date.now();
    clearInterval(recTimerId);
    recTimerId = setInterval(() => {
      const s = Math.max(0, Math.floor((Date.now() - recStartedAt) / 1000));
      const mm = String(Math.floor(s / 60)).padStart(2, '0');
      const ss = String(s % 60).padStart(2, '0');
      micTimerEl.textContent = `${mm}:${ss}`;
    }, 250);
  }

  function stopTimer() {
    clearInterval(recTimerId);
    recTimerId = null;
    if (micTimerEl) micTimerEl.textContent = '00:00';
  }

  async function loadHistory() {
    try {
      const res = await fetch(`/session/${encodeURIComponent(sessionId)}/history`);
      const data = await res.json();
      historyEl.innerHTML = '';
      (data.history || []).forEach(m => appendHistory(m.role, m.content));
    } catch (e) {
      console.warn('Failed to fetch history', e);
    }
  }

  function connect() {
    if (ws && connected) return;
    ws = new WebSocket(wsUrl());

    ws.onopen = () => {
      setConnected(true);
      if (tokensEl) tokensEl.textContent = '';
      loadHistory();
      setTyping(false);
      setMurf('connected');
    };

    ws.onclose = () => {
      setConnected(false);
      resetStreamingTts(true);
      stopRecording(true);
      setTyping(false);
      setMurf('disconnected');
    };

    ws.onerror = (ev) => {
      console.error('WS error', ev);
    };

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        const type = msg.type;
        if (type === 'echo') {
          appendHistory('echo', JSON.stringify(msg.data));
        } else if (type === 'session_created' || type === 'session_joined') {
          if (msg.session) {
            sessionId = msg.session;
            if (sidEl) sidEl.textContent = sessionId;
          }
        } else if (type === 'streaming_mode') {
          streamingMode = !!msg.on;
          if (modeValueEl) modeValueEl.textContent = streamingMode ? 'Streaming' : 'Traditional';
        } else if (type === 'streaming_progress') {
          progressEl.textContent = `chunks=${msg.chunks} bytes=${msg.bytes} duration=${msg.duration}s`;
        } else if (type === 'llm_token') {
          appendToken(msg.token || '');
          setTyping(true);
        } else if (type === 'llm_complete') {
          appendHistory('assistant', msg.text || '');
          setTyping(false);
        } else if (type === 'audio_chunk') {
          const b64 = msg.b64 || '';
          if (!Array.isArray(ttsChunkBuffer)) ttsChunkBuffer = [];
          ttsChunkBuffer.push(b64);
          // Prune buffer to prevent unbounded growth
          try {
            if (ttsChunkBuffer.length > TTS_BUFFER_MAX) {
              const remove = ttsChunkBuffer.length - TTS_BUFFER_PRUNE_TO;
              if (remove > 0) ttsChunkBuffer.splice(0, remove);
            }
          } catch {}
          // Stream-play this chunk as it arrives
          resumeStreamingAudio();
          // Enqueue for ordered processing to avoid out-of-order scheduling
          queueAudioChunk(msg);
          // Print acknowledgement for each received chunk
          console.log(`[WS] audio_chunk #${ttsChunkBuffer.length} len=${b64.length} final=${!!msg.final} ctx=${msg.context_id || ''}`);
          if (msg.final) {
            console.log(`[WS] audio_chunk final=true. Total chunks: ${ttsChunkBuffer.length}`);
            // Update progress display
            if (progressEl) {
              const totalDuration = ttsChunkCount > 0 ? (ttsLastChunkTime - ttsStartTime) / 1000 : 0;
              progressEl.textContent = `chunks=${ttsChunkCount} bytes=${ttsTotalBytes} duration=${totalDuration.toFixed(1)}s quality=${ttsAudioQuality}`;
            }
          }
        } else if (type === 'tts_audio') {
          // { type: 'tts_audio', mime: 'audio/mpeg', b64: '...' }
          // Suppress fallback playback if Murf streaming is active
          if (ttsUseWebAudio && (ttsIsPlaying || ttsContextId)) {
            console.log('[WS] suppressing fallback tts_audio because streaming is active');
          } else {
            playTtsAudio(msg.b64, msg.mime);
            setMurf('streaming');
            if (murfStatusTimeout) try { clearTimeout(murfStatusTimeout); } catch {}
            murfStatusTimeout = setTimeout(() => setMurf(connected ? 'connected' : 'disconnected'), 1500);
          }
        } else if (type === 'murf_cleared') {
          // Backend confirmed Murf context cancellation
          console.log('[WS] murf_cleared ctx=', msg.context_id || null);
          try { resetStreamingTts(true); } catch {}
          setMurf(connected ? 'connected' : 'disconnected');
        } else if (type === 'error') {
          appendHistory('error', msg.message || 'unknown error');
          setTyping(false);
        } else {
          // ignore
        }
      } catch (e) {
        // Non-JSON messages should not occur in this demo, ignore
      }
    };
  }

  // Controls
  btnEcho?.addEventListener('click', () => {
    if (!connected) return;
    
    // Add visual feedback
    btnEcho.style.transform = 'scale(0.95)';
    setTimeout(() => {
      btnEcho.style.transform = 'scale(1)';
    }, 150);
    
    ws.send(JSON.stringify({ type: 'echo', data: { time: Date.now() } }));
    
    // Update status to show echo test
    if (murfValueEl) {
      murfValueEl.textContent = 'Echo Test';
      murfValueEl.style.color = 'var(--warning)';
      
      // Reset after echo
      setTimeout(() => {
        if (murfValueEl) {
          murfValueEl.textContent = 'Connected';
          murfValueEl.style.color = 'var(--success)';
        }
      }, 2000);
    }
  });

  // Audio-only mode: typed text input disabled

  // New controls

  // Enhanced clear functionality with streaming state reset
  btnClear?.addEventListener('click', () => {
    tokensEl.textContent = '';
    historyEl.innerHTML = '';
    progressEl.textContent = 'chunks=0 bytes=0 duration=0s quality=idle';
    setTyping(false);
    resetStreamingTts(true);
    // Also request backend to clear any Murf synthesis/context
    try { if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: 'clear_murf' })); } catch {}
    
    // Reset UI state
    if (modeValueEl) modeValueEl.textContent = 'Streaming';
    if (recValueEl) recValueEl.textContent = 'Idle';
    if (sttValueEl) sttValueEl.textContent = 'Idle';
    if (murfValueEl) murfValueEl.textContent = 'Idle';
    if (vadValueEl) vadValueEl.textContent = 'Idle';
    
    // Reset meter
    if (meterBarEl) {
      meterBarEl.style.width = '0%';
      meterBarEl.style.background = 'linear-gradient(90deg, var(--success), var(--primary))';
    }
    
    // Reset timer
    if (micTimerEl) micTimerEl.textContent = '00:00';
    
    // Clear waveform
    if (waveCtx && waveCanvas) {
      waveCtx.clearRect(0, 0, waveCanvas.width, waveCanvas.height);
    }
    
    console.log('All data cleared and UI reset');
  });

  function updateDebugLayout() {
    const hidden = debugCardEl?.classList.contains('hidden');
    if (!hidden) {
      document.body.classList.add('has-debug');
    } else {
      document.body.classList.remove('has-debug');
    }
  }

  function toggleTokensPanel() {
    if (!tokensWrapEl) return;
    tokensWrapEl.classList.toggle('hidden');
  }

  function toggleDebugPanel() {
    if (!debugCardEl) return;
    debugCardEl.classList.toggle('hidden');
    updateDebugLayout();
    
    // Add smooth animation for debug panel
    if (!debugCardEl.classList.contains('hidden')) {
      debugCardEl.style.opacity = '0';
      debugCardEl.style.transform = 'translateY(20px)';
      setTimeout(() => {
        debugCardEl.style.transition = 'all 0.3s ease';
        debugCardEl.style.opacity = '1';
        debugCardEl.style.transform = 'translateY(0)';
      }, 10);
    }
  }

  btnToggleTokens?.addEventListener('click', () => toggleTokensPanel());

  btnToggleDebug?.addEventListener('click', () => toggleDebugPanel());

  // Clean Mode and Web Audio toggles removed for audio-only UI

  // Audio quality monitoring and adaptive adjustments
  function monitorAudioQuality() {
    if (!ttsCtx || !ttsIsPlaying) return;
    
    try {
      // Monitor audio context performance
      const currentTime = ttsCtx.currentTime;
      const playheadDiff = Math.abs(currentTime - ttsPlayhead);
      
      // Adjust buffer size based on timing accuracy
      if (playheadDiff > 0.1) {
        // Timing is off, increase buffer size
        ttsMinLeadSec = Math.min(0.15, ttsMinLeadSec * 1.1);
        console.log('Audio timing off, increased buffer size to:', ttsMinLeadSec);
      } else if (playheadDiff < 0.02 && ttsMinLeadSec > 0.03) {
        // Timing is very accurate, can reduce buffer size
        ttsMinLeadSec = Math.max(0.02, ttsMinLeadSec * 0.95);
        console.log('Audio timing accurate, reduced buffer size to:', ttsMinLeadSec);
      }
      
      // Monitor for audio dropouts
      if (ttsNodes.length > 0) {
        const activeNodes = ttsNodes.filter(node => node.buffer && !node.buffer.duration);
        if (activeNodes.length > 0) {
          console.warn('Detected audio dropouts, adjusting buffer strategy');
          ttsMinLeadSec = Math.min(0.2, ttsMinLeadSec * 1.2);
        }
      }
      
      // Update audio quality status based on performance metrics
      const avgLatency = ttsLatencyHistory.length > 0 ? 
        ttsLatencyHistory.reduce((a, b) => a + b, 0) / ttsLatencyHistory.length : 0;
      
      if (avgLatency > 0.2 || ttsDropoutCount > 5) {
        ttsAudioQuality = 'poor';
      } else if (avgLatency > 0.1 || ttsDropoutCount > 2) {
        ttsAudioQuality = 'degraded';
      } else {
        ttsAudioQuality = 'good';
      }
      
      // Adjust buffer size dynamically
      adjustBufferSize();
      
      // Log quality metrics periodically
      if (ttsChunkCount % 10 === 0 && ttsChunkCount > 0) {
        console.log(`[Audio Quality] Chunks: ${ttsChunkCount}, Latency: ${avgLatency.toFixed(3)}s, Quality: ${ttsAudioQuality}, Dropouts: ${ttsDropoutCount}, Buffer: ${ttsBufferSize}, Crossfade: ${(ttsCrossfadeDuration * 1000).toFixed(1)}ms`);
      }
    } catch (err) {
      console.warn('Error monitoring audio quality:', err);
    }
  }
  
  // Set up periodic audio quality monitoring
  setInterval(monitorAudioQuality, 1000);
  
  // Set up periodic streaming progress updates
  setInterval(updateStreamingProgress, 500);
  
  // Enhanced audio bars animation for streaming feedback
  function animateAudioBars() {
    const barsEl = document.getElementById('audio-bars');
    if (!barsEl) return;
    
    const bars = barsEl.querySelectorAll('.bar');
    bars.forEach((bar, index) => {
      if (ttsStreamingStatus === 'playing' || ttsStreamingStatus === 'finalizing') {
        // Animate bars based on streaming activity
        const intensity = Math.random() * 0.8 + 0.2;
        const height = Math.floor(intensity * 32);
        bar.style.height = `${height}px`;
        bar.style.opacity = intensity;
        
        // Add subtle color variation
        if (ttsAudioQuality === 'good') {
          bar.style.background = 'linear-gradient(to top, var(--success), var(--primary))';
        } else if (ttsAudioQuality === 'degraded') {
          bar.style.background = 'linear-gradient(to top, var(--warning), var(--primary))';
        } else {
          bar.style.background = 'linear-gradient(to top, var(--danger), var(--warning))';
        }
      } else {
        // Reset bars when not streaming
        bar.style.height = '4px';
        bar.style.opacity = '0.3';
        bar.style.background = 'linear-gradient(to top, var(--primary), var(--primary-hover))';
      }
    });
  }
  
  // Set up audio bars animation
  setInterval(animateAudioBars, 100);
  
  // Provide streaming statistics and debugging information
  function getStreamingStats() {
    const stats = {
      status: ttsStreamingStatus,
      chunks: ttsChunkCount,
      bytes: ttsTotalBytes,
      startTime: ttsStartTime,
      lastChunkTime: ttsLastChunkTime,
      audioQuality: ttsAudioQuality,
      dropoutCount: ttsDropoutCount,
      latencyHistory: ttsLatencyHistory,
      bufferSize: ttsMinLeadSec,
      playhead: ttsPlayhead,
      isPlaying: ttsIsPlaying,
      contextId: ttsContextId,
      nodesCount: ttsNodes.length,
      queueLength: ttsChunkQueue.length,
      
      // Seamless playback specific stats
      seamlessBuffer: {
        size: ttsBufferSize,
        current: ttsAudioBuffer.length,
        isBuffering: ttsIsBuffering,
        playbackStarted: ttsPlaybackStarted
      },
      timing: {
        preroll: ttsPrerollSec,
        minLead: ttsMinLeadSec,
        crossfade: ttsCrossfadeDuration,
        lastChunkEnd: ttsLastChunkEndTime
      },
      performance: {
        avgLatency: ttsLatencyHistory.length > 0 ? 
          ttsLatencyHistory.reduce((a, b) => a + b, 0) / ttsLatencyHistory.length : 0,
        maxLatency: Math.max(...ttsLatencyHistory, 0),
        minLatency: Math.min(...ttsLatencyHistory, Infinity)
      }
    };
    
    if (ttsStartTime > 0) {
      stats.totalDuration = (Date.now() - ttsStartTime) / 1000;
    }
    
    return stats;
  }
  
  // Expose streaming stats for debugging
  try { 
    window.getStreamingStats = getStreamingStats; 
    window.resetStreamingTts = resetStreamingTts;
    window.adjustBufferSize = adjustBufferSize;
    console.log('[Seamless] Debug functions available: getStreamingStats(), resetStreamingTts(), adjustBufferSize()');
  } catch {}
  
  // Enhanced logging for streaming operations
  function logStreamingEvent(event, data = {}) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [Seamless] ${event}`, data);
    
    // Also log to history for user visibility
    if (event.includes('Error') || event.includes('Warning')) {
      appendHistory('error', `Streaming: ${event}`);
    }
  }
  
  // Log seamless playback performance summary
  function logSeamlessPerformance() {
    if (ttsChunkCount === 0) return;
    
    const stats = getStreamingStats();
    const performance = stats.performance;
    
    console.log(`[Seamless] Performance Summary:
    - Chunks: ${stats.chunks}
    - Total Duration: ${stats.totalDuration?.toFixed(2)}s
    - Audio Quality: ${stats.audioQuality}
    - Dropouts: ${stats.dropoutCount}
    - Buffer Size: ${stats.seamlessBuffer.size} chunks
    - Avg Latency: ${performance.avgLatency.toFixed(3)}s
    - Crossfade: ${(stats.timing.crossfade * 1000).toFixed(1)}ms
    - Seamless Playback: ${!stats.seamlessBuffer.isBuffering ? '✅ Active' : '⏳ Buffering'}`);
  }

  // ------------------------------
  // AssemblyAI Realtime helpers
  // ------------------------------

  async function fetchAaiToken() {
    const res = await fetch('/assemblyai/token');
    const data = await res.json();
    if (data?.token) return data.token;
    throw new Error('Failed to fetch AssemblyAI token');
  }

  function downsampleBuffer(buffer, sampleRate, outRate = 16000) {
    if (outRate === sampleRate) return buffer;
    const sampleRateRatio = sampleRate / outRate;
    const newLength = Math.round(buffer.length / sampleRateRatio);
    const result = new Float32Array(newLength);
    let offsetResult = 0;
    let offsetBuffer = 0;
    while (offsetResult < result.length) {
      const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
      let accum = 0, count = 0;
      for (let i = Math.round(offsetBuffer); i < nextOffsetBuffer && i < buffer.length; i++) {
        accum += buffer[i];
        count++;
      }
      result[offsetResult] = count ? (accum / count) : 0;
      offsetResult++;
      offsetBuffer = nextOffsetBuffer;
    }
    return result;
  }

  function floatTo16BitPCM(float32Array) {
    const out = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      let s = Math.max(-1, Math.min(1, float32Array[i]));
      out[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return out;
  }

  function toBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      const slice = bytes.subarray(i, i + chunk);
      binary += String.fromCharCode.apply(null, slice);
    }
    return btoa(binary);
  }

  async function startAaiStreaming() {
    if (!connected) connect();
    if (!navigator.mediaDevices?.getUserMedia) {
      appendHistory('error', 'getUserMedia not supported');
      return false;
    }
    try {
      const token = await fetchAaiToken();
      // Use v3 Universal-Streaming WS to match token endpoint
      const url = `wss://streaming.assemblyai.com/v3/ws?sample_rate=16000&token=${encodeURIComponent(token)}`;
      aaiWs = new WebSocket(url);

      aaiWs.onopen = async () => {
        aaiConnected = true;
        isRecording = true;
        if (recValueEl) recValueEl.textContent = 'Recording (AAI)';
        if (recValueEl) recValueEl.style.color = 'var(--danger)';
        appendHistory('stt', 'AssemblyAI connected');
        startTimer();

        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaStream = stream; // for cleanup
        sourceNode = audioContext.createMediaStreamSource(stream);
        // Visuals: waveform analyser
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 1024;
        try { sourceNode.connect(analyser); } catch {}
        startWaveformDraw();
        // AudioWorklet-based processing (replaces deprecated ScriptProcessorNode)
        let workletOk = false;
        try {
          await audioContext.audioWorklet.addModule('/static/aai-worklet.js');
          processorNode = new AudioWorkletNode(audioContext, 'aai-processor', {
            numberOfInputs: 1,
            numberOfOutputs: 1,
            channelCount: 1,
          });
          processorNode.port.onmessage = (e) => {
            const d = e.data;
            // Meter updates come as { m: <0..1> }
            if (d && typeof d === 'object' && 'm' in d) {
              updateMeter(d.m);
              return;
            }
            // PCM frames arrive as ArrayBuffer
            if (!aaiWs || aaiWs.readyState !== 1) return;
            if (!streamingMode) return;
            try { aaiWs.send(d); } catch {}
          };
          const mute = audioContext.createGain();
          mute.gain.value = 0;
          sourceNode.connect(processorNode).connect(mute).connect(audioContext.destination);
          workletOk = true;
          setSttBadge('AudioWorklet');
        } catch (err) {
          console.warn('AudioWorklet unavailable, falling back to ScriptProcessorNode', err);
        }

        if (!workletOk) {
          // Fallback: ScriptProcessorNode (deprecated but works on older browsers)
          processorNode = audioContext.createScriptProcessor(4096, 1, 1);
          processorNode.onaudioprocess = (e) => {
            if (!aaiWs || aaiWs.readyState !== 1) return;
            if (!streamingMode) return;
            const inputData = e.inputBuffer.getChannelData(0);
            const down = downsampleBuffer(inputData, audioContext.sampleRate, 16000);
            const pcm16 = floatTo16BitPCM(down);
            // Level meter (RMS on inputData)
            let sum = 0; for (let i = 0; i < inputData.length; i++) { const s = inputData[i]; sum += s * s; }
            const rms = Math.sqrt(sum / inputData.length) || 0;
            updateMeter(Math.min(1, rms * 4));
            try {
              aaiWs.send(pcm16.buffer);
            } catch {}
          };
          sourceNode.connect(processorNode);
          processorNode.connect(audioContext.destination);
          setSttBadge('Fallback');
        }
      };

      aaiWs.onmessage = (msg) => {
        try {
          const data = JSON.parse(msg.data);
          // New API (turn-based)
          if (typeof data.end_of_turn === 'boolean') {
            if (data.transcript && data.end_of_turn) {
              appendHistory('stt', data.transcript);
              if (ws && ws.readyState === 1) {
                ws.send(JSON.stringify({ type: 'turn_end', transcript: data.transcript }));
              }
            }
            return;
          }
          // Legacy API (message_type)
          const mt = data.message_type;
          if (mt === 'FinalTranscript' && data.text) {
            appendHistory('stt', data.text);
            if (ws && ws.readyState === 1) {
              ws.send(JSON.stringify({ type: 'turn_end', transcript: data.text }));
            }
          }
        } catch {}
      };

      aaiWs.onerror = (e) => {
        appendHistory('error', 'AssemblyAI error');
      };

      aaiWs.onclose = () => {
        aaiConnected = false;
        appendHistory('stt', 'AssemblyAI disconnected');
        setSttBadge('Idle');
        stopTimer();
      };

      btnRec.textContent = '⏹';
      try { btnRec.classList.add('recording'); } catch {}
      btnRec.title = 'Stop Recording';
      return true;
    } catch (err) {
      appendHistory('error', 'AAI connect failed: ' + (err?.message || err));
      return false;
    }
  }

  function stopAaiStreaming() {
    try { if (processorNode) processorNode.disconnect(); } catch {}
    try { if (sourceNode) sourceNode.disconnect(); } catch {}
    stopWaveformDraw();
    analyser = null;
    try { if (audioContext && audioContext.state !== 'closed') audioContext.close(); } catch {}
    try { if (aaiWs && aaiWs.readyState <= 1) aaiWs.close(); } catch {}
    try {
      if (mediaStream) mediaStream.getTracks().forEach(t => t.stop());
    } catch {}
    processorNode = null; sourceNode = null; audioContext = null;
    aaiWs = null; aaiConnected = false;
    setSttBadge('Idle');
    stopTimer();
    updateMeter(0);
  }

  async function startRecording() {
    // Interrupt any ongoing TTS immediately (frontend + backend)
    try { resetStreamingTts(false); } catch {}
    try { if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: 'clear_murf' })); } catch {}

    // Prefer AssemblyAI realtime path
    const ok = await startAaiStreaming();
    if (!ok) {
      // Fallback: old backend binary streaming via MediaRecorder
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const options = { mimeType: 'audio/webm;codecs=opus' };
        mediaRecorder = new MediaRecorder(mediaStream, options);
        // Visuals: create analyser for waveform/VAD even in fallback path
        try {
          if (!audioContext || audioContext.state === 'closed') {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
          }
          sourceNode = audioContext.createMediaStreamSource(mediaStream);
          analyser = audioContext.createAnalyser();
          analyser.fftSize = 1024;
          sourceNode.connect(analyser);
          startWaveformDraw();
        } catch {}
        mediaRecorder.ondataavailable = async (e) => {
          if (!e.data || e.data.size === 0) return;
          if (!ws || ws.readyState !== 1) return;
          if (!streamingMode) return;
          try {
            const buf = await e.data.arrayBuffer();
            ws.send(buf);
          } catch (err) {
            console.warn('Failed to send audio chunk', err);
          }
        };
        mediaRecorder.start(250);
        isRecording = true;
        btnRec.textContent = '⏹';
        try { btnRec.classList.add('recording'); } catch {}
        btnRec.title = 'Stop Recording';
        if (recValueEl) recValueEl.textContent = 'Recording';
        if (recValueEl) recValueEl.style.color = 'var(--danger)';
      } catch (err) {
        appendHistory('error', 'mic error: ' + (err?.message || err));
      }
    }
  }

  function stopRecording(silent = false) {
    // Immediately flip state and UI so subsequent clicks don't re-start inadvertently
    isRecording = false;
    if (!silent) {
      btnRec.textContent = '🎤';
      btnRec.title = 'Start Recording';
      try { btnRec.classList.remove('recording'); } catch {}
      if (recValueEl) {
        recValueEl.textContent = 'Idle';
        recValueEl.style.color = 'var(--text)';
      }
    }

    // Proactively ask backend to clear Murf context to stop any TTS in-flight
    try { if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: 'clear_murf' })); } catch {}

    // Proceed with cleanup
    try {
      if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
      }
    } catch {}
    try {
      if (mediaStream) {
        mediaStream.getTracks().forEach(t => t.stop());
      }
    } catch {}
    // Also stop AAI path
    stopAaiStreaming();
    mediaRecorder = null;
    mediaStream = null;
  }

  btnRec.addEventListener('click', () => {
    // Try to resume audio context on user gesture
    resumeStreamingAudio();
    
    // Add visual feedback
    btnRec.style.transform = 'scale(0.95)';
    setTimeout(() => {
      btnRec.style.transform = 'scale(1)';
    }, 150);
    
    // If AAI WebSocket is in CONNECTING state, treat as recording (allow Stop)
    const connecting = !!(typeof aaiWs !== 'undefined' && aaiWs && aaiWs.readyState === 0);
    if (isRecording || connecting) {
      stopRecording();
    } else {
      startRecording();
    }
  });

  // Attempt to resume audio context on first user interaction and when returning to tab
  try { document.addEventListener('pointerdown', () => resumeStreamingAudio(), { passive: true }); } catch {}
  try { document.addEventListener('visibilitychange', () => { if (!document.hidden) resumeStreamingAudio(); }); } catch {}

  // Initialize UI state
  function initializeUI() {
    // Set initial values for new UI elements
    if (modeValueEl) modeValueEl.textContent = 'Streaming';
    if (recValueEl) recValueEl.textContent = 'Idle';
    if (sttValueEl) sttValueEl.textContent = 'Idle';
    if (murfValueEl) murfValueEl.textContent = 'Idle';
    if (vadValueEl) vadValueEl.textContent = 'Idle';
    
    // Initialize meter
    if (meterBarEl) {
      meterBarEl.style.width = '0%';
      meterBarEl.style.background = 'linear-gradient(90deg, var(--success), var(--primary))';
    }
    
    // Initialize timer
    if (micTimerEl) micTimerEl.textContent = '00:00';
  }
  
  // Auto-connect on load
  connect();
  
  // Initialize UI after DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeUI);
  } else {
    initializeUI();
  }

  // Dynamic buffer size adjustment for optimal seamless playback
  function adjustBufferSize() {
    const avgLatency = ttsLatencyHistory.length > 0 ? 
      ttsLatencyHistory.reduce((a, b) => a + b, 0) / ttsLatencyHistory.length : 0;
    
    // Adjust buffer size based on latency and quality
    if (avgLatency > 0.3 || ttsAudioQuality === 'poor') {
      // High latency or poor quality - increase buffer
      ttsBufferSize = Math.min(20, ttsBufferSize + 2);
      console.log(`[Seamless] Increased buffer size to ${ttsBufferSize} chunks due to high latency (${avgLatency.toFixed(3)}s)`);
    } else if (avgLatency < 0.05 && ttsAudioQuality === 'good' && ttsDropoutCount === 0) {
      // Low latency and good quality - can reduce buffer for faster response
      ttsBufferSize = Math.max(5, ttsBufferSize - 1);
      console.log(`[Seamless] Decreased buffer size to ${ttsBufferSize} chunks due to good performance`);
    }
    
    // Adjust crossfade duration based on buffer size
    if (ttsBufferSize > 15) {
      ttsCrossfadeDuration = 0.08; // Longer crossfade for larger buffers
    } else if (ttsBufferSize < 8) {
      ttsCrossfadeDuration = 0.03; // Shorter crossfade for smaller buffers
    } else {
      ttsCrossfadeDuration = 0.05; // Default crossfade
    }
  }
})();
