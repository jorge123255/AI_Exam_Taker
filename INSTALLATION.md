# AI Exam Taker - Installation Guide

## Prerequisites

### System Requirements
- **Node.js**: Version 18.0.0 or higher
- **Python**: Version 3.8+ (for some dependencies)
- **Operating System**: macOS, Windows, or Linux
- **Memory**: At least 4GB RAM (8GB+ recommended)
- **Storage**: 2GB free space

### External Services
1. **Ollama Server**: Running on 192.168.1.10:11434 (or update config.json)
   - Required models: `qwen2-vl:latest`, `qwen2.5:latest`, `nomic-embed-text:latest`
2. **ChromaDB**: For vector storage (will be installed automatically)
3. **RDP Target**: The device/system where exams will be taken

## Installation Steps

### 1. Clone and Setup
```bash
# Clone the repository
git clone <repository-url>
cd AI_Exam_Taker

# Install dependencies
npm install

# Make start script executable (Unix/macOS)
chmod +x start.js
```

### 2. Configure Ollama Models
Ensure your Ollama server has the required models:
```bash
# On your Ollama server (192.168.1.10)
ollama pull qwen2-vl:latest
ollama pull qwen2.5:latest  
ollama pull nomic-embed-text:latest
```

### 3. Configuration
Edit `config.json` to match your environment:
```json
{
  "ollama": {
    "endpoint": "http://192.168.1.10:11434",
    "models": {
      "vision": "qwen2-vl:latest",
      "reasoning": "qwen2.5:latest", 
      "embedding": "nomic-embed-text:latest"
    }
  }
}
```

### 4. Start the Application
```bash
# Start with automatic setup
npm start

# Or start directly (if database already exists)
npm run direct

# Development mode with auto-restart
npm run dev
```

## First Time Setup

### 1. Database Initialization
The application will automatically:
- Create required directories (`data/`, `logs/`, `uploads/`)
- Initialize SQLite database
- Create necessary tables
- Add sample knowledge base entries

### 2. Access the Dashboard
Open your browser and navigate to:
- **Main Dashboard**: http://localhost:3000
- **Direct Dashboard**: http://localhost:3000/dashboard
- **Health Check**: http://localhost:3000/health

## Usage Guide

### 1. Connect to RDP
1. Open the dashboard
2. Enter RDP connection details:
   - **Host**: IP address of target machine
   - **Username**: RDP username
   - **Password**: RDP password
   - **Port**: RDP port (default: 3389)
3. Click "Connect RDP"

### 2. Upload Knowledge Base
Before taking exams, populate the knowledge base:

#### Upload PDF Files
1. Use the API endpoint: `POST /api/upload-pdf`
2. Or use curl:
```bash
curl -X POST -F "pdf=@exam_answers.pdf" \
     -F "subject=mathematics" \
     -F "difficulty=medium" \
     http://localhost:3000/api/upload-pdf
```

#### Add Manual Entries
```bash
curl -X POST -H "Content-Type: application/json" \
     -d '{"question":"What is 2+2?","answer":"4","subject":"math"}' \
     http://localhost:3000/api/rag/add-manual
```

### 3. Start Exam Taking
1. Ensure RDP is connected
2. Navigate to the exam interface on the remote machine
3. Click "Start Exam" in the dashboard
4. The AI will begin analyzing the screen and answering questions

### 4. Monitor Progress
- **Live Screen**: View real-time screenshots
- **Current Question**: See detected questions and AI reasoning
- **Performance Metrics**: Track success rate and confidence
- **System Log**: Monitor AI reasoning and actions

### 5. Manual Override
When the AI is uncertain:
1. Click "Manual Override" to take control
2. Click on the screen to manually select answers
3. Click "Manual Override" again to return control to AI

## API Endpoints

### Core Functionality
- `POST /api/rdp/connect` - Connect to RDP
- `POST /api/rdp/disconnect` - Disconnect RDP
- `POST /api/exam/start` - Start exam taking
- `POST /api/exam/stop` - Stop exam taking
- `POST /api/exam/override` - Toggle manual override

### Knowledge Management
- `POST /api/upload-pdf` - Upload PDF answer sheets
- `POST /api/rag/add-manual` - Add manual Q&A entries
- `GET /api/rag/search` - Search knowledge base
- `GET /api/rag/stats` - Get RAG system statistics

### Monitoring
- `GET /api/status` - Get system status
- `GET /api/sessions` - List exam sessions
- `GET /api/sessions/:id` - Get session details
- `GET /api/health/ollama` - Check Ollama connection
- `GET /api/health/system` - System health check

## Troubleshooting

### Common Issues

#### 1. Ollama Connection Failed
```
Error: Vision analysis failed: connect ECONNREFUSED 192.168.1.10:11434
```
**Solution**: 
- Verify Ollama server is running
- Check IP address and port in config.json
- Ensure required models are installed

#### 2. RDP Connection Failed
```
Error: RDP connection failed
```
**Solution**:
- Verify target machine allows RDP connections
- Check credentials and network connectivity
- Ensure RDP port (3389) is open

#### 3. Database Errors
```
Error: SQLITE_CANTOPEN: unable to open database file
```
**Solution**:
- Check file permissions in `data/` directory
- Run `npm run setup-db` to reinitialize
- Ensure sufficient disk space

#### 4. PDF Processing Failed
```
Error: Only PDF files are allowed
```
**Solution**:
- Ensure file is a valid PDF
- Check file size (max 50MB)
- Verify file is not corrupted

### Performance Optimization

#### 1. Reduce Screenshot Frequency
Edit `config.json`:
```json
{
  "rdp": {
    "screenshotInterval": 2000
  }
}
```

#### 2. Adjust AI Confidence Threshold
```json
{
  "ai": {
    "confidence_threshold": 0.7
  }
}
```

#### 3. Optimize RAG Search
```json
{
  "rag": {
    "similarity_threshold": 0.6,
    "max_results": 3
  }
}
```

## Development

### Project Structure
```
AI_Exam_Taker/
├── src/
│   ├── ai/              # AI components (Ollama, RAG, Vision)
│   ├── core/            # Core exam taking logic
│   ├── database/        # Database management
│   ├── utils/           # Utilities (logging, actions, PDF)
│   ├── api/             # API routes
│   └── index.js         # Main application
├── public/              # Web dashboard
├── config.json          # Configuration
├── package.json         # Dependencies
└── start.js            # Startup script
```

### Adding New Features
1. Create feature branch
2. Add new modules in appropriate `src/` subdirectory
3. Update API routes if needed
4. Add tests
5. Update documentation

### Testing
```bash
# Run tests
npm test

# Test specific components
curl -X POST -H "Content-Type: application/json" \
     -d '{"question":"Test question","options":[{"text":"A"},{"text":"B"}]}' \
     http://localhost:3000/api/test/reasoning
```

## Security Considerations

### 1. Network Security
- Use VPN for RDP connections
- Restrict access to dashboard (add authentication)
- Use HTTPS in production

### 2. Data Protection
- Encrypt sensitive exam data
- Secure API keys for external services
- Regular backup of knowledge base

### 3. Access Control
- Implement user authentication
- Role-based access control
- Audit logging

## Support

For issues and questions:
1. Check this documentation
2. Review logs in `logs/app.log`
3. Check system health at `/api/health/system`
4. Create GitHub issue with detailed error information

## License

MIT License - see LICENSE file for details.