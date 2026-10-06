#!/bin/bash

# Trading Middleware Setup Script
# This script helps set up the trading middleware service

set -e

echo "🚀 Trading Middleware Setup"
echo "=============================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check prerequisites
echo "📋 Checking prerequisites..."

if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js is not installed. Please install Node.js 20 LTS or higher.${NC}"
    exit 1
fi

if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ npm is not installed. Please install npm.${NC}"
    exit 1
fi

NODE_VERSION=$(node --version)
echo -e "${GREEN}✓ Node.js ${NODE_VERSION} installed${NC}"

NPM_VERSION=$(npm --version)
echo -e "${GREEN}✓ npm ${NPM_VERSION} installed${NC}"

echo ""
echo "📦 Installing dependencies..."
npm install

echo ""
echo "⚙️  Setting up environment files..."

if [ ! -f .env ]; then
    cp .env.example .env
    echo -e "${GREEN}✓ Created .env file${NC}"
    echo -e "${YELLOW}⚠️  Please update .env with your configuration${NC}"
else
    echo -e "${YELLOW}✓ .env file already exists${NC}"
fi

if [ ! -f .env.development ]; then
    cp .env.development .env.development 2>/dev/null || echo "Development env file already exists"
fi

echo ""
echo "🔨 Building application..."
npm run build

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Update .env with your backend service URL"
echo "2. Start development server: npm run start:dev"
echo "3. Or start with Docker: docker-compose up -d"
echo ""
echo "📚 Documentation: See README.md for more information"
