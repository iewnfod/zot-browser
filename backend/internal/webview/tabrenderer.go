// Package webview provides off-screen rendering support for browser tabs.
// Each tab is rendered headlessly using CEF's OSR (Off-Screen Rendering) capability,
// and the rendered content is displayed in the main UI.
package webview

import (
	"fmt"
	"sync"

	"github.com/energye/energy/v2/cef"
	"github.com/energye/energy/v2/consts"
	"github.com/energye/golcl/lcl"
)

// TabRenderer represents an off-screen renderer for a browser tab
type TabRenderer struct {
	mu           sync.RWMutex
	id           string
	url          string
	chromium     cef.IChromium
	isCreated    bool
	isLoading    bool
	title        string
	favicon      string
	canGoBack    bool
	canGoForward bool

	// Callbacks
	onTitleChanged   func(title string)
	onFaviconChanged func(favicon string)
	onLoadStart      func()
	onLoadEnd        func()
	onURLChanged     func(url string)
}

// TabRendererConfig contains configuration for a tab renderer
type TabRendererConfig struct {
	ID               string
	URL              string
	OnTitleChanged   func(title string)
	OnFaviconChanged func(favicon string)
	OnLoadStart      func()
	OnLoadEnd        func()
	OnURLChanged     func(url string)
}

// NewTabRenderer creates a new off-screen tab renderer
func NewTabRenderer(config TabRendererConfig) *TabRenderer {
	tr := &TabRenderer{
		id:               config.ID,
		url:              config.URL,
		onTitleChanged:   config.OnTitleChanged,
		onFaviconChanged: config.OnFaviconChanged,
		onLoadStart:      config.OnLoadStart,
		onLoadEnd:        config.OnLoadEnd,
		onURLChanged:     config.OnURLChanged,
	}

	return tr
}

// Create creates the off-screen browser
func (tr *TabRenderer) Create() error {
	tr.mu.Lock()
	defer tr.mu.Unlock()

	if tr.isCreated {
		return nil
	}

	// Create a headless chromium instance
	tr.chromium = cef.NewChromium(nil, nil)
	tr.chromium.SetDefaultURL(tr.url)

	// Set up event handlers
	tr.setupEventHandlers()

	// Initialize and create the browser
	tr.chromium.Initialized()
	if !tr.chromium.CreateBrowser(nil, "", nil, nil) {
		return fmt.Errorf("failed to create browser for tab %s", tr.id)
	}

	tr.isCreated = true
	return nil
}

func (tr *TabRenderer) setupEventHandlers() {
	// Loading progress
	tr.chromium.SetOnLoadingProgressChange(func(sender lcl.IObject, browser *cef.ICefBrowser, progress float64) {
		tr.mu.Lock()
		tr.isLoading = progress < 1.0
		tr.mu.Unlock()
	})

	// Load start
	tr.chromium.SetOnLoadStart(func(sender lcl.IObject, browser *cef.ICefBrowser, frame *cef.ICefFrame, transitionType consts.TCefTransitionType) {
		tr.mu.Lock()
		tr.isLoading = true
		tr.mu.Unlock()

		if tr.onLoadStart != nil {
			tr.onLoadStart()
		}
	})

	// Load end
	tr.chromium.SetOnLoadEnd(func(sender lcl.IObject, browser *cef.ICefBrowser, frame *cef.ICefFrame, httpStatusCode int32) {
		tr.mu.Lock()
		tr.isLoading = false
		tr.canGoBack = browser.CanGoBack()
		tr.canGoForward = browser.CanGoForward()
		tr.mu.Unlock()

		if tr.onLoadEnd != nil {
			tr.onLoadEnd()
		}
	})

	// Title change
	tr.chromium.SetOnTitleChange(func(sender lcl.IObject, browser *cef.ICefBrowser, title string) {
		tr.mu.Lock()
		tr.title = title
		tr.mu.Unlock()

		if tr.onTitleChanged != nil {
			tr.onTitleChanged(title)
		}
	})

	// Address change
	tr.chromium.SetOnAddressChange(func(sender lcl.IObject, browser *cef.ICefBrowser, frame *cef.ICefFrame, url string) {
		if frame.IsMain() {
			tr.mu.Lock()
			tr.url = url
			tr.mu.Unlock()

			if tr.onURLChanged != nil {
				tr.onURLChanged(url)
			}
		}
	})

	// Favicon change
	tr.chromium.SetOnFaviconUrlChange(func(sender lcl.IObject, browser *cef.ICefBrowser, iconUrls *cef.TStrings) {
		if iconUrls.Count() > 0 {
			faviconURL := iconUrls.Strings(0)
			tr.mu.Lock()
			tr.favicon = faviconURL
			tr.mu.Unlock()

			if tr.onFaviconChanged != nil {
				tr.onFaviconChanged(faviconURL)
			}
		}
	})
}

// LoadURL loads a new URL in the tab
func (tr *TabRenderer) LoadURL(url string) {
	tr.mu.Lock()
	defer tr.mu.Unlock()

	if tr.chromium != nil {
		tr.chromium.LoadUrl(url)
	}
}

// Reload reloads the current page
func (tr *TabRenderer) Reload() {
	tr.mu.Lock()
	defer tr.mu.Unlock()

	if tr.chromium != nil {
		tr.chromium.Reload()
	}
}

// Stop stops loading the current page
func (tr *TabRenderer) Stop() {
	tr.mu.Lock()
	defer tr.mu.Unlock()

	if tr.chromium != nil {
		tr.chromium.StopLoad()
	}
}

// GoBack navigates back in history
func (tr *TabRenderer) GoBack() {
	tr.mu.Lock()
	defer tr.mu.Unlock()

	if tr.chromium != nil {
		tr.chromium.GoBack()
	}
}

// GoForward navigates forward in history
func (tr *TabRenderer) GoForward() {
	tr.mu.Lock()
	defer tr.mu.Unlock()

	if tr.chromium != nil {
		tr.chromium.GoForward()
	}
}

// GetURL returns the current URL
func (tr *TabRenderer) GetURL() string {
	tr.mu.RLock()
	defer tr.mu.RUnlock()
	return tr.url
}

// GetTitle returns the current title
func (tr *TabRenderer) GetTitle() string {
	tr.mu.RLock()
	defer tr.mu.RUnlock()
	return tr.title
}

// IsLoading returns whether the page is loading
func (tr *TabRenderer) IsLoading() bool {
	tr.mu.RLock()
	defer tr.mu.RUnlock()
	return tr.isLoading
}

// CanGoBack returns whether we can navigate back
func (tr *TabRenderer) CanGoBack() bool {
	tr.mu.RLock()
	defer tr.mu.RUnlock()
	return tr.canGoBack
}

// CanGoForward returns whether we can navigate forward
func (tr *TabRenderer) CanGoForward() bool {
	tr.mu.RLock()
	defer tr.mu.RUnlock()
	return tr.canGoForward
}

// Close closes the browser
func (tr *TabRenderer) Close() {
	tr.mu.Lock()
	defer tr.mu.Unlock()

	if tr.chromium != nil {
		tr.chromium.CloseBrowser(true)
		tr.isCreated = false
	}
}

// GetID returns the tab ID
func (tr *TabRenderer) GetID() string {
	return tr.id
}
