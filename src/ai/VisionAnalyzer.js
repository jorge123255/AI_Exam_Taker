const EventEmitter = require('events');
const logger = require('../utils/logger');
const WebSearchClient = require('../utils/WebSearchClient');
const config = require('../../config.json');

class VisionAnalyzer extends EventEmitter {
    constructor(ollamaClient, ragSystem) {
        super();
        this.ollamaClient = ollamaClient;
        this.ragSystem = ragSystem;
        this.webSearchClient = new WebSearchClient();
        this.lastAnalysis = null;
        this.analysisHistory = [];
    }

    async analyzeScreen(screenshotBuffer) {
        try {
            logger.info('Starting screen analysis...');
            
            // Convert screenshot to base64
            const imageBase64 = screenshotBuffer.toString('base64');
            
            // Analyze the screen with Ollama vision model
            const screenAnalysis = await this.ollamaClient.analyzeExamScreen(imageBase64);
            
            // Store analysis
            this.lastAnalysis = {
                ...screenAnalysis,
                timestamp: new Date().toISOString(),
                imageBase64: imageBase64
            };
            
            this.analysisHistory.push(this.lastAnalysis);
            
            // Keep only last 10 analyses in memory
            if (this.analysisHistory.length > 10) {
                this.analysisHistory.shift();
            }
            
            logger.info('Screen analysis completed:', {
                questionDetected: !!screenAnalysis.question,
                questionType: screenAnalysis.question_type,
                optionsCount: screenAnalysis.options?.length || 0,
                confidence: screenAnalysis.confidence
            });
            
            // Process the analysis
            await this.processAnalysis(screenAnalysis);
            
            return screenAnalysis;
        } catch (error) {
            logger.error('Screen analysis failed:', error);
            throw error;
        }
    }

    async processAnalysis(analysis) {
        try {
            // Check if we have a valid question
            if (!analysis.question || analysis.confidence < 0.5) {
                logger.warn('Low confidence or no question detected:', {
                    question: analysis.question,
                    confidence: analysis.confidence
                });
                return;
            }

            // Emit question detected event
            this.emit('question_detected', {
                question: analysis.question,
                type: analysis.question_type,
                options: analysis.options,
                confidence: analysis.confidence
            });

            // If we have options, try to find the answer
            if (analysis.options && analysis.options.length > 0) {
                await this.findAnswer(analysis);
            }
        } catch (error) {
            logger.error('Error processing analysis:', error);
            this.emit('uncertainty', {
                error: error.message,
                analysis: analysis
            });
        }
    }

    async findAnswer(analysis) {
        try {
            logger.info('Finding answer for question:', analysis.question);

            // First, search in RAG system
            const ragResults = await this.ragSystem.search(analysis.question, config.rag.max_results);
            
            let bestAnswer = null;
            let answerSource = 'unknown';
            let confidence = 0;

            if (ragResults.length > 0 && ragResults[0].score > config.rag.similarity_threshold) {
                // Found answer in RAG system
                bestAnswer = ragResults[0].content;
                answerSource = 'rag';
                confidence = ragResults[0].score;
                
                logger.info('Answer found in RAG system:', {
                    answer: bestAnswer,
                    confidence: confidence
                });
            } else {
                // Try web search if RAG doesn't have good results
                let webSearchResults = [];
                if (this.webSearchClient.isConfigured()) {
                    try {
                        webSearchResults = await this.webSearchClient.searchForQuestionType(
                            analysis.question,
                            analysis.question_type
                        );
                        
                        if (webSearchResults.length > 0 && webSearchResults[0].confidence > 0.6) {
                            bestAnswer = webSearchResults[0].extractedAnswer;
                            answerSource = 'web_search';
                            confidence = webSearchResults[0].confidence;
                            
                            logger.info('Answer found via web search:', {
                                answer: bestAnswer,
                                confidence: confidence,
                                source: webSearchResults[0].source
                            });
                        }
                    } catch (error) {
                        logger.error('Web search failed:', error);
                    }
                }

                // If still no good answer, use AI reasoning
                if (!bestAnswer || confidence < 0.6) {
                    const contextData = [];
                    if (ragResults.length > 0) contextData.push(ragResults[0].content);
                    if (webSearchResults.length > 0) contextData.push(webSearchResults[0].extractedAnswer);
                    
                    const reasoningResult = await this.ollamaClient.reasonAboutAnswer(
                        analysis.question,
                        analysis.options,
                        contextData.join('\n\n')
                    );
                    
                    bestAnswer = reasoningResult.answer;
                    answerSource = 'reasoning';
                    confidence = reasoningResult.confidence;
                    
                    logger.info('Answer determined by AI reasoning:', {
                        answer: bestAnswer,
                        confidence: confidence,
                        reasoning: reasoningResult.reasoning
                    });

                    // Store the reasoning for monitoring
                    this.emit('ai_reasoning', {
                        question: analysis.question,
                        reasoning: reasoningResult.reasoning,
                        answer: bestAnswer,
                        confidence: confidence,
                        keyConcepts: reasoningResult.key_concepts,
                        uncertaintyFactors: reasoningResult.uncertainty_factors,
                        contextSources: {
                            rag: ragResults.length > 0,
                            webSearch: webSearchResults.length > 0
                        }
                    });
                }
            }

            // Emit answer found event
            this.emit('answer_found', {
                answer: bestAnswer,
                confidence: confidence,
                source: answerSource,
                question: analysis.question
            });

        } catch (error) {
            logger.error('Error finding answer:', error);
            this.emit('uncertainty', {
                question: analysis.question,
                error: error.message,
                reason: 'Answer search failed'
            });
        }
    }

