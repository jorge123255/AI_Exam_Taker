const { ChromaClient } = require('chromadb');
const logger = require('../utils/logger');
const config = require('../../config.json');
const OllamaClient = require('./OllamaClient');

class RAGSystem {
    constructor() {
        this.client = null;
        this.collection = null;
        this.ollamaClient = new OllamaClient();
        this.isInitialized = false;
        this.useMemoryFallback = false;
        this.memoryStore = []; // Fallback in-memory storage
    }

    async initialize() {
        try {
            logger.info('Initializing RAG system...');

            try {
                // Try to initialize ChromaDB client
                this.client = new ChromaClient({
                    path: `http://${config.rag.chromadb.host}:${config.rag.chromadb.port}`
                });

                // Test connection
                await this.client.heartbeat();

                // Get or create collection
                try {
                    this.collection = await this.client.getCollection({
                        name: config.rag.chromadb.collection
                    });
                    logger.info('Connected to existing ChromaDB collection');
                } catch (error) {
                    // Collection doesn't exist, create it
                    this.collection = await this.client.createCollection({
                        name: config.rag.chromadb.collection,
                        metadata: {
                            description: "Exam answers and knowledge base",
                            created_at: new Date().toISOString()
                        }
                    });
                    logger.info('Created new ChromaDB collection');
                }
                
                logger.info('ChromaDB initialized successfully');
            } catch (error) {
                logger.warn('ChromaDB not available, using in-memory fallback:', error.message);
                this.useMemoryFallback = true;
                this.client = null;
                this.collection = null;
            }

            this.isInitialized = true;
            logger.info('RAG system initialized successfully' + (this.useMemoryFallback ? ' (memory fallback mode)' : ''));
        } catch (error) {
            logger.error('Failed to initialize RAG system:', error);
            throw error;
        }
    }

    async addDocument(content, metadata = {}) {
        try {
            if (!this.isInitialized) {
                throw new Error('RAG system not initialized');
            }

            logger.info('Adding document to RAG system');

            const documentId = `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

            if (this.useMemoryFallback) {
                // Use in-memory storage
                this.memoryStore.push({
                    id: documentId,
                    content: content,
                    metadata: {
                        ...metadata,
                        added_at: new Date().toISOString(),
                        content_length: content.length
                    }
                });
                logger.info('Document added to memory store:', { documentId, contentLength: content.length });
            } else {
                // Generate embedding for the content
                const embedding = await this.ollamaClient.generateEmbedding(content);

                // Add to ChromaDB
                await this.collection.add({
                    ids: [documentId],
                    embeddings: [embedding],
                    documents: [content],
                    metadatas: [{
                        ...metadata,
                        added_at: new Date().toISOString(),
                        content_length: content.length
                    }]
                });
                logger.info('Document added to ChromaDB:', { documentId, contentLength: content.length });
            }

            return { id: documentId, success: true };
        } catch (error) {
            logger.error('Failed to add document to RAG:', error);
            throw error;
        }
    }

    async search(query, limit = 5, examType = null) {
        try {
            if (!this.isInitialized) {
                throw new Error('RAG system not initialized');
            }

            logger.info('Searching RAG system for:', { query, examType, limit });

            if (this.useMemoryFallback) {
                // Simple text search in memory with exam type filtering
                const results = this.memoryStore
                    .filter(doc => !examType || doc.metadata.subject === examType)
                    .map(doc => ({
                        content: doc.content,
                        metadata: doc.metadata,
                        score: this.calculateTextSimilarity(query.toLowerCase(), doc.content.toLowerCase()),
                        distance: 0
                    }))
                    .filter(result => result.score > 0.1)
                    .sort((a, b) => b.score - a.score)
                    .slice(0, limit);

                logger.info('Memory search completed:', {
                    query,
                    examType,
                    resultsCount: results.length,
                    topScore: results.length > 0 ? results[0].score : 0
                });

                return results;
            } else {
                // Generate embedding for the query
                const queryEmbedding = await this.ollamaClient.generateEmbedding(query);

                // Build where clause for exam type filtering
                let whereClause = null;
                if (examType) {
                    whereClause = { "subject": { "$eq": examType } };
                }

                // Search in ChromaDB
                const results = await this.collection.query({
                    queryEmbeddings: [queryEmbedding],
                    nResults: limit,
                    where: whereClause,
                    include: ['documents', 'metadatas', 'distances']
                });

                // Process results
                const processedResults = [];
                if (results.documents && results.documents[0]) {
                    for (let i = 0; i < results.documents[0].length; i++) {
                        const distance = results.distances[0][i];
                        const similarity = 1 - distance; // Convert distance to similarity

                        processedResults.push({
                            content: results.documents[0][i],
                            metadata: results.metadatas[0][i],
                            score: similarity,
                            distance: distance
                        });
                    }
                }

                // Sort by similarity score (highest first)
                processedResults.sort((a, b) => b.score - a.score);

                logger.info('ChromaDB search completed:', {
                    query,
                    examType,
                    resultsCount: processedResults.length,
                    topScore: processedResults.length > 0 ? processedResults[0].score : 0
                });

                return processedResults;
            }
        } catch (error) {
            logger.error('RAG search failed:', error);
            throw error;
        }
    }

    calculateTextSimilarity(text1, text2) {
        // Simple word overlap similarity
        const words1 = text1.split(/\s+/);
        const words2 = text2.split(/\s+/);
        
        const set1 = new Set(words1);
        const set2 = new Set(words2);
        
        const intersection = new Set([...set1].filter(x => set2.has(x)));
        const union = new Set([...set1, ...set2]);
        
        return intersection.size / union.size;
    }

    async addPDFContent(pdfPath, metadata = {}) {
        try {
            logger.info('Processing PDF for RAG system:', pdfPath);

            // This would integrate with Docling for PDF processing
            // For now, we'll use a placeholder implementation
            const fs = require('fs');
            const pdfParse = require('pdf-parse');

            const pdfBuffer = fs.readFileSync(pdfPath);
            const pdfData = await pdfParse(pdfBuffer);

            // Split content into chunks for better retrieval
            const chunks = this.splitTextIntoChunks(pdfData.text, 1000);

            const addedDocuments = [];
            for (let i = 0; i < chunks.length; i++) {
                const chunk = chunks[i];
                const chunkMetadata = {
                    ...metadata,
                    source: 'pdf',
                    pdf_path: pdfPath,
                    chunk_index: i,
                    total_chunks: chunks.length,
                    pdf_pages: pdfData.numpages
                };

                const result = await this.addDocument(chunk, chunkMetadata);
                addedDocuments.push(result);
            }

            logger.info('PDF processed and added to RAG system:', {
                pdfPath,
                chunksAdded: addedDocuments.length,
                totalPages: pdfData.numpages
            });

            return {
                success: true,
                documentsAdded: addedDocuments.length,
                chunks: addedDocuments
            };
        } catch (error) {
            logger.error('Failed to process PDF for RAG:', error);
            throw error;
        }
    }

    splitTextIntoChunks(text, maxChunkSize = 1000, overlap = 100) {
        const chunks = [];
        let start = 0;

        while (start < text.length) {
            let end = start + maxChunkSize;
            
            // Try to break at sentence boundaries
            if (end < text.length) {
                const lastPeriod = text.lastIndexOf('.', end);
                const lastNewline = text.lastIndexOf('\n', end);
                const breakPoint = Math.max(lastPeriod, lastNewline);
                
                if (breakPoint > start + maxChunkSize * 0.5) {
                    end = breakPoint + 1;
                }
            }

            chunks.push(text.slice(start, end).trim());
            start = end - overlap;
        }

        return chunks.filter(chunk => chunk.length > 0);
    }

    async getCollectionStats() {
        try {
            if (!this.isInitialized) {
                throw new Error('RAG system not initialized');
            }

            if (this.useMemoryFallback) {
                return {
                    documentCount: this.memoryStore.length,
                    collectionName: 'memory_fallback',
                    isReady: this.isInitialized
                };
            }

            const count = await this.collection.count();
            
            return {
                documentCount: count,
                collectionName: config.rag.chromadb.collection,
                isReady: this.isInitialized
            };
        } catch (error) {
            logger.error('Failed to get collection stats:', error);
            return {
                documentCount: 0,
                collectionName: config.rag.chromadb.collection,
                isReady: false,
                error: error.message
            };
        }
    }

    async getExamTypeStats(examType) {
        try {
            if (!this.isInitialized) {
                throw new Error('RAG system not initialized');
            }

            if (this.useMemoryFallback) {
                const examDocs = this.memoryStore.filter(doc =>
                    !examType || examType === 'all' || doc.metadata.subject === examType
                );
                
                return {
                    documentCount: examDocs.length,
                    examType: examType,
                    isReady: this.isInitialized,
                    avgContentLength: examDocs.length > 0 ?
                        examDocs.reduce((sum, doc) => sum + doc.content.length, 0) / examDocs.length : 0
                };
            }

            // For ChromaDB, we'll need to query with filters
            let whereClause = null;
            if (examType && examType !== 'all') {
                whereClause = { "subject": { "$eq": examType } };
            }

            // Get documents for this exam type
            const results = await this.collection.get({
                where: whereClause,
                include: ['metadatas', 'documents']
            });

            const documentCount = results.documents ? results.documents.length : 0;
            const avgContentLength = documentCount > 0 ?
                results.documents.reduce((sum, doc) => sum + doc.length, 0) / documentCount : 0;

            return {
                documentCount: documentCount,
                examType: examType,
                isReady: this.isInitialized,
                avgContentLength: avgContentLength
            };
        } catch (error) {
            logger.error('Failed to get exam type stats:', error);
            return {
                documentCount: 0,
                examType: examType,
                isReady: false,
                avgContentLength: 0,
                error: error.message
            };
        }
    }

    async deleteDocument(documentId) {
        try {
            if (!this.isInitialized) {
                throw new Error('RAG system not initialized');
            }

            await this.collection.delete({
                ids: [documentId]
            });

            logger.info('Document deleted from RAG system:', documentId);
            return { success: true };
        } catch (error) {
            logger.error('Failed to delete document from RAG:', error);
            throw error;
        }
    }

    async clearCollection() {
        try {
            if (!this.isInitialized) {
                throw new Error('RAG system not initialized');
            }

            // Delete the collection and recreate it
            await this.client.deleteCollection({
                name: config.rag.chromadb.collection
            });

            this.collection = await this.client.createCollection({
                name: config.rag.chromadb.collection,
                metadata: {
                    description: "Exam answers and knowledge base",
                    created_at: new Date().toISOString()
                }
            });

            logger.info('RAG collection cleared and recreated');
            return { success: true };
        } catch (error) {
            logger.error('Failed to clear RAG collection:', error);
            throw error;
        }
    }

    async findSimilarQuestions(question, threshold = 0.8) {
        try {
            const results = await this.search(question, 10);
            
            // Filter for high similarity questions
            const similarQuestions = results.filter(result => 
                result.score >= threshold && 
                result.metadata.type === 'question'
            );

            return similarQuestions;
        } catch (error) {
            logger.error('Failed to find similar questions:', error);
            throw error;
        }
    }

    isReady() {
        return this.isInitialized;
    }
}

module.exports = RAGSystem;