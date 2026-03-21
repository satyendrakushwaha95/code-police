import { useState } from 'react';
import { useWorkspace } from '../../store/WorkspaceContext';
import { useSettings } from '../../store/SettingsContext';
import { useToast } from '../../hooks/useToast';
import './Chat.css';

interface SemanticSearchModalProps {
  onClose: () => void;
  onAddResults: (results: any[]) => void;
}

export default function SemanticSearchModal({ onClose, onAddResults }: SemanticSearchModalProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedResults, setSelectedResults] = useState<Set<number>>(new Set());
  
  const { searchWorkspace, state: workspace } = useWorkspace();
  const { settings } = useSettings();
  const { showToast } = useToast();

  const handleSearch = async () => {
    if (!query.trim()) {
      showToast('Please enter a search query', 'error');
      return;
    }

    if (!workspace.rootPath) {
      showToast('No workspace folder opened', 'error');
      return;
    }

    setIsSearching(true);
    try {
      const searchResults = await searchWorkspace(settings.embeddingModel, query.trim(), 15);
      setResults(searchResults);
      if (searchResults.length === 0) {
        showToast('No results found', 'info');
      }
    } catch (err: any) {
      showToast(`Search failed: ${err.message}`, 'error');
    } finally {
      setIsSearching(false);
    }
  };

  const toggleResult = (index: number) => {
    const newSelected = new Set(selectedResults);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedResults(newSelected);
  };

  const handleAddSelected = () => {
    const selected = results.filter((_, i) => selectedResults.has(i));
    if (selected.length === 0) {
      showToast('No results selected', 'error');
      return;
    }
    onAddResults(selected);
    showToast(`Added ${selected.length} code chunks to context`, 'success');
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-content semantic-search-modal">
        <div className="modal-header">
          <h2>🔍 Semantic Code Search</h2>
          <button className="btn-icon" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="modal-body">
          <div className="search-input-group">
            <input
              type="text"
              className="search-input-large"
              placeholder="Describe what you're looking for..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              autoFocus
            />
            <button 
              className="btn btn-primary" 
              onClick={handleSearch}
              disabled={isSearching || !query.trim()}
            >
              {isSearching ? 'Searching...' : 'Search'}
            </button>
          </div>

          {results.length > 0 && (
            <div className="search-results-list">
              <div className="results-header">
                <span>{results.length} results found</span>
                <span className="selected-count">{selectedResults.size} selected</span>
              </div>
              {results.map((result, i) => (
                <div 
                  key={i} 
                  className={`result-card ${selectedResults.has(i) ? 'selected' : ''}`}
                  onClick={() => toggleResult(i)}
                >
                  <div className="result-card-header">
                    <input 
                      type="checkbox" 
                      checked={selectedResults.has(i)}
                      onChange={() => toggleResult(i)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <span className="result-file">{result.relativeFilePath}</span>
                    <span className="result-lines">Lines {result.startLine}-{result.endLine}</span>
                  </div>
                  <pre className="result-code">{result.content.substring(0, 200)}{result.content.length > 200 ? '...' : ''}</pre>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button 
            className="btn btn-primary" 
            onClick={handleAddSelected}
            disabled={selectedResults.size === 0}
          >
            Add {selectedResults.size > 0 ? `${selectedResults.size} ` : ''}to Context
          </button>
        </div>
      </div>
    </div>
  );
}

