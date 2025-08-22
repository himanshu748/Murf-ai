# 🎤 Murf AI Conversational Bot - Day 21: Stream Murf Audio to Client + LLM Streaming + AudioWorklet STT

A sophisticated AI-powered conversational agent with real-time audio streaming, turn detection, and enhanced UI, built with FastAPI and modern web technologies. This project combines Murf AI (TTS), AssemblyAI SDK (Streaming STT), and Perplexity AI (LLM) to create a seamless voice interaction experience with intelligent turn detection and a beautiful, responsive interface.

## 🆕 What's New in Day 21
- **Stream Murf base64 audio to the browser**: The backend now forwards Murf WS base64 audio chunks to the client in real time over `/ws`.
- **Client accumulation + acknowledgements**: The frontend accumulates chunks in-memory and logs acknowledgements for each received chunk.
- **No playback for chunks (yet)**: Chunks are not played in the `<audio>` element for this step. Existing `tts_audio` single-shot playback remains unchanged.
- **Message format**: `{"type": "audio_chunk", "b64": "...", "final": true|false, "context_id": "ctx_<session>"}`

### How to Test Day 21
1. Start the server and open the app (see Getting Started below).
2. Send a prompt (type and press Send or use STT flow).
3. Open the browser DevTools Console.
4. Observe logs like `"[WS] audio_chunk #<n> len=<len> final=<bool> ctx=<id>"` as chunks arrive.
5. Confirm an in-memory array is growing on the client: `ttsChunkBuffer.length`.

### Code Pointers
- Backend forwarding: `main.py` in `_stream_llm_and_emit()` wires `MurfWsClient.start_receiver(on_audio_chunk=...)` and forwards chunks to the browser as `audio_chunk` messages.
- Murf client: `services/murf_ws.py` invokes the `on_audio_chunk(b64, payload)` callback for each Murf audio message.
- Frontend accumulation: `static/script.js` handles `type === 'audio_chunk'`, pushes `b64` into `ttsChunkBuffer`, and prints acknowledgements. No UI playback for streamed chunks.

> Note: This change does not disrupt existing token streaming or the final `tts_audio` message.

## ✨ Key Features

### 🎙️ Voice Interaction
- **Real-time speech-to-text with turn detection**
- **Intelligent conversation flow with Perplexity AI**
- **High-quality text-to-speech with Murf AI**
- **Advanced turn detection using AssemblyAI SDK**
- **Real-time audio streaming and processing**
- **Enhanced noise cancellation and audio optimization**
- **Session-based conversation memory**

### 🎨 Enhanced Modern UI
- **Beautiful gradient-based royal theme**
- **Real-time status indicators and visual feedback**
- **Animated transcription display with timestamps**
- **Responsive design for all devices**
- **Interactive conversation history**
- **Smooth animations and transitions**
- **Enhanced accessibility features**
- **Keyboard shortcuts (Space to record)**

### 🛠️ Technical Highlights
- **FastAPI backend with WebSocket support**
- **Real-time binary audio streaming via WebSocket**
- **Perplexity AI integration with 'sonar' model**
- **AssemblyAI Python SDK for streaming STT**
- **Enhanced error handling and fallbacks**
- **Modular service architecture**
- **Session persistence and management**
- **Production-ready logging and monitoring**

### 🎤 Day 18: Enhanced Turn Detection & UI
- **Intelligent turn detection** - AI automatically detects when you stop talking
- **Enhanced visual feedback** with status indicators and animations
- **Real-time transcription display** with confidence scores
- **Beautiful conversation history** with timestamps
- **Keyboard shortcuts** for hands-free operation
- **Enhanced error handling** with graceful degradation
- **Mobile-responsive design** for all device types
- **Professional gradient UI** with smooth animations

## 🚀 Getting Started

