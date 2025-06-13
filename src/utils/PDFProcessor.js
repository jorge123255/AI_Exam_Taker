const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const logger = require('./logger');

class PDFProcessor {
    constructor(ragSystem) {
        this.ragSystem = ragSystem;
        this.supportedFormats = ['.pdf'];
    }

    async processPDFFile(filePath, metadata = {}) {
        try {
            logger.info('Processing PDF file:', filePath);

            if (!fs.existsSync(filePath)) {
                throw new Error(`PDF file not found: ${filePath}`);
            }

            const fileExtension = path.extname(filePath).toLowerCase();
            if (!this.supportedFormats.includes(fileExtension)) {
                throw new Error(`Unsupported file format: ${fileExtension}`);
            }

            // Read PDF file
            const pdfBuffer = fs.readFileSync(filePath);
            const pdfData = await pdfParse(pdfBuffer);

            logger.info('PDF parsed successfully:', {
                pages: pdfData.numpages,
                textLength: pdfData.text.length
            });

            // Process the extracted text
            const processedContent = await this.processExtractedText(pdfData.text, {
                ...metadata,
                source_file: path.basename(filePath),
                total_pages: pdfData.numpages,
                extraction_method: 'pdf-parse'
            });

            return processedContent;
        } catch (error) {
            logger.error('PDF processing failed:', error);
            throw error;
        }
    }

    async processExtractedText(text, metadata = {}) {
        try {
            // Clean and normalize the text
            const cleanedText = this.cleanText(text);
            
            // Extract Q&A pairs
            const qaPairs = this.extractQAPairs(cleanedText);
            
            logger.info('Extracted Q&A pairs:', { count: qaPairs.length });

            // Add to RAG system
            const addedDocuments = [];
            for (const qa of qaPairs) {
                try {
                    const docMetadata = {
                        ...metadata,
                        type: 'question_answer',
                        subject: qa.subject || metadata.subject,
                        difficulty: qa.difficulty || metadata.difficulty,
                        question_type: qa.questionType || 'unknown'
                    };

                    const result = await this.ragSystem.addDocument(
                        `Question: ${qa.question}\nAnswer: ${qa.answer}`,
                        docMetadata
                    );

                    addedDocuments.push({
                        ...result,
                        question: qa.question,
                        answer: qa.answer
                    });
                } catch (error) {
                    logger.error('Failed to add Q&A pair to RAG:', error);
                }
            }

            return {
                success: true,
                totalQAPairs: qaPairs.length,
                addedToRAG: addedDocuments.length,
                documents: addedDocuments,
                metadata
            };
        } catch (error) {
            logger.error('Text processing failed:', error);
            throw error;
        }
    }

    cleanText(text) {
        // Remove excessive whitespace and normalize line breaks
        let cleaned = text.replace(/\r\n/g, '\n')
                         .replace(/\r/g, '\n')
                         .replace(/\n{3,}/g, '\n\n')
                         .replace(/[ \t]{2,}/g, ' ')
                         .trim();

        // Remove page numbers and headers/footers (common patterns)
        cleaned = cleaned.replace(/^Page \d+.*$/gm, '')
                        .replace(/^\d+\s*$/gm, '')
                        .replace(/^-+\s*$/gm, '');

        return cleaned;
    }

    extractQAPairs(text) {
        const qaPairs = [];
        
        // Try different Q&A extraction patterns
        const patterns = [
            // Pattern 1: "Q: ... A: ..." or "Question: ... Answer: ..."
            /(?:Q(?:uestion)?[:\.]?\s*)(.*?)(?:\n|^)(?:A(?:nswer)?[:\.]?\s*)(.*?)(?=\n(?:Q(?:uestion)?[:\.]?|$))/gis,
            
            // Pattern 2: Numbered questions "1. ... Answer: ..."
            /(\d+\.?\s*)(.*?)(?:\n|^)(?:Answer[:\.]?\s*)(.*?)(?=\n\d+\.|$)/gis,
            
            // Pattern 3: Multiple choice format
            /(\d+\.?\s*)(.*?)(?:\n[A-D]\..*?)*\n(?:Answer[:\.]?\s*|Correct[:\.]?\s*)([A-D]\.?.*?)(?=\n\d+\.|$)/gis
        ];

        for (const pattern of patterns) {
            const matches = [...text.matchAll(pattern)];
            
            for (const match of matches) {
                let question, answer;
                
                if (pattern === patterns[0]) {
                    // Q: ... A: ... format
                    question = match[1].trim();
                    answer = match[2].trim();
                } else if (pattern === patterns[1]) {
                    // Numbered format
                    question = match[2].trim();
                    answer = match[3].trim();
                } else if (pattern === patterns[2]) {
                    // Multiple choice format
                    question = match[2].trim();
                    answer = match[3].trim();
                }

                if (question && answer && question.length > 10 && answer.length > 1) {
                    // Determine question type
                    const questionType = this.determineQuestionType(question, answer);
                    
                    // Extract subject if possible
                    const subject = this.extractSubject(question);
                    
                    // Determine difficulty
                    const difficulty = this.estimateDifficulty(question, answer);

                    qaPairs.push({
                        question: question,
                        answer: answer,
                        questionType: questionType,
                        subject: subject,
                        difficulty: difficulty
                    });
                }
            }
        }

        // Remove duplicates
        const uniqueQAPairs = this.removeDuplicateQAPairs(qaPairs);
        
        return uniqueQAPairs;
    }

