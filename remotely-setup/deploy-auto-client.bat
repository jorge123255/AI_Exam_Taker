@echo off
setlocal enabledelayedexpansion

REM Auto-Connect Remotely Client Deployment Script (Windows)
REM This script sets up the Remotely client for automatic connection to the AI Exam server

echo.
echo 🚀 AI Exam Taker - Auto-Connect Client Setup
echo =============================================
echo.

REM Configuration
set SERVER_IP=192.168.1.32
set SERVER_PORT=5001
set CLIENT_NAME=AI-Exam-Client
set CLIENT_EXE=Remotely_Desktop.exe
set CONFIG_FILE=appsettings.json

echo [%time%] Detected platform: Windows
echo [%time%] Server: http://%SERVER_IP%:%SERVER_PORT%
echo.

REM Create auto-connect configuration
echo [%time%] Creating auto-connect configuration...

(
echo {
echo   "ServerUri": "http://%SERVER_IP%:%SERVER_PORT%",
echo   "DeviceName": "%CLIENT_NAME%",
echo   "AutoConnect": true,
echo   "HideSessionId": true,
echo   "MinimizeToTray": true,
echo   "EnableClipboard": true,
echo   "EnableFileTransfer": true,
echo   "EnableAudio": false,
echo   "Quality": "High",
echo   "AutoReconnect": true,
echo   "ConnectionTimeout": 30000,
echo   "RetryAttempts": 5,
echo   "RetryDelay": 3000
echo }
) > %CONFIG_FILE%

echo [%time%] ✅ Configuration file created: %CONFIG_FILE%
echo.

REM Create startup script
echo [%time%] Creating startup script...

(
echo @echo off
echo echo Starting AI Exam Taker Client...
echo echo Connecting to server: http://%SERVER_IP%:%SERVER_PORT%
echo echo.
echo.
echo REM Start the Remotely client with auto-connect
echo start "" "%CLIENT_EXE%" --auto-connect --config "%CONFIG_FILE%"
echo.
echo echo Client started. Check system tray for connection status.
echo pause
) > start-ai-client.bat

echo [%time%] ✅ Windows startup script created: start-ai-client.bat
echo.

REM Create desktop shortcut
echo [%time%] Creating desktop shortcut...

(
echo @echo off
echo cd /d "%%~dp0"
echo call start-ai-client.bat
) > "AI Exam Client.bat"

echo [%time%] ✅ Desktop shortcut created: AI Exam Client.bat
echo.

REM Test server connection
echo [%time%] Testing connection to server...

ping -n 1 %SERVER_IP% >nul 2>&1
if !errorlevel! equ 0 (
    echo [%time%] ✅ Server is reachable at %SERVER_IP%
) else (
    echo [%time%] ⚠️ Server not reachable. Please ensure:
    echo   - Server is running on %SERVER_IP%:%SERVER_PORT%
    echo   - Firewall allows connections
    echo   - Network connectivity is working
)

echo.
echo [%time%] ✅ Auto-connect client setup complete!
echo.
echo 📋 Next Steps:
echo 1. Place the Remotely client executable (%CLIENT_EXE%^) in this directory
echo 2. Run the startup script to connect:
echo    - Double-click: start-ai-client.bat
echo    - Or use desktop shortcut: AI Exam Client.bat
echo 3. Client will automatically connect to: http://%SERVER_IP%:%SERVER_PORT%
echo 4. No session ID required - connection is automatic!
echo.
echo 🔧 Configuration Details:
echo - Server: http://%SERVER_IP%:%SERVER_PORT%
echo - Client Name: %CLIENT_NAME%
echo - Auto-Connect: Enabled
echo - Hide Session ID: Enabled
echo - Auto-Reconnect: Enabled
echo.
echo [%time%] ✅ Setup complete! 🎉
echo.
pause 