// Package webview provides off-screen rendering support for browser tabs.
package webview

import (
	"fmt"
	"sync"
)

// Manager manages multiple tab renderers
type Manager struct {
	mu        sync.RWMutex
	renderers map[string]*TabRenderer
}

// NewManager creates a new tab renderer manager
func NewManager() *Manager {
	return &Manager{
		renderers: make(map[string]*TabRenderer),
	}
}

// CreateRenderer creates a new tab renderer with the given configuration
func (m *Manager) CreateRenderer(config TabRendererConfig) (*TabRenderer, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if _, exists := m.renderers[config.ID]; exists {
		return nil, fmt.Errorf("renderer with ID %s already exists", config.ID)
	}

	renderer := NewTabRenderer(config)
	m.renderers[config.ID] = renderer

	return renderer, nil
}

// GetRenderer returns the tab renderer with the given ID
func (m *Manager) GetRenderer(id string) (*TabRenderer, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	renderer, ok := m.renderers[id]
	return renderer, ok
}

// RemoveRenderer removes and closes the tab renderer with the given ID
func (m *Manager) RemoveRenderer(id string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if renderer, ok := m.renderers[id]; ok {
		renderer.Close()
		delete(m.renderers, id)
	}
}

// CloseAll closes all tab renderers
func (m *Manager) CloseAll() {
	m.mu.Lock()
	defer m.mu.Unlock()

	for id, renderer := range m.renderers {
		renderer.Close()
		delete(m.renderers, id)
	}
}

// Count returns the number of active renderers
func (m *Manager) Count() int {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return len(m.renderers)
}

// GetAllIDs returns all renderer IDs
func (m *Manager) GetAllIDs() []string {
	m.mu.RLock()
	defer m.mu.RUnlock()

	ids := make([]string, 0, len(m.renderers))
	for id := range m.renderers {
		ids = append(ids, id)
	}
	return ids
}
