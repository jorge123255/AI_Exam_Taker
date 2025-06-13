const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const OllamaClient = require('../ai/OllamaClient');
const VisionAnalyzer = require('../ai/VisionAnalyzer');
const ActionExecutor = require('../utils/ActionExecutor');
const RemotelyClient = require('../rdp/RemotelyClient');
const config = require('../../config.json');

class ExamTaker {
    constructor(io, ragSystem) {
        this.io = io;
        this.ragSystem = ragSystem;
        this.sessionId = null;
        this.examId = null;
        this.isActive = false;
        this.manualOverride = false;
        this.connected = false;
        this.currentExamType = 'general'; // Default exam type
        
        this.ollamaClient = new OllamaClient();
        this.visionAnalyzer = new VisionAnalyzer(this.ollamaClient, this.ragSystem);
        this.actionExecutor = new ActionExecutor();
        this.remotelyClient = new RemotelyClient();
        
        this.currentQuestion = null;
        this.questionHistory = [];
        this.screenshotInterval = null;
        this.lastScreenshot = null;
        
        this.setupEventHandlers();
    }

    setupEventHandlers() {
        // Listen for vision analysis results
        this.visionAnalyzer.on('question_detected', (questionData) => {
            this.handleQuestionDetected(questionData);
        });

        this.visionAnalyzer.on('answer_found', (answerData) => {
            this.handleAnswerFound(answerData);
        });

        this.visionAnalyzer.on('uncertainty', (uncertaintyData) => {
            this.handleUncertainty(uncertaintyData);
        });

        // Listen for Remotely client events
        this.remotelyClient.on('connected', () => {
            this.connected = true;
            this.io.emit('rdp_connected', {
                sessionId: this.remotelyClient.getSessionId(),
                deviceId: this.remotelyClient.getDeviceId(),
                timestamp: new Date().toISOString()
            });
        });

        this.remotelyClient.on('disconnected', () => {
            this.connected = false;
            this.io.emit('rdp_disconnected', {
                timestamp: new Date().toISOString()
            });
        });

        this.remotelyClient.on('screenshot', (screenshotData) => {
            this.handleRemotelyScreenshot(screenshotData);
        });

        this.remotelyClient.on('error', (error) => {
            logger.error('Remotely client error:', error);
            this.io.emit('rdp_error', {
                error: error.message,
                timestamp: new Date().toISOString()
            });
        });
    }

    async connectRDP({ remotelyServerUrl, deviceId, accessKey, organizationId }) {
        try {
            logger.info(`Attempting Remotely connection to device: ${deviceId}`);
            
            const result = await this.remotelyClient.connect({
                remotelyServerUrl,
                deviceId,
                accessKey,
                organizationId
            });

            this.sessionId = result.sessionId;
            logger.info(`Remotely connected successfully. Session ID: ${this.sessionId}`);
            
            // Start requesting screenshots
            this.startScreenshotRequests();
            
            return { sessionId: this.sessionId };
        } catch (error) {
            logger.error('Remotely connection failed:', error);
            throw error;
        }
    }

    async disconnect() {
        try {
            if (this.isActive) {
                await this.stopExam();
            }

            await this.remotelyClient.disconnect();
            this.connected = false;
            this.sessionId = null;

            logger.info('Remotely disconnected successfully');
        } catch (error) {
            logger.error('Remotely disconnection failed:', error);
            throw error;
        }
    }

    async startExam() {
        try {
            if (!this.connected) {
                throw new Error('No active RDP connection');
            }

            this.examId = uuidv4();
            this.isActive = true;
            this.questionHistory = [];

            // Start screenshot monitoring
            this.startScreenshotMonitoring();

            this.io.emit('exam_started', {
                examId: this.examId,
                timestamp: new Date().toISOString()
            });

            logger.info(`Exam started. Exam ID: ${this.examId}`);
            return { examId: this.examId };
        } catch (error) {
            logger.error('Failed to start exam:', error);
            throw error;
        }
    }

    async stopExam() {
        try {
            this.isActive = false;
            
            if (this.screenshotInterval) {
                clearInterval(this.screenshotInterval);
                this.screenshotInterval = null;
            }

            this.io.emit('exam_stopped', {
                examId: this.examId,
                questionsAnswered: this.questionHistory.length,
                timestamp: new Date().toISOString()
            });

            logger.info(`Exam stopped. Questions answered: ${this.questionHistory.length}`);
        } catch (error) {
            logger.error('Failed to stop exam:', error);
            throw error;
        }
    }

    startScreenshotRequests() {
        this.screenshotInterval = setInterval(() => {
            if (this.remotelyClient.isConnected()) {
                this.remotelyClient.requestScreenshot();
            }
        }, config.rdp.screenshotInterval);
    }

