#!/bin/bash
# Development script for Zot Browser with CEF backend
# This script starts the development environment for testing

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Zot Browser Dev Script ===${NC}"

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Check if we're in the right directory
if [ ! -f "$SCRIPT_DIR/package.json" ]; then
    echo -e "${RED}Error: package.json not found. Please run this script from the project root.${NC}"
    exit 1
fi

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check prerequisites
echo -e "${YELLOW}Checking prerequisites...${NC}"

if ! command_exists npm; then
    echo -e "${RED}Error: npm is not installed${NC}"
    exit 1
fi

if ! command_exists go; then
    echo -e "${RED}Error: Go is not installed${NC}"
    exit 1
fi

echo -e "${GREEN}Prerequisites OK${NC}"

# Install npm dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}Installing npm dependencies...${NC}"
    npm install
fi

# Build React frontend for embedding
echo -e "${YELLOW}Building React frontend...${NC}"
npm run build

# Check if build was successful
if [ ! -d "out/renderer" ]; then
    echo -e "${RED}Error: React build failed - out/renderer not found${NC}"
    exit 1
fi

# Copy React build to Go backend resources
echo -e "${YELLOW}Copying React build to Go backend resources...${NC}"
mkdir -p backend/cmd/browser/resources
cp -r out/renderer/* backend/cmd/browser/resources/

# Compile and copy the CEF bridge TypeScript
echo -e "${YELLOW}Compiling CEF bridge TypeScript...${NC}"
cd backend/webui
npx tsc --project tsconfig.json
cd ../..
cp backend/webui/dist/cef-bridge.js backend/cmd/browser/resources/

echo -e "${GREEN}React build copied to backend resources${NC}"

# Build and run Go backend in development mode
echo -e "${YELLOW}Building and running Go backend...${NC}"

cd backend

# Tidy dependencies
go mod tidy

# Build the binary
echo "Building zot-browser binary..."

# Detect platform and set appropriate flags
case "$(uname -s)" in
    Linux*)
        CGO_ENABLED=1 go build -o ../dist/zot-browser ./cmd/browser
        ;;
    Darwin*)
        CGO_ENABLED=1 go build -o ../dist/zot-browser ./cmd/browser
        ;;
    MINGW*|MSYS*|CYGWIN*)
        CGO_ENABLED=1 go build -o ../dist/zot-browser.exe ./cmd/browser
        ;;
    *)
        echo -e "${RED}Error: Unsupported platform${NC}"
        exit 1
        ;;
esac

cd ..

echo -e "${GREEN}Build complete!${NC}"
echo ""
echo -e "${YELLOW}Starting Zot Browser...${NC}"
echo ""

# Run the application
case "$(uname -s)" in
    Linux*|Darwin*)
        ./dist/zot-browser
        ;;
    MINGW*|MSYS*|CYGWIN*)
        ./dist/zot-browser.exe
        ;;
esac
