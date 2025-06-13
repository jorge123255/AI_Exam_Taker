# Remotely Server Setup for AI Exam Taker

## Quick Start

1. **Start the Remotely server:**
   ```bash
   cd remotely-setup
   docker-compose up -d
   ```

2. **Access the Remotely dashboard:**
   - Open: http://192.168.1.32:5001
   - Create your admin account (first user becomes admin)

3. **Get your API credentials:**
   - Go to Account → API Access
   - Create a new API token
   - Note down the API Key ID and Secret

## Configuration for AI Exam Taker

Once Remotely is running, use these settings in your AI Exam Taker dashboard:

- **Remotely Server URL:** `http://192.168.1.32:5001`
- **Device ID:** (Get from Remotely dashboard after installing agent)
- **Access Key:** `[API_KEY_ID]:[API_SECRET]` (from step 3 above)
- **Organization ID:** (Optional, leave blank for default)

## Installing Remotely Agent on Target Machines

### Windows:
1. Download installer from: http://192.168.1.32:5001/Downloads
2. Run the installer on your target exam machine
3. The device will appear in the Remotely dashboard

### Linux:
```bash
curl -L http://192.168.1.32:5001/Downloads/Remotely-Linux.zip -o remotely.zip
unzip remotely.zip
sudo ./install.sh
```

## Troubleshooting

- **Can't access http://192.168.1.32:5001:** Wait 30-60 seconds for container to start
- **No devices showing:** Make sure agent is installed and can reach the server
- **API errors:** Verify your API key format is `ID:SECRET`

## Security Notes

- This setup is for local testing
- For production, use HTTPS and proper authentication
- Consider using Caddy reverse proxy for internet exposure 