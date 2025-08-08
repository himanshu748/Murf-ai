# 30 Days of Voice Agents

A comprehensive journey through building voice-enabled applications and AI agents. This project demonstrates the evolution from basic web applications to sophisticated voice agent systems.

## 🎯 Current Progress

### Day 1: Project Setup ✅
- **Task**: Initialize a Python backend using FastAPI
- **Status**: Completed
- **Features**:
  - FastAPI backend with modern async support
  - Static file serving for HTML, CSS, and JavaScript
  - Beautiful, responsive UI
  - Auto-generated API documentation

### Day 2: Your First REST TTS Call ✅
- **Task**: Create a server endpoint that accepts text and calls Murf's REST TTS API
- **Status**: Completed
- **Features**:
  - `/api/tts/generate` endpoint for text-to-speech conversion
  - Integration with Murf AI's TTS API
  - Secure API key management using environment variables
  - Interactive API documentation at `/docs`

### Day 7: Echo Bot v2 — Transcribe and Speak with Murf ✅
- **Task**: Build `/tts/echo` to accept audio, transcribe with AssemblyAI, synthesize with Murf, and return audio URL.
- **Status**: Completed
- **Features**:
  - Endpoint: `POST /tts/echo` (multipart FormData `audio_file`)
  - Transcription via AssemblyAI
  - TTS via Murf AI
  - UI button “Murf Echo” to play Murf-generated audio and show transcript

## 🚀 Getting Started

### Prerequisites
- Python 3.8+
- Murf AI API key

### Installation

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd Murf-ai
   ```

2. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

3. **Set up environment variables**
   ```bash
   # Create a .env file with your Murf API key
   echo "MURF_API_KEY=your_api_key_here" > .env
   ```

4. **Run the application**
   ```bash
   cd murf-ai-challenge
   python app.py
   ```

5. **Access the application**
   - Main page: http://localhost:8000
   - API documentation: http://localhost:8000/docs
   - Basic API test: http://localhost:8000/api/data

## 📚 API Endpoints

### GET /
Serves the main HTML page with project information.

### GET /api/data
Basic API endpoint that returns a simple JSON response.

### POST /api/tts/generate
Generates TTS audio using Murf AI's API.

**Request Body:**
```json
{
  "text": "Hello, world!",
  "voice_id": "en-US-Neural2-F",
  "output_format": "mp3"
}
```

**Response:**
```json
{
  "success": true,
  "audio_url": "https://api.murf.ai/...",
  "message": "TTS generated successfully"
}
```

### POST /tts/echo
Transcribes uploaded audio using AssemblyAI and generates Murf audio.

Example:
```bash
curl -X POST "http://localhost:8000/tts/echo" \
  -F "audio_file=@/path/to/recording.webm"
```

## 🔧 Testing the TTS API

### Using the Interactive Docs
1. Visit http://localhost:8000/docs
2. Click on the `/api/tts/generate` endpoint
3. Click "Try it out"
4. Enter your text and parameters
5. Click "Execute"

### Using curl
```bash
curl -X POST "http://localhost:8000/api/tts/generate" \
     -H "Content-Type: application/json" \
     -d '{
       "text": "Hello, this is a test!",
       "voice_id": "en-US-Neural2-F",
       "output_format": "mp3"
     }'
```

### Using JavaScript (in browser console)
```javascript
testTTSAPI("Hello, this is a test message!");
```

## 🛡️ Security

- API keys are stored securely in `.env` files
- `.env` files are excluded from version control
- Environment variables are loaded using python-dotenv

## 📁 Project Structure

```
Murf-ai/
├── murf-ai-challenge/
│   ├── app.py              # FastAPI application
│   ├── templates/
│   │   └── index.html      # Main HTML page (Jinja template)
│   └── static/
│       ├── style.css       # Modern CSS styling
│       └── script.js       # Interactive JavaScript
├── requirements.txt    # Python dependencies
├── .env               # Environment variables (not in git)
└── README.md          # This file
```

## 🎨 Features

- **Modern UI**: Beautiful gradient background with card-based layout
- **Responsive Design**: Works on desktop and mobile devices
- **Interactive Elements**: Smooth animations and hover effects
- **Auto Documentation**: FastAPI's automatic API documentation
- **Error Handling**: Comprehensive error handling for API calls
- **Security**: Secure API key management

## 🔮 Next Steps

This project will continue with daily challenges covering:
- Voice recognition and speech-to-text
- Natural language processing
- Conversational AI
- Voice agent frameworks
- And much more!

## 📝 License

This project is part of the 30 Days of Voice Agents challenge.

---

**Ready to start your voice agent journey?** 🎤✨