### Prerequisites
- Python 3.8+
- Node.js 16+ (for frontend development)
- API keys for Murf AI, AssemblyAI, and Perplexity AI

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/murf-ai.git
   cd murf-ai
   ```

2. Create and activate a virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

4. Set up environment variables:
   Create a `.env` file in the root directory with your API keys:
   ```
   MURF_API_KEY=your_murf_api_key
   ASSEMBLYAI_API_KEY=your_assemblyai_api_key
   PERPLEXITY_API_KEY=your_perplexity_api_key
   ```

### Running the Application

1. Start the FastAPI server:
   ```bash
   uvicorn main:app --reload
   ```

2. Open your browser and navigate to:
   ```
   http://localhost:8000
   ```

## 🏗️ Project Structure

```
Murf-ai/
├── main.py                     # FastAPI application with enhanced WebSocket support
├── config.py                   # Configuration and API key management
├── schemas.py                  # Pydantic models for request/response validation
├── requirements.txt            # Python dependencies
├── uploads/                    # Audio file storage directory
├── services/                   # Service layer architecture
│   ├── __init__.py
│   ├── stt.py                 # AssemblyAI speech-to-text service
│   ├── llm.py                 # Perplexity AI integration with 'sonar' model
│   ├── murf_ws.py             # Murf WebSocket TTS streaming client (logs base64 audio)
│   └── tts.py                 # Murf AI text-to-speech service
├── templates/                  # Enhanced Jinja2 templates
│   └── index.html             # Beautiful responsive UI with animations
├── static/                     # Enhanced frontend assets
│   ├── script.js              # Enhanced JavaScript with turn detection
│   ├── aai-worklet.js         # AudioWorklet processor for realtime STT
│   └── fallback.mp3           # Fallback audio for error scenarios
├── .env                       # Environment variables (API keys)
└── README.md                  # This enhanced documentation
```

## 📚 Development Journey

### Days 1-3: Foundation & Setup
- Project initialization
- Basic API integrations
- Error handling and logging

### Days 4-6: Speech Recognition
- Audio upload system
- Real-time transcription
- Audio processing pipeline

### Days 7-9: Advanced Features
- Session management
- Conversation history
- Enhanced error recovery

### Days 10-14: Polish & Refinement
- UI/UX improvements
- Performance optimization
- Comprehensive documentation

## 🔧 Troubleshooting

### Common Issues

1. **Microphone Access**
   - Ensure browser has microphone permissions
   - Check for hardware issues
   - Try a different browser

2. **API Errors**
   - Verify API keys in `.env`
   - Check service status pages
   - Review error logs

3. **Installation Issues**
   - Ensure Python 3.8+ is installed
   - Try recreating virtual environment
   - Check dependency versions

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Open a pull request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Murf AI](https://murf.ai/) for the TTS service
- [AssemblyAI](https://assemblyai.com/) for speech recognition
- [Perplexity AI](https://www.perplexity.ai/) for language model
- [FastAPI](https://fastapi.tiangolo.com/) for the web framework

---

<div align="center">
  Made with ❤️ by [Your Name]
</div>

## 🚀 Challenge Overview

This project represents the **30 Days of AI Agent Challenge by Murf AI** - an intensive hands-on journey to master AI agent development. Currently documenting progress through **Day 20** (Murf WS TTS streaming, UI toggles, and AudioWorklet STT):
  
- **FastAPI** backend with Python for robust server architecture
- **Murf AI** for premium text-to-speech capabilities
- **AssemblyAI** for accurate speech transcription
- **Perplexity AI** for intelligent conversational responses
- **Royal Black** themed modern web interface for elegant user experience

## ✨ Features (Days 10-16 Focus)

### 🧠 Day 10: Chat History & Memory
- **Session-based conversations** with persistent memory
- **Dynamic session management** via URL parameters
- **Automatic voice recording** after each response
- **Complete conversational flow**: Audio → STT → LLM → Chat History → TTS → Audio

### 🛡️ Day 11: Robust Error Handling
- **Comprehensive try-catch blocks** for all API calls
- **Graceful fallback responses** when services fail
- **User-friendly error messages** with fallback audio
- **Network resilience** and timeout handling

### 🎨 Day 12: Modern UI Design
- **Royal Black Theme** with elegant gold accents
- **Unified recording button** with state-based functionality
- **Smooth animations** and visual feedback
- **Auto-playing audio** responses
- **Responsive design** for all devices

### 📚 Day 13: Complete Documentation
- **Comprehensive API documentation**
- **Setup and deployment guides**
- **Architecture explanations**
- **Usage examples and screenshots**

### 🔧 Day 14: Code Refactoring
- **Pydantic models** for request/response validation
- **Modular service architecture** in `/services` folder
- **Professional logging** throughout the application
- **Clean, maintainable code** structure

### 🌐 Day 15: WebSocket Integration
- **Real-time bidirectional communication** via WebSocket `/ws` endpoint
- **Instant message echo** for connection testing
- **Live audio visualization** during recording
- **Real-time processing status** updates
- **Enhanced session management** with WebSocket persistence
- **Improved error handling** with connection resilience

### 🎵 Day 16: Real-Time Audio Streaming
- **Binary WebSocket streaming** for real-time audio transmission
- **Dual recording modes** with intuitive toggle (Traditional ↔ Streaming)
- **Session-based file management** with automatic naming and timestamps
- **Live streaming progress** with chunk count and byte tracking
- **Audio file persistence** saved to `recordings/` directory
- **Comprehensive streaming statistics** including duration and average chunk size

### 🎤 Day 17: Real-Time Audio Transcription
- **AssemblyAI Python SDK integration** for streaming speech-to-text
- **Real-time transcription** with live partial and final results
- **16kHz, 16-bit, mono PCM audio format** for optimal transcription accuracy
- **Live transcription display** with confidence scores and timestamps
- **Transcription controls** with toggle and status indicators
- **Console and UI output** for comprehensive transcription monitoring
- **Session-based transcription management** with automatic cleanup



## 🔧 Setup & Installation

### Prerequisites
- Python 3.8+
- Node.js (for any additional frontend tooling)
- API Keys for:
  - Murf AI
  - AssemblyAI
  - Perplexity AI

### Installation Steps

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/Murf-ai.git
   cd Murf-ai
   ```

2. **Create virtual environment**
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. **Install dependencies**
   ```bash
   pip install fastapi uvicorn python-multipart requests assemblyai openai python-dotenv pydantic
   ```

4. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your API keys
   ```

5. **Run the application**
   ```bash
   uvicorn main:app --reload --host 0.0.0.0 --port 8000
   ```

6. **Access the application**
   - Open `http://localhost:8000` in your browser
   - API docs available at `http://localhost:8000/docs`

## 🔐 Environment Variables

Create a `.env` file with the following variables:

```env
MURF_API_KEY=your_murf_api_key_here
ASSEMBLYAI_API_KEY=your_assemblyai_api_key_here
PERPLEXITY_API_KEY=your_perplexity_api_key_here
LOG_LEVEL=INFO
MAX_CHAT_HISTORY=10
PERPLEXITY_MODEL=sonar
MURF_VOICE_CONFIG_JSON=
```

## 🔌 API Endpoints

### Core Endpoints (Days 10-15)

#### `WebSocket /ws` ⭐ **NEW in Day 15**
**Real-time bidirectional communication endpoint**

- **Connection**: WebSocket protocol for instant messaging
- **Features**: 
  - Session creation and management
  - Voice message processing (STT → LLM → TTS)
  - Real-time processing status updates
  - Echo testing for connection verification
  - Automatic reconnection with exponential backoff
- **Message Types**:
  - `session_create` - Create new conversation session
  - `session_join` - Join existing session
  - `voice_message` - Send audio for processing
  - `text_message` - Send text for processing
  - `echo` - Test connection with echo response
  - `processing_status` - Real-time processing updates

#### `GET /` 
**Main application interface**

- **Output**: Enhanced HTML interface with WebSocket support
- **Features**: Real-time audio visualization, modern UI, debug console

#### `GET /health`
**Service health monitoring**

- **Output**: Health status of all services (STT, TTS, LLM)
- **Use**: Monitoring and debugging

#### `GET /session/new`
**Create new session via HTTP**

- **Output**: New session ID and metadata
- **Use**: Alternative to WebSocket session creation

#### `GET /session/{session_id}/history`
**Retrieve chat history for debugging**

- **Input**: Session ID
- **Output**: Complete conversation history
- **Use**: Debugging and conversation analysis

#### `DELETE /session/{session_id}`
**Delete session and its history**

- **Input**: Session ID
- **Output**: Confirmation message
- **Use**: Reset conversations

### Legacy Endpoints (Days 1-9)

<details>
<summary>View earlier development endpoints</summary>

#### `POST /generate` (Day 2)
Basic text-to-speech conversion

#### `POST /upload` (Day 5)
File upload handling

#### `POST /transcribe/file` (Day 6)
Audio transcription service

#### `POST /tts/echo` (Day 7)
Echo bot with Murf voice

#### `POST /llm/query` (Days 8-9)
LLM query processing

</details>

## 🎨 Royal Black Theme

The UI features a sophisticated royal black color scheme:

- **Primary Background**: `#0a0a0a` (Deep Black)
- **Secondary Background**: `#1a1a1a` (Charcoal)
- **Accent Color**: `#ffd700` (Royal Gold)
- **Text Primary**: `#ffffff` (Pure White)
- **Text Secondary**: `#cccccc` (Light Gray)
- **Interactive Elements**: Gold gradients with smooth transitions
- **Recording State**: Pulsing red animation

## 🎯 Usage

### Starting a Conversation

1. **Open the application** in your web browser
2. **Click the microphone button** to start recording
3. **Speak your message** clearly
4. **Click stop** or wait for auto-stop
5. **Listen to the AI response** 
6. **Continue the conversation** - recording starts automatically after each response

### Session Management

- Sessions are created automatically with UUID
- Session ID appears in URL: `?session=abc-123-def`
- Share URL to continue conversations later
- Sessions persist until server restart (in-memory storage)

### Error Handling

The application gracefully handles various error scenarios:
- **Network timeouts**: "I'm having trouble connecting right now"
- **API failures**: Service-specific fallback messages
- **Audio issues**: Recording and playback error recovery
- **Invalid input**: User-friendly error notifications

## 🧪 Testing

### Manual Testing
1. **Basic Conversation**: Test simple back-and-forth
2. **Memory Testing**: Reference previous messages
3. **Error Scenarios**: Disconnect internet, test fallbacks
4. **Session Management**: Test multiple browser tabs
5. **Audio Quality**: Test in different environments

### API Testing
Use the FastAPI docs interface at `/docs` or tools like Postman:

```bash
# Test chat endpoint
curl -X POST "http://localhost:8000/agent/chat/test-session" \
     -H "Content-Type: multipart/form-data" \
     -F "audio=@test-audio.wav"
```

## 🎓 Learning Journey: Day-by-Day Development

### 📅 Foundation Phase (Days 1-5)

#### Day 1: Project Foundation
**Goal**: Initialize Python backend with FastAPI and serve basic HTML  
**What I Built**:
- FastAPI application with modern async architecture
- Basic `index.html` with responsive design
- Static file serving configuration
- Auto-generated API documentation setup
- Beautiful gradient backgrounds and card layouts

**Key Learning**: FastAPI's automatic OpenAPI documentation generation and static file serving capabilities.

#### Day 2: First TTS Integration  
**Goal**: Create server endpoint for Murf's REST TTS API  
**What I Built**:
- `/api/tts/generate` endpoint accepting text input
- Murf AI API integration with proper error handling
- Secure environment variable management
- Interactive API testing through FastAPI docs

**Key Learning**: RESTful API design patterns and secure API key management.

#### Day 3: Client-Side Voice Interface
**Goal**: Build frontend text input with TTS playback  
**What I Built**:
- Text input field with submit functionality
- JavaScript integration with backend TTS endpoint
- HTML `<audio>` element for playback
- Real-time status feedback for users

**Key Learning**: Frontend-backend communication and audio handling in browsers.

#### Day 4: Echo Bot Foundation
**Goal**: Record voice and play it back  
**What I Built**:
- Browser MediaRecorder API integration
- "Start Recording" and "Stop Recording" buttons
- Real-time audio recording with visual feedback
- Local audio playback functionality

**Key Learning**: WebRTC MediaRecorder API and browser audio permissions.

#### Day 5: Audio Upload System
**Goal**: Upload recorded audio to Python server  
**What I Built**:
- File upload endpoint with multipart form support
- `/uploads` folder management and cleanup
- Audio file metadata extraction (name, type, size)
- Upload status indicators in UI

**Key Learning**: File handling in FastAPI and multipart form data processing.

### 🧠 Intelligence Phase (Days 6-9)

#### Day 6: Speech Recognition
**Goal**: Transcribe uploaded audio files  
**What I Built**:
- `/transcribe/file` endpoint with AssemblyAI integration
- Direct audio-to-text processing without temp files
- Transcription accuracy optimization settings
- Real-time transcription status updates