    startScreenshotMonitoring() {
        // Screenshot monitoring is now handled by Remotely client events
        // This method is kept for compatibility but actual monitoring
        // happens through the 'screenshot' event from RemotelyClient
    }

    async handleRemotelyScreenshot(screenshotData) {
        try {
            if (!this.isActive || this.manualOverride) {
                // Still emit screenshot for monitoring even if not analyzing
                this.io.emit('screenshot', {
                    image: screenshotData.imageData,
                    timestamp: screenshotData.timestamp
                });
                return;
            }

            // Convert base64 to buffer for analysis
            const imageBuffer = Buffer.from(screenshotData.imageData, 'base64');
            this.lastScreenshot = imageBuffer;
            
            // Emit screenshot to clients
            this.io.emit('screenshot', {
                image: screenshotData.imageData,
                timestamp: screenshotData.timestamp
            });

            // Analyze with AI vision
            const analysis = await this.visionAnalyzer.analyzeScreen(imageBuffer);
            
            // Emit analysis results
            this.io.emit('screen_analysis', {
                analysis,
                timestamp: new Date().toISOString()
            });

            return analysis;
        } catch (error) {
            logger.error('Screenshot analysis failed:', error);
        }
    }

    async captureAndAnalyzeScreen() {
        // Legacy method - now handled by handleRemotelyScreenshot
        if (this.lastScreenshot) {
            return await this.visionAnalyzer.analyzeScreen(this.lastScreenshot);
        }
        throw new Error('No screenshot available from Remotely client');
    }

    async captureScreen() {
        // Screen capture is now handled by Remotely client
        if (this.lastScreenshot) {
            return this.lastScreenshot;
        }
        throw new Error('No screenshot available from Remotely client');
    }

    async handleQuestionDetected(questionData) {
        try {
            logger.info('Question detected:', questionData.question);
            
            this.currentQuestion = {
                id: uuidv4(),
                question: questionData.question,
                type: questionData.type,
                options: questionData.options,
                detectedAt: new Date().toISOString(),
                status: 'analyzing'
            };

            // Emit question detection
            this.io.emit('question_detected', this.currentQuestion);

            // Search for answer in RAG system with exam type context
            const ragResults = await this.ragSystem.search(
                questionData.question,
                5,
                this.currentExamType
            );
            
            // Emit AI reasoning about the search
            this.io.emit('ai_reasoning', {
                reasoning: `Searching knowledge base for exam type: ${this.currentExamType}`,
                keyConcepts: [this.currentExamType, 'knowledge_search'],
                uncertaintyFactors: ragResults.length === 0 ? ['no_matching_documents'] : [],
                searchResults: ragResults.length,
                examType: this.currentExamType
            });
            
            if (ragResults.length > 0 && ragResults[0].score > config.rag.similarity_threshold) {
                // Found answer in RAG
                await this.handleAnswerFound({
                    answer: ragResults[0].content,
                    confidence: ragResults[0].score,
                    source: `rag_${this.currentExamType}`,
                    examType: this.currentExamType,
                    ragResults: ragResults.slice(0, 3) // Include top 3 results for context
                });
            } else {
                // Search online as fallback
                await this.searchOnlineForAnswer(questionData.question);
            }
        } catch (error) {
            logger.error('Error handling question detection:', error);
            await this.handleUncertainty({
                question: questionData.question,
                error: error.message
            });
        }
    }

    async handleAnswerFound(answerData) {
        try {
            logger.info('Answer found:', answerData);

            if (this.currentQuestion) {
                this.currentQuestion.answer = answerData.answer;
                this.currentQuestion.confidence = answerData.confidence;
                this.currentQuestion.source = answerData.source;
                this.currentQuestion.status = 'answered';
            }

            // Emit answer found
            this.io.emit('answer_found', {
                question: this.currentQuestion,
                answer: answerData,
                timestamp: new Date().toISOString()
            });

            // Execute the answer if confidence is high enough
            if (answerData.confidence >= config.ai.confidence_threshold) {
                await this.executeAnswer(answerData);
            } else {
                await this.handleUncertainty({
                    question: this.currentQuestion?.question,
                    answer: answerData.answer,
                    confidence: answerData.confidence,
                    reason: 'Low confidence'
                });
            }
        } catch (error) {
            logger.error('Error handling answer:', error);
        }
    }

    async handleUncertainty(uncertaintyData) {
        try {
            logger.warn('AI uncertainty detected:', uncertaintyData);

            // Emit uncertainty event
            this.io.emit('ai_uncertainty', {
                ...uncertaintyData,
                timestamp: new Date().toISOString()
            });

            // Pause automatic processing and wait for human intervention
            this.setManualOverride(true);
            
            // Log the uncertainty for review
            if (this.currentQuestion) {
                this.currentQuestion.status = 'uncertain';
                this.currentQuestion.uncertainty = uncertaintyData;
            }
        } catch (error) {
            logger.error('Error handling uncertainty:', error);
        }
    }

