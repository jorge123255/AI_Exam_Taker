#!/bin/bash

echo "🔧 Fixing Sharp dependency for macOS ARM64..."
npm install --include=optional sharp

echo "🚀 Starting AI Exam Taker..."
node quick-test.js 