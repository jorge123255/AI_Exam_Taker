const DatabaseManager = require('./DatabaseManager');
const logger = require('../utils/logger');

async function setupDatabase() {
    try {
        console.log('🗄️  Setting up AI Exam Taker database...');
        
        const dbManager = new DatabaseManager();
        await dbManager.initialize();
        
        console.log('✅ Database setup completed successfully!');
        console.log(`📍 Database location: ${dbManager.dbPath}`);
        
        // Add some sample data for testing
        await addSampleData(dbManager);
        
        await dbManager.close();
        process.exit(0);
    } catch (error) {
        console.error('❌ Database setup failed:', error);
        process.exit(1);
    }
}

async function addSampleData(dbManager) {
    try {
        console.log('📝 Adding sample knowledge base entries...');
        
        const sampleQuestions = [
            {
                question: "What does the word 'supported' most nearly mean?",
                answer: "Held up",
                metadata: {
                    subject: "English",
                    topic: "Vocabulary",
                    difficulty: "easy",
                    source: "sample"
                }
            },
            {
                question: "In the context of literature, what does 'fog' often symbolize?",
                answer: "Confusion or uncertainty",
                metadata: {
                    subject: "English",
                    topic: "Literary Analysis",
                    difficulty: "medium",
                    source: "sample"
                }
            },
            {
                question: "What is the main purpose of a bridge in literature?",
                answer: "To connect different elements or ideas",
                metadata: {
                    subject: "English",
                    topic: "Literary Devices",
                    difficulty: "medium",
                    source: "sample"
                }
            }
        ];

        for (const item of sampleQuestions) {
            await dbManager.addToKnowledgeBase(item.question, item.answer, item.metadata);
        }

        console.log(`✅ Added ${sampleQuestions.length} sample knowledge base entries`);
    } catch (error) {
        console.error('Failed to add sample data:', error);
    }
}

if (require.main === module) {
    setupDatabase();
}

module.exports = { setupDatabase };