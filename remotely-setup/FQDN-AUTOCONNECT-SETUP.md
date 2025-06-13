# FQDN/IP Auto-Connect Configuration Guide

This guide explains how to set up FQDN/IP based auto-connect functionality for the AI Exam Taker Remote Control system.

## Overview

The FQDN/IP auto-connect feature allows you to:
- Configure server endpoints using domain names or IP addresses
- Set up automatic connections when the portable client starts
- Manage multiple server configurations
- Generate portable client configuration files
- Monitor connection status and troubleshoot issues

## Server Configuration

### 1. Access the Remote Control Section

1. Open the AI Exam Taker Dashboard
2. Navigate to the "Control Panel" section
3. Find the "Server Configuration" area

### 2. Configure Server Settings

Fill in the following fields:

- **Configuration Name**: A friendly name for this server setup (e.g., "Main Exam Server")
- **Server Endpoint**: The FQDN or IP address with port (e.g., `192.168.1.32:5000` or `remotely.company.com:5000`)
- **Device ID**: The identifier of the target device you want to control
- **Access Key**: Your API access key for authentication
- **Auto-Connect**: Check this box to enable automatic connection on startup

### 3. Save and Test Configuration

1. Click "Save Configuration" to store your settings
2. Click "Test Connection" to verify the server is reachable
3. Use "Generate Client Config" to create portable client configuration files

## Auto-Connect Workflow

### How Auto-Connect Works

1. **Configuration Storage**: Server configurations are stored in the database
2. **Auto-Detection**: The system scans for auto-connect enabled configurations
3. **Automatic Connection**: When an auto-connect config is found, the system attempts connection
4. **Status Updates**: Connection status is displayed in real-time
5. **Fallback**: If auto-connect fails, manual connection options remain available

### Priority Order

The auto-detection system checks configurations in this order:

1. **Database Auto-Connect Configs**: Configurations with auto-connect enabled
2. **Recent Configurations**: Most recently used configurations
3. **Legacy Config**: Settings from config.json (backward compatibility)
4. **Network Discovery**: Automatic network scanning (if implemented)

## Portable Client Setup

### 1. Generate Client Configuration

1. Configure your server settings in the dashboard
2. Click "Generate Client Config"
3. Review the configuration in the preview modal
4. Click "Download Configuration" to save the file

### 2. Deploy to Portable Client

1. Save the downloaded file as `remotely-config.json`
2. Place it in the same directory as your Remotely client executable
3. Ensure the server endpoint is accessible from the client machine
4. Start the client - it will automatically use the configuration

### Example Client Configuration

```json
{
  "serverEndpoint": "192.168.1.32:5000",
  "deviceId": "exam-computer-001",
  "accessKey": "your-api-access-key-here",
  "organizationId": "your-organization-id",
  "autoConnect": true,
  "connectionTimeout": 30000,
  "retryAttempts": 3,
  "generatedAt": "2025-06-13T15:43:00.000Z"
}
```

## Configuration Management

### Managing Multiple Configurations

1. Click "Manage Configurations" to open the configuration manager
2. View all saved configurations with their details
3. Use the action buttons for each configuration:
   - **Load**: Load settings into the form for editing
   - **Test**: Test the connection without saving
   - **Generate**: Create a client configuration file
   - **Delete**: Remove the configuration

### Configuration Details

Each configuration shows:
- Configuration name and server endpoint
- Device ID and auto-connect status
- Creation date and last connection time
- Connection test results

## Troubleshooting

### Common Issues

1. **Connection Test Fails**
   - Verify server endpoint is correct and accessible
   - Check that the Remotely server is running
   - Ensure firewall allows connections on the specified port
   - Validate access key and device ID

2. **Auto-Connect Not Working**
   - Confirm auto-connect is enabled in the configuration
   - Check that the configuration is saved properly
   - Review debug console for connection attempts
   - Verify network connectivity between client and server

3. **Device Not Found**
   - Ensure the Remotely agent is installed on the target device
   - Verify the device ID matches the registered device
   - Check that the device is online and connected to the server

### Debug Information

The debug console provides detailed information about:
- Auto-detection scan results
- Connection attempts and failures
- Network connectivity issues
- Authentication problems

### Network Requirements

- **Ports**: Ensure the Remotely server port (typically 5000) is accessible
- **Protocols**: HTTPS is recommended for secure connections
- **Firewall**: Configure firewall rules to allow connections
- **DNS**: If using FQDN, ensure DNS resolution works correctly

## Security Considerations

### Access Key Management

- Store access keys securely
- Use environment variables or secure configuration files
- Rotate keys regularly
- Limit key permissions to necessary operations only

### Network Security

- Use HTTPS endpoints when possible
- Implement proper firewall rules
- Consider VPN connections for remote access
- Monitor connection logs for suspicious activity

### Client Configuration Security

- Protect client configuration files from unauthorized access
- Use secure file permissions
- Consider encrypting sensitive configuration data
- Regularly update client configurations

## API Endpoints

The following API endpoints support the FQDN/IP auto-connect functionality:

- `GET /api/remote-servers` - List all server configurations
- `POST /api/remote-servers` - Create new server configuration
- `PUT /api/remote-servers/:id` - Update server configuration
- `DELETE /api/remote-servers/:id` - Delete server configuration
- `GET /api/remote-servers/auto-connect` - Get auto-connect configurations
- `POST /api/remote-servers/:id/test-connection` - Test server connection
- `POST /api/remote-servers/:id/generate-client-config` - Generate client config

## Best Practices

1. **Naming Conventions**: Use descriptive names for configurations
2. **Testing**: Always test connections before deploying to production
3. **Documentation**: Document server endpoints and access requirements
4. **Monitoring**: Monitor connection status and performance
5. **Backup**: Keep backup copies of important configurations
6. **Updates**: Regularly update client configurations as needed

## Support

For additional support with FQDN/IP auto-connect setup:

1. Check the debug console for detailed error messages
2. Review the system logs for connection attempts
3. Verify network connectivity and firewall settings
4. Consult the Remotely documentation for server setup
5. Test with simple configurations before complex deployments