const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const config = require('../config.json');
const logger = require('./utils/logger');
const ExamTaker = require('./core/ExamTaker');
const DatabaseManager = require('./database/DatabaseManager');
const RAGSystem = require('./ai/RAGSystem');
const AnalyticsEngine = require('./utils/AnalyticsEngine');
const createRoutes = require('./api/routes');

class AIExamTakerApp {
    constructor() {
        this.app = express();
        this.server = http.createServer(this.app);
        this.io = socketIo(this.server, {
            cors: {
                origin: "*",
                methods: ["GET", "POST"]
            }
        });
        
        this.examTaker = null;
        this.dbManager = new DatabaseManager();
        this.ragSystem = new RAGSystem();
        this.analyticsEngine = new AnalyticsEngine(this.dbManager);
        
        this.setupMiddleware();
        this.setupRoutes();
        this.setupSocketHandlers();
        
        // Set Socket.IO instance in logger for real-time logging
        logger.setSocketIO(this.io);
    }

    setupMiddleware() {
        this.app.use(cors());
        this.app.use(express.json({ limit: '50mb' }));
        this.app.use(express.urlencoded({ extended: true, limit: '50mb' }));
        this.app.use(express.static(path.join(__dirname, '../public')));
        
        // Logging middleware
        this.app.use((req, res, next) => {
            logger.info(`${req.method} ${req.path}`, { ip: req.ip });
            next();
        });
    }

    setupRoutes() {
        // Health check
        this.app.get('/health', (req, res) => {
            res.json({ status: 'healthy', timestamp: new Date().toISOString() });
        });

        // API routes
        this.app.use('/api', createRoutes(this.ragSystem, this.dbManager, this.analyticsEngine));

        // Dashboard route
        this.app.get('/dashboard', (req, res) => {
            res.sendFile(path.join(__dirname, '../public/index.html'));
        });

        // Redirect root to dashboard
        this.app.get('/', (req, res) => {
            res.redirect('/dashboard');
        });

        // RDP connection routes
        this.app.post('/api/rdp/connect', async (req, res) => {
            try {
                const { remotelyServerUrl, deviceId, accessKey, organizationId } = req.body;
                
                if (!remotelyServerUrl || !deviceId || !accessKey) {
                    return res.status(400).json({
                        success: false,
                        error: 'remotelyServerUrl, deviceId, and accessKey are required'
                    });
                }
                
                if (!this.examTaker) {
                    this.examTaker = new ExamTaker(this.io, this.ragSystem, this.analyticsEngine);
                }
                
                const result = await this.examTaker.connectRDP({
                    remotelyServerUrl,
                    deviceId,
                    accessKey,
                    organizationId
                });
                
                // Emit debug info
                this.io.emit('debug_info', {
                    uptime: process.uptime(),
                    memory: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
                    cpu: 'N/A'
                });
                
                res.json({ success: true, sessionId: result.sessionId });
            } catch (error) {
                logger.error('Remotely connection failed:', error);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Auto-detection endpoint
        this.app.get('/api/rdp/detect', async (req, res) => {
            try {
                // Simulate auto-detection logic
                // In a real implementation, this would scan for available Remotely connections
                const connections = await this.detectRemotelyConnections();
                res.json({ success: true, connections });
            } catch (error) {
                logger.error('Auto-detection failed:', error);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        this.app.post('/api/rdp/disconnect', async (req, res) => {
            try {
                if (this.examTaker) {
                    await this.examTaker.disconnect();
                }
                res.json({ success: true });
            } catch (error) {
                logger.error('RDP disconnection failed:', error);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Exam control routes
        this.app.post('/api/exam/start', async (req, res) => {
            try {
                if (!this.examTaker || !this.examTaker.isConnected()) {
                    return res.status(400).json({ success: false, error: 'No active RDP connection' });
                }
                
                const result = await this.examTaker.startExam();
                res.json({ success: true, examId: result.examId });
            } catch (error) {
                logger.error('Failed to start exam:', error);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        this.app.post('/api/exam/stop', async (req, res) => {
            try {
                if (this.examTaker) {
                    await this.examTaker.stopExam();
                }
                res.json({ success: true });
            } catch (error) {
                logger.error('Failed to stop exam:', error);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        this.app.post('/api/exam/override', async (req, res) => {
            try {
                const { action } = req.body; // 'take_control' or 'release_control'
                
                if (this.examTaker) {
                    await this.examTaker.setManualOverride(action === 'take_control');
                }
                res.json({ success: true });
            } catch (error) {
                logger.error('Failed to toggle manual override:', error);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Exam type management routes
        this.app.post('/api/exam/set-type', async (req, res) => {
            try {
                const { examType } = req.body;
                
                if (!examType) {
                    return res.status(400).json({ success: false, error: 'Exam type is required' });
                }
                
                if (this.examTaker) {
                    this.examTaker.setExamType(examType);
                    
                    // Validate readiness for this exam type
                    const isReady = await this.examTaker.validateExamReadiness();
                    
                    res.json({
                        success: true,
                        examType: examType,
                        isReady: isReady
                    });
                } else {
                    res.json({ success: true, examType: examType });
                }
            } catch (error) {
                logger.error('Failed to set exam type:', error);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        this.app.get('/api/exam/current-type', (req, res) => {
            try {
                const examType = this.examTaker ? this.examTaker.getCurrentExamType() : 'general';
                res.json({ success: true, examType: examType });
            } catch (error) {
                logger.error('Failed to get current exam type:', error);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        this.app.get('/api/exam/readiness', async (req, res) => {
            try {
                if (this.examTaker) {
                    const isReady = await this.examTaker.validateExamReadiness();
                    const stats = await this.examTaker.getExamTypeStats();
                    
                    res.json({
                        success: true,
                        isReady: isReady,
                        examType: this.examTaker.getCurrentExamType(),
                        stats: stats
                    });
                } else {
                    res.json({
                        success: true,
                        isReady: false,
                        examType: 'general',
                        stats: { documentCount: 0, isReady: false }
                    });
                }
            } catch (error) {
                logger.error('Failed to check exam readiness:', error);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // RAG system routes
        this.app.post('/api/rag/upload', async (req, res) => {
            try {
                const { content, metadata } = req.body;
                const result = await this.ragSystem.addDocument(content, metadata);
                res.json({ success: true, documentId: result.id });
            } catch (error) {
                logger.error('Failed to upload document to RAG:', error);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        this.app.get('/api/rag/search', async (req, res) => {
            try {
                const { query, limit = 5 } = req.query;
                const results = await this.ragSystem.search(query, limit);
                res.json({ success: true, results });
            } catch (error) {
                logger.error('RAG search failed:', error);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Configuration management routes
        this.app.post('/api/config/save', async (req, res) => {
            try {
                const { config: newConfig } = req.body;
                
                if (!newConfig) {
                    return res.status(400).json({ success: false, error: 'Configuration is required' });
                }

                // Save to database for persistence
                await this.dbManager.runQuery(
                    'INSERT OR REPLACE INTO system_config (key, value, updated_at) VALUES (?, ?, ?)',
                    ['ai_config', JSON.stringify(newConfig), new Date().toISOString()]
                );

                // Update runtime config
                if (newConfig.ollama) {
                    Object.assign(config.ollama, newConfig.ollama);
                }
                if (newConfig.rag) {
                    Object.assign(config.rag, newConfig.rag);
                }
                if (newConfig.ai) {
                    Object.assign(config.ai, newConfig.ai);
                }

                logger.info('AI configuration saved successfully');
                
                // Emit configuration change event
                this.io.emit('config_updated', {
                    config: newConfig,
                    timestamp: new Date().toISOString()
                });

                res.json({ success: true, message: 'Configuration saved successfully' });
            } catch (error) {
                logger.error('Failed to save configuration:', error);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        this.app.get('/api/config/load', async (req, res) => {
            try {
                // Load from database
                const savedConfig = await this.dbManager.getQuery(
                    'SELECT value FROM system_config WHERE key = ?',
                    ['ai_config']
                );

                let configToReturn = {
                    ollama: config.ollama,
                    rag: config.rag,
                    ai: config.ai
                };

                if (savedConfig && savedConfig.value) {
                    try {
                        const parsedConfig = JSON.parse(savedConfig.value);
                        configToReturn = { ...configToReturn, ...parsedConfig };
                    } catch (parseError) {
                        logger.warn('Failed to parse saved config, using defaults');
                    }
                }

                res.json({ success: true, config: configToReturn });
            } catch (error) {
                logger.error('Failed to load configuration:', error);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Status and monitoring
        this.app.get('/api/status', (req, res) => {
            const status = {
                rdpConnected: this.examTaker ? this.examTaker.isConnected() : false,
                examActive: this.examTaker ? this.examTaker.isExamActive() : false,
                manualOverride: this.examTaker ? this.examTaker.isManualOverride() : false,
                ragReady: this.ragSystem.isReady(),
                currentExamType: this.examTaker ? this.examTaker.getCurrentExamType() : 'general',
                timestamp: new Date().toISOString()
            };
            res.json(status);
        });

        // Debug info endpoint
        this.app.get('/api/debug/info', (req, res) => {
            const debugInfo = {
                uptime: Math.floor(process.uptime()),
                memory: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
                cpu: 'N/A',
                connections: this.examTaker ? 1 : 0,
                examActive: this.examTaker ? this.examTaker.isExamActive() : false
            };
            res.json(debugInfo);
        });
    }

    async detectRemotelyConnections() {
        logger.info('Performing auto-detection scan for Remotely connections');
        
        const detectedConnections = [];
        
        try {
            // 1. Check database for auto-connect configurations
            const autoConnectConfigs = await this.dbManager.getAutoConnectConfigs();
            
            for (const config of autoConnectConfigs) {
                detectedConnections.push({
                    id: config.id,
                    serverUrl: config.server_endpoint,
                    deviceId: config.device_id,
                    accessKey: config.access_key,
                    organizationId: config.organization_id,
                    name: config.name,
                    detectionMethod: 'database_auto_connect',
                    confidence: 0.95,
                    lastConnected: config.last_connected_at,
                    autoConnect: true
                });
            }
            
            // 2. Check all configured servers (not just auto-connect ones)
            if (detectedConnections.length === 0) {
                const allConfigs = await this.dbManager.getAllRemoteServerConfigs();
                
                for (const config of allConfigs.slice(0, 3)) { // Limit to top 3 most recent
                    detectedConnections.push({
                        id: config.id,
                        serverUrl: config.server_endpoint,
                        deviceId: config.device_id,
                        accessKey: config.access_key,
                        organizationId: config.organization_id,
                        name: config.name,
                        detectionMethod: 'database_configured',
                        confidence: 0.8,
                        lastConnected: config.last_connected_at,
                        autoConnect: false
                    });
                }
            }
            
            // 3. Check legacy config.json for backward compatibility
            if (detectedConnections.length === 0 && config.remotely && config.remotely.serverUrl) {
                detectedConnections.push({
                    serverUrl: config.remotely.serverUrl,
                    deviceId: config.remotely.deviceId || 'config-device',
                    accessKey: config.remotely.accessKey || 'config-key',
                    organizationId: config.remotely.organizationId,
                    name: 'Legacy Configuration',
                    detectionMethod: 'legacy_config',
                    confidence: 0.7,
                    autoConnect: false
                });
            }
            
            // 4. Network discovery (simulate for now - could implement actual network scanning)
            if (detectedConnections.length === 0) {
                const networkScanResults = await this.performNetworkScan();
                detectedConnections.push(...networkScanResults);
            }
            
            logger.info(`Auto-detection found ${detectedConnections.length} potential connections`);
            
            // If we have auto-connect configurations, automatically attempt connection
            const autoConnectConfig = detectedConnections.find(conn => conn.autoConnect);
            if (autoConnectConfig) {
                logger.info(`Auto-connecting to: ${autoConnectConfig.name} (${autoConnectConfig.serverUrl})`);
                
                // Emit auto-connect event
                this.io.emit('auto_connect_initiated', {
                    config: autoConnectConfig,
                    timestamp: new Date().toISOString()
                });
                
                // Attempt auto-connection in background
                this.attemptAutoConnection(autoConnectConfig);
            }
            
            return detectedConnections;
            
        } catch (error) {
            logger.error('Auto-detection failed:', error);
            return [];
        }
    }

    async performNetworkScan() {
        // Simulate network scanning for Remotely servers
        // In a real implementation, this could scan common ports and endpoints
        const networkResults = [];
        
        const commonEndpoints = [
            'https://remotely.local:5000',
            'http://localhost:5000',
            'https://192.168.1.100:5000',
            'https://remotely.company.com'
        ];
        
        // For demo purposes, just return one mock result
        networkResults.push({
            serverUrl: 'https://remotely.local:5000',
            deviceId: 'network-discovered-device',
            accessKey: 'network-discovered-key',
            name: 'Network Discovered Server',
            detectionMethod: 'network_scan',
            confidence: 0.6,
            autoConnect: false
        });
        
        return networkResults;
    }

    async attemptAutoConnection(connectionConfig) {
        try {
            // Wait a moment to let the UI update
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            if (!this.examTaker) {
                this.examTaker = new ExamTaker(this.io, this.ragSystem, this.analyticsEngine);
            }
            
            const result = await this.examTaker.connectRDP({
                remotelyServerUrl: connectionConfig.serverUrl,
                deviceId: connectionConfig.deviceId,
                accessKey: connectionConfig.accessKey,
                organizationId: connectionConfig.organizationId
            });
            
            // Update last connected time in database
            if (connectionConfig.id) {
                await this.dbManager.updateLastConnected(connectionConfig.id);
            }
            
            logger.info(`Auto-connection successful: ${connectionConfig.name}`);
            
            this.io.emit('auto_connect_success', {
                config: connectionConfig,
                sessionId: result.sessionId,
                timestamp: new Date().toISOString()
            });
            
        } catch (error) {
            logger.error(`Auto-connection failed for ${connectionConfig.name}:`, error);
            
            this.io.emit('auto_connect_failed', {
                config: connectionConfig,
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }

    setupSocketHandlers() {
        this.io.on('connection', (socket) => {
            logger.info('Client connected:', socket.id);

            // Send initial debug info
            socket.emit('debug_info', {
                uptime: Math.floor(process.uptime()),
                memory: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
                cpu: 'N/A'
            });

            socket.on('disconnect', () => {
                logger.info('Client disconnected:', socket.id);
            });

            // Manual control events
            socket.on('manual_click', async (data) => {
                if (this.examTaker && this.examTaker.isManualOverride()) {
                    await this.examTaker.performClick(data.x, data.y);
                    socket.emit('debug_info', { lastAction: `Click at (${data.x}, ${data.y})` });
                }
            });

            socket.on('manual_type', async (data) => {
                if (this.examTaker && this.examTaker.isManualOverride()) {
                    await this.examTaker.performType(data.text);
                    socket.emit('debug_info', { lastAction: `Type: ${data.text}` });
                }
            });

            // Debug console events
            socket.on('request_debug_info', () => {
                socket.emit('debug_info', {
                    uptime: Math.floor(process.uptime()),
                    memory: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
                    cpu: 'N/A',
                    connections: this.examTaker ? 1 : 0,
                    examActive: this.examTaker ? this.examTaker.isExamActive() : false
                });
            });

            // Connection detection events
            socket.on('force_detection_scan', async () => {
                try {
                    const connections = await this.detectRemotelyConnections();
                    if (connections.length > 0) {
                        socket.emit('connection_detected', connections[0]);
                    }
                } catch (error) {
                    logger.error('Forced detection scan failed:', error);
                }
            });
        });

        // Periodic debug info updates
        setInterval(() => {
            this.io.emit('debug_info', {
                uptime: Math.floor(process.uptime()),
                memory: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
                cpu: 'N/A'
            });
        }, 30000); // Every 30 seconds
    }

    async initialize() {
        try {
            // Initialize database
            await this.dbManager.initialize();
            logger.info('Database initialized');

            // Initialize RAG system
            try {
                await this.ragSystem.initialize();
                logger.info('RAG system initialized successfully');
            } catch (error) {
                logger.warn('RAG system initialization failed, using fallback mode:', error.message);
            }

            // Setup analytics event listeners
            this.setupAnalyticsListeners();

            logger.info('AI Exam Taker application initialized successfully');
        } catch (error) {
            logger.error('Failed to initialize application:', error);
            throw error;
        }
    }

    setupAnalyticsListeners() {
        // Listen for analytics events and emit to clients
        this.analyticsEngine.on('real_time_stats_updated', (stats) => {
            this.io.emit('analytics_update', {
                type: 'real_time_stats',
                data: stats
            });
        });

        this.analyticsEngine.on('question_metrics_updated', (data) => {
            this.io.emit('analytics_update', {
                type: 'question_metrics',
                data: data
            });
        });

        this.analyticsEngine.on('answer_metrics_updated', (data) => {
            this.io.emit('analytics_update', {
                type: 'answer_metrics',
                data: data
            });
        });

        logger.info('Analytics event listeners setup complete');
    }

    start() {
        const port = config.server.port;
        const host = config.server.host;

        this.server.listen(port, host, () => {
            logger.info(`AI Exam Taker server running on http://${host}:${port}`);
            console.log(`🚀 Server started on http://${host}:${port}`);
            console.log(`📊 Dashboard: http://${host}:${port}/dashboard`);
        });
    }
}

// Start the application
async function main() {
    try {
        const app = new AIExamTakerApp();
        await app.initialize();
        app.start();
    } catch (error) {
        logger.error('Failed to start application:', error);
        process.exit(1);
    }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    logger.info('Received SIGINT, shutting down gracefully');
    process.exit(0);
});

process.on('SIGTERM', () => {
    logger.info('Received SIGTERM, shutting down gracefully');
    process.exit(0);
});

if (require.main === module) {
    main();
}

module.exports = AIExamTakerApp;