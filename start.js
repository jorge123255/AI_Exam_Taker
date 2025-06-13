#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

console.log('🚀 Starting AI Exam Taker...\n');

// Check if required directories exist
const requiredDirs = ['./data', './logs', './uploads'];
for (const dir of requiredDirs) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`📁 Created directory: ${dir}`);
    }
}

// Check if database exists, if not run setup
const dbPath = './data/exam_taker.db';
if (!fs.existsSync(dbPath)) {
    console.log('🗄️  Database not found, running setup...');
    
    const setupProcess = spawn('node', ['src/database/setup.js'], {
        stdio: 'inherit'
    });
    
    setupProcess.on('close', (code) => {
        if (code === 0) {
            console.log('✅ Database setup completed\n');
            startApplication();
        } else {
            console.error('❌ Database setup failed');
            process.exit(1);
        }
    });
} else {
    console.log('✅ Database found\n');
    startApplication();
}

function startApplication() {
    console.log('🎯 Starting AI Exam Taker application...\n');
    
    // Start the main application
    const appProcess = spawn('node', ['src/index.js'], {
        stdio: 'inherit'
    });
    
    appProcess.on('close', (code) => {
        console.log(`\n🛑 Application exited with code ${code}`);
        process.exit(code);
    });
    
    // Handle graceful shutdown
    process.on('SIGINT', () => {
        console.log('\n🛑 Received SIGINT, shutting down gracefully...');
        appProcess.kill('SIGINT');
    });
    
    process.on('SIGTERM', () => {
        console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
        appProcess.kill('SIGTERM');
    });
}