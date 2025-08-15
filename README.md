# 🎤 30 Days of AI Agent Challenge by Murf AI

A comprehensive learning journey building sophisticated AI-powered conversational agents from scratch. This repository documents the progressive development of voice-enabled AI systems, combining cutting-edge Speech-to-Text (STT), Large Language Model (LLM), and Text-to-Speech (TTS) technologies.

## 🚀 Challenge Overview

This project represents the **30 Days of AI Agent Challenge by Murf AI** - an intensive hands-on journey to master AI agent development. Currently showcasing the first 14 days of learning and building:

- **FastAPI** backend with Python for robust server architecture
- **Murf AI** for premium text-to-speech capabilities
- **AssemblyAI** for accurate speech transcription
- **Perplexity AI** for intelligent conversational responses
- **Royal Black** themed modern web interface for elegant user experience

## ✨ Features (Days 10-14 Focus)

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

## 🏗️ Architecture

```
Murf-ai/
├── main.py                 # FastAPI application entry point
├── services/               # Service layer
│   ├── __init__.py
│   ├── stt_service.py     # AssemblyAI integration
│   ├── tts_service.py     # Murf AI integration
│   └── llm_service.py     # Perplexity AI integration
├── static/                # Frontend assets
│   ├── index.html         # Main UI
│   ├── style.css         # Royal Black theme
│   └── script.js         # Frontend logic
├── models/                # Pydantic models
│   └── __init__.py
├── uploads/              # Temporary audio files
├── .env                  # Environment variables
├── requirements.txt      # Python dependencies
└── README.md            # This file
```

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
```

## 🔌 API Endpoints

### Core Endpoints (Days 10-14)

#### `POST /agent/chat/{session_id}`
**Primary conversational endpoint with memory**

- **Input**: Audio file (multipart/form-data)
- **Process**: STT → Chat History → LLM → Update History → TTS
- **Output**: Audio URL with conversation context
- **Features**: Session persistence, error handling, fallback responses

#### `GET /agent/history/{session_id}`
**Retrieve chat history for debugging**

- **Input**: Session ID
- **Output**: Complete conversation history
- **Use**: Debugging and conversation analysis

#### `DELETE /agent/history/{session_id}`
**Clear session history**

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