    determineQuestionType(question, answer) {
        const questionLower = question.toLowerCase();
        const answerLower = answer.toLowerCase();

        // Multiple choice indicators
        if (questionLower.includes('which of the following') || 
            questionLower.includes('select all that apply') ||
            /[a-d]\./i.test(answer)) {
            return 'multiple_choice';
        }

        // True/false questions
        if (answerLower === 'true' || answerLower === 'false' ||
            answerLower === 't' || answerLower === 'f') {
            return 'true_false';
        }

        // Fill in the blank
        if (questionLower.includes('fill in') || questionLower.includes('complete')) {
            return 'fill_blank';
        }

        // Short answer
        if (answer.split(' ').length <= 5) {
            return 'short_answer';
        }

        // Essay/long answer
        if (answer.split(' ').length > 20) {
            return 'essay';
        }

        return 'single_choice';
    }

    extractSubject(question) {
        const subjectKeywords = {
            'mathematics': ['math', 'equation', 'calculate', 'solve', 'algebra', 'geometry', 'calculus'],
            'science': ['atom', 'molecule', 'cell', 'organism', 'physics', 'chemistry', 'biology'],
            'english': ['grammar', 'literature', 'writing', 'reading', 'author', 'poem', 'novel'],
            'history': ['war', 'century', 'historical', 'ancient', 'revolution', 'empire'],
            'geography': ['country', 'continent', 'ocean', 'mountain', 'capital', 'climate']
        };

        const questionLower = question.toLowerCase();
        
        for (const [subject, keywords] of Object.entries(subjectKeywords)) {
            if (keywords.some(keyword => questionLower.includes(keyword))) {
                return subject;
            }
        }

        return 'general';
    }

    estimateDifficulty(question, answer) {
        let difficultyScore = 0;

        // Question length (longer questions tend to be more complex)
        if (question.length > 100) difficultyScore += 1;
        if (question.length > 200) difficultyScore += 1;

        // Answer length (longer answers might indicate complexity)
        if (answer.length > 50) difficultyScore += 1;
        if (answer.length > 150) difficultyScore += 1;

        // Complex vocabulary indicators
        const complexWords = ['analyze', 'synthesize', 'evaluate', 'compare', 'contrast', 'explain', 'justify'];
        if (complexWords.some(word => question.toLowerCase().includes(word))) {
            difficultyScore += 2;
        }

        // Multiple parts or sub-questions
        if (question.includes('(a)') || question.includes('(i)') || question.includes('part')) {
            difficultyScore += 1;
        }

        // Return difficulty level
        if (difficultyScore <= 1) return 'easy';
        if (difficultyScore <= 3) return 'medium';
        return 'hard';
    }

    removeDuplicateQAPairs(qaPairs) {
        const seen = new Set();
        const unique = [];

        for (const qa of qaPairs) {
            // Create a normalized key for comparison
            const key = qa.question.toLowerCase().replace(/[^\w\s]/g, '').trim();
            
            if (!seen.has(key)) {
                seen.add(key);
                unique.push(qa);
            }
        }

        return unique;
    }

    async processDirectory(directoryPath, metadata = {}) {
        try {
            logger.info('Processing PDF directory:', directoryPath);

            if (!fs.existsSync(directoryPath)) {
                throw new Error(`Directory not found: ${directoryPath}`);
            }

            const files = fs.readdirSync(directoryPath);
            const pdfFiles = files.filter(file => 
                this.supportedFormats.includes(path.extname(file).toLowerCase())
            );

            logger.info(`Found ${pdfFiles.length} PDF files to process`);

            const results = [];
            for (const file of pdfFiles) {
                try {
                    const filePath = path.join(directoryPath, file);
                    const fileMetadata = {
                        ...metadata,
                        batch_processing: true,
                        directory: directoryPath
                    };

                    const result = await this.processPDFFile(filePath, fileMetadata);
                    results.push({
                        file: file,
                        ...result
                    });

                    logger.info(`Processed ${file}: ${result.addedToRAG} Q&A pairs added`);
                } catch (error) {
                    logger.error(`Failed to process ${file}:`, error);
                    results.push({
                        file: file,
                        success: false,
                        error: error.message
                    });
                }
            }

            const totalQAPairs = results.reduce((sum, r) => sum + (r.addedToRAG || 0), 0);
            logger.info(`Directory processing complete: ${totalQAPairs} total Q&A pairs added`);

            return {
                success: true,
                filesProcessed: results.length,
                totalQAPairs: totalQAPairs,
                results: results
            };
        } catch (error) {
            logger.error('Directory processing failed:', error);
            throw error;
        }
    }

    // Method to integrate with Docling (placeholder for future implementation)
    async processWithDocling(filePath, metadata = {}) {
        try {
            // This would integrate with Docling for more advanced PDF processing
            // For now, we'll use the standard PDF processing
            logger.info('Docling integration not yet implemented, using standard PDF processing');
            return await this.processPDFFile(filePath, {
                ...metadata,
                processing_method: 'docling_fallback'
            });
        } catch (error) {
            logger.error('Docling processing failed:', error);
            throw error;
        }
    }
}

module.exports = PDFProcessor;