**Key Learning**: Speech-to-text API integration and audio format handling.

#### Day 7: Voice Echo with AI
**Goal**: Transcribe → Generate TTS → Play Murf voice  
**What I Built**:
- `/tts/echo` endpoint combining STT and TTS
- Complete audio processing pipeline
- Voice selection and audio quality controls
- Transcript display alongside audio playback

**Key Learning**: API orchestration and creating seamless user experiences.

#### Day 8: LLM Integration
**Goal**: Add intelligent text responses  
**What I Built**:
- `/llm/query` endpoint with Perplexity AI
- Context-aware response generation
- Temperature and token limit controls
- Error handling for API failures

**Key Learning**: Large Language Model integration and prompt engineering basics.

#### Day 9: Voice-to-Voice Conversations
**Goal**: Complete STT → LLM → TTS pipeline  
**What I Built**:
- Audio input processing with transcription
- LLM response generation from speech
- Text-to-speech output with Murf voices
- Seamless voice conversation flow

**Key Learning**: Building complex AI pipelines and managing async operations.

### 🚀 Advanced Features Phase (Days 10-14)

#### Day 10: Conversational Memory
**Goal**: Implement session-based chat history  
**What I Built**:
- Session management with UUID generation
- In-memory chat history storage
- `/agent/chat/{session_id}` primary endpoint
- URL parameter session tracking
- Context-aware conversations with memory

**Key Learning**: State management in web applications and conversational AI context.

#### Day 11: Production-Ready Error Handling
**Goal**: Comprehensive error management and fallbacks  
**What I Built**:
- Try-catch blocks for all API integrations
- Graceful degradation when services fail
- User-friendly error messages
- Fallback TTS using Web Speech API
- Network timeout and retry logic

**Key Learning**: Building resilient applications and user experience during failures.

#### Day 12: Professional UI/UX Design
**Goal**: Create visually appealing, modern interface  
**What I Built**:
- **Royal Black Theme**: Deep blacks with gold accents
- Unified recording button with state animations
- Smooth CSS transitions and hover effects
- Auto-playing audio responses
- Responsive design for all devices
- Loading overlays with elegant spinners

**Key Learning**: Modern CSS techniques, animation, and creating premium user experiences.

#### Day 13: Complete Documentation
**Goal**: Professional project documentation  
**What I Built**:
- Comprehensive README with setup guides
- API endpoint documentation with examples
- Architecture diagrams and explanations
- Troubleshooting guides and FAQs
- Performance metrics and optimization tips

**Key Learning**: Technical writing and creating maintainable documentation.

#### Day 14: Code Architecture Refactoring
**Goal**: Clean, maintainable, production-ready code  
**What I Built**:
- **Pydantic Models**: Request/response validation
- **Modular Services**: Separate STT, TTS, LLM modules
- **Professional Logging**: Structured logging throughout
- **Error Response Models**: Consistent error handling
- **Service Status Endpoints**: Health monitoring
- **Clean Code Principles**: Separation of concerns

**Key Learning**: Software architecture principles and building maintainable codebases.

#### Day 15: WebSocket Real-Time Communication ⭐ **NEW**
**Goal**: Implement real-time bidirectional communication for enhanced user experience  
**What I Built**:
- **WebSocket Endpoint**: `/ws` for real-time client-server communication
- **Connection Management**: Automatic reconnection with exponential backoff
- **Echo Testing**: Simple message echo for connection verification
- **Real-time Processing**: Live status updates during voice processing
- **Enhanced Audio Visualization**: Real-time audio visualization during recording
- **Improved Session Management**: WebSocket-based session persistence
- **Debug Console**: Real-time logging and debugging interface
- **Mobile-Responsive UI**: Enhanced responsive design for all devices

**Key Learning**: Real-time web communication, WebSocket protocols, and building responsive user interfaces with live feedback.

#### Day 16: Real-Time Audio Streaming ⭐ **NEW**
**Goal**: Stream audio data in real-time from client to server and save to file  
**What I Built**:
- **Binary WebSocket Streaming**: Real-time audio chunk transmission via WebSocket
- **Dual Recording Modes**: Toggle between Traditional (record→process) and Streaming (real-time→file)
- **Session-Based File Management**: Automatic file creation with session IDs and timestamps
- **Real-Time Progress Tracking**: Live updates showing chunk count, bytes streamed, and progress
- **Advanced WebSocket Handling**: Support for both text (JSON) and binary (audio) message types
- **Streaming UI Controls**: Modern toggle switch with visual feedback and mode descriptions
- **File Persistence**: Audio saved to `recordings/stream_[session]_[timestamp].webm`
- **Comprehensive Statistics**: Duration, chunk count, total bytes, and average chunk size tracking

**Key Learning**: Real-time binary data streaming, mixed message type handling in WebSockets, and building dual-mode audio recording interfaces.

#### Day 17: Real-Time Audio Transcription (recap)
**Goal**: Live transcription during streaming

- Integrated AssemblyAI SDK for partial and final results over `/ws`
- Logged transcripts server-side and surfaced updates to the UI

#### Day 18: Turn Detection & UI Enhancements (recap)
**Goal**: Detect natural speaking turns with clear visual feedback

- Enabled end-of-turn detection via AssemblyAI streaming events
- Added status indicators and smoother UI interactions for recording/transcribing

#### Day 19: Streaming LLM Responses ⭐ NEW
**Goal**: After receiving the final transcript from AssemblyAI, stream the LLM response token-by-token, accumulate it, and print to the console.

**Implementation Plan**
- In `main.py` (`websocket_audio_streaming()`), on `TurnEvent` with `end_of_turn=True`, pass the transcript text to the LLM layer.
- Add a streaming helper in `services/llm.py` that yields incremental tokens/chunks from the LLM API.
- Accumulate chunks server-side and log tokens and the final assembled response to the console.

**How to Test**
- Run the app, connect the browser to `/ws`, and speak a short prompt.
- When the turn ends, watch the server console for streamed tokens arriving and the final concatenated response.

**Acceptance Criteria**
- Tokens from the LLM arrive incrementally and are printed as they stream in.
- The complete response string is assembled and logged after the stream ends.
- No blocking of the WebSocket loop; streaming runs without disrupting ongoing transcription sessions.

## 🚀 Deployment

### Local Development
```bash
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

### Production Deployment
```bash
# Install production dependencies
pip install gunicorn

# Run with Gunicorn
gunicorn main:app -w 4 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000
```

### Docker Deployment
```dockerfile
FROM python:3.9-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Murf AI** for creating this incredible **30 Days of AI Agent Challenge** and providing exceptional text-to-speech capabilities
- **AssemblyAI** for accurate speech recognition technology that powers our voice understanding
- **Perplexity AI** for intelligent conversational responses and advanced reasoning capabilities
- **FastAPI** for the robust, modern web framework that enables rapid development
- **The Challenge Community** for inspiration, feedback, and shared learning experiences

## 🐛 Troubleshooting

### Common Issues

**Audio not recording**
- Check browser permissions for microphone access
- Ensure HTTPS or localhost for WebRTC APIs

**API timeouts**
- Verify API keys in `.env` file
- Check network connectivity
- Review API rate limits

**Session not persisting**
- Sessions use in-memory storage (resets on server restart)
- For production, implement database storage

**UI not loading**
- Clear browser cache
- Check console for JavaScript errors
- Verify static file serving

### Debug Mode
Enable detailed logging:
```env
LOG_LEVEL=DEBUG
```

## 📊 Performance

- **Average Response Time**: 3-5 seconds (STT + LLM + TTS)
- **Audio Quality**: 44.1kHz, 16-bit (browser standard)
- **Concurrent Sessions**: Limited by memory (recommend Redis for production)
- **File Size Limits**: 10MB for audio uploads

## 🔮 Future Enhancements

- [ ] Database integration for persistent chat history
- [ ] Real-time streaming STT for faster responses
- [ ] Voice cloning with custom Murf voices
- [ ] Multi-language support
- [ ] Mobile app development
- [ ] Analytics and conversation insights
- [ ] Integration with more LLM providers
- [ ] Advanced conversation management

---

**Built with ❤️ during the 30 Days of AI Agent Challenge by Murf AI**

Part of an incredible learning journey to master AI agent development. Join the challenge and build the future of conversational AI!

For questions or support, please open an issue on GitHub.
