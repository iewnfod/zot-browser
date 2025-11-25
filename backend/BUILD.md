# Zot Browser Backend - CEF Build Configuration

## Prerequisites

To build the Go CEF backend, you need:

1. Go 1.21 or later
2. CEF Framework (downloaded via energy CLI tool)
3. X11 development libraries (on Linux)

### Installing Energy CLI

```bash
go install github.com/nicegui/nicegui/v2/cmd/energy@latest
```

### Downloading CEF Framework

```bash
energy install
```

### Linux Dependencies

On Ubuntu/Debian:
```bash
sudo apt-get install libx11-dev libgtk-3-dev libgdk-pixbuf2.0-dev
```

## Building

### Development Build

```bash
cd backend
go build -o zot-browser ./cmd/browser
```

### Production Build

```bash
cd backend
CGO_ENABLED=1 go build -ldflags="-s -w" -o zot-browser ./cmd/browser
```

## Building the React Frontend

Before running the CEF backend, you need to build the React frontend and copy it to the resources directory:

```bash
# Build React app
cd /path/to/zot-browser
npm run build

# Copy build output to backend resources
cp -r out/renderer/* backend/cmd/browser/resources/
```

## Running

```bash
./zot-browser
```

## Project Structure

```
backend/
├── cmd/
│   └── browser/
│       ├── main.go           # Main entry point
│       └── resources/        # Embedded React build files
├── internal/
│   ├── browser/              # Browser state management
│   ├── ipc/                  # IPC handlers
│   ├── store/                # Persistent storage
│   └── webview/              # Tab rendering (OSR)
├── webui/
│   └── cef-bridge.js         # JavaScript bridge for React
├── go.mod
└── go.sum
```
