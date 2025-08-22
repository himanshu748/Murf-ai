(() => {
  const sidEl = document.getElementById('sid');
  const tokensEl = document.getElementById('tokens');
  const historyEl = document.getElementById('history');
  const progressEl = document.getElementById('progress');
  const dotEl = document.getElementById('conn-dot');
  const connTextEl = document.getElementById('conn-text');
  const inputEl = document.getElementById('input-text');
  const btnConnect = document.getElementById('btn-connect');
  const btnSend = document.getElementById('btn-send');
  const btnTurn = document.getElementById('btn-turn');
  const btnEcho = document.getElementById('btn-echo');
  const btnToggleMode = document.getElementById('btn-toggle-mode');
  const modePill = document.getElementById('mode-pill');
  const btnRec = document.getElementById('btn-rec');
  const recPill = document.getElementById('rec-pill');
  const btnReconnect = document.getElementById('btn-reconnect');
  const btnClear = document.getElementById('btn-clear');
  const typingUi = document.getElementById('typing');
  const btnToggleTokens = document.getElementById('btn-toggle-tokens');
  const btnToggleDebug = document.getElementById('btn-toggle-debug');
  const btnClean = document.getElementById('btn-clean');
  const tokensWrapEl = document.getElementById('tokens-wrap');
  const debugCardEl = document.getElementById('debug-card');
  // New UI elements
  const sttBadgeEl = document.getElementById('stt-badge');
  const meterBarEl = document.getElementById('meter-bar');
  const micTimerEl = document.getElementById('mic-timer');
  const audioEl = document.getElementById('tts-audio');
  const audioSpeedSel = document.getElementById('audio-speed');
  const murfPillEl = document.getElementById('murf-pill');
  const vadPillEl = document.getElementById('vad-pill');
  const statusRowEl = document.getElementById('status-row');
  const waveCanvas = document.getElementById('wave-canvas');
  const waveCtx = waveCanvas ? waveCanvas.getContext('2d') : null;
  const btnGear = document.getElementById('btn-gear');

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
  if (ttsAudioEl && audioSpeedSel) {
    ttsAudioEl.playbackRate = parseFloat(audioSpeedSel.value || '1');
    audioSpeedSel.addEventListener('change', () => {
      try { ttsAudioEl.playbackRate = parseFloat(audioSpeedSel.value || '1'); } catch {}
    });
  }
  if (ttsAudioEl) {
    ttsAudioEl.addEventListener('playing', () => setMurf('streaming'));
    const backToConn = () => setMurf(connected ? 'connected' : 'disconnected');
    ttsAudioEl.addEventListener('pause', backToConn);
    ttsAudioEl.addEventListener('ended', backToConn);
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

  function wsUrl() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${location.host}/ws?session=${encodeURIComponent(sessionId)}`;
    }

  function setConnected(on) {
    connected = on;
    if (on) {
      dotEl.classList.add('ok');
      connTextEl.textContent = 'Connected';
    } else {
      dotEl.classList.remove('ok');
      connTextEl.textContent = 'Disconnected';
    }
  }

  function appendToken(t) {
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
      try { ttsAudioEl.playbackRate = parseFloat(audioSpeedSel?.value || '1'); } catch {}
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
        try { ttsAudioEl.playbackRate = parseFloat(audioSpeedSel?.value || '1'); } catch {}
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
    meterBarEl.style.width = `${pct.toFixed(0)}%`;
    updateVAD(level01);
  }

  function setSttBadge(text) {
    if (sttBadgeEl) sttBadgeEl.textContent = text;
  }

  function setMurf(status) {
    if (murfPillEl) murfPillEl.textContent = `Murf: ${status}`;
  }

  function updateVAD(level) {
    if (!vadPillEl) return;
    if (!isRecording) {
      vadPillEl.textContent = 'VAD: idle';
      vadState = 'idle';
      return;
    }
    const now = Date.now();
    const threshold = 0.25; // tuned for RMS*4 scaling
    const newState = level > threshold ? 'speech' : 'silence';
    if (newState !== vadState && (now - vadLastChange) > 150) {
      vadState = newState;
      vadLastChange = now;
      vadPillEl.textContent = `VAD: ${vadState}`;
    }
  }

  function startWaveformDraw() {
    if (!waveCanvas || !waveCtx || !analyser) return;
    // Match canvas width to CSS size
    try { waveCanvas.width = waveCanvas.clientWidth; } catch {}
    const bufferLength = analyser.fftSize;
    const dataArray = new Uint8Array(bufferLength);
    const w = () => {
      if (!analyser) return; // stopped
      waveAnimId = requestAnimationFrame(w);
      analyser.getByteTimeDomainData(dataArray);
      const W = waveCanvas.width, H = waveCanvas.height;
      waveCtx.clearRect(0, 0, W, H);
      waveCtx.strokeStyle = '#ffffff';
      waveCtx.globalAlpha = 0.9;
      waveCtx.lineWidth = 1;
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
      const rms = Math.sqrt(sumSq / bufferLength) || 0;
      const level = Math.min(1, rms * 4);
      updateMeter(level);
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
      tokensEl.textContent = '';
      loadHistory();
      setTyping(false);
      setMurf('connected');
    };

    ws.onclose = () => {
      setConnected(false);
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
            sidEl.textContent = sessionId;
          }
        } else if (type === 'streaming_mode') {
          streamingMode = !!msg.on;
          modePill.innerHTML = `Mode: <b class="mono">${streamingMode ? 'streaming' : 'traditional'}</b>`;
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
          // Print acknowledgement for each received chunk
          console.log(`[WS] audio_chunk #${ttsChunkBuffer.length} len=${b64.length} final=${!!msg.final} ctx=${msg.context_id || ''}`);
          if (msg.final) {
            console.log(`[WS] audio_chunk final=true. Total chunks: ${ttsChunkBuffer.length}`);
          }
        } else if (type === 'tts_audio') {
        // { type: 'tts_audio', mime: 'audio/mpeg', b64: '...' }
        playTtsAudio(msg.b64, msg.mime);
        setMurf('streaming');
        if (murfStatusTimeout) try { clearTimeout(murfStatusTimeout); } catch {}
        murfStatusTimeout = setTimeout(() => setMurf(connected ? 'connected' : 'disconnected'), 1500);
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
  btnConnect?.addEventListener('click', () => connect());
  btnEcho.addEventListener('click', () => {
    if (!connected) return;
    ws.send(JSON.stringify({ type: 'echo', data: { time: Date.now() } }));
  });

  function sendUserText(asTurnEnd = false) {
    const t = (inputEl.value || '').trim();
    if (!t || !connected) return;
    appendHistory('user', t);
    if (asTurnEnd) {
      ws.send(JSON.stringify({ type: 'turn_end', transcript: t }));
    } else {
      ws.send(JSON.stringify({ type: 'text_message', text: t }));
    }
    inputEl.value = '';
    tokensEl.textContent = '';
    setTyping(true);
  }

  btnSend?.addEventListener('click', () => sendUserText(false));
  btnTurn?.addEventListener('click', () => sendUserText(true));

  btnToggleMode?.addEventListener('click', () => {
    if (!connected) return;
    streamingMode = !streamingMode;
    ws.send(JSON.stringify({ type: 'streaming_mode', on: streamingMode }));
  });

  // New controls
  btnReconnect?.addEventListener('click', () => {
    try { if (ws && ws.readyState <= 1) ws.close(); } catch {}
    setTimeout(() => connect(), 150);
  });

  btnClear?.addEventListener('click', () => {
    tokensEl.textContent = '';
    historyEl.innerHTML = '';
    progressEl.textContent = 'chunks=0 bytes=0 duration=0s';
    setTyping(false);
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
  }

  btnToggleTokens?.addEventListener('click', () => toggleTokensPanel());

  btnToggleDebug?.addEventListener('click', () => toggleDebugPanel());

  // Clean Mode and gear toggle removed; status row always visible

  // Enter to send message (no shortcuts)
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      sendUserText(false);
      e.preventDefault();
    }
  });


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
      const url = `wss://streaming.assemblyai.com/v3/ws?sample_rate=16000&format_turns=true&token=${encodeURIComponent(token)}`;
      aaiWs = new WebSocket(url);

      aaiWs.onopen = async () => {
        aaiConnected = true;
        isRecording = true;
        recPill.innerHTML = 'Mic: <b class="mono">recording</b> (AAI)';
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
        recPill.innerHTML = 'Mic: <b class="mono">recording</b>';
      } catch (err) {
        appendHistory('error', 'mic error: ' + (err?.message || err));
      }
    }
  }

  function stopRecording(silent = false) {
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
    isRecording = false;
    if (!silent) {
      btnRec.textContent = '🎤';
      btnRec.title = 'Start Recording';
      recPill.innerHTML = 'Mic: <b class="mono">idle</b>';
      try { btnRec.classList.remove('recording'); } catch {}
    }
  }

  btnRec.addEventListener('click', () => {
    if (!isRecording) {
      startRecording();
    } else {
      stopRecording();
    }
  });

  // Auto-connect on load
  connect();
})();
