const WebSocket = require('ws');
const EventEmitter = require('events');
const logger = require('../utils/logger');
const config = require('../../config.json');
const axios = require('axios');

class RemotelyClient extends EventEmitter {
    constructor() {
        super();
        this.ws = null;
        this.sessionId = null;
        this.deviceId = null;
        this.connected = false;
        this.remotelyServerUrl = null;
        this.accessKey = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 5000;
    }

    async connect({ remotelyServerUrl, deviceId, accessKey, organizationId }) {
        try {
            logger.info('Connecting to Remotely server:', { remotelyServerUrl, deviceId });

            this.remotelyServerUrl = remotelyServerUrl;
            this.deviceId = deviceId;
            this.accessKey = accessKey;

            // Parse the access key (format: keyId:keySecret)
            const accessKeyParts = accessKey.trim().split(':');
            if (accessKeyParts.length !== 2) {
                throw new Error('Access key must be in format: keyId:keySecret');
            }
            
            const [keyId, keySecret] = accessKeyParts;
            
            // First, get all available devices to check if any exist
            const allDevicesResponse = await axios.get(`${remotelyServerUrl}/api/devices`, {
                headers: {
                    'X-Api-Key': `${keyId}:${keySecret}`,
                    'Content-Type': 'application/json'
                }
            });

            const availableDevices = allDevicesResponse.data;
            
            if (!availableDevices || availableDevices.length === 0) {
                throw new Error(`No devices are connected to the Remotely server. Please install the Remotely agent on a target computer first. Visit ${remotelyServerUrl}/downloads to download the agent.`);
            }

            // Check if the specified device exists
            const deviceExists = availableDevices.some(device => device.id === deviceId);
            if (!deviceExists) {
                const deviceList = availableDevices.map(d => `${d.id} (${d.deviceName})`).join(', ');
                throw new Error(`Device ${deviceId} not found. Available devices: ${deviceList}`);
            }

            // Get specific device info
            const deviceResponse = await axios.get(`${remotelyServerUrl}/api/devices/${deviceId}`, {
                headers: {
                    'X-Api-Key': `${keyId}:${keySecret}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!deviceResponse.data) {
                throw new Error(`Device ${deviceId} not found or access denied`);
            }

            logger.info('Device verified, establishing remote control session');

            // Launch remote control session using Remotely API
            const remoteControlResponse = await axios.post(`${remotelyServerUrl}/api/RemoteControl/Viewer/`, {
                deviceID: deviceId
            }, {
                headers: {
                    'X-Api-Key': `${keyId}:${keySecret}`,
                    'Content-Type': 'application/json'
                }
            });

            if (remoteControlResponse.data) {
                this.connected = true;
                this.sessionId = this.generateConnectionId();
                logger.info('Remotely session established:', this.sessionId);
                this.emit('connected');
                
                return { 
                    sessionId: this.sessionId,
                    connectionUrl: remoteControlResponse.data
                };
            } else {
                throw new Error('Failed to establish remote control session');
            }


        } catch (error) {
            logger.error('Failed to connect to Remotely:', error);
            throw error;
        }
    }

    async disconnect() {
        try {
            if (this.ws && this.connected) {
                this.sendMessage({
                    type: 'ViewerDisconnected',
                    viewerConnectionId: this.sessionId
                });

                this.ws.close();
                this.connected = false;
                this.sessionId = null;
                logger.info('Disconnected from Remotely server');
            }
        } catch (error) {
            logger.error('Error disconnecting from Remotely:', error);
            throw error;
        }
    }

    handleMessage(data) {
        try {
            const message = JSON.parse(data.toString());
            
            switch (message.type) {
                case 'ScreenData':
                    this.handleScreenData(message);
                    break;
                case 'ConnectionEstablished':
                    this.sessionId = message.connectionId;
                    logger.info('Remotely session established:', this.sessionId);
                    break;
                case 'CursorChange':
                    this.emit('cursor_change', message);
                    break;
                case 'ScreenSize':
                    this.emit('screen_size', message);
                    break;
                case 'ClipboardText':
                    this.emit('clipboard', message);
                    break;
                default:
                    logger.debug('Unhandled Remotely message type:', message.type);
            }
        } catch (error) {
            logger.error('Error handling Remotely message:', error);
        }
    }

    handleScreenData(message) {
        try {
            // Screen data comes as base64 encoded image
            const imageData = message.imageData;
            const imageFormat = message.imageFormat || 'jpeg';
            
            this.emit('screenshot', {
                imageData,
                imageFormat,
                timestamp: new Date().toISOString(),
                bounds: message.bounds
            });
        } catch (error) {
            logger.error('Error handling screen data:', error);
        }
    }

    sendMessage(message) {
        if (this.ws && this.connected) {
            this.ws.send(JSON.stringify(message));
        } else {
            logger.warn('Cannot send message: not connected to Remotely');
        }
    }

    sendMouseClick(x, y, button = 'left') {
        const message = {
            type: 'MouseClick',
            x: x,
            y: y,
            button: button,
            viewerConnectionId: this.sessionId
        };
        
        this.sendMessage(message);
        logger.debug('Sent mouse click:', { x, y, button });
    }

    sendMouseMove(x, y) {
        const message = {
            type: 'MouseMove',
            x: x,
            y: y,
            viewerConnectionId: this.sessionId
        };
        
        this.sendMessage(message);
    }

    sendKeyPress(key, modifiers = []) {
        const message = {
            type: 'KeyPress',
            key: key,
            modifiers: modifiers,
            viewerConnectionId: this.sessionId
        };
        
        this.sendMessage(message);
        logger.debug('Sent key press:', { key, modifiers });
    }

    sendKeyDown(key) {
        const message = {
            type: 'KeyDown',
            key: key,
            viewerConnectionId: this.sessionId
        };
        
        this.sendMessage(message);
    }

    sendKeyUp(key) {
        const message = {
            type: 'KeyUp',
            key: key,
            viewerConnectionId: this.sessionId
        };
        
        this.sendMessage(message);
    }

    sendTextInput(text) {
        const message = {
            type: 'TextInput',
            text: text,
            viewerConnectionId: this.sessionId
        };
        
        this.sendMessage(message);
        logger.debug('Sent text input:', { textLength: text.length });
    }

    requestScreenshot() {
        const message = {
            type: 'GetScreenshot',
            viewerConnectionId: this.sessionId
        };
        
        this.sendMessage(message);
    }

    setQuality(quality) {
        const message = {
            type: 'SetQuality',
            quality: quality, // 0-100
            viewerConnectionId: this.sessionId
        };
        
        this.sendMessage(message);
    }

    attemptReconnect() {
        this.reconnectAttempts++;
        logger.info(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
        
        setTimeout(() => {
            if (this.remotelyServerUrl && this.deviceId && this.accessKey) {
                this.connect({
                    remotelyServerUrl: this.remotelyServerUrl,
                    deviceId: this.deviceId,
                    accessKey: this.accessKey
                }).catch(error => {
                    logger.error('Reconnection failed:', error);
                });
            }
        }, this.reconnectDelay);
    }

    generateConnectionId() {
        return 'viewer_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
    }

    isConnected() {
        return this.connected;
    }

    getSessionId() {
        return this.sessionId;
    }

    getDeviceId() {
        return this.deviceId;
    }

    // Enhanced methods for exam taking
    async clickAnswer(coordinates, options = {}) {
        try {
            const { x, y } = coordinates;
            const { doubleClick = false, delay = 100 } = options;

            // Move mouse to position first
            this.sendMouseMove(x, y);
            
            // Small delay to ensure mouse movement
            await new Promise(resolve => setTimeout(resolve, delay));
            
            // Perform click
            if (doubleClick) {
                this.sendMouseClick(x, y, 'left');
                await new Promise(resolve => setTimeout(resolve, 50));
                this.sendMouseClick(x, y, 'left');
            } else {
                this.sendMouseClick(x, y, 'left');
            }

            logger.info('Answer clicked via Remotely:', { x, y, doubleClick });
            return { success: true, coordinates: { x, y } };
        } catch (error) {
            logger.error('Failed to click answer via Remotely:', error);
            throw error;
        }
    }

    async typeAnswer(text, options = {}) {
        try {
            const { clearFirst = false, delay = 50 } = options;

            if (clearFirst) {
                // Select all and delete
                this.sendKeyPress('a', ['ctrl']);
                await new Promise(resolve => setTimeout(resolve, delay));
                this.sendKeyPress('Delete');
                await new Promise(resolve => setTimeout(resolve, delay));
            }

            // Type the text
            this.sendTextInput(text);

            logger.info('Text typed via Remotely:', { textLength: text.length });
            return { success: true, text };
        } catch (error) {
            logger.error('Failed to type via Remotely:', error);
            throw error;
        }
    }

    async dragAndDrop(startCoords, endCoords, options = {}) {
        try {
            const { delay = 100 } = options;

            // Move to start position
            this.sendMouseMove(startCoords.x, startCoords.y);
            await new Promise(resolve => setTimeout(resolve, delay));

            // Mouse down
            this.sendKeyDown('MouseLeft');
            await new Promise(resolve => setTimeout(resolve, delay));

            // Drag to end position
            this.sendMouseMove(endCoords.x, endCoords.y);
            await new Promise(resolve => setTimeout(resolve, delay));

            // Mouse up
            this.sendKeyUp('MouseLeft');

            logger.info('Drag and drop performed via Remotely:', { startCoords, endCoords });
            return { success: true, startCoords, endCoords };
        } catch (error) {
            logger.error('Failed to perform drag and drop via Remotely:', error);
            throw error;
        }
    }
}

module.exports = RemotelyClient;