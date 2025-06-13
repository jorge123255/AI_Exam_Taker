const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');
const config = require('../../config.json');

class DatabaseManager {
    constructor() {
        this.dbPath = config.database.path;
        this.db = null;
        this.isInitialized = false;
    }

    async initialize() {
        try {
            logger.info('Initializing database...');

            // Ensure database directory exists
            const dbDir = path.dirname(this.dbPath);
            if (!fs.existsSync(dbDir)) {
                fs.mkdirSync(dbDir, { recursive: true });
            }

            // Open database connection
            this.db = new sqlite3.Database(this.dbPath, (err) => {
                if (err) {
                    logger.error('Failed to open database:', err);
                    throw err;
                }
            });

            // Create tables
            await this.createTables();
            
            this.isInitialized = true;
            logger.info('Database initialized successfully');
        } catch (error) {
            logger.error('Database initialization failed:', error);
            throw error;
        }
    }

    async createTables() {
        const tables = [
            // Exam sessions table
            `CREATE TABLE IF NOT EXISTS exam_sessions (
                id TEXT PRIMARY KEY,
                rdp_host TEXT NOT NULL,
                rdp_port INTEGER,
                started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                ended_at DATETIME,
                status TEXT DEFAULT 'active',
                total_questions INTEGER DEFAULT 0,
                questions_answered INTEGER DEFAULT 0,
                success_rate REAL DEFAULT 0.0,
                metadata TEXT
            )`,

            // Questions table
            `CREATE TABLE IF NOT EXISTS questions (
                id TEXT PRIMARY KEY,
                exam_session_id TEXT,
                question_text TEXT NOT NULL,
                question_type TEXT,
                options TEXT, -- JSON array of options
                detected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                answered_at DATETIME,
                selected_answer TEXT,
                correct_answer TEXT,
                confidence REAL,
                source TEXT, -- 'rag', 'reasoning', 'manual'
                screenshot_path TEXT,
                coordinates TEXT, -- JSON object with click coordinates
                reasoning TEXT,
                status TEXT DEFAULT 'pending',
                FOREIGN KEY (exam_session_id) REFERENCES exam_sessions (id)
            )`,

            // Knowledge base table for storing answers
            `CREATE TABLE IF NOT EXISTS knowledge_base (
                id TEXT PRIMARY KEY,
                question_hash TEXT UNIQUE,
                question_text TEXT NOT NULL,
                answer TEXT NOT NULL,
                subject TEXT,
                topic TEXT,
                difficulty TEXT,
                source TEXT,
                confidence REAL DEFAULT 1.0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                usage_count INTEGER DEFAULT 0
            )`,

            // Actions log table
            `CREATE TABLE IF NOT EXISTS actions_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                exam_session_id TEXT,
                question_id TEXT,
                action_type TEXT NOT NULL,
                action_data TEXT, -- JSON data
                coordinates TEXT, -- JSON coordinates
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                success BOOLEAN DEFAULT 1,
                error_message TEXT,
                FOREIGN KEY (exam_session_id) REFERENCES exam_sessions (id),
                FOREIGN KEY (question_id) REFERENCES questions (id)
            )`,

            // System logs table
            `CREATE TABLE IF NOT EXISTS system_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                level TEXT NOT NULL,
                message TEXT NOT NULL,
                metadata TEXT, -- JSON metadata
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,

            // Performance metrics table
            `CREATE TABLE IF NOT EXISTS performance_metrics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                exam_session_id TEXT,
                metric_name TEXT NOT NULL,
                metric_value REAL NOT NULL,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (exam_session_id) REFERENCES exam_sessions (id)
            )`,

            // System configuration table
            `CREATE TABLE IF NOT EXISTS system_config (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,

            // User preferences table
            `CREATE TABLE IF NOT EXISTS user_preferences (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT DEFAULT 'default',
                preference_key TEXT NOT NULL,
                preference_value TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, preference_key)
            )`,

            // Remote server configurations table
            `CREATE TABLE IF NOT EXISTS remote_server_configs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                server_endpoint TEXT NOT NULL UNIQUE,
                device_id TEXT,
                access_key TEXT,
                organization_id TEXT,
                auto_connect BOOLEAN DEFAULT 0,
                is_active BOOLEAN DEFAULT 1,
                connection_timeout INTEGER DEFAULT 30000,
                retry_attempts INTEGER DEFAULT 3,
                description TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_connected_at DATETIME
            )`
        ];

        for (const tableSQL of tables) {
            await this.runQuery(tableSQL);
        }

        // Create indexes for better performance
        const indexes = [
            'CREATE INDEX IF NOT EXISTS idx_questions_session ON questions(exam_session_id)',
            'CREATE INDEX IF NOT EXISTS idx_questions_status ON questions(status)',
            'CREATE INDEX IF NOT EXISTS idx_knowledge_hash ON knowledge_base(question_hash)',
            'CREATE INDEX IF NOT EXISTS idx_actions_session ON actions_log(exam_session_id)',
            'CREATE INDEX IF NOT EXISTS idx_actions_timestamp ON actions_log(timestamp)',
            'CREATE INDEX IF NOT EXISTS idx_system_logs_level ON system_logs(level)',
            'CREATE INDEX IF NOT EXISTS idx_system_logs_timestamp ON system_logs(timestamp)'
        ];

        for (const indexSQL of indexes) {
            await this.runQuery(indexSQL);
        }
    }

    async runQuery(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.run(sql, params, function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({ lastID: this.lastID, changes: this.changes });
                }
            });
        });
    }

    async getQuery(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.get(sql, params, (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    async allQuery(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.all(sql, params, (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    // Exam session methods
    async createExamSession(sessionData) {
        try {
            const { id, rdp_host, rdp_port, metadata = {} } = sessionData;
            
            await this.runQuery(
                `INSERT INTO exam_sessions (id, rdp_host, rdp_port, metadata) 
                 VALUES (?, ?, ?, ?)`,
                [id, rdp_host, rdp_port, JSON.stringify(metadata)]
            );

            logger.info('Exam session created:', { id, rdp_host, rdp_port });
            return { success: true, sessionId: id };
        } catch (error) {
            logger.error('Failed to create exam session:', error);
            throw error;
        }
    }

    async updateExamSession(sessionId, updates) {
        try {
            const setClause = Object.keys(updates).map(key => `${key} = ?`).join(', ');
            const values = Object.values(updates);
            values.push(sessionId);

            await this.runQuery(
                `UPDATE exam_sessions SET ${setClause} WHERE id = ?`,
                values
            );

            logger.info('Exam session updated:', { sessionId, updates });
            return { success: true };
        } catch (error) {
            logger.error('Failed to update exam session:', error);
            throw error;
        }
    }

    async getExamSession(sessionId) {
        try {
            const session = await this.getQuery(
                'SELECT * FROM exam_sessions WHERE id = ?',
                [sessionId]
            );

            if (session && session.metadata) {
                session.metadata = JSON.parse(session.metadata);
            }

            return session;
        } catch (error) {
            logger.error('Failed to get exam session:', error);
            throw error;
        }
    }

    // Question methods
    async saveQuestion(questionData) {
        try {
            const {
                id, exam_session_id, question_text, question_type,
                options, selected_answer, correct_answer, confidence,
                source, screenshot_path, coordinates, reasoning, status
            } = questionData;

            await this.runQuery(
                `INSERT INTO questions (
                    id, exam_session_id, question_text, question_type, options,
                    selected_answer, correct_answer, confidence, source,
                    screenshot_path, coordinates, reasoning, status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    id, exam_session_id, question_text, question_type,
                    JSON.stringify(options), selected_answer, correct_answer,
                    confidence, source, screenshot_path, JSON.stringify(coordinates),
                    reasoning, status || 'pending'
                ]
            );

            logger.info('Question saved:', { id, question_text: question_text.substring(0, 50) });
            return { success: true, questionId: id };
        } catch (error) {
            logger.error('Failed to save question:', error);
            throw error;
        }
    }

    async updateQuestion(questionId, updates) {
        try {
            // Handle JSON fields
            if (updates.options) updates.options = JSON.stringify(updates.options);
            if (updates.coordinates) updates.coordinates = JSON.stringify(updates.coordinates);
            
            const setClause = Object.keys(updates).map(key => `${key} = ?`).join(', ');
            const values = Object.values(updates);
            values.push(questionId);

            await this.runQuery(
                `UPDATE questions SET ${setClause}, answered_at = CURRENT_TIMESTAMP WHERE id = ?`,
                values
            );

            logger.info('Question updated:', { questionId, updates });
            return { success: true };
        } catch (error) {
            logger.error('Failed to update question:', error);
            throw error;
        }
    }

    async getQuestion(questionId) {
        try {
            const question = await this.getQuery(
                'SELECT * FROM questions WHERE id = ?',
                [questionId]
            );

            if (question) {
                if (question.options) question.options = JSON.parse(question.options);
                if (question.coordinates) question.coordinates = JSON.parse(question.coordinates);
            }

            return question;
        } catch (error) {
            logger.error('Failed to get question:', error);
            throw error;
        }
    }

    async getSessionQuestions(sessionId) {
        try {
            const questions = await this.allQuery(
                'SELECT * FROM questions WHERE exam_session_id = ? ORDER BY detected_at',
                [sessionId]
            );

            return questions.map(q => {
                if (q.options) q.options = JSON.parse(q.options);
                if (q.coordinates) q.coordinates = JSON.parse(q.coordinates);
                return q;
            });
        } catch (error) {
            logger.error('Failed to get session questions:', error);
            throw error;
        }
    }

    // Knowledge base methods
    async addToKnowledgeBase(questionText, answer, metadata = {}) {
        try {
            const crypto = require('crypto');
            const questionHash = crypto.createHash('md5').update(questionText.toLowerCase().trim()).digest('hex');
            const id = `kb_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

            await this.runQuery(
                `INSERT OR REPLACE INTO knowledge_base (
                    id, question_hash, question_text, answer, subject, topic,
                    difficulty, source, confidence
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    id, questionHash, questionText, answer,
                    metadata.subject || null, metadata.topic || null,
                    metadata.difficulty || null, metadata.source || 'manual',
                    metadata.confidence || 1.0
                ]
            );

            logger.info('Added to knowledge base:', { questionText: questionText.substring(0, 50), answer });
            return { success: true, id };
        } catch (error) {
            logger.error('Failed to add to knowledge base:', error);
            throw error;
        }
    }

    async searchKnowledgeBase(questionText, limit = 5) {
        try {
            const results = await this.allQuery(
                `SELECT * FROM knowledge_base 
                 WHERE question_text LIKE ? 
                 ORDER BY confidence DESC, usage_count DESC 
                 LIMIT ?`,
                [`%${questionText}%`, limit]
            );

            return results;
        } catch (error) {
            logger.error('Failed to search knowledge base:', error);
            throw error;
        }
    }

    // Action logging
    async logAction(actionData) {
        try {
            const {
                exam_session_id, question_id, action_type, action_data,
                coordinates, success = true, error_message
            } = actionData;

            await this.runQuery(
                `INSERT INTO actions_log (
                    exam_session_id, question_id, action_type, action_data,
                    coordinates, success, error_message
                ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    exam_session_id, question_id, action_type,
                    JSON.stringify(action_data), JSON.stringify(coordinates),
                    success, error_message
                ]
            );

            return { success: true };
        } catch (error) {
            logger.error('Failed to log action:', error);
            throw error;
        }
    }

    // Statistics and reporting
    async getSessionStats(sessionId) {
        try {
            const stats = await this.getQuery(
                `SELECT 
                    COUNT(*) as total_questions,
                    COUNT(CASE WHEN status = 'answered' THEN 1 END) as answered_questions,
                    COUNT(CASE WHEN status = 'correct' THEN 1 END) as correct_answers,
                    AVG(confidence) as avg_confidence,
                    MIN(detected_at) as first_question,
                    MAX(answered_at) as last_answer
                 FROM questions WHERE exam_session_id = ?`,
                [sessionId]
            );

            return stats;
        } catch (error) {
            logger.error('Failed to get session stats:', error);
            throw error;
        }
    }

    // Remote server configuration methods
    async saveRemoteServerConfig(configData) {
        try {
            const {
                name, server_endpoint, device_id, access_key, organization_id,
                auto_connect = false, connection_timeout = 30000, retry_attempts = 3,
                description = ''
            } = configData;

            const id = `rsc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

            await this.runQuery(
                `INSERT INTO remote_server_configs (
                    id, name, server_endpoint, device_id, access_key, organization_id,
                    auto_connect, connection_timeout, retry_attempts, description
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    id, name, server_endpoint, device_id, access_key, organization_id,
                    auto_connect ? 1 : 0, connection_timeout, retry_attempts, description
                ]
            );

            logger.info('Remote server config saved:', { id, name, server_endpoint });
            return { success: true, id };
        } catch (error) {
            logger.error('Failed to save remote server config:', error);
            throw error;
        }
    }

    async updateRemoteServerConfig(id, updates) {
        try {
            // Handle boolean fields
            if (updates.auto_connect !== undefined) {
                updates.auto_connect = updates.auto_connect ? 1 : 0;
            }
            if (updates.is_active !== undefined) {
                updates.is_active = updates.is_active ? 1 : 0;
            }

            updates.updated_at = new Date().toISOString();

            const setClause = Object.keys(updates).map(key => `${key} = ?`).join(', ');
            const values = Object.values(updates);
            values.push(id);

            await this.runQuery(
                `UPDATE remote_server_configs SET ${setClause} WHERE id = ?`,
                values
            );

            logger.info('Remote server config updated:', { id, updates });
            return { success: true };
        } catch (error) {
            logger.error('Failed to update remote server config:', error);
            throw error;
        }
    }

    async getRemoteServerConfig(id) {
        try {
            const config = await this.getQuery(
                'SELECT * FROM remote_server_configs WHERE id = ?',
                [id]
            );

            if (config) {
                config.auto_connect = Boolean(config.auto_connect);
                config.is_active = Boolean(config.is_active);
            }

            return config;
        } catch (error) {
            logger.error('Failed to get remote server config:', error);
            throw error;
        }
    }

    async getAllRemoteServerConfigs() {
        try {
            const configs = await this.allQuery(
                'SELECT * FROM remote_server_configs WHERE is_active = 1 ORDER BY created_at DESC'
            );

            return configs.map(config => ({
                ...config,
                auto_connect: Boolean(config.auto_connect),
                is_active: Boolean(config.is_active)
            }));
        } catch (error) {
            logger.error('Failed to get all remote server configs:', error);
            throw error;
        }
    }

    async getAutoConnectConfigs() {
        try {
            const configs = await this.allQuery(
                'SELECT * FROM remote_server_configs WHERE auto_connect = 1 AND is_active = 1 ORDER BY last_connected_at DESC'
            );

            return configs.map(config => ({
                ...config,
                auto_connect: Boolean(config.auto_connect),
                is_active: Boolean(config.is_active)
            }));
        } catch (error) {
            logger.error('Failed to get auto-connect configs:', error);
            throw error;
        }
    }

    async deleteRemoteServerConfig(id) {
        try {
            await this.runQuery(
                'UPDATE remote_server_configs SET is_active = 0 WHERE id = ?',
                [id]
            );

            logger.info('Remote server config deleted (soft delete):', { id });
            return { success: true };
        } catch (error) {
            logger.error('Failed to delete remote server config:', error);
            throw error;
        }
    }

    async updateLastConnected(id) {
        try {
            await this.runQuery(
                'UPDATE remote_server_configs SET last_connected_at = CURRENT_TIMESTAMP WHERE id = ?',
                [id]
            );

            return { success: true };
        } catch (error) {
            logger.error('Failed to update last connected time:', error);
            throw error;
        }
    }

    async close() {
        if (this.db) {
            this.db.close((err) => {
                if (err) {
                    logger.error('Error closing database:', err);
                } else {
                    logger.info('Database connection closed');
                }
            });
        }
    }
}

module.exports = DatabaseManager;