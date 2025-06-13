const fs = require('fs');
const path = require('path');
const config = require('../../config.json');

class Logger {
    constructor() {
        this.logLevel = config.logging.level || 'info';
        this.consoleLogging = config.logging.console !== false;
        this.fileLogging = !!config.logging.file;
        this.logFile = config.logging.file;
        this.socketIO = null; // Will be set by the main app
        
        this.levels = {
            error: 0,
            warn: 1,
            info: 2,
            debug: 3
        };
        
        // Ensure log directory exists
        if (this.fileLogging) {
            const logDir = path.dirname(this.logFile);
            if (!fs.existsSync(logDir)) {
                fs.mkdirSync(logDir, { recursive: true });
            }
        }
    }

    // Method to set Socket.IO instance for real-time logging
    setSocketIO(io) {
        this.socketIO = io;
    }

    shouldLog(level) {
        return this.levels[level] <= this.levels[this.logLevel];
    }

    formatMessage(level, message, meta = {}) {
        const timestamp = new Date().toISOString();
        const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
        return `[${timestamp}] ${level.toUpperCase()}: ${message}${metaStr}`;
    }

    log(level, message, meta = {}) {
        if (!this.shouldLog(level)) {
            return;
        }

        const formattedMessage = this.formatMessage(level, message, meta);

        // Console logging
        if (this.consoleLogging) {
            switch (level) {
                case 'error':
                    console.error(formattedMessage);
                    break;
                case 'warn':
                    console.warn(formattedMessage);
                    break;
                case 'info':
                    console.info(formattedMessage);
                    break;
                case 'debug':
                    console.debug(formattedMessage);
                    break;
                default:
                    console.log(formattedMessage);
            }
        }

        // File logging
        if (this.fileLogging) {
            try {
                fs.appendFileSync(this.logFile, formattedMessage + '\n');
            } catch (error) {
                console.error('Failed to write to log file:', error);
            }
        }

        // Real-time logging to debug console
        if (this.socketIO) {
            this.socketIO.emit('debug_log', {
                level,
                message,
                meta,
                formattedMessage,
                timestamp: new Date().toISOString()
            });
        }
    }

    error(message, meta = {}) {
        this.log('error', message, meta);
    }

    warn(message, meta = {}) {
        this.log('warn', message, meta);
    }

    info(message, meta = {}) {
        this.log('info', message, meta);
    }

    debug(message, meta = {}) {
        this.log('debug', message, meta);
    }

    // Special method for AI reasoning logs
    aiReasoning(question, reasoning, answer, confidence, meta = {}) {
        this.info('AI Reasoning', {
            question,
            reasoning,
            answer,
            confidence,
            ...meta,
            type: 'ai_reasoning'
        });
    }

    // Special method for action logs
    action(actionType, details, meta = {}) {
        this.info('Action Executed', {
            actionType,
            details,
            ...meta,
            type: 'action'
        });
    }

    // Special method for exam progress logs
    examProgress(examId, questionNumber, totalQuestions, status, meta = {}) {
        this.info('Exam Progress', {
            examId,
            questionNumber,
            totalQuestions,
            status,
            progress: `${questionNumber}/${totalQuestions}`,
            ...meta,
            type: 'exam_progress'
        });
    }
}

// Create singleton instance
const logger = new Logger();

module.exports = logger;