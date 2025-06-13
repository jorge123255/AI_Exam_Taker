# AI Exam Taker

An intelligent application that can take control of RDP sessions to automatically complete exams using AI vision and reasoning capabilities.

## 🚀 Quick Start

```bash
# Clone the repository
git clone <repository-url>
cd AI_Exam_Taker

# Install dependencies
npm install

# Test your setup
npm run test-setup

# Start the application
npm start
```

Open your browser to http://localhost:3000 to access the dashboard.

## ✨ Features

- **🖥️ RDP Integration**: Connect to remote machines for exam taking
- **👁️ AI Vision**: Advanced screen analysis using Ollama qwen2-vl model
- **🧠 Smart Reasoning**: Multi-model AI reasoning for answer selection
- **📚 RAG System**: Vector database for storing and retrieving exam knowledge
- **📄 PDF Processing**: Extract Q&A pairs from PDF answer sheets
- **🔍 Web Search**: Fallback search using Firecrawl/Tully APIs
- **🎮 Manual Override**: Take control when AI needs human assistance
- **📊 Real-time Monitoring**: Live dashboard with AI reasoning logs
- **🎯 Multi-format Support**: Handle various question types (multiple choice, drag & drop, etc.)

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Web Dashboard │    │   RDP Client    │    │   AI Engine     │
│   (Control)     │◄──►│   (Screenshots) │◄──►│   (Ollama)      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   SQLite DB     │    │   Vision        │    │   RAG System    │
│   (Sessions)    │    │   Analyzer      │    │   (ChromaDB)    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 📋 Prerequisites

- **Node.js** 18.0.0+
- **Ollama Server** with required models:
  - `qwen2-vl:latest` (vision analysis)
  - `qwen2.5:latest` (reasoning)
  - `nomic-embed-text:latest` (embeddings)
- **RDP Access** to target exam machines

## 🛠️ Installation

See [INSTALLATION.md](INSTALLATION.md) for detailed setup instructions.

### Quick Setup
1. **Install Ollama models** on your Ollama server (192.168.1.10):
   ```bash
   ollama pull qwen2-vl:latest
   ollama pull qwen2.5:latest
   ollama pull nomic-embed-text:latest
   ```

2. **Configure the application**:
   ```bash
   cp config.example.json config.json
   # Edit config.json with your Ollama endpoint and settings
   ```

3. **Start the application**:
   ```bash
   npm start
   ```

## 🎯 Usage

### 1. Connect to RDP
- Enter target machine credentials in the dashboard
- Click "Connect RDP" to establish connection

### 2. Upload Knowledge Base
- Upload PDF files with exam answers via the dashboard
- Or use the API: `POST /api/upload-pdf`

### 3. Start Exam Taking
- Navigate to exam interface on remote machine
- Click "Start Exam" in dashboard
- Monitor AI progress and reasoning in real-time

### 4. Manual Override
- Click "Manual Override" when AI needs assistance
- Click on screen to manually select answers
- Return control to AI when ready

## 🔧 Configuration

Key configuration options in `config.json`:

```json
{
  "ollama": {
    "endpoint": "http://192.168.1.10:11434",
    "models": {
      "vision": "qwen2-vl:latest",
      "reasoning": "qwen2.5:latest",
      "embedding": "nomic-embed-text:latest"
    }
  },
  "ai": {
    "confidence_threshold": 0.8,
    "screenshot_analysis_delay": 2000
  },
  "rag": {
    "similarity_threshold": 0.7,
    "max_results": 5
  }
}
```

## 📡 API Endpoints

### Core Operations
- `POST /api/rdp/connect` - Connect to RDP
- `POST /api/exam/start` - Start exam taking
- `POST /api/exam/override` - Toggle manual control

### Knowledge Management
- `POST /api/upload-pdf` - Upload PDF answer sheets
- `POST /api/rag/add-manual` - Add manual Q&A entries
- `GET /api/rag/search` - Search knowledge base

### Monitoring
- `GET /api/status` - System status
- `GET /api/sessions` - Exam sessions
- `GET /api/health/ollama` - Ollama health check

## 🧪 Testing

```bash
# Test your setup
npm run test-setup

# Test specific components
curl -X POST -H "Content-Type: application/json" \
     -d '{"question":"Test question","options":[{"text":"A"},{"text":"B"}]}' \
     http://localhost:3000/api/test/reasoning
```

## 📊 Dashboard Features

- **Live Screen View**: Real-time screenshots of exam interface
- **Question Detection**: AI-detected questions and options
- **Answer Reasoning**: Step-by-step AI reasoning process
- **Performance Metrics**: Success rate, confidence scores, timing
- **Manual Control**: Click-to-answer when needed
- **System Logs**: Comprehensive logging and debugging

## 🔍 How It Works

1. **Screen Capture**: Takes screenshots of RDP session
2. **Vision Analysis**: AI analyzes screen to detect questions and options
3. **Knowledge Search**: Searches RAG database for similar questions
4. **AI Reasoning**: Uses LLM to reason about the best answer
5. **Action Execution**: Clicks the selected answer automatically
6. **Monitoring**: Logs all actions and reasoning for review

## 🛡️ Security Considerations

- Use VPN for RDP connections
- Secure API endpoints in production
- Encrypt sensitive exam data
- Implement user authentication
- Regular security audits

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## ⚠️ Disclaimer

This tool is for educational and research purposes. Ensure compliance with exam policies and academic integrity guidelines. Users are responsible for ethical use of this software.

## 🆘 Support

- 📖 Check [INSTALLATION.md](INSTALLATION.md) for setup help
- 🐛 Report issues on GitHub
- 💬 Join discussions in GitHub Discussions
- 📧 Contact maintainers for enterprise support

---

**Built with ❤️ using Node.js, Ollama, and modern AI technologies**