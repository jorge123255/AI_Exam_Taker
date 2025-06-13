const axios = require('axios');
const logger = require('../utils/logger');
const config = require('../../config.json');

class OllamaClient {
    constructor() {
        this.baseURL = config.ollama.endpoint;
        this.timeout = config.ollama.timeout;
        this.models = config.ollama.models;
        
        this.client = axios.create({
            baseURL: this.baseURL,
            timeout: this.timeout,
            headers: {
                'Content-Type': 'application/json'
            }
        });
    }

    async generateVisionResponse(imageBase64, prompt, model = null) {
        try {
            const modelName = model || this.models.vision;
            
            const response = await this.client.post('/api/generate', {
                model: modelName,
                prompt: prompt,
                images: [imageBase64],
                stream: false,
                options: {
                    temperature: 0.1,
                    top_p: 0.9,
                    top_k: 40
                }
            });

            logger.info(`Vision analysis completed with model: ${modelName}`);
            return response.data.response;
        } catch (error) {
            logger.error('Ollama vision generation failed:', error.message);
            throw new Error(`Vision analysis failed: ${error.message}`);
        }
    }

    async generateTextResponse(prompt, model = null) {
        try {
            const modelName = model || this.models.reasoning;
            
            const response = await this.client.post('/api/generate', {
                model: modelName,
                prompt: prompt,
                stream: false,
                options: {
                    temperature: 0.2,
                    top_p: 0.9,
                    top_k: 40
                }
            });

            logger.info(`Text generation completed with model: ${modelName}`);
            return response.data.response;
        } catch (error) {
            logger.error('Ollama text generation failed:', error.message);
            throw new Error(`Text generation failed: ${error.message}`);
        }
    }

    async generateEmbedding(text, model = null) {
        try {
            const modelName = model || this.models.embedding;
            
            const response = await this.client.post('/api/embeddings', {
                model: modelName,
                prompt: text
            });

            logger.info(`Embedding generated with model: ${modelName}`);
            return response.data.embedding;
        } catch (error) {
            logger.error('Ollama embedding generation failed:', error.message);
            throw new Error(`Embedding generation failed: ${error.message}`);
        }
    }

    async chatCompletion(messages, model = null) {
        try {
            const modelName = model || this.models.reasoning;
            
            const response = await this.client.post('/api/chat', {
                model: modelName,
                messages: messages,
                stream: false,
                options: {
                    temperature: 0.1,
                    top_p: 0.9,
                    top_k: 40
                }
            });

            logger.info(`Chat completion completed with model: ${modelName}`);
            return response.data.message.content;
        } catch (error) {
            logger.error('Ollama chat completion failed:', error.message);
            throw new Error(`Chat completion failed: ${error.message}`);
        }
    }

    async analyzeExamScreen(imageBase64) {
        const prompt = `
You are an AI assistant specialized in analyzing exam interfaces. Look at this screenshot and identify:

1. QUESTION: Extract the exact question text
2. QUESTION_TYPE: Identify the type (multiple_choice, single_choice, drag_drop, text_input, etc.)
3. OPTIONS: List all available answer options with their positions
4. UI_ELEMENTS: Identify clickable elements, buttons, navigation
5. CURRENT_STATE: Describe what's currently visible and active

Respond in JSON format:
{
    "question": "exact question text",
    "question_type": "type of question",
    "options": [
        {"text": "option text", "position": {"x": 0, "y": 0}, "identifier": "A/B/C or option ID"}
    ],
    "ui_elements": {
        "next_button": {"x": 0, "y": 0, "visible": true},
        "previous_button": {"x": 0, "y": 0, "visible": false},
        "submit_button": {"x": 0, "y": 0, "visible": false}
    },
    "current_state": "description of current screen state",
    "confidence": 0.95
}

Be precise with coordinates and text extraction. If you're uncertain about any element, set confidence lower.
`;

        try {
            const response = await this.generateVisionResponse(imageBase64, prompt);
            return JSON.parse(response);
        } catch (error) {
            logger.error('Failed to analyze exam screen:', error);
            throw error;
        }
    }

    async reasonAboutAnswer(question, options, context = null) {
        const prompt = `
You are an expert exam-taking AI. Given the following question and options, provide your reasoning and select the best answer.

QUESTION: ${question}

OPTIONS:
${options.map((opt, idx) => `${String.fromCharCode(65 + idx)}. ${opt.text}`).join('\n')}

${context ? `CONTEXT: ${context}` : ''}

Please provide your reasoning step by step, then select the best answer. Respond in JSON format:
{
    "reasoning": "detailed step-by-step reasoning",
    "answer": "selected option text",
    "answer_identifier": "A/B/C/etc",
    "confidence": 0.95,
    "key_concepts": ["concept1", "concept2"],
    "uncertainty_factors": ["factor1", "factor2"] // if any
}

Be thorough in your reasoning and honest about your confidence level.
`;

        try {
            const response = await this.generateTextResponse(prompt);
            return JSON.parse(response);
        } catch (error) {
            logger.error('Failed to reason about answer:', error);
            throw error;
        }
    }

    async findAnswerCoordinates(screenAnalysis, selectedAnswer) {
        const prompt = `
Given this screen analysis and the selected answer, determine the exact coordinates to click:

SCREEN_ANALYSIS: ${JSON.stringify(screenAnalysis)}
SELECTED_ANSWER: ${selectedAnswer}

Find the option that matches the selected answer and return its coordinates. Respond in JSON format:
{
    "coordinates": {"x": 0, "y": 0},
    "matched_option": "option text that was matched",
    "confidence": 0.95,
    "click_type": "option_select" // or "drag_drop", "text_input", etc.
}

If no match is found or coordinates are unclear, set confidence to 0.
`;

        try {
            const response = await this.generateTextResponse(prompt);
            return JSON.parse(response);
        } catch (error) {
            logger.error('Failed to find answer coordinates:', error);
            throw error;
        }
    }

    async checkHealth() {
        try {
            const response = await this.client.get('/api/tags');
            const availableModels = response.data.models.map(m => m.name);
            
            const requiredModels = Object.values(this.models);
            const missingModels = requiredModels.filter(model => 
                !availableModels.some(available => available.includes(model.split(':')[0]))
            );

            return {
                connected: true,
                availableModels,
                requiredModels,
                missingModels,
                healthy: missingModels.length === 0
            };
        } catch (error) {
            logger.error('Ollama health check failed:', error.message);
            return {
                connected: false,
                error: error.message,
                healthy: false
            };
        }
    }
}

module.exports = OllamaClient;