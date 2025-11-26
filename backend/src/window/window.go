package window

import (
	"github.com/energye/energy/v2/cef"
	"github.com/energye/energy/v2/cef/ipc"
)

func LoadWindowEvents() {
	ipc.On("maximize", func() {
		window := cef.BrowserWindow.MainWindow()
		window.FullScreen()
	})

	ipc.On("minimize", func() {
		window := cef.BrowserWindow.MainWindow()
		window.Minimize()
	})

	ipc.On("unmaximize", func() {
		window := cef.BrowserWindow.MainWindow()
		window.ExitFullScreen()
	})

	ipc.On("close", func() {
		window := cef.BrowserWindow.MainWindow()
		window.Close()
	})

	ipc.On("is-maximized", func() {
		window := cef.BrowserWindow.MainWindow()
		window.IsFullScreen()
	})
}
