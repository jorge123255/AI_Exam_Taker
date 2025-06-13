const axios = require('axios');
const logger = require('./logger');
const config = require('../../config.json');

class WebSearchClient {
    constructor() {
        this.firecrawlEnabled = config.search.firecrawl.enabled;
        this.tullyEnabled = config.search.tully.enabled;
        this.firecrawlApiKey = config.search.firecrawl.api_key;
        this.tullyApiKey = config.search.tully.api_key;
    }

    async searchForAnswer(question, options = {}) {
        try {
            logger.info('Searching web for answer:', question);

            let results = [];

            // Try Firecrawl first if enabled
            if (this.firecrawlEnabled && this.firecrawlApiKey) {
                try {
                    const firecrawlResults = await this.searchWithFirecrawl(question, options);
                    results = results.concat(firecrawlResults);
                } catch (error) {
                    logger.error('Firecrawl search failed:', error);
                }
            }

            // Try Tully if enabled and no good results from Firecrawl
            if (this.tullyEnabled && this.tullyApiKey && results.length === 0) {
                try {
                    const tullyResults = await this.searchWithTully(question, options);
                    results = results.concat(tullyResults);
                } catch (error) {
                    logger.error('Tully search failed:', error);
                }
            }

            // Fallback to basic web search if no specialized tools available
            if (results.length === 0) {
                results = await this.basicWebSearch(question, options);
            }

            // Process and rank results
            const processedResults = this.processSearchResults(results, question);

            logger.info('Web search completed:', {
                query: question,
                resultsCount: processedResults.length,
                topScore: processedResults.length > 0 ? processedResults[0].relevanceScore : 0
            });

            return processedResults;
        } catch (error) {
            logger.error('Web search failed:', error);
            throw error;
        }
    }

