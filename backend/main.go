package main

import (
	"embed"
	"log"

	"github.com/energye/energy/v2/cef"
	"iewnfod.com/zot-browser/backend/src/store"
	"iewnfod.com/zot-browser/backend/src/window"
)

var resources embed.FS

func main() {
	// init store
	if err := store.InitStore(); err != nil {
		log.Fatal("Failed to initialize store:", err)
	}
	defer store.CloseStore()

	// init cef
	cef.GlobalInit(nil, &resources)

	cefApp := cef.NewApplication()

	cef.BrowserWindow.Config.Url = "http://localhost:5173"
	cef.BrowserWindow.Config.EnableHideCaption = true

	cef.BrowserWindow.Config.Width = 1500
	cef.BrowserWindow.Config.Height = 1020

	// load events
	window.LoadWindowEvents()

	// run
	cef.Run(cefApp)
}
