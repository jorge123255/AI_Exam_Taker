# Auto-Connect Remotely Client Setup

This guide will help you set up the Remotely client to automatically connect to your AI Exam Taker server without requiring session IDs or manual configuration.

## 🎯 Goal

- **No Session IDs**: Client connects automatically without user input
- **Auto-Detection**: Client finds and connects to the server automatically  
- **Zero Configuration**: User just opens the app and it works
- **Server Control**: Server chooses which computer to control from the web interface

## 📋 Quick Setup

### For Windows Users

1. **Download the Remotely Desktop Client**
   - Go to your server: `http://192.168.1.32:5001`
   - Click "Downloads" → Download "Desktop Client for Windows"
   - Save as `Remotely_Desktop.exe`

2. **Run Auto-Setup**
   - Double-click `deploy-auto-client.bat`
   - This creates all necessary configuration files

3. **Start the Client**
   - Double-click `start-ai-client.bat` OR
   - Double-click `AI Exam Client.bat` (desktop shortcut)

4. **Done!** 
   - Client automatically connects to `192.168.1.32:5001`
   - No session ID required
   - Check system tray for connection status

### For Mac/Linux Users

1. **Download the Remotely Desktop Client**
   - Go to your server: `http://192.168.1.32:5001`
   - Download appropriate client for your platform
   - Save as `Remotely_Desktop`

2. **Run Auto-Setup**
   ```bash
   chmod +x deploy-auto-client.sh
   ./deploy-auto-client.sh
   ```

3. **Start the Client**
   ```bash
   ./start-ai-client.sh
   ```

## 🔧 How It Works

### Auto-Connect Configuration

The setup creates an `appsettings.json` file with these settings:

```json
{
  "ServerUri": "http://192.168.1.32:5001",
  "DeviceName": "AI-Exam-Client",
  "AutoConnect": true,
  "HideSessionId": true,
  "MinimizeToTray": true,
  "AutoReconnect": true
}
```

### Key Features

- **AutoConnect**: Automatically connects on startup
- **HideSessionId**: No session ID dialog shown to user
- **AutoReconnect**: Reconnects if connection is lost
- **MinimizeToTray**: Runs quietly in system tray
- **DeviceName**: Shows as "AI-Exam-Client" in server interface

## 🖥️ Server-Side Control

Once the client is connected, you can control it from the server web interface:

1. **Go to Remote Control**: `http://192.168.1.32:5001/remote-control`
2. **Select Device**: Choose "AI-Exam-Client" from connected devices
3. **Start Session**: Click to start controlling the remote computer
4. **AI Integration**: Use the AI Control page to start automated exam taking

## 🔍 Troubleshooting

### Client Won't Connect

1. **Check Server Status**
   ```bash
   curl http://192.168.1.32:5001
   ```

2. **Verify Network Connectivity**
   - Ping the server: `ping 192.168.1.32`
   - Check firewall settings
   - Ensure port 5001 is open

3. **Check Client Logs**
   - Look for error messages in the client console
   - Check system tray for connection status

### Client Connects But Not Visible

1. **Check Device Name**
   - Look for "AI-Exam-Client" in the server's device list
   - May take a few seconds to appear

2. **Refresh Server Interface**
   - Reload the remote control page
   - Check the devices list

### Connection Keeps Dropping

1. **Network Stability**
   - Check for network interruptions
   - Consider using wired connection instead of WiFi

2. **Firewall Issues**
   - Ensure Windows Firewall allows Remotely client
   - Check corporate firewall settings

## 📁 File Structure

After running the setup, you'll have:

```
📁 Client Directory/
├── 📄 Remotely_Desktop.exe          # The client executable
├── 📄 appsettings.json              # Auto-connect configuration
├── 📄 start-ai-client.bat           # Startup script
├── 📄 AI Exam Client.bat            # Desktop shortcut
└── 📄 deploy-auto-client.bat        # Setup script
```

## 🚀 Advanced Configuration

### Custom Server Address

Edit the deployment script to change server address:

```batch
set SERVER_IP=your.server.ip
set SERVER_PORT=5001
```

### Custom Device Name

Change the device name in the configuration:

```json
{
  "DeviceName": "Custom-Client-Name"
}
```

### Connection Settings

Adjust timeouts and retry settings:

```json
{
  "ConnectionTimeout": 30000,
  "RetryAttempts": 5,
  "RetryDelay": 3000
}
```

## 🔐 Security Notes

- **Network Security**: Use VPN for connections over public networks
- **Firewall**: Configure firewall rules appropriately
- **Access Control**: Monitor connected devices in server interface
- **Updates**: Keep client and server updated

## 📞 Support

If you encounter issues:

1. **Check Logs**: Look at client console output
2. **Test Connectivity**: Verify network connection to server
3. **Server Status**: Ensure AI Exam Taker server is running
4. **Firewall**: Check firewall and network settings

## 🎯 Expected Workflow

1. **User starts client** → Automatic connection to server
2. **Server detects client** → "AI-Exam-Client" appears in device list  
3. **Admin selects device** → Start remote control session
4. **AI takes over** → Automated exam taking begins
5. **No user interaction** → Everything happens automatically

This setup eliminates the need for session IDs and makes the connection process completely transparent to the end user! 🎉 