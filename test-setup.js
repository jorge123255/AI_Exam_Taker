#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const axios = require('axios');

console.log('🧪 AI Exam Taker - Setup Test\n');

async function runTests() {
    const tests = [
        testDirectories,
        testConfigFile,
        testDependencies,
        testOllamaConnection,
        testDatabaseSetup
    ];

    let passed = 0;
    let failed = 0;

    for (const test of tests) {
        try {
            await test();
            passed++;
        } catch (error) {
            console.error(`❌ ${error.message}`);
            failed++;
        }
    }

    console.log(`\n📊 Test Results: ${passed} passed, ${failed} failed\n`);

    if (failed === 0) {
        console.log('✅ All tests passed! Your setup is ready.');
        console.log('🚀 Run "npm start" to launch the application.');
    } else {
        console.log('⚠️  Some tests failed. Please check the issues above.');
        process.exit(1);
    }
}

async function testDirectories() {
    console.log('📁 Testing directory structure...');
    
    const requiredDirs = ['src', 'public', 'src/ai', 'src/core', 'src/database', 'src/utils'];
    const optionalDirs = ['data', 'logs', 'uploads'];
    
    for (const dir of requiredDirs) {
        if (!fs.existsSync(dir)) {
            throw new Error(`Required directory missing: ${dir}`);
        }
    }
    
    for (const dir of optionalDirs) {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
            console.log(`  📂 Created directory: ${dir}`);
        }
    }
    
    console.log('  ✅ Directory structure OK');
}

async function testConfigFile() {
    console.log('⚙️  Testing configuration file...');
    
    if (!fs.existsSync('config.json')) {
        throw new Error('config.json file not found');
    }
    
    try {
        const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
        
        const requiredKeys = ['ollama', 'rdp', 'rag', 'server', 'database'];
        for (const key of requiredKeys) {
            if (!config[key]) {
                throw new Error(`Missing configuration section: ${key}`);
            }
        }
        
        if (!config.ollama.endpoint) {
            throw new Error('Ollama endpoint not configured');
        }
        
        console.log('  ✅ Configuration file OK');
    } catch (error) {
        throw new Error(`Invalid config.json: ${error.message}`);
    }
}

async function testDependencies() {
    console.log('📦 Testing dependencies...');
    
    const requiredFiles = [
        'src/index.js',
        'src/core/ExamTaker.js',
        'src/ai/OllamaClient.js',
        'src/ai/VisionAnalyzer.js',
        'src/ai/RAGSystem.js',
        'src/database/DatabaseManager.js',
        'public/index.html'
    ];
    
    for (const file of requiredFiles) {
        if (!fs.existsSync(file)) {
            throw new Error(`Required file missing: ${file}`);
        }
    }
    
    // Test if main modules can be required
    try {
        require('./src/utils/logger');
        require('./src/database/DatabaseManager');
        console.log('  ✅ Core modules can be loaded');
    } catch (error) {
        throw new Error(`Module loading failed: ${error.message}`);
    }
    
    console.log('  ✅ Dependencies OK');
}

async function testOllamaConnection() {
    console.log('🤖 Testing Ollama connection...');
    
    try {
        const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
        const ollamaEndpoint = config.ollama.endpoint;
        
        // Test connection
        const response = await axios.get(`${ollamaEndpoint}/api/tags`, {
            timeout: 5000
        });
        
        const availableModels = response.data.models.map(m => m.name);
        const requiredModels = Object.values(config.ollama.models);
        
        console.log(`  📡 Connected to Ollama at ${ollamaEndpoint}`);
        console.log(`  🎯 Available models: ${availableModels.length}`);
        
        const missingModels = [];
        for (const model of requiredModels) {
            const modelBase = model.split(':')[0];
            if (!availableModels.some(available => available.includes(modelBase))) {
                missingModels.push(model);
            }
        }
        
        if (missingModels.length > 0) {
            console.log(`  ⚠️  Missing models: ${missingModels.join(', ')}`);
            console.log(`  💡 Run: ollama pull ${missingModels.join(' && ollama pull ')}`);
        } else {
            console.log('  ✅ All required models available');
        }
        
        console.log('  ✅ Ollama connection OK');
    } catch (error) {
        if (error.code === 'ECONNREFUSED') {
            throw new Error('Cannot connect to Ollama server. Is it running?');
        } else {
            throw new Error(`Ollama test failed: ${error.message}`);
        }
    }
}

async function testDatabaseSetup() {
    console.log('🗄️  Testing database setup...');
    
    try {
        const DatabaseManager = require('./src/database/DatabaseManager');
        const dbManager = new DatabaseManager();
        
        // Test database initialization
        await dbManager.initialize();
        console.log('  ✅ Database connection OK');
        
        // Test basic operations
        const testData = {
            id: 'test_session_' + Date.now(),
            rdp_host: 'test.example.com',
            rdp_port: 3389,
            metadata: { test: true }
        };
        
        await dbManager.createExamSession(testData);
        const session = await dbManager.getExamSession(testData.id);
        
        if (!session || session.id !== testData.id) {
            throw new Error('Database read/write test failed');
        }
        
        console.log('  ✅ Database operations OK');
        
        await dbManager.close();
    } catch (error) {
        throw new Error(`Database test failed: ${error.message}`);
    }
}

// Run tests
runTests().catch(error => {
    console.error('❌ Test runner failed:', error);
    process.exit(1);
});