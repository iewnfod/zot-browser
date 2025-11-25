// Package browser provides the core browser state management for the CEF-based browser.
// It manages tabs, spaces, and the overall browser state.
package browser

import (
	"sync"
	"time"

	"github.com/google/uuid"
)

// Tab represents a browser tab
type Tab struct {
	ID              string    `json:"id"`
	Name            string    `json:"name"`
	URL             string    `json:"url"`
	Src             string    `json:"src"`
	Favicon         string    `json:"favicon"`
	LastAccessed    int64     `json:"lastAccessed,omitempty"`
	PinnedURL       string    `json:"pinnedUrl,omitempty"`
	ShouldRender    bool      `json:"shouldRender,omitempty"`
	IsPinned        bool      `json:"isPinned,omitempty"`
	IsFavorite      bool      `json:"isFavorite,omitempty"`
	SpaceID         string    `json:"spaceId,omitempty"`
	IsMediaPlaying  bool      `json:"isMediaPlaying,omitempty"`
	LastMediaPlayed int64     `json:"lastMediaPlayed,omitempty"`
}

// Space represents a workspace containing tabs
type Space struct {
	ID           string   `json:"id"`
	Name         string   `json:"name"`
	Icon         string   `json:"icon"`
	TabIDs       []string `json:"tabIds"`
	PinnedTabIDs []string `json:"pinnedTabIds"`
	ThemeColor   string   `json:"themeColor"`
}

// Browser represents the overall browser state
type Browser struct {
	mu sync.RWMutex

	Tabs           map[string]*Tab   `json:"tabs"`
	Spaces         map[string]*Space `json:"spaces"`
	FavoriteTabIDs []string          `json:"favoriteTabIds"`
	CurrentTabID   string            `json:"currentTabId,omitempty"`
	CurrentSpaceID string            `json:"currentSpaceId,omitempty"`
}

// NewBrowser creates a new browser instance with a default space
func NewBrowser() *Browser {
	defaultSpace := NewDefaultSpace()
	return &Browser{
		Tabs: make(map[string]*Tab),
		Spaces: map[string]*Space{
			defaultSpace.ID: defaultSpace,
		},
		FavoriteTabIDs: []string{},
		CurrentSpaceID: defaultSpace.ID,
	}
}

// NewDefaultSpace creates a new default space
func NewDefaultSpace() *Space {
	return &Space{
		ID:           uuid.New().String(),
		Name:         "Default",
		Icon:         "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8'/%3E%3Cpath d='M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'/%3E%3C/svg%3E",
		TabIDs:       []string{},
		PinnedTabIDs: []string{},
		ThemeColor:   "",
	}
}

// NewTab creates a new tab with the given URL
func NewTab(src string) *Tab {
	return &Tab{
		ID:             uuid.New().String(),
		Src:            src,
		Name:           "",
		URL:            src,
		Favicon:        "",
		LastAccessed:   time.Now().UnixMilli(),
		PinnedURL:      "",
		ShouldRender:   false,
		IsPinned:       false,
		IsFavorite:     false,
		IsMediaPlaying: false,
	}
}

// CreateTab creates a new tab in the browser
func (b *Browser) CreateTab(url string, spaceID string, isPinned bool) *Tab {
	b.mu.Lock()
	defer b.mu.Unlock()

	if spaceID == "" {
		spaceID = b.CurrentSpaceID
	}

	tab := NewTab(url)
	tab.SpaceID = spaceID
	tab.IsPinned = isPinned

	b.Tabs[tab.ID] = tab

	if space, ok := b.Spaces[spaceID]; ok {
		if isPinned {
			space.PinnedTabIDs = append(space.PinnedTabIDs, tab.ID)
		} else {
			space.TabIDs = append(space.TabIDs, tab.ID)
		}
	}

	b.CurrentTabID = tab.ID
	b.CurrentSpaceID = spaceID

	return tab
}

// CloseTab closes a tab by ID
func (b *Browser) CloseTab(tabID string) {
	b.mu.Lock()
	defer b.mu.Unlock()

	tab, ok := b.Tabs[tabID]
	if !ok {
		return
	}

	// If it's a favorite or pinned tab, just mark it as not rendering
	if tab.IsFavorite || tab.IsPinned {
		tab.ShouldRender = false
		return
	}

	// Remove from tab list
	delete(b.Tabs, tabID)

	// Remove from space
	if tab.SpaceID != "" {
		if space, ok := b.Spaces[tab.SpaceID]; ok {
			space.TabIDs = removeString(space.TabIDs, tabID)
			space.PinnedTabIDs = removeString(space.PinnedTabIDs, tabID)
		}
	}

	// If this was the current tab, select another
	if b.CurrentTabID == tabID {
		b.CurrentTabID = ""
		// Try to select another tab in the same space
		if space, ok := b.Spaces[b.CurrentSpaceID]; ok {
			if len(space.TabIDs) > 0 {
				b.CurrentTabID = space.TabIDs[len(space.TabIDs)-1]
			} else if len(space.PinnedTabIDs) > 0 {
				b.CurrentTabID = space.PinnedTabIDs[len(space.PinnedTabIDs)-1]
			}
		}
	}
}

// SelectTab selects a tab by ID
func (b *Browser) SelectTab(tabID string) {
	b.mu.Lock()
	defer b.mu.Unlock()

	if tab, ok := b.Tabs[tabID]; ok {
		tab.LastAccessed = time.Now().UnixMilli()
		b.CurrentTabID = tabID
		if tab.SpaceID != "" {
			b.CurrentSpaceID = tab.SpaceID
		}
	}
}

// UpdateTab updates a tab's properties
func (b *Browser) UpdateTab(tabID string, updates map[string]interface{}) {
	b.mu.Lock()
	defer b.mu.Unlock()

	tab, ok := b.Tabs[tabID]
	if !ok {
		return
	}

	for key, value := range updates {
		switch key {
		case "name":
			if v, ok := value.(string); ok {
				tab.Name = v
			}
		case "url":
			if v, ok := value.(string); ok {
				tab.URL = v
			}
		case "src":
			if v, ok := value.(string); ok {
				tab.Src = v
			}
		case "favicon":
			if v, ok := value.(string); ok {
				tab.Favicon = v
			}
		case "shouldRender":
			if v, ok := value.(bool); ok {
				tab.ShouldRender = v
			}
		case "isMediaPlaying":
			if v, ok := value.(bool); ok {
				tab.IsMediaPlaying = v
			}
		case "lastMediaPlayed":
			if v, ok := value.(int64); ok {
				tab.LastMediaPlayed = v
			}
		}
	}
}

// PinTab pins a tab
func (b *Browser) PinTab(tabID string) {
	b.mu.Lock()
	defer b.mu.Unlock()

	tab, ok := b.Tabs[tabID]
	if !ok || tab.SpaceID == "" || tab.IsPinned {
		return
	}

	if space, ok := b.Spaces[tab.SpaceID]; ok {
		space.TabIDs = removeString(space.TabIDs, tabID)
		space.PinnedTabIDs = append(space.PinnedTabIDs, tabID)
	}

	tab.IsPinned = true
	tab.PinnedURL = tab.URL
}

// UnpinTab unpins a tab
func (b *Browser) UnpinTab(tabID string) {
	b.mu.Lock()
	defer b.mu.Unlock()

	tab, ok := b.Tabs[tabID]
	if !ok || tab.SpaceID == "" || !tab.IsPinned {
		return
	}

	if space, ok := b.Spaces[tab.SpaceID]; ok {
		space.PinnedTabIDs = removeString(space.PinnedTabIDs, tabID)
		space.TabIDs = append(space.TabIDs, tabID)
	}

	tab.IsPinned = false
}

// GetCurrentTab returns the current tab
func (b *Browser) GetCurrentTab() *Tab {
	b.mu.RLock()
	defer b.mu.RUnlock()

	if b.CurrentTabID != "" {
		return b.Tabs[b.CurrentTabID]
	}
	return nil
}

// GetCurrentSpace returns the current space
func (b *Browser) GetCurrentSpace() *Space {
	b.mu.RLock()
	defer b.mu.RUnlock()

	if b.CurrentSpaceID != "" {
		return b.Spaces[b.CurrentSpaceID]
	}
	return nil
}

// GetAllTabs returns all tabs
func (b *Browser) GetAllTabs() []*Tab {
	b.mu.RLock()
	defer b.mu.RUnlock()

	tabs := make([]*Tab, 0, len(b.Tabs))
	for _, tab := range b.Tabs {
		tabs = append(tabs, tab)
	}
	return tabs
}

// Helper function to remove a string from a slice
func removeString(slice []string, s string) []string {
	result := make([]string, 0, len(slice))
	for _, item := range slice {
		if item != s {
			result = append(result, item)
		}
	}
	return result
}