    async searchWithFirecrawl(question, options = {}) {
        try {
            const searchQuery = this.buildSearchQuery(question, options);
            
            const response = await axios.post('https://api.firecrawl.dev/v0/search', {
                query: searchQuery,
                limit: options.limit || 5,
                include_domains: options.domains || [],
                exclude_domains: options.excludeDomains || [],
                format: 'markdown'
            }, {
                headers: {
                    'Authorization': `Bearer ${this.firecrawlApiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            });

            return response.data.data.map(result => ({
                title: result.title,
                content: result.markdown,
                url: result.url,
                source: 'firecrawl',
                timestamp: new Date().toISOString()
            }));
        } catch (error) {
            logger.error('Firecrawl API error:', error);
            throw error;
        }
    }

    async searchWithTully(question, options = {}) {
        try {
            const searchQuery = this.buildSearchQuery(question, options);
            
            const response = await axios.post('https://api.tully.ai/search', {
                query: searchQuery,
                max_results: options.limit || 5,
                include_content: true
            }, {
                headers: {
                    'Authorization': `Bearer ${this.tullyApiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            });

            return response.data.results.map(result => ({
                title: result.title,
                content: result.content,
                url: result.url,
                source: 'tully',
                timestamp: new Date().toISOString()
            }));
        } catch (error) {
            logger.error('Tully API error:', error);
            throw error;
        }
    }

    async basicWebSearch(question, options = {}) {
        try {
            // This is a placeholder for basic web search
            // In a real implementation, you might use DuckDuckGo API or similar
            logger.info('Using basic web search fallback');
            
            // For now, return empty results
            return [];
        } catch (error) {
            logger.error('Basic web search failed:', error);
            return [];
        }
    }

    buildSearchQuery(question, options = {}) {
        let query = question;

        // Add context if provided
        if (options.subject) {
            query += ` ${options.subject}`;
        }

        if (options.topic) {
            query += ` ${options.topic}`;
        }

        // Add search modifiers for better results
        if (options.examType) {
            query += ` exam question answer`;
        }

        return query.trim();
    }

    processSearchResults(results, originalQuestion) {
        return results.map(result => {
            // Calculate relevance score based on content similarity
            const relevanceScore = this.calculateRelevanceScore(result.content, originalQuestion);
            
            // Extract potential answer from content
            const extractedAnswer = this.extractAnswer(result.content, originalQuestion);

            return {
                ...result,
                relevanceScore,
                extractedAnswer,
                confidence: Math.min(relevanceScore, 0.8) // Cap confidence for web results
            };
        }).sort((a, b) => b.relevanceScore - a.relevanceScore);
    }

    calculateRelevanceScore(content, question) {
        try {
            const questionWords = question.toLowerCase().split(/\s+/);
            const contentWords = content.toLowerCase().split(/\s+/);
            
            let matchCount = 0;
            for (const word of questionWords) {
                if (word.length > 3 && contentWords.includes(word)) {
                    matchCount++;
                }
            }

            const score = matchCount / questionWords.length;
            return Math.min(score, 1.0);
        } catch (error) {
            logger.error('Error calculating relevance score:', error);
            return 0;
        }
    }

    extractAnswer(content, question) {
        try {
            // Simple answer extraction logic
            const sentences = content.split(/[.!?]+/);
            const questionWords = question.toLowerCase().split(/\s+/);
            
            // Find sentences that contain question keywords
            const relevantSentences = sentences.filter(sentence => {
                const sentenceLower = sentence.toLowerCase();
                return questionWords.some(word => 
                    word.length > 3 && sentenceLower.includes(word)
                );
            });

            if (relevantSentences.length > 0) {
                // Return the first relevant sentence, cleaned up
                return relevantSentences[0].trim().substring(0, 200);
            }

            // Fallback: return first few sentences
            return sentences.slice(0, 2).join('. ').trim().substring(0, 200);
        } catch (error) {
            logger.error('Error extracting answer:', error);
            return content.substring(0, 200);
        }
    }

    async searchForQuestionType(questionText, questionType) {
        try {
            const searchOptions = {
                examType: true,
                subject: this.inferSubject(questionText),
                limit: 3
            };

            // Customize search based on question type
            switch (questionType) {
                case 'multiple_choice':
                    searchOptions.query = `"${questionText}" multiple choice answer`;
                    break;
                case 'true_false':
                    searchOptions.query = `"${questionText}" true false answer`;
                    break;
                case 'fill_blank':
                    searchOptions.query = `"${questionText}" fill in the blank answer`;
                    break;
                default:
                    searchOptions.query = questionText;
            }

            return await this.searchForAnswer(questionText, searchOptions);
        } catch (error) {
            logger.error('Question type search failed:', error);
            throw error;
        }
    }

    inferSubject(questionText) {
        const subjectKeywords = {
            'mathematics': ['math', 'equation', 'calculate', 'solve', 'algebra', 'geometry'],
            'science': ['atom', 'molecule', 'cell', 'physics', 'chemistry', 'biology'],
            'english': ['grammar', 'literature', 'writing', 'author', 'poem', 'novel'],
            'history': ['war', 'century', 'historical', 'ancient', 'revolution'],
            'geography': ['country', 'continent', 'ocean', 'mountain', 'capital']
        };

        const questionLower = questionText.toLowerCase();
        
        for (const [subject, keywords] of Object.entries(subjectKeywords)) {
            if (keywords.some(keyword => questionLower.includes(keyword))) {
                return subject;
            }
        }

        return 'general';
    }

    isConfigured() {
        return (this.firecrawlEnabled && this.firecrawlApiKey) || 
               (this.tullyEnabled && this.tullyApiKey);
    }

    getStatus() {
        return {
            firecrawl: {
                enabled: this.firecrawlEnabled,
                configured: !!this.firecrawlApiKey
            },
            tully: {
                enabled: this.tullyEnabled,
                configured: !!this.tullyApiKey
            },
            ready: this.isConfigured()
        };
    }
}

module.exports = WebSearchClient;