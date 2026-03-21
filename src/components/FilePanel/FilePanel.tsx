import { useState, useRef, useEffect } from 'react';
import FileTree from './FileTree';
import { useWorkspace } from '../../store/WorkspaceContext';
import { useSettings } from '../../store/SettingsContext';
import { useToast } from '../../hooks/useToast';
import './FilePanel.css';

interface OpenFile {
  id: string;
  name: string;
  path: string;
  content: string;
  language: string;
  modified: boolean;
}

interface FilePanelProps {
  isOpen: boolean;
  onClose: () => void;
  onAddContext: (content: string, fileName: string) => void;
}

function detectLanguage(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const langMap: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    py: 'python', rb: 'ruby', go: 'go', rs: 'rust',
    java: 'java', kt: 'kotlin', swift: 'swift', dart: 'dart',
    c: 'c', cpp: 'cpp', h: 'c', hpp: 'cpp', cs: 'csharp',
    html: 'html', htm: 'html', css: 'css', scss: 'scss',
    json: 'json', yaml: 'yaml', yml: 'yaml', toml: 'toml', xml: 'xml',
    md: 'markdown', txt: 'text', sql: 'sql',
    sh: 'bash', bash: 'bash', zsh: 'bash', ps1: 'powershell',
    php: 'php', lua: 'lua', r: 'r',
  };
  return langMap[ext] || 'text';
}

