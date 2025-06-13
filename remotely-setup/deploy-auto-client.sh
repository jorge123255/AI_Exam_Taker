#!/bin/bash

# Auto-Connect Remotely Client Deployment Script
# This script sets up the Remotely client for automatic connection to the AI Exam server

set -e

echo "🚀 AI Exam Taker - Auto-Connect Client Setup"
echo "============================================="

# Configuration
SERVER_IP="192.168.1.32"
SERVER_PORT="5001"
CLIENT_NAME="AI-Exam-Client"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${BLUE}[$(date +'%H:%M:%S')]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[$(date +'%H:%M:%S')] ✅${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[$(date +'%H:%M:%S')] ⚠️${NC} $1"
}

print_error() {
    echo -e "${RED}[$(date +'%H:%M:%S')] ❌${NC} $1"
}

# Check if running on Windows (Git Bash, WSL, etc.)
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" || "$OSTYPE" == "cygwin" ]]; then
    PLATFORM="windows"
    CLIENT_EXE="Remotely_Desktop.exe"
    CONFIG_FILE="appsettings.json"
elif [[ "$OSTYPE" == "darwin"* ]]; then
    PLATFORM="macos"
    CLIENT_EXE="Remotely_Desktop"
    CONFIG_FILE="appsettings.json"
else
    PLATFORM="linux"
    CLIENT_EXE="Remotely_Desktop"
    CONFIG_FILE="appsettings.json"
fi

print_status "Detected platform: $PLATFORM"

# Function to create auto-connect configuration
create_autoconnect_config() {
    print_status "Creating auto-connect configuration..."
    
    cat > "$CONFIG_FILE" << EOF
{
  "ServerUri": "http://${SERVER_IP}:${SERVER_PORT}",
  "DeviceName": "${CLIENT_NAME}",
  "AutoConnect": true,
  "HideSessionId": true,
  "MinimizeToTray": true,
  "EnableClipboard": true,
  "EnableFileTransfer": true,
  "EnableAudio": false,
  "Quality": "High",
  "AutoReconnect": true,
  "ConnectionTimeout": 30000,
  "RetryAttempts": 5,
  "RetryDelay": 3000
}
EOF

    print_success "Configuration file created: $CONFIG_FILE"
}

# Function to create startup script
create_startup_script() {
    print_status "Creating startup script..."
    
    if [[ "$PLATFORM" == "windows" ]]; then
        cat > "start-ai-client.bat" << EOF
@echo off
echo Starting AI Exam Taker Client...
echo Connecting to server: http://${SERVER_IP}:${SERVER_PORT}
echo.

REM Start the Remotely client with auto-connect
start "" "${CLIENT_EXE}" --auto-connect --config "${CONFIG_FILE}"

echo Client started. Check system tray for connection status.
pause
EOF
        print_success "Windows startup script created: start-ai-client.bat"
        
    else
        cat > "start-ai-client.sh" << EOF
#!/bin/bash

echo "🚀 Starting AI Exam Taker Client..."
echo "Connecting to server: http://${SERVER_IP}:${SERVER_PORT}"
echo

# Make sure the client executable is executable
chmod +x "${CLIENT_EXE}"

# Start the Remotely client with auto-connect
./"${CLIENT_EXE}" --auto-connect --config "${CONFIG_FILE}" &

echo "✅ Client started. Check for connection status."
echo "Server: http://${SERVER_IP}:${SERVER_PORT}"
EOF
        chmod +x "start-ai-client.sh"
        print_success "Startup script created: start-ai-client.sh"
    fi
}

# Function to test server connectivity
test_server_connection() {
    print_status "Testing connection to server..."
    
    if command -v curl &> /dev/null; then
        if curl -s --connect-timeout 5 "http://${SERVER_IP}:${SERVER_PORT}" > /dev/null; then
            print_success "Server is reachable at http://${SERVER_IP}:${SERVER_PORT}"
        else
            print_warning "Server not reachable. Please ensure:"
            echo "  - Server is running on ${SERVER_IP}:${SERVER_PORT}"
            echo "  - Firewall allows connections"
            echo "  - Network connectivity is working"
        fi
    else
        print_warning "curl not available. Please manually verify server connectivity."
    fi
}

# Function to create desktop shortcut (Windows)
create_desktop_shortcut() {
    if [[ "$PLATFORM" == "windows" ]]; then
        print_status "Creating desktop shortcut..."
        
        cat > "AI Exam Client.bat" << EOF
@echo off
cd /d "%~dp0"
call start-ai-client.bat
EOF
        print_success "Desktop shortcut created: AI Exam Client.bat"
    fi
}

# Main deployment process
main() {
    print_status "Starting auto-connect client deployment..."
    
    # Create configuration
    create_autoconnect_config
    
    # Create startup script
    create_startup_script
    
    # Test server connection
    test_server_connection
    
    # Create desktop shortcut for Windows
    if [[ "$PLATFORM" == "windows" ]]; then
        create_desktop_shortcut
    fi
    
    echo
    print_success "Auto-connect client setup complete!"
    echo
    echo "📋 Next Steps:"
    echo "1. Place the Remotely client executable (${CLIENT_EXE}) in this directory"
    echo "2. Run the startup script to connect:"
    if [[ "$PLATFORM" == "windows" ]]; then
        echo "   - Double-click: start-ai-client.bat"
        echo "   - Or use desktop shortcut: AI Exam Client.bat"
    else
        echo "   - Run: ./start-ai-client.sh"
    fi
    echo "3. Client will automatically connect to: http://${SERVER_IP}:${SERVER_PORT}"
    echo "4. No session ID required - connection is automatic!"
    echo
    echo "🔧 Configuration Details:"
    echo "- Server: http://${SERVER_IP}:${SERVER_PORT}"
    echo "- Client Name: ${CLIENT_NAME}"
    echo "- Auto-Connect: Enabled"
    echo "- Hide Session ID: Enabled"
    echo "- Auto-Reconnect: Enabled"
    echo
    print_success "Setup complete! 🎉"
}

# Run main function
main "$@" 