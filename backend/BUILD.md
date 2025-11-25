# Zot Browser CEF Backend Build Guide

This guide explains how to build and run the CEF (Chromium Embedded Framework) version of Zot Browser using the Energy framework.

## Architecture Overview

The CEF version of Zot Browser consists of two main parts:

1. **Go Backend** (`backend/`): Uses the Energy framework to create a CEF-based browser
2. **React Frontend** (`src/renderer/`): The same React UI used by the Electron version

The communication between Go and React happens through IPC (Inter-Process Communication).

## Prerequisites

### Required Tools

- **Go 1.21 or later** - [Download Go](https://golang.org/dl/)
- **Node.js 18 or later** - [Download Node.js](https://nodejs.org/)
- **CEF Framework** - Downloaded via Energy CLI tool

### Platform-Specific Dependencies

#### Linux (Ubuntu/Debian)
```bash
sudo apt-get install libx11-dev libgtk-3-dev libgdk-pixbuf2.0-dev
```

#### macOS
Xcode Command Line Tools are required:
```bash
xcode-select --install
```

#### Windows
Visual C++ Build Tools are required.

### Installing Energy CLI

```bash
go install github.com/energye/energy/v2/cmd/energy@latest
```

### Downloading CEF Framework

```bash
energy install
```

This will download the appropriate CEF framework for your platform.

## Building

### Quick Build (Development)

Use the provided build script:

```bash
./build-cef.sh
```

This script will:
1. Install npm dependencies if needed
2. Build the React frontend
3. Copy the build to the Go backend resources
4. Build the Go binary

### Manual Build Steps

#### 1. Build React Frontend

```bash
npm install
npm run build
```

#### 2. Copy Build to Backend

```bash
cp -r out/renderer/* backend/cmd/browser/resources/
cp backend/webui/cef-bridge.js backend/cmd/browser/resources/
```

#### 3. Build Go Backend

```bash
cd backend
go mod tidy
go build -o zot-browser ./cmd/browser
```

For production builds with optimizations:
```bash
CGO_ENABLED=1 go build -ldflags="-s -w" -o zot-browser ./cmd/browser
```

## Running

After building:
```bash
./dist/zot-browser
# or on Windows:
./dist/zot-browser.exe
```

## Project Structure

```
zot-browser/
├── backend/                    # Go CEF backend
│   ├── cmd/
│   │   └── browser/
│   │       ├── main.go         # Main entry point
│   │       └── resources/      # Embedded React build
│   ├── internal/
│   │   ├── browser/            # Browser state management
│   │   │   └── browser.go      # Tab, Space, Browser state
│   │   ├── ipc/                # IPC handlers
│   │   │   └── handler.go      # Go-React communication
│   │   ├── store/              # Persistent storage
│   │   │   └── store.go        # JSON file storage
│   │   └── webview/            # Tab rendering (OSR)
│   │       ├── manager.go      # Tab renderer manager
│   │       └── tabrenderer.go  # Off-screen tab rendering
│   ├── webui/
│   │   └── cef-bridge.js       # JS bridge for CEF IPC
│   ├── go.mod
│   └── go.sum
├── src/
│   └── renderer/
│       └── src/
│           └── components/
│               ├── CEFWebView.tsx      # CEF WebView component
│               ├── UnifiedWebView.tsx  # Unified WebView (Electron/CEF)
│               └── WebView.tsx         # Electron WebView
├── build-cef.sh               # Build script
└── package.json
```

## IPC Communication

### From React to Go

The `cef-bridge.js` script provides an Electron-compatible API that routes calls to the Energy CEF IPC system.

Example:
```javascript
// In React code (works with both Electron and CEF)
window.api.getFavicon(url);
window.store.get('settings');
window.store.set('settings', value);
```

### From Go to React

The Go backend can emit events to React:
```go
ipc.Emit("tab-title-changed", tabId, title)
```

React listens for these events:
```javascript
ipc.on('tab-title-changed', (tabId, title) => {
  // Handle title change
});
```

## Key Differences from Electron Version

1. **WebView Implementation**: Instead of Electron's `<webview>` tag, CEF uses off-screen rendering (OSR)
2. **IPC Mechanism**: Uses Energy's IPC instead of Electron's ipcRenderer/ipcMain
3. **Build Process**: Requires Go compilation in addition to React build
4. **Dependencies**: Requires CEF framework and Energy library

## Troubleshooting

### "CEF framework not found"
Run `energy install` to download the CEF framework.

### X11 errors on Linux
Install X11 development libraries:
```bash
sudo apt-get install libx11-dev
```

### Build fails on macOS
Ensure Xcode Command Line Tools are installed:
```bash
xcode-select --install
```

## Development

### Hot Reload

For development, you can run the React frontend with hot reload:
```bash
npm run dev
```

Then point the CEF app to the development server URL in `main.go`:
```go
cef.BrowserWindow.Config.Url = "http://localhost:5173"
```

### Debugging

- **React DevTools**: Use the browser's built-in DevTools (F12)
- **Go Backend**: Use standard Go debugging tools or add log statements

## License

This project follows the same license as the main Zot Browser project.
