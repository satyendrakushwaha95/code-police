import { useState, useRef, useEffect, useCallback } from 'react';
import FileTree from './FileTree';
import CodeEditor from './CodeEditor';
import { useWorkspace } from '../../store/WorkspaceContext';
import { useSettings } from '../../store/SettingsContext';
import { useToast } from '../../hooks/useToast';
import { useEditorState } from '../../hooks/useEditorState';
import './FilePanel.css';

interface OpenFile {
  id: string;
  name: string;
  path: string;
  absolutePath: string;
  content: string;
  diskContent: string;
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
  const [pendingCloseId, setPendingCloseId] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<string[]>([]);
  const panelRef = useRef<HTMLDivElement>(null);
  const isResizing = useRef(false);
  const hasRestoredRef = useRef(false);
  const { showToast } = useToast();
  const editorState = useEditorState();

  const activeFile = openFiles.find(f => f.id === activeFileId) || null;

  // --- Resize Handle ---

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

  // --- File Operations ---

  const handleFileSelect = (content: string, name: string, path: string, absolutePath: string) => {
    const existing = openFiles.find(f => f.path === path);
    if (existing) {
      setActiveFileId(existing.id);
    } else {
      const id = `file-${Date.now()}`;
      const newFile: OpenFile = {
        id,
        name,
        path,
        absolutePath,
        content,
        diskContent: content,
        language: detectLanguage(name),
        modified: false,
      };
      setOpenFiles(prev => [...prev, newFile]);
      setActiveFileId(id);
    }
    setView('editor');
  };

  const handleContentChange = (newContent: string) => {
    setOpenFiles(prev => prev.map(f =>
      f.id === activeFileId
        ? { ...f, content: newContent, modified: newContent !== f.diskContent }
        : f
    ));
  };

  const handleSaveFile = useCallback(async () => {
    const file = openFiles.find(f => f.id === activeFileId);
    if (!file) return;

    if (!file.absolutePath) {
      showToast('Cannot save — file has no disk path', 'error');
      return;
    }

    const ipc = (window as any).ipcRenderer;
    if (!ipc) {
      showToast('Save requires Electron runtime', 'error');
      return;
    }

    const result = await ipc.invoke('fs:writeFile', {
      filePath: file.absolutePath,
      content: file.content,
    });

    if (result.success) {
      setOpenFiles(prev => prev.map(f =>
        f.id === activeFileId ? { ...f, modified: false, diskContent: file.content } : f
      ));
      showToast(`Saved ${file.name}`, 'success');
    } else {
      showToast(`Failed to save: ${result.error}`, 'error');
    }
  }, [openFiles, activeFileId, showToast]);

  const handleCreateNewFile = () => {
    const name = prompt('Enter file name:', 'untitled.txt');
    if (!name) return;
    const id = `file-${Date.now()}`;
    const newFile: OpenFile = {
      id,
      name,
      path: name,
      absolutePath: '',
      content: '',
      diskContent: '',
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

  const handleSendToAgent = () => {
    if (!activeFile) return;
    onAddContext(activeFile.content, activeFile.name);
    showToast(`Added ${activeFile.name} to agent context`, 'success');
  };

  // --- Tab Close with Dirty Confirmation ---

  const closeFileImmediate = useCallback((id: string) => {
    setPendingCloseId(null);
    setOpenFiles(prev => {
      const remaining = prev.filter(f => f.id !== id);
      if (activeFileId === id) {
        const newActive = remaining.length > 0 ? remaining[remaining.length - 1].id : null;
        setActiveFileId(newActive);
        if (remaining.length === 0) setView('tree');
      }
      return remaining;
    });
  }, [activeFileId]);

  const handleCloseFile = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const file = openFiles.find(f => f.id === id);

    if (file?.modified) {
      setPendingCloseId(id);
      return;
    }

    closeFileImmediate(id);
  };

  const handleConfirmSave = async () => {
    if (!pendingCloseId) return;
    const file = openFiles.find(f => f.id === pendingCloseId);
    if (!file) return;

    if (!file.absolutePath) {
      showToast('Cannot save — file has no disk path', 'error');
      setPendingCloseId(null);
      return;
    }

    const ipc = (window as any).ipcRenderer;
    if (!ipc) {
      setPendingCloseId(null);
      return;
    }

    const result = await ipc.invoke('fs:writeFile', {
      filePath: file.absolutePath,
      content: file.content,
    });

    if (result.success) {
      showToast(`Saved ${file.name}`, 'success');
      closeFileImmediate(pendingCloseId);
    } else {
      showToast(`Failed to save: ${result.error}`, 'error');
      setPendingCloseId(null);
    }
  };

  const handleConfirmDiscard = () => {
    if (pendingCloseId) closeFileImmediate(pendingCloseId);
  };

  const handleConfirmCancel = () => {
    setPendingCloseId(null);
  };

  // --- Global Ctrl+S ---

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (activeFile && view === 'editor') {
          handleSaveFile();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeFile, view, handleSaveFile]);

  // --- Semantic Search ---

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const { state: workspace, indexWorkspace, searchWorkspace } = useWorkspace();
  const { settings } = useSettings();

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
    handleFileSelect(result.content, result.relativeFilePath.split('/').pop() || 'chunk', result.relativeFilePath, '');
  };

  const handleAddSearchResultToContext = (result: any, e: React.MouseEvent) => {
    e.stopPropagation();
    const contextText = `File: ${result.relativeFilePath} (lines ${result.startLine}-${result.endLine})\n\n${result.content}`;
    onAddContext(contextText, `${result.relativeFilePath}:${result.startLine}`);
    showToast(`Added ${result.relativeFilePath} to context`, 'success');
  };

  // --- Session Persistence: restore on mount ---

  useEffect(() => {
    if (hasRestoredRef.current) return;
    hasRestoredRef.current = true;

    const saved = editorState.load();
    if (!saved) return;

    setExpandedFolders(saved.expandedFolders);

    const restoreTabs = async () => {
      const ipc = (window as any).ipcRenderer;
      if (!ipc) return;

      const restored: OpenFile[] = [];
      for (const tab of saved.openTabs) {
        if (!tab.absolutePath) continue;
        try {
          const content = await ipc.invoke('fs:readFile', tab.absolutePath);
          restored.push({
            id: `file-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            name: tab.path.split('/').pop() || '',
            path: tab.path,
            absolutePath: tab.absolutePath,
            content,
            diskContent: content,
            language: detectLanguage(tab.path),
            modified: false,
          });
        } catch {
          // File no longer exists on disk — skip silently
        }
      }

      if (restored.length > 0) {
        setOpenFiles(restored);
        const activeTab = saved.openTabs.find(t => t.isActive);
        const activeFile = activeTab
          ? restored.find(f => f.path === activeTab.path)
          : restored[0];
        setActiveFileId(activeFile?.id || restored[0].id);
        setView('editor');
      }
    };

    restoreTabs();
  }, []);

  // --- Session Persistence: auto-save on changes (debounced) ---

  useEffect(() => {
    const timeout = setTimeout(() => {
      editorState.save({
        expandedFolders,
        openTabs: openFiles.map(f => ({
          path: f.path,
          absolutePath: f.absolutePath,
          isActive: f.id === activeFileId,
        })),
      });
    }, 500);
    return () => clearTimeout(timeout);
  }, [openFiles, activeFileId, expandedFolders]);

  // --- Render ---

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

        <FileTree
          onFileSelect={handleFileSelect}
          initialExpanded={expandedFolders}
          onExpandedChange={setExpandedFolders}
        />
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

        {/* Dirty Confirmation Bar */}
        {pendingCloseId && (
          <div className="dirty-confirm-bar">
            <span>
              &ldquo;{openFiles.find(f => f.id === pendingCloseId)?.name}&rdquo; has unsaved changes.
            </span>
            <div className="dirty-confirm-actions">
              <button className="btn btn-sm btn-primary" onClick={handleConfirmSave}>Save</button>
              <button className="btn btn-sm btn-danger" onClick={handleConfirmDiscard}>Discard</button>
              <button className="btn btn-sm btn-ghost" onClick={handleConfirmCancel}>Cancel</button>
            </div>
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
                <button className="btn btn-ghost" onClick={handleSendToAgent} title="Send file to agent context">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 2L11 13"/><path d="M22 2L15 22L11 13L2 9L22 2Z"/>
                  </svg>
                  Send to Agent
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
              <div className="file-editor" style={{ flex: 1, minHeight: 0 }}>
                <CodeEditor
                  code={activeFile.content}
                  language={activeFile.language}
                  onChange={handleContentChange}
                  onSave={handleSaveFile}
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