    async executeAnswer(answerData) {
        try {
            logger.info('Executing answer:', answerData);

            // Use vision analyzer to determine click coordinates
            const clickCoordinates = await this.visionAnalyzer.findAnswerCoordinates(
                this.currentQuestion,
                answerData.answer
            );

            if (clickCoordinates) {
                // Execute the click via Remotely
                await this.remotelyClient.clickAnswer(clickCoordinates);
                
                // Wait for page to update
                await new Promise(resolve => setTimeout(resolve, config.ai.screenshot_analysis_delay));

                // Add to history
                this.questionHistory.push({
                    ...this.currentQuestion,
                    answeredAt: new Date().toISOString(),
                    coordinates: clickCoordinates
                });

                // Emit action executed
                this.io.emit('action_executed', {
                    action: 'click',
                    coordinates: clickCoordinates,
                    question: this.currentQuestion,
                    timestamp: new Date().toISOString()
                });

                logger.info(`Answer executed successfully via Remotely at (${clickCoordinates.x}, ${clickCoordinates.y})`);
            } else {
                throw new Error('Could not determine click coordinates for answer');
            }
        } catch (error) {
            logger.error('Failed to execute answer:', error);
            await this.handleUncertainty({
                question: this.currentQuestion?.question,
                error: error.message,
                reason: 'Execution failed'
            });
        }
    }

    async searchOnlineForAnswer(question) {
        try {
            // Implementation would use Firecrawl or Tully here
            logger.info('Searching online for answer:', question);
            
            // Placeholder for online search
            // In real implementation, integrate with Firecrawl/Tully APIs
            
            await this.handleUncertainty({
                question,
                reason: 'Answer not found in knowledge base, online search not implemented yet'
            });
        } catch (error) {
            logger.error('Online search failed:', error);
            await this.handleUncertainty({
                question,
                error: error.message,
                reason: 'Online search failed'
            });
        }
    }

    async performClick(x, y) {
        try {
            await this.actionExecutor.click(x, y);
            
            this.io.emit('manual_action', {
                action: 'click',
                coordinates: { x, y },
                timestamp: new Date().toISOString()
            });

            logger.info(`Manual click performed at (${x}, ${y})`);
        } catch (error) {
            logger.error('Manual click failed:', error);
            throw error;
        }
    }

    async performType(text) {
        try {
            await this.actionExecutor.type(text);
            
            this.io.emit('manual_action', {
                action: 'type',
                text,
                timestamp: new Date().toISOString()
            });

            logger.info(`Manual typing performed: ${text}`);
        } catch (error) {
            logger.error('Manual typing failed:', error);
            throw error;
        }
    }

    setManualOverride(enabled) {
        this.manualOverride = enabled;
        
        this.io.emit('manual_override_changed', {
            enabled,
            timestamp: new Date().toISOString()
        });

        logger.info(`Manual override ${enabled ? 'enabled' : 'disabled'}`);
    }

    isConnected() {
        return this.connected;
    }

    isExamActive() {
        return this.isActive;
    }

    isManualOverride() {
        return this.manualOverride;
    }

    setExamType(examType) {
        this.currentExamType = examType;
        logger.info(`Exam type changed to: ${examType}`);
        
        // Emit exam type change event
        this.io.emit('exam_type_changed', {
            examType: examType,
            timestamp: new Date().toISOString()
        });
        
        // Update vision analyzer with new exam type context
        if (this.visionAnalyzer && this.visionAnalyzer.setExamType) {
            this.visionAnalyzer.setExamType(examType);
        }
    }

    getCurrentExamType() {
        return this.currentExamType;
    }

    async getExamTypeStats() {
        try {
            if (this.ragSystem && this.ragSystem.getExamTypeStats) {
                return await this.ragSystem.getExamTypeStats(this.currentExamType);
            }
            return { documentCount: 0, isReady: false };
        } catch (error) {
            logger.error('Failed to get exam type stats:', error);
            return { documentCount: 0, isReady: false, error: error.message };
        }
    }

    async validateExamReadiness() {
        try {
            const stats = await this.getExamTypeStats();
            const isReady = stats.documentCount > 0 && this.ragSystem.isReady();
            
            this.io.emit('exam_readiness_check', {
                examType: this.currentExamType,
                isReady: isReady,
                documentCount: stats.documentCount,
                ragSystemReady: this.ragSystem.isReady(),
                timestamp: new Date().toISOString()
            });
            
            return isReady;
        } catch (error) {
            logger.error('Failed to validate exam readiness:', error);
            return false;
        }
    }
}

module.exports = ExamTaker;