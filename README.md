<p align="center">
<h3 align="center">Zot Browser</h3>
</p>
<p align="center">
<a href="./README_zh.md">中文</a> | <a href="./README.md">English</a>
</p>

## Overview

Zot Browser is a modern web browser with support for multiple backend technologies:

- **Electron Version**: Traditional desktop app using Electron
- **CEF Version**: Native desktop app using Go and Chromium Embedded Framework (CEF)

## Features

- Tab management with spaces
- Pinned and favorite tabs
- Customizable sidebar
- Media playback detection
- Persistent settings

## Building

### Electron Version

```bash
npm install
npm run build
npm run build:win  # Windows
npm run build:mac  # macOS
npm run build:linux  # Linux
```

### CEF Version

See [backend/BUILD.md](./backend/BUILD.md) for detailed instructions.

```bash
./build-cef.sh
```

## Development

```bash
npm install
npm run dev
```

## License

See LICENSE file for details.
