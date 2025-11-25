// Package ipc provides IPC (Inter-Process Communication) handlers for the CEF-based browser.
// This package bridges the communication between the Go backend and the React frontend.
package ipc

import (
	"encoding/json"
	"fmt"
	"sync"

	"github.com/energye/energy/v2/cef/ipc"
	"github.com/iewnfod/zot-browser/internal/browser"
	"github.com/iewnfod/zot-browser/internal/store"
)

// Handler manages IPC communication between Go and JavaScript
type Handler struct {
	browser *browser.Browser
	store   *store.Store
	mu      sync.RWMutex
}

// NewHandler creates a new IPC handler
func NewHandler(b *browser.Browser, s *store.Store) *Handler {
	return &Handler{
		browser: b,
		store:   s,
	}
}

// RegisterHandlers registers all IPC handlers
func (h *Handler) RegisterHandlers() {
	// Window control handlers
	h.registerWindowHandlers()

	// Tab management handlers
	h.registerTabHandlers()

	// Store (persistent storage) handlers
	h.registerStoreHandlers()

	// Utility handlers
	h.registerUtilityHandlers()

	fmt.Println("[IPC] All handlers registered")
}

func (h *Handler) registerWindowHandlers() {
	ipc.On("is-maximized", func() bool {
		// TODO: Get actual window state from CEF
		return false
	})

	ipc.On("maximize", func() {
		fmt.Println("[IPC] Window maximize")
		// TODO: Implement window maximize
	})

	ipc.On("minimize", func() {
		fmt.Println("[IPC] Window minimize")
		// TODO: Implement window minimize
	})

	ipc.On("unmaximize", func() {
		fmt.Println("[IPC] Window unmaximize")
		// TODO: Implement window unmaximize
	})

	ipc.On("close", func() {
		fmt.Println("[IPC] Window close")
		// TODO: Implement window close
	})

	ipc.On("focus", func() {
		fmt.Println("[IPC] Window focus")
		// TODO: Implement window focus
	})
}

func (h *Handler) registerTabHandlers() {
	ipc.On("create-tab", func(url string, spaceID string, isPinned bool) string {
		h.mu.Lock()
		defer h.mu.Unlock()

		tab := h.browser.CreateTab(url, spaceID, isPinned)
		data, _ := json.Marshal(tab)
		return string(data)
	})

	ipc.On("close-tab", func(tabID string) {
		h.mu.Lock()
		defer h.mu.Unlock()

		h.browser.CloseTab(tabID)
	})

	ipc.On("select-tab", func(tabID string) {
		h.mu.Lock()
		defer h.mu.Unlock()

		h.browser.SelectTab(tabID)
	})

	ipc.On("update-tab", func(tabID string, updatesJSON string) {
		h.mu.Lock()
		defer h.mu.Unlock()

		var updates map[string]interface{}
		if err := json.Unmarshal([]byte(updatesJSON), &updates); err != nil {
			fmt.Printf("[IPC] Error parsing tab updates: %v\n", err)
			return
		}
		h.browser.UpdateTab(tabID, updates)
	})

	ipc.On("pin-tab", func(tabID string) {
		h.mu.Lock()
		defer h.mu.Unlock()

		h.browser.PinTab(tabID)
	})

	ipc.On("unpin-tab", func(tabID string) {
		h.mu.Lock()
		defer h.mu.Unlock()

		h.browser.UnpinTab(tabID)
	})

	ipc.On("get-current-tab", func() string {
		h.mu.RLock()
		defer h.mu.RUnlock()

		tab := h.browser.GetCurrentTab()
		if tab == nil {
			return ""
		}
		data, _ := json.Marshal(tab)
		return string(data)
	})

	ipc.On("get-all-tabs", func() string {
		h.mu.RLock()
		defer h.mu.RUnlock()

		tabs := h.browser.GetAllTabs()
		data, _ := json.Marshal(tabs)
		return string(data)
	})

	ipc.On("get-browser-state", func() string {
		h.mu.RLock()
		defer h.mu.RUnlock()

		data, _ := json.Marshal(h.browser)
		return string(data)
	})
}

func (h *Handler) registerStoreHandlers() {
	ipc.On("store-get", func(key string) string {
		value, ok := h.store.Get(key)
		if !ok {
			return ""
		}
		data, _ := json.Marshal(value)
		return string(data)
	})

	ipc.On("store-set", func(key string, valueJSON string) bool {
		var value interface{}
		if err := json.Unmarshal([]byte(valueJSON), &value); err != nil {
			fmt.Printf("[IPC] Error parsing store value: %v\n", err)
			return false
		}
		if err := h.store.Set(key, value); err != nil {
			fmt.Printf("[IPC] Error storing value: %v\n", err)
			return false
		}
		return true
	})

	ipc.On("store-has", func(key string) bool {
		return h.store.Has(key)
	})

	ipc.On("store-delete", func(key string) bool {
		if err := h.store.Delete(key); err != nil {
			fmt.Printf("[IPC] Error deleting key: %v\n", err)
			return false
		}
		return true
	})
}

func (h *Handler) registerUtilityHandlers() {
	ipc.On("get-favicon", func(url string) string {
		// TODO: Implement favicon fetching
		// For now, return an empty string
		return ""
	})

	ipc.On("scale-factor", func() float64 {
		// TODO: Get actual scale factor from CEF
		return 1.0
	})
}
