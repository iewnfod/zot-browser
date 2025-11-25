# Build script for Zot Browser with CEF backend (Windows PowerShell)
# This script builds both the React frontend and the Go CEF backend

param(
    [switch]$SkipNpmInstall,
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

# Colors for output
function Write-ColorOutput {
    param(
        [string]$Message,
        [string]$Color = "White"
    )
    Write-Host $Message -ForegroundColor $Color
}

Write-ColorOutput "=== Zot Browser Build Script (Windows) ===" "Green"

# Get the directory where this script is located
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# Check if we're in the right directory
if (-not (Test-Path "$ScriptDir\package.json")) {
    Write-ColorOutput "Error: package.json not found. Please run this script from the project root." "Red"
    exit 1
}

# Function to check if a command exists
function Test-CommandExists {
    param([string]$Command)
    $null -ne (Get-Command $Command -ErrorAction SilentlyContinue)
}

# Check prerequisites
Write-ColorOutput "Checking prerequisites..." "Yellow"

if (-not (Test-CommandExists "npm")) {
    Write-ColorOutput "Error: npm is not installed" "Red"
    exit 1
}

if (-not (Test-CommandExists "go")) {
    Write-ColorOutput "Error: Go is not installed" "Red"
    exit 1
}

Write-ColorOutput "Prerequisites OK" "Green"

# Build React frontend
Write-ColorOutput "Building React frontend..." "Yellow"

# Install npm dependencies if node_modules doesn't exist
if (-not (Test-Path "node_modules") -and -not $SkipNpmInstall) {
    Write-Host "Installing npm dependencies..."
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-ColorOutput "Error: npm install failed" "Red"
        exit 1
    }
}

if (-not $SkipBuild) {
    # Run type checking and build
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-ColorOutput "Error: npm build failed" "Red"
        exit 1
    }
}

# Check if build was successful
if (-not (Test-Path "out\renderer")) {
    Write-ColorOutput "Error: React build failed - out\renderer not found" "Red"
    exit 1
}

Write-ColorOutput "React frontend built successfully" "Green"

# Copy React build to Go backend resources
Write-ColorOutput "Copying React build to Go backend resources..." "Yellow"

# Create resources directory if it doesn't exist
$ResourcesDir = "backend\cmd\browser\resources"
if (-not (Test-Path $ResourcesDir)) {
    New-Item -ItemType Directory -Path $ResourcesDir -Force | Out-Null
}

# Copy the built files
Copy-Item -Path "out\renderer\*" -Destination $ResourcesDir -Recurse -Force

# Compile and copy the CEF bridge TypeScript
Write-ColorOutput "Compiling CEF bridge TypeScript..." "Yellow"
Push-Location "backend\webui"
npx tsc --project tsconfig.json
if ($LASTEXITCODE -ne 0) {
    Write-ColorOutput "Error: TypeScript compilation failed" "Red"
    Pop-Location
    exit 1
}
Pop-Location
Copy-Item -Path "backend\webui\dist\cef-bridge.js" -Destination $ResourcesDir -Force

Write-ColorOutput "React build copied to backend resources" "Green"

# Build Go backend
Write-ColorOutput "Building Go backend..." "Yellow"

Push-Location backend

try {
    # Tidy dependencies
    go mod tidy
    if ($LASTEXITCODE -ne 0) {
        Write-ColorOutput "Error: go mod tidy failed" "Red"
        exit 1
    }

    # Build the binary
    Write-Host "Building zot-browser binary..."

    # Create dist directory if it doesn't exist
    $DistDir = "..\dist"
    if (-not (Test-Path $DistDir)) {
        New-Item -ItemType Directory -Path $DistDir -Force | Out-Null
    }

    # Build with Windows GUI flags
    $env:CGO_ENABLED = "1"
    go build -ldflags="-s -w -H windowsgui" -o "..\dist\zot-browser.exe" .\cmd\browser
    if ($LASTEXITCODE -ne 0) {
        Write-ColorOutput "Error: Go build failed" "Red"
        exit 1
    }
}
finally {
    Pop-Location
}

Write-ColorOutput "Go backend built successfully" "Green"
Write-ColorOutput "=== Build Complete ===" "Green"
Write-Host ""
Write-Host "Binary location: dist\zot-browser.exe"
Write-Host ""
Write-Host "To run: .\dist\zot-browser.exe"
Write-Host ""
Write-ColorOutput "Note: Make sure CEF framework is installed before running." "Yellow"
Write-Host "Run 'energy install' to download the CEF framework if needed."
