const EventEmitter = require('events');
const logger = require('./logger');

class AnalyticsEngine extends EventEmitter {
    constructor(dbManager) {
        super();
        this.dbManager = dbManager;
        this.sessionMetrics = new Map();
        this.realTimeStats = {
            questionsPerMinute: 0,
            averageConfidence: 0,
            successRate: 0,
            totalQuestions: 0,
            correctAnswers: 0,
            uncertaintyEvents: 0,
            manualInterventions: 0
        };
        this.performanceHistory = [];
        this.startTime = null;
    }

    startSession(sessionId) {
        this.startTime = new Date();
        this.sessionMetrics.set(sessionId, {
            sessionId,
            startTime: this.startTime,
            questions: [],
            actions: [],
            uncertaintyEvents: [],
            manualInterventions: [],
            totalProcessingTime: 0,
            averageResponseTime: 0
        });

        logger.info('Analytics session started:', { sessionId });
    }

    recordQuestionDetected(sessionId, questionData) {
        const metrics = this.sessionMetrics.get(sessionId);
        if (!metrics) return;

        const questionMetric = {
            id: questionData.id,
            question: questionData.question,
            type: questionData.type,
            detectedAt: new Date(),
            confidence: questionData.confidence,
            options: questionData.options?.length || 0,
            status: 'detected'
        };

        metrics.questions.push(questionMetric);
        this.updateRealTimeStats();
        
        this.emit('question_metrics_updated', {
            sessionId,
            questionCount: metrics.questions.length,
            questionMetric
        });
    }

    recordAnswerFound(sessionId, answerData) {
        const metrics = this.sessionMetrics.get(sessionId);
        if (!metrics) return;

        const question = metrics.questions.find(q => q.status === 'detected');
        if (question) {
            question.answer = answerData.answer;
            question.answerSource = answerData.source;
            question.answerConfidence = answerData.confidence;
            question.answeredAt = new Date();
            question.responseTime = question.answeredAt - question.detectedAt;
            question.status = 'answered';

            // Update processing time
            metrics.totalProcessingTime += question.responseTime;
            metrics.averageResponseTime = metrics.totalProcessingTime / metrics.questions.filter(q => q.status === 'answered').length;

            this.updateRealTimeStats();
            
            this.emit('answer_metrics_updated', {
                sessionId,
                question,
                responseTime: question.responseTime
            });
        }
    }

    recordActionExecuted(sessionId, actionData) {
        const metrics = this.sessionMetrics.get(sessionId);
        if (!metrics) return;

        const actionMetric = {
            type: actionData.action,
            coordinates: actionData.coordinates,
            timestamp: new Date(),
            success: true,
            questionId: actionData.question?.id
        };

        metrics.actions.push(actionMetric);
        
        this.emit('action_metrics_updated', {
            sessionId,
            actionCount: metrics.actions.length,
            actionMetric
        });
    }

    recordUncertaintyEvent(sessionId, uncertaintyData) {
        const metrics = this.sessionMetrics.get(sessionId);
        if (!metrics) return;

        const uncertaintyMetric = {
            question: uncertaintyData.question,
            reason: uncertaintyData.reason,
            confidence: uncertaintyData.confidence,
            timestamp: new Date(),
            resolved: false
        };

        metrics.uncertaintyEvents.push(uncertaintyMetric);
        this.realTimeStats.uncertaintyEvents++;
        
        this.emit('uncertainty_metrics_updated', {
            sessionId,
            uncertaintyCount: metrics.uncertaintyEvents.length,
            uncertaintyMetric
        });
    }

    recordManualIntervention(sessionId, interventionData) {
        const metrics = this.sessionMetrics.get(sessionId);
        if (!metrics) return;

        const interventionMetric = {
            type: interventionData.action,
            timestamp: new Date(),
            coordinates: interventionData.coordinates,
            text: interventionData.text,
            questionId: interventionData.questionId
        };

        metrics.manualInterventions.push(interventionMetric);
        this.realTimeStats.manualInterventions++;
        
        this.emit('intervention_metrics_updated', {
            sessionId,
            interventionCount: metrics.manualInterventions.length,
            interventionMetric
        });
    }

    updateRealTimeStats() {
        const allMetrics = Array.from(this.sessionMetrics.values());
        
        if (allMetrics.length === 0) return;

        const allQuestions = allMetrics.flatMap(m => m.questions);
        const answeredQuestions = allQuestions.filter(q => q.status === 'answered');
        const correctAnswers = answeredQuestions.filter(q => q.answerConfidence > 0.8);

        this.realTimeStats.totalQuestions = allQuestions.length;
        this.realTimeStats.correctAnswers = correctAnswers.length;
        this.realTimeStats.successRate = answeredQuestions.length > 0 ? 
            (correctAnswers.length / answeredQuestions.length) * 100 : 0;
        
        this.realTimeStats.averageConfidence = answeredQuestions.length > 0 ?
            answeredQuestions.reduce((sum, q) => sum + q.answerConfidence, 0) / answeredQuestions.length * 100 : 0;

        // Calculate questions per minute
        if (this.startTime) {
            const elapsedMinutes = (new Date() - this.startTime) / (1000 * 60);
            this.realTimeStats.questionsPerMinute = elapsedMinutes > 0 ? 
                allQuestions.length / elapsedMinutes : 0;
        }

        this.emit('real_time_stats_updated', this.realTimeStats);
    }

