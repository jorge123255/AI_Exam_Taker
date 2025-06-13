#!/usr/bin/env node

console.log('🚀 Quick Test & Start for AI Exam Taker\n');

// Test basic requirements
const fs = require('fs');
const axios = require('axios');

async function quickTest() {
    try {
        // Check config
        const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
        console.log('✅ Config loaded');
        
        // Test Ollama connection
        const response = await axios.get(`${config.ollama.endpoint}/api/tags`, { timeout: 5000 });
        console.log('✅ Ollama connected');
        console.log(`📊 Available models: ${response.data.models.length}`);
        
        // Check if our configured models exist
        const availableModels = response.data.models.map(m => m.name);
        const requiredModels = Object.values(config.ollama.models);
        
        for (const model of requiredModels) {
            if (availableModels.includes(model)) {
                console.log(`✅ Model available: ${model}`);
            } else {
                console.log(`⚠️  Model missing: ${model}`);
            }
        }
        
        console.log('\n🎯 Starting AI Exam Taker...\n');
        
        // Start the application
        require('./src/index.js');
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

quickTest(); 