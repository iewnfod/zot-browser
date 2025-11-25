// Package store provides persistent storage for the browser state.
package store

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
)

// Store provides JSON-based persistent storage
type Store struct {
	mu       sync.RWMutex
	path     string
	data     map[string]interface{}
}

// New creates a new store at the given path
func New(path string) (*Store, error) {
	s := &Store{
		path: path,
		data: make(map[string]interface{}),
	}

	// Ensure directory exists
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, err
	}

	// Load existing data if file exists
	if _, err := os.Stat(path); err == nil {
		data, err := os.ReadFile(path)
		if err != nil {
			return nil, err
		}
		if err := json.Unmarshal(data, &s.data); err != nil {
			return nil, err
		}
	}

	return s, nil
}

// Get retrieves a value from the store
func (s *Store) Get(key string) (interface{}, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	value, ok := s.data[key]
	return value, ok
}

// Set stores a value in the store
func (s *Store) Set(key string, value interface{}) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.data[key] = value
	return s.save()
}

// Has checks if a key exists in the store
func (s *Store) Has(key string) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	_, ok := s.data[key]
	return ok
}

// Delete removes a key from the store
func (s *Store) Delete(key string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	delete(s.data, key)
	return s.save()
}

// save persists the store to disk
func (s *Store) save() error {
	data, err := json.MarshalIndent(s.data, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.path, data, 0644)
}

// GetString retrieves a string value from the store
func (s *Store) GetString(key string) (string, bool) {
	value, ok := s.Get(key)
	if !ok {
		return "", false
	}
	str, ok := value.(string)
	return str, ok
}

// GetInt retrieves an int value from the store
func (s *Store) GetInt(key string) (int, bool) {
	value, ok := s.Get(key)
	if !ok {
		return 0, false
	}
	// JSON numbers are float64
	if f, ok := value.(float64); ok {
		return int(f), true
	}
	return 0, false
}

// GetBool retrieves a bool value from the store
func (s *Store) GetBool(key string) (bool, bool) {
	value, ok := s.Get(key)
	if !ok {
		return false, false
	}
	b, ok := value.(bool)
	return b, ok
}

// GetMap retrieves a map value from the store
func (s *Store) GetMap(key string) (map[string]interface{}, bool) {
	value, ok := s.Get(key)
	if !ok {
		return nil, false
	}
	m, ok := value.(map[string]interface{})
	return m, ok
}
