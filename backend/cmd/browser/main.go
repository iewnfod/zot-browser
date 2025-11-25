package main

import (
	"embed"
	"fmt"
	"os"
	"path/filepath"

	"github.com/energye/energy/v2/cef"
	"github.com/energye/energy/v2/pkgs/assetserve"
	"github.com/energye/golcl/lcl"
	"github.com/iewnfod/zot-browser/internal/browser"
	"github.com/iewnfod/zot-browser/internal/ipc"
	"github.com/iewnfod/zot-browser/internal/store"
)

//go:embed resources
var resources embed.FS

func main() {
	// Initialize CEF globally (required for all energy applications)
	cef.GlobalInit(nil, resources)

	// Initialize persistent storage
	homeDir, _ := os.UserHomeDir()
	storePath := filepath.Join(homeDir, ".zot-browser", "store.json")
	appStore, err := store.New(storePath)
	if err != nil {
		fmt.Printf("[Main] Error initializing store: %v\n", err)
	}

	// Initialize browser state
	browserState := browser.NewBrowser()

	// Create IPC handler
	ipcHandler := ipc.NewHandler(browserState, appStore)

	// Create the CEF application
	app := cef.NewApplication()
	app.SetUseMockKeyChain(true)
	app.SetEnableGPU(true)

	// Configure main browser window
	cef.BrowserWindow.Config.Title = "Zot Browser"
	cef.BrowserWindow.Config.Width = 1200
	cef.BrowserWindow.Config.Height = 720

	// Use internal HTTP server to serve React frontend
	cef.BrowserWindow.Config.Url = "http://localhost:22022/index.html"

	// Register IPC handlers
	ipcHandler.RegisterHandlers()

	// Start the internal HTTP server after browser process starts
	cef.SetBrowserProcessStartAfterCallback(func(b bool) {
		fmt.Println("[Main] Browser process started, creating internal HTTP server")

		// Start the internal asset server to serve React build
		server := assetserve.NewAssetsHttpServer()
		server.PORT = 22022
		server.AssetsFSName = "resources"
		server.Assets = resources
		go server.StartHttpServer()
	})

	// Set up browser initialization callback
	cef.BrowserWindow.SetBrowserInit(func(event *cef.BrowserEvent, window cef.IBrowserWindow) {
		fmt.Println("[Main] Browser window initialized")

		// Handle window events
		event.SetOnBeforeClose(func(sender lcl.IObject, browser *cef.ICefBrowser) {
			fmt.Println("[Main] Browser closing")
		})
	})

	// Run the CEF application
	cef.Run(app)
}