    generateSessionReport(sessionId) {
        const metrics = this.sessionMetrics.get(sessionId);
        if (!metrics) return null;

        const answeredQuestions = metrics.questions.filter(q => q.status === 'answered');
        const highConfidenceAnswers = answeredQuestions.filter(q => q.answerConfidence > 0.8);
        
        const report = {
            sessionId,
            duration: new Date() - metrics.startTime,
            summary: {
                totalQuestions: metrics.questions.length,
                answeredQuestions: answeredQuestions.length,
                correctAnswers: highConfidenceAnswers.length,
                successRate: answeredQuestions.length > 0 ? 
                    (highConfidenceAnswers.length / answeredQuestions.length) * 100 : 0,
                averageConfidence: answeredQuestions.length > 0 ?
                    answeredQuestions.reduce((sum, q) => sum + q.answerConfidence, 0) / answeredQuestions.length : 0,
                averageResponseTime: metrics.averageResponseTime,
                totalActions: metrics.actions.length,
                uncertaintyEvents: metrics.uncertaintyEvents.length,
                manualInterventions: metrics.manualInterventions.length
            },
            performance: {
                questionsPerMinute: this.realTimeStats.questionsPerMinute,
                fastestResponse: Math.min(...answeredQuestions.map(q => q.responseTime)),
                slowestResponse: Math.max(...answeredQuestions.map(q => q.responseTime)),
                medianResponseTime: this.calculateMedian(answeredQuestions.map(q => q.responseTime))
            },
            questionTypes: this.analyzeQuestionTypes(metrics.questions),
            answerSources: this.analyzeAnswerSources(answeredQuestions),
            timeDistribution: this.analyzeTimeDistribution(answeredQuestions),
            uncertaintyAnalysis: this.analyzeUncertaintyPatterns(metrics.uncertaintyEvents)
        };

        return report;
    }

    analyzeQuestionTypes(questions) {
        const types = {};
        questions.forEach(q => {
            types[q.type] = (types[q.type] || 0) + 1;
        });
        return types;
    }

    analyzeAnswerSources(questions) {
        const sources = {};
        questions.forEach(q => {
            if (q.answerSource) {
                sources[q.answerSource] = (sources[q.answerSource] || 0) + 1;
            }
        });
        return sources;
    }

    analyzeTimeDistribution(questions) {
        const times = questions.map(q => q.responseTime).filter(t => t);
        if (times.length === 0) return {};

        return {
            average: times.reduce((sum, t) => sum + t, 0) / times.length,
            median: this.calculateMedian(times),
            min: Math.min(...times),
            max: Math.max(...times),
            standardDeviation: this.calculateStandardDeviation(times)
        };
    }

    analyzeUncertaintyPatterns(uncertaintyEvents) {
        const reasons = {};
        uncertaintyEvents.forEach(event => {
            reasons[event.reason] = (reasons[event.reason] || 0) + 1;
        });

        return {
            totalEvents: uncertaintyEvents.length,
            reasonBreakdown: reasons,
            averageConfidenceAtUncertainty: uncertaintyEvents.length > 0 ?
                uncertaintyEvents.reduce((sum, e) => sum + (e.confidence || 0), 0) / uncertaintyEvents.length : 0
        };
    }

    calculateMedian(numbers) {
        if (numbers.length === 0) return 0;
        const sorted = [...numbers].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 === 0 ? 
            (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
    }

    calculateStandardDeviation(numbers) {
        if (numbers.length === 0) return 0;
        const mean = numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
        const squaredDiffs = numbers.map(n => Math.pow(n - mean, 2));
        const avgSquaredDiff = squaredDiffs.reduce((sum, d) => sum + d, 0) / numbers.length;
        return Math.sqrt(avgSquaredDiff);
    }

    async saveSessionMetrics(sessionId) {
        try {
            const report = this.generateSessionReport(sessionId);
            if (!report) return;

            // Save to database
            await this.dbManager.runQuery(
                `INSERT INTO performance_metrics (exam_session_id, metric_name, metric_value) VALUES 
                 (?, 'success_rate', ?),
                 (?, 'average_confidence', ?),
                 (?, 'average_response_time', ?),
                 (?, 'questions_per_minute', ?),
                 (?, 'uncertainty_events', ?),
                 (?, 'manual_interventions', ?)`,
                [
                    sessionId, report.summary.successRate,
                    sessionId, report.summary.averageConfidence,
                    sessionId, report.summary.averageResponseTime,
                    sessionId, report.performance.questionsPerMinute,
                    sessionId, report.summary.uncertaintyEvents,
                    sessionId, report.summary.manualInterventions
                ]
            );

            logger.info('Session metrics saved:', { sessionId, report: report.summary });
            return report;
        } catch (error) {
            logger.error('Failed to save session metrics:', error);
            throw error;
        }
    }

    getRealTimeStats() {
        return this.realTimeStats;
    }

    getSessionMetrics(sessionId) {
        return this.sessionMetrics.get(sessionId);
    }

    clearSession(sessionId) {
        this.sessionMetrics.delete(sessionId);
        logger.info('Session metrics cleared:', { sessionId });
    }

    exportMetrics(sessionId, format = 'json') {
        const report = this.generateSessionReport(sessionId);
        if (!report) return null;

        switch (format) {
            case 'csv':
                return this.exportToCSV(report);
            case 'json':
            default:
                return JSON.stringify(report, null, 2);
        }
    }

    exportToCSV(report) {
        const metrics = this.sessionMetrics.get(report.sessionId);
        if (!metrics) return '';

        const headers = ['Question', 'Type', 'Confidence', 'Answer', 'Source', 'Response Time', 'Status'];
        const rows = metrics.questions.map(q => [
            q.question.substring(0, 50),
            q.type,
            q.confidence,
            q.answer || '',
            q.answerSource || '',
            q.responseTime || '',
            q.status
        ]);

        return [headers, ...rows].map(row => row.join(',')).join('\n');
    }
}

module.exports = AnalyticsEngine;