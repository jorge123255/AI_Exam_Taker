const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');
const PDFProcessor = require('../utils/PDFProcessor');

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = './uploads';
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    fileFilter: (req, file, cb) => {
        const allowedTypes = [
            'application/pdf',
            'text/plain',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        ];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Only PDF, TXT, and DOCX files are allowed'), false);
        }
    },
    limits: {
        fileSize: 50 * 1024 * 1024 // 50MB limit
    }
});

function createRoutes(ragSystem, dbManager) {
    const router = express.Router();
    const pdfProcessor = new PDFProcessor(ragSystem);

    // PDF Upload and Processing Routes
    router.post('/upload-pdf', upload.single('pdf'), async (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({ success: false, error: 'No PDF file uploaded' });
            }

            const { subject, topic, difficulty, source } = req.body;
            const metadata = {
                subject: subject || 'general',
                topic: topic || null,
                difficulty: difficulty || 'medium',
                source: source || 'upload',
                uploaded_at: new Date().toISOString(),
                original_filename: req.file.originalname
            };

            logger.info('Processing uploaded PDF:', req.file.originalname);

            const result = await pdfProcessor.processPDFFile(req.file.path, metadata);

            // Clean up uploaded file
            fs.unlinkSync(req.file.path);

            res.json({
                success: true,
                filename: req.file.originalname,
                qaPairsExtracted: result.totalQAPairs,
                addedToRAG: result.addedToRAG,
                metadata: result.metadata
            });

        } catch (error) {
            logger.error('PDF upload processing failed:', error);
            
            // Clean up file if it exists
            if (req.file && fs.existsSync(req.file.path)) {
                fs.unlinkSync(req.file.path);
            }

            res.status(500).json({ success: false, error: error.message });
        }
    });

    // Process PDF directory
    router.post('/process-pdf-directory', async (req, res) => {
        try {
            const { directoryPath, subject, topic, difficulty } = req.body;

            if (!directoryPath) {
                return res.status(400).json({ success: false, error: 'Directory path is required' });
            }

            const metadata = {
                subject: subject || 'general',
                topic: topic || null,
                difficulty: difficulty || 'medium',
                source: 'directory_batch',
                processed_at: new Date().toISOString()
            };

            const result = await pdfProcessor.processDirectory(directoryPath, metadata);

            res.json({
                success: true,
                filesProcessed: result.filesProcessed,
                totalQAPairs: result.totalQAPairs,
                results: result.results
            });

        } catch (error) {
            logger.error('Directory processing failed:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // RAG System Management Routes
    router.get('/rag/stats', async (req, res) => {
        try {
            const stats = await ragSystem.getCollectionStats();
            res.json({ success: true, stats });
        } catch (error) {
            logger.error('Failed to get RAG stats:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    router.post('/rag/search', async (req, res) => {
        try {
            const { query, limit = 5 } = req.body;

            if (!query) {
                return res.status(400).json({ success: false, error: 'Query is required' });
            }

            const results = await ragSystem.search(query, limit);
            res.json({ success: true, results });
        } catch (error) {
            logger.error('RAG search failed:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    router.post('/rag/add-manual', async (req, res) => {
        try {
            const { question, answer, subject, topic, difficulty } = req.body;

            if (!question || !answer) {
                return res.status(400).json({ success: false, error: 'Question and answer are required' });
            }

            const metadata = {
                subject: subject || 'general',
                topic: topic || null,
                difficulty: difficulty || 'medium',
                source: 'manual_entry',
                added_at: new Date().toISOString()
            };

            const content = `Question: ${question}\nAnswer: ${answer}`;
            const result = await ragSystem.addDocument(content, metadata);

            // Also add to knowledge base
            await dbManager.addToKnowledgeBase(question, answer, metadata);

            res.json({ success: true, documentId: result.id });
        } catch (error) {
            logger.error('Failed to add manual entry to RAG:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    router.delete('/rag/clear', async (req, res) => {
        try {
            await ragSystem.clearCollection();
            res.json({ success: true, message: 'RAG collection cleared' });
        } catch (error) {
            logger.error('Failed to clear RAG collection:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // Knowledge Base Routes
    router.get('/knowledge-base/search', async (req, res) => {
        try {
            const { query, limit = 10 } = req.query;

            if (!query) {
                return res.status(400).json({ success: false, error: 'Query is required' });
            }

            const results = await dbManager.searchKnowledgeBase(query, limit);
            res.json({ success: true, results });
        } catch (error) {
            logger.error('Knowledge base search failed:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    router.post('/knowledge-base/add', async (req, res) => {
        try {
            const { question, answer, subject, topic, difficulty, source } = req.body;

            if (!question || !answer) {
                return res.status(400).json({ success: false, error: 'Question and answer are required' });
            }

            const metadata = {
                subject: subject || 'general',
                topic: topic || null,
                difficulty: difficulty || 'medium',
                source: source || 'api'
            };

            const result = await dbManager.addToKnowledgeBase(question, answer, metadata);
            res.json({ success: true, id: result.id });
        } catch (error) {
            logger.error('Failed to add to knowledge base:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // Exam Session Management Routes
    router.get('/sessions', async (req, res) => {
        try {
            const sessions = await dbManager.allQuery(
                'SELECT * FROM exam_sessions ORDER BY started_at DESC LIMIT 20'
            );
            res.json({ success: true, sessions });
        } catch (error) {
            logger.error('Failed to get exam sessions:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    router.get('/sessions/:sessionId', async (req, res) => {
        try {
            const { sessionId } = req.params;
            const session = await dbManager.getExamSession(sessionId);
            
            if (!session) {
                return res.status(404).json({ success: false, error: 'Session not found' });
            }

            const questions = await dbManager.getSessionQuestions(sessionId);
            const stats = await dbManager.getSessionStats(sessionId);

            res.json({
                success: true,
                session,
                questions,
                stats
            });
        } catch (error) {
            logger.error('Failed to get session details:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    router.get('/sessions/:sessionId/stats', async (req, res) => {
        try {
            const { sessionId } = req.params;
            const stats = await dbManager.getSessionStats(sessionId);
            res.json({ success: true, stats });
        } catch (error) {
            logger.error('Failed to get session stats:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // System Health and Diagnostics
    router.get('/health/ollama', async (req, res) => {
        try {
            const OllamaClient = require('../ai/OllamaClient');
            const ollamaClient = new OllamaClient();
            const health = await ollamaClient.checkHealth();
            res.json({ success: true, health });
        } catch (error) {
            logger.error('Ollama health check failed:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    router.get('/health/system', async (req, res) => {
        try {
            const health = {
                timestamp: new Date().toISOString(),
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                ragReady: ragSystem.isReady(),
                dbConnected: dbManager.isInitialized
            };

            res.json({ success: true, health });
        } catch (error) {
            logger.error('System health check failed:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // Configuration Routes
    router.get('/config', (req, res) => {
        try {
            const config = require('../../config.json');
            
            // Remove sensitive information
            const safeConfig = {
                ollama: {
                    endpoint: config.ollama.endpoint,
                    models: config.ollama.models
                },
                rag: config.rag,
                ai: config.ai,
                server: config.server
            };

            res.json({ success: true, config: safeConfig });
        } catch (error) {
            logger.error('Failed to get config:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // Logs Route
    router.get('/logs', async (req, res) => {
        try {
            const { level = 'info', limit = 100 } = req.query;
            
            const logs = await dbManager.allQuery(
                'SELECT * FROM system_logs WHERE level = ? ORDER BY timestamp DESC LIMIT ?',
                [level, parseInt(limit)]
            );

            res.json({ success: true, logs });
        } catch (error) {
            logger.error('Failed to get logs:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // Test Routes (for development)
    router.post('/test/vision', async (req, res) => {
        try {
            const { imageBase64, prompt } = req.body;
            
            if (!imageBase64 || !prompt) {
                return res.status(400).json({ success: false, error: 'Image and prompt are required' });
            }

            const OllamaClient = require('../ai/OllamaClient');
            const ollamaClient = new OllamaClient();
            const response = await ollamaClient.generateVisionResponse(imageBase64, prompt);

            res.json({ success: true, response });
        } catch (error) {
            logger.error('Vision test failed:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    router.post('/test/reasoning', async (req, res) => {
        try {
            const { question, options, context } = req.body;
            
            if (!question || !options) {
                return res.status(400).json({ success: false, error: 'Question and options are required' });
            }

            const OllamaClient = require('../ai/OllamaClient');
            const ollamaClient = new OllamaClient();
            const response = await ollamaClient.reasonAboutAnswer(question, options, context);

            res.json({ success: true, response });
        } catch (error) {
            logger.error('Reasoning test failed:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // Exam Type Management Routes
    router.get('/exam-types', async (req, res) => {
        try {
            const examTypes = await dbManager.allQuery(
                'SELECT DISTINCT subject as exam_type FROM knowledge_base ORDER BY subject'
            );
            
            const defaultTypes = [
                { exam_type: 'general' },
                { exam_type: 'aws-architect' },
                { exam_type: 'comptia-security' },
                { exam_type: 'cisco-ccna' },
                { exam_type: 'microsoft-azure' },
                { exam_type: 'google-cloud' }
            ];

            // Merge with database types
            const allTypes = [...defaultTypes];
            examTypes.forEach(type => {
                if (!allTypes.find(t => t.exam_type === type.exam_type)) {
                    allTypes.push(type);
                }
            });

            res.json({ success: true, examTypes: allTypes });
        } catch (error) {
            logger.error('Failed to get exam types:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    router.post('/exam-types', async (req, res) => {
        try {
            const { name, description } = req.body;
            
            if (!name) {
                return res.status(400).json({ success: false, error: 'Exam type name is required' });
            }

            // Add a dummy entry to knowledge base to register the exam type
            await dbManager.addToKnowledgeBase(
                `${name} exam type created`,
                `This is a placeholder entry for the ${name} exam type`,
                {
                    subject: name.toLowerCase().replace(/\s+/g, '-'),
                    topic: 'system',
                    difficulty: 'medium',
                    source: 'system'
                }
            );

            res.json({ success: true, examType: name });
        } catch (error) {
            logger.error('Failed to create exam type:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // Enhanced RAG Routes
    router.get('/rag/documents', async (req, res) => {
        try {
            const { examType, limit = 50 } = req.query;
            
            let query = 'SELECT * FROM knowledge_base';
            let params = [];
            
            if (examType && examType !== 'all') {
                query += ' WHERE subject = ?';
                params.push(examType);
            }
            
            query += ' ORDER BY created_at DESC LIMIT ?';
            params.push(parseInt(limit));

            const documents = await dbManager.allQuery(query, params);
            res.json({ success: true, documents });
        } catch (error) {
            logger.error('Failed to get RAG documents:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    router.delete('/rag/documents/:id', async (req, res) => {
        try {
            const { id } = req.params;
            
            await dbManager.runQuery('DELETE FROM knowledge_base WHERE id = ?', [id]);
            
            // TODO: Also remove from ChromaDB if needed
            
            res.json({ success: true, message: 'Document deleted' });
        } catch (error) {
            logger.error('Failed to delete document:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    router.get('/rag/stats/:examType', async (req, res) => {
        try {
            const { examType } = req.params;
            
            let query = 'SELECT COUNT(*) as count, AVG(LENGTH(answer)) as avg_length FROM knowledge_base';
            let params = [];
            
            if (examType && examType !== 'all') {
                query += ' WHERE subject = ?';
                params.push(examType);
            }

            const dbStats = await dbManager.getQuery(query, params);
            
            // Get RAG system stats
            const ragStats = await ragSystem.getExamTypeStats(examType);
            
            res.json({
                success: true,
                stats: {
                    ...ragStats,
                    examTypeCount: dbStats.count || 0,
                    avgContentLength: Math.round(dbStats.avg_length || ragStats.avgContentLength || 0)
                }
            });
        } catch (error) {
            logger.error('Failed to get exam type stats:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // Configuration Management Routes
    router.post('/config/save', async (req, res) => {
        try {
            const { config } = req.body;
            
            if (!config) {
                return res.status(400).json({ success: false, error: 'Configuration is required' });
            }

            // Save configuration to database or file
            // For now, we'll just validate and return success
            // TODO: Implement actual config saving
            
            logger.info('Configuration saved:', config);
            res.json({ success: true, message: 'Configuration saved successfully' });
        } catch (error) {
            logger.error('Failed to save configuration:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // Enhanced file upload with better metadata
    router.post('/upload-document', upload.single('document'), async (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({ success: false, error: 'No file uploaded' });
            }

            const { examType, tags, description } = req.body;
            const metadata = {
                subject: examType || 'general',
                tags: tags || '',
                description: description || '',
                source: 'ui_upload',
                uploaded_at: new Date().toISOString(),
                original_filename: req.file.originalname,
                file_size: req.file.size,
                mime_type: req.file.mimetype
            };

            logger.info('Processing uploaded document:', req.file.originalname);

            let result;
            if (req.file.mimetype === 'application/pdf') {
                result = await pdfProcessor.processPDFFile(req.file.path, metadata);
            } else {
                // Handle text files
                const fs = require('fs');
                const content = fs.readFileSync(req.file.path, 'utf8');
                
                // Add to RAG system
                const ragResult = await ragSystem.addDocument(content, metadata);
                
                // Add to knowledge base
                await dbManager.addToKnowledgeBase(
                    `Document: ${req.file.originalname}`,
                    content,
                    metadata
                );

                result = {
                    totalQAPairs: 1,
                    addedToRAG: 1,
                    metadata: metadata
                };
            }

            // Clean up uploaded file
            fs.unlinkSync(req.file.path);

            res.json({
                success: true,
                filename: req.file.originalname,
                qaPairsExtracted: result.totalQAPairs,
                addedToRAG: result.addedToRAG,
                metadata: result.metadata
            });

        } catch (error) {
            logger.error('Document upload processing failed:', error);
            
            // Clean up file if it exists
            if (req.file && fs.existsSync(req.file.path)) {
                fs.unlinkSync(req.file.path);
            }

            res.status(500).json({ success: false, error: error.message });
        }
    });

    // Remote Server Configuration Routes
    router.get('/remote-servers', async (req, res) => {
        try {
            const configs = await dbManager.getAllRemoteServerConfigs();
            res.json({ success: true, configs });
        } catch (error) {
            logger.error('Failed to get remote server configs:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    router.post('/remote-servers', async (req, res) => {
        try {
            const configData = req.body;
            
            if (!configData.name || !configData.server_endpoint) {
                return res.status(400).json({
                    success: false,
                    error: 'Name and server endpoint are required'
                });
            }

            const result = await dbManager.saveRemoteServerConfig(configData);
            res.json(result);
        } catch (error) {
            logger.error('Failed to save remote server config:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    router.put('/remote-servers/:id', async (req, res) => {
        try {
            const { id } = req.params;
            const updates = req.body;
            
            const result = await dbManager.updateRemoteServerConfig(id, updates);
            res.json(result);
        } catch (error) {
            logger.error('Failed to update remote server config:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    router.delete('/remote-servers/:id', async (req, res) => {
        try {
            const { id } = req.params;
            const result = await dbManager.deleteRemoteServerConfig(id);
            res.json(result);
        } catch (error) {
            logger.error('Failed to delete remote server config:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    router.get('/remote-servers/auto-connect', async (req, res) => {
        try {
            const configs = await dbManager.getAutoConnectConfigs();
            res.json({ success: true, configs });
        } catch (error) {
            logger.error('Failed to get auto-connect configs:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    router.post('/remote-servers/:id/test-connection', async (req, res) => {
        try {
            const { id } = req.params;
            const config = await dbManager.getRemoteServerConfig(id);
            
            if (!config) {
                return res.status(404).json({ success: false, error: 'Configuration not found' });
            }

            // Test the connection using RemotelyClient
            const RemotelyClient = require('../rdp/RemotelyClient');
            const client = new RemotelyClient();
            
            try {
                const result = await client.connect({
                    remotelyServerUrl: config.server_endpoint,
                    deviceId: config.device_id,
                    accessKey: config.access_key,
                    organizationId: config.organization_id
                });
                
                // Disconnect immediately after testing
                await client.disconnect();
                
                res.json({
                    success: true,
                    message: 'Connection test successful',
                    connectionDetails: result
                });
            } catch (connectionError) {
                res.json({
                    success: false,
                    error: connectionError.message,
                    testResult: 'failed'
                });
            }
        } catch (error) {
            logger.error('Failed to test connection:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    router.post('/remote-servers/:id/generate-client-config', async (req, res) => {
        try {
            const { id } = req.params;
            const config = await dbManager.getRemoteServerConfig(id);
            
            if (!config) {
                return res.status(404).json({ success: false, error: 'Configuration not found' });
            }

            // Generate client configuration file
            const clientConfig = {
                serverEndpoint: config.server_endpoint,
                deviceId: config.device_id,
                accessKey: config.access_key,
                organizationId: config.organization_id,
                autoConnect: config.auto_connect,
                connectionTimeout: config.connection_timeout,
                retryAttempts: config.retry_attempts,
                generatedAt: new Date().toISOString(),
                instructions: [
                    "1. Save this configuration file as 'remotely-config.json'",
                    "2. Place it in the same directory as your Remotely client",
                    "3. The client will automatically use this configuration on startup",
                    "4. Ensure the server endpoint is accessible from the client machine"
                ]
            };

            res.json({
                success: true,
                clientConfig,
                downloadFilename: `remotely-config-${config.name.replace(/\s+/g, '-').toLowerCase()}.json`
            });
        } catch (error) {
            logger.error('Failed to generate client config:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    return router;
}

module.exports = createRoutes;