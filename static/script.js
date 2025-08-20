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
  let ttsAudioEl = null;
  let lastAudioUrl = null;

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
    div.textContent = `${role}: ${content}`;
    historyEl.appendChild(div);
    historyEl.scrollTop = historyEl.scrollHeight;
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
      const bytes = base64ToUint8(b64);
      const blob = new Blob([bytes], { type: mime || 'audio/mpeg' });
      const url = URL.createObjectURL(blob);
      if (!ttsAudioEl) {
        ttsAudioEl = new Audio();
        ttsAudioEl.autoplay = true;
      }
      if (lastAudioUrl) {
        try { URL.revokeObjectURL(lastAudioUrl); } catch {}
      }
      lastAudioUrl = url;
      ttsAudioEl.src = url;
      const p = ttsAudioEl.play();
      if (p && typeof p.catch === 'function') {
        p.catch(() => {
          appendHistory('tts', 'Autoplay blocked; click anywhere to allow audio.');
        });
      }
    } catch (e) {
      appendHistory('error', 'Failed to play TTS audio');
    }
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
    };

    ws.onclose = () => {
      setConnected(false);
      stopRecording(true);
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
        } else if (type === 'llm_complete') {
          appendHistory('assistant', msg.text || '');
        } else if (type === 'tts_audio') {
          // { type: 'tts_audio', mime: 'audio/mpeg', b64: '...' }
          playTtsAudio(msg.b64, msg.mime);
        } else if (type === 'error') {
          appendHistory('error', msg.message || 'unknown error');
        } else {
          // ignore
        }
      } catch (e) {
        // Non-JSON messages should not occur in this demo, ignore
      }
    };
  }

  // Controls
  btnConnect.addEventListener('click', () => connect());
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
  }

  btnSend.addEventListener('click', () => sendUserText(false));
  btnTurn.addEventListener('click', () => sendUserText(true));

  btnToggleMode.addEventListener('click', () => {
    if (!connected) return;
    streamingMode = !streamingMode;
    ws.send(JSON.stringify({ type: 'streaming_mode', on: streamingMode }));
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

        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaStream = stream; // for cleanup
        sourceNode = audioContext.createMediaStreamSource(stream);
        // Use ScriptProcessor for simplicity; buffer size 4096
        processorNode = audioContext.createScriptProcessor(4096, 1, 1);
        processorNode.onaudioprocess = (e) => {
          if (!aaiWs || aaiWs.readyState !== 1) return;
          if (!streamingMode) return;
          const inputData = e.inputBuffer.getChannelData(0);
          const down = downsampleBuffer(inputData, audioContext.sampleRate, 16000);
          const pcm16 = floatTo16BitPCM(down);
          try {
            // v3 expects raw binary PCM frames (50-1000ms)
            aaiWs.send(pcm16.buffer);
          } catch {}
        };
        sourceNode.connect(processorNode);
        processorNode.connect(audioContext.destination);
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
      };

      btnRec.textContent = 'Stop Recording';
      return true;
    } catch (err) {
      appendHistory('error', 'AAI connect failed: ' + (err?.message || err));
      return false;
    }
  }

  function stopAaiStreaming() {
    try { if (processorNode) processorNode.disconnect(); } catch {}
    try { if (sourceNode) sourceNode.disconnect(); } catch {}
    try { if (audioContext && audioContext.state !== 'closed') audioContext.close(); } catch {}
    try { if (aaiWs && aaiWs.readyState <= 1) aaiWs.close(); } catch {}
    try {
      if (mediaStream) mediaStream.getTracks().forEach(t => t.stop());
    } catch {}
    aaiWs = null; aaiConnected = false;
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
        btnRec.textContent = 'Stop Recording';
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
      btnRec.textContent = 'Start Recording';
      recPill.innerHTML = 'Mic: <b class="mono">idle</b>';
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
