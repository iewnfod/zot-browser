#!/bin/bash
# Build script for Zot Browser with CEF backend
# This script builds both the React frontend and the Go CEF backend

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Zot Browser Build Script ===${NC}"

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

# Build React frontend
echo -e "${YELLOW}Building React frontend...${NC}"

# Install npm dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "Installing npm dependencies..."
    npm install
fi

# Run type checking and build
npm run build

# Check if build was successful
if [ ! -d "out/renderer" ]; then
    echo -e "${RED}Error: React build failed - out/renderer not found${NC}"
    exit 1
fi

echo -e "${GREEN}React frontend built successfully${NC}"

# Copy React build to Go backend resources
echo -e "${YELLOW}Copying React build to Go backend resources...${NC}"

# Create resources directory if it doesn't exist
mkdir -p backend/cmd/browser/resources

# Copy the built files
cp -r out/renderer/* backend/cmd/browser/resources/

# Also copy the CEF bridge script
cp backend/webui/cef-bridge.js backend/cmd/browser/resources/

echo -e "${GREEN}React build copied to backend resources${NC}"

# Build Go backend
echo -e "${YELLOW}Building Go backend...${NC}"

cd backend

# Tidy dependencies
go mod tidy

# Build the binary
echo "Building zot-browser binary..."

# Detect platform and set appropriate flags
case "$(uname -s)" in
    Linux*)
        CGO_ENABLED=1 go build -ldflags="-s -w" -o ../dist/zot-browser ./cmd/browser
        ;;
    Darwin*)
        CGO_ENABLED=1 go build -ldflags="-s -w" -o ../dist/zot-browser ./cmd/browser
        ;;
    MINGW*|MSYS*|CYGWIN*)
        CGO_ENABLED=1 go build -ldflags="-s -w -H windowsgui" -o ../dist/zot-browser.exe ./cmd/browser
        ;;
    *)
        echo -e "${RED}Error: Unsupported platform${NC}"
        exit 1
        ;;
esac

cd ..

echo -e "${GREEN}Go backend built successfully${NC}"
echo -e "${GREEN}=== Build Complete ===${NC}"
echo ""
echo "Binary location: dist/zot-browser"
echo ""
echo "To run: ./dist/zot-browser"
echo ""
echo -e "${YELLOW}Note: Make sure CEF framework is installed before running.${NC}"
echo "Run 'energy install' to download the CEF framework if needed."