export default function FilePanel({ isOpen, onClose, onAddContext }: FilePanelProps) {
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([]);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const [view, setView] = useState<'tree' | 'editor'>('tree');
  const [panelWidth, setPanelWidth] = useState(350);
  const panelRef = useRef<HTMLDivElement>(null);
  const isResizing = useRef(false);
  const { showToast } = useToast();

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing.current) return;
      const newWidth = Math.max(280, Math.min(800, window.innerWidth - e.clientX));
      setPanelWidth(newWidth);
    };

    const handleMouseUp = () => {
      isResizing.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  const activeFile = openFiles.find(f => f.id === activeFileId) || null;

  const handleFileSelect = (content: string, name: string, path: string) => {
    const existing = openFiles.find(f => f.path === path);
    if (existing) {
      setActiveFileId(existing.id);
    } else {
      const id = `file-${Date.now()}`;
      const newFile: OpenFile = {
        id,
        name,
        path,
        content,
        language: detectLanguage(name),
        modified: false,
      };
      setOpenFiles(prev => [...prev, newFile]);
      setActiveFileId(id);
    }
    setView('editor');
  };

  const handleCloseFile = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setOpenFiles(prev => prev.filter(f => f.id !== id));
    if (activeFileId === id) {
      const remaining = openFiles.filter(f => f.id !== id);
      setActiveFileId(remaining.length > 0 ? remaining[remaining.length - 1].id : null);
      if (remaining.length === 0) setView('tree');
    }
  };

  const handleContentChange = (newContent: string) => {
    setOpenFiles(prev => prev.map(f =>
      f.id === activeFileId ? { ...f, content: newContent, modified: true } : f
    ));
  };

  const handleSaveFile = async () => {
    if (!activeFile) return;

    // Try using the File System Access API for native save
    if ('showSaveFilePicker' in window) {
      try {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: activeFile.name,
          types: [{
            description: 'File',
            accept: { 'text/plain': [`.${activeFile.name.split('.').pop() || 'txt'}`] },
          }],
        });
        const writable = await handle.createWritable();
        await writable.write(activeFile.content);
        await writable.close();
        setOpenFiles(prev => prev.map(f =>
          f.id === activeFileId ? { ...f, modified: false } : f
        ));
        return;
      } catch (err: any) {
        if (err.name === 'AbortError') return;
      }
    }

    // Fallback: trigger download
    const blob = new Blob([activeFile.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = activeFile.name;
    a.click();
    URL.revokeObjectURL(url);
    setOpenFiles(prev => prev.map(f =>
      f.id === activeFileId ? { ...f, modified: false } : f
    ));
  };

  const handleCreateNewFile = () => {
    const name = prompt('Enter file name:', 'untitled.txt');
    if (!name) return;
    const id = `file-${Date.now()}`;
    const newFile: OpenFile = {
      id,
      name,
      path: name,
      content: '',
      language: detectLanguage(name),
      modified: true,
    };
    setOpenFiles(prev => [...prev, newFile]);
    setActiveFileId(id);
    setView('editor');
  };

  const handleUseAsContext = () => {
    if (!activeFile) return;
    onAddContext(activeFile.content, activeFile.name);
  };

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const { state: workspace, indexWorkspace, searchWorkspace } = useWorkspace();
  const { settings } = useSettings();

  // Search logic
  const handleSearch = async (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && searchQuery.trim()) {
      if (!workspace.rootPath) {
        showToast('No workspace folder opened', 'error');
        return;
      }

      if (!settings.model) {
        showToast('No embedding model selected', 'error');
        return;
      }

      setIsSearching(true);
      try {
        const results = await searchWorkspace(settings.embeddingModel, searchQuery.trim(), 10);
        setSearchResults(results);
        if (results.length === 0) {
          showToast('No results found', 'info');
        } else {
          showToast(`Found ${results.length} results`, 'success');
        }
      } catch (err: any) {
        console.error('Search error:', err);
        showToast(`Search failed: ${err.message || 'Unknown error'}`, 'error');
      } finally {
        setIsSearching(false);
      }
    }
  };

  const handleIndexCodebase = async () => {
    if (!workspace.rootPath) {
      showToast('No workspace folder opened', 'error');
      return;
    }

    if (!settings.embeddingModel) {
      showToast('No embedding model selected', 'error');
      return;
    }

    try {
      showToast('Indexing workspace...', 'info');
      const { indexedCount } = await indexWorkspace(settings.embeddingModel);
      showToast(`Successfully indexed ${indexedCount} files!`, 'success');
    } catch (err: any) {
      console.error('Indexing error:', err);
      showToast(`Failed to index codebase: ${err.message || 'Unknown error'}`, 'error');
    }
  };

  const handleSearchResultClick = (result: any) => {
    // A search result contains relativeFilePath and content. We can open it in the editor
    handleFileSelect(result.content, result.relativeFilePath.split('/').pop() || 'chunk', result.relativeFilePath);
  };

  const handleAddSearchResultToContext = (result: any, e: React.MouseEvent) => {
    e.stopPropagation();
    const contextText = `File: ${result.relativeFilePath} (lines ${result.startLine}-${result.endLine})\n\n${result.content}`;
    onAddContext(contextText, `${result.relativeFilePath}:${result.startLine}`);
    showToast(`Added ${result.relativeFilePath} to context`, 'success');
  };

  if (!isOpen) return null;

  return (
    <div className="file-panel" ref={panelRef} style={{ width: `${panelWidth}px` }}>
      <div className="file-panel-resize-handle" onMouseDown={startResize} />
      <div className="file-panel-header">
        <div className="panel-tabs">
          <button
            className={`panel-tab ${view === 'tree' ? 'active' : ''}`}
            onClick={() => setView('tree')}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>
            Explorer
          </button>
          <button
            className={`panel-tab ${view === 'editor' ? 'active' : ''}`}
            onClick={() => setView('editor')}
            disabled={openFiles.length === 0}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            Editor
          </button>
        </div>
        <div className="panel-actions">
          <button className="btn-icon" onClick={handleCreateNewFile} title="New File">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
          </button>
          <button className="btn-icon" onClick={onClose} title="Close Panel">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      </div>

      <div style={{ display: view === 'tree' ? 'flex' : 'none', flex: 1, minHeight: 0, flexDirection: 'column' }}>
        {workspace.rootPath && (
          <div className="semantic-search-container">
            <input
              type="text"
              className="semantic-search-input"
              placeholder="Semantic code search (Press Enter)..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={handleSearch}
              disabled={workspace.isIndexing || isSearching}
            />
            {isSearching && <div className="search-spinner"></div>}
            {workspace.isIndexing ? (
              <div className="indexing-status">
                <div className="indexing-progress">
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: '100%' }}></div>
                  </div>
                  <span className="progress-text">Indexing {workspace.filesIndex.length} files...</span>
                </div>
              </div>
            ) : (
              <button className="btn-index" onClick={handleIndexCodebase} title="Generate embeddings for code chunks using Ollama">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>
                  <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
                  <line x1="12" y1="22.08" x2="12" y2="12"/>
                </svg>
                Index Codebase
              </button>
            )}
          </div>
        )}
        
        {searchResults.length > 0 && (
          <div className="search-results">
            <div className="search-results-header">
              <span>{searchResults.length} Result{searchResults.length !== 1 ? 's' : ''}</span>
              <button className="clear-search" onClick={() => {setSearchResults([]); setSearchQuery('');}}>Clear</button>
            </div>
            {searchResults.map((res, i) => (
               <div key={i} className="search-result-item" onClick={() => handleSearchResultClick(res)}>
                 <div className="result-header">
                   <div className="result-path">{res.relativeFilePath}:{res.startLine}-{res.endLine}</div>
                   <button
                     className="btn-add-context"
                     onClick={(e) => handleAddSearchResultToContext(res, e)}
                     title="Add to chat context"
                   >
                     <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                       <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
                     </svg>
                   </button>
                 </div>
                 <div className="result-snippet">{res.content.substring(0, 120)}...</div>
               </div>
            ))}
          </div>
        )}

        <FileTree onFileSelect={handleFileSelect} />
      </div>

      <div className="editor-area" style={{ display: view === 'editor' ? 'flex' : 'none' }}>
        {/* File Tabs */}
        {openFiles.length > 0 && (
          <div className="editor-tabs">
            {openFiles.map(f => (
              <div
                key={f.id}
                className={`editor-tab ${f.id === activeFileId ? 'active' : ''}`}
                onClick={() => setActiveFileId(f.id)}
              >
                <span className="tab-name">{f.modified ? '● ' : ''}{f.name}</span>
                <button className="tab-close" onClick={(e) => handleCloseFile(f.id, e)}>×</button>
              </div>
            ))}
          </div>
        )}

        {/* Editor */}
        {activeFile ? (
          <div className="editor-content">
            <div className="editor-toolbar">
              <span className="editor-lang">{activeFile.language}</span>
              <span className="editor-path">{activeFile.path}</span>
              <div className="editor-toolbar-actions">
                <button className="btn btn-ghost" onClick={handleUseAsContext} title="Use as chat context">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
                  Use as Context
                </button>
                <button className="btn btn-primary" onClick={handleSaveFile}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                  Save
                </button>
              </div>
            </div>
            {activeFile.content.length > 100000 ? (
              <div className="editor-empty">
                <p>File too large to display ({activeFile.content.length.toLocaleString()} chars)</p>
              </div>
            ) : (
              <div className="file-editor">
                <div className="editor-line-numbers">
                  {activeFile.content.split('\n').map((_, i) => (
                    <div key={i} className="line-number">{i + 1}</div>
                  ))}
                </div>
                <textarea
                  value={activeFile.content}
                  onChange={(e) => handleContentChange(e.target.value)}
                  spellCheck={false}
                  className="editor-textarea"
                />
              </div>
            )}
          </div>
        ) : (
          <div className="editor-empty">
            <p>Select a file from the explorer to edit</p>
          </div>
        )}
      </div>
    </div>
  );
}