    async findAnswerCoordinates(questionData, selectedAnswer) {
        try {
            if (!this.lastAnalysis) {
                throw new Error('No recent screen analysis available');
            }

            logger.info('Finding coordinates for answer:', selectedAnswer);

            // Use Ollama to determine click coordinates
            const coordinateResult = await this.ollamaClient.findAnswerCoordinates(
                this.lastAnalysis,
                selectedAnswer
            );

            if (coordinateResult.confidence < 0.5) {
                throw new Error('Low confidence in coordinate detection');
            }

            logger.info('Answer coordinates found:', coordinateResult);

            return coordinateResult.coordinates;
        } catch (error) {
            logger.error('Failed to find answer coordinates:', error);
            throw error;
        }
    }

    async detectQuestionChange() {
        try {
            if (this.analysisHistory.length < 2) {
                return false;
            }

            const current = this.analysisHistory[this.analysisHistory.length - 1];
            const previous = this.analysisHistory[this.analysisHistory.length - 2];

            // Simple question change detection
            const questionChanged = current.question !== previous.question;
            
            if (questionChanged) {
                logger.info('Question change detected:', {
                    previous: previous.question,
                    current: current.question
                });
            }

            return questionChanged;
        } catch (error) {
            logger.error('Error detecting question change:', error);
            return false;
        }
    }

    async validateScreenState() {
        try {
            if (!this.lastAnalysis) {
                return { valid: false, reason: 'No analysis available' };
            }

            const analysis = this.lastAnalysis;

            // Check if we're on an exam page
            const hasQuestion = !!analysis.question;
            const hasOptions = analysis.options && analysis.options.length > 0;
            const hasNavigation = analysis.ui_elements && (
                analysis.ui_elements.next_button?.visible ||
                analysis.ui_elements.submit_button?.visible
            );

            const valid = hasQuestion && (hasOptions || hasNavigation);

            return {
                valid,
                reason: valid ? 'Valid exam screen' : 'Not a valid exam screen',
                details: {
                    hasQuestion,
                    hasOptions,
                    hasNavigation,
                    confidence: analysis.confidence
                }
            };
        } catch (error) {
            logger.error('Error validating screen state:', error);
            return { valid: false, reason: error.message };
        }
    }

    getLastAnalysis() {
        return this.lastAnalysis;
    }

    getAnalysisHistory() {
        return this.analysisHistory;
    }

    clearHistory() {
        this.analysisHistory = [];
        this.lastAnalysis = null;
        logger.info('Analysis history cleared');
    }
}

module.exports = VisionAnalyzer;