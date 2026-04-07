import { useState, useEffect } from 'react';
import { useWorkspace } from '../../store/WorkspaceContext';
import './FilePanel.css';

interface FileNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: FileNode[];
  absolutePath?: string;
}

interface FileTreeProps {
  onFileSelect: (content: string, name: string, path: string, absolutePath: string) => void;
  initialExpanded?: string[];
  onExpandedChange?: (expanded: string[]) => void;
}

export default function FileTree({ onFileSelect, initialExpanded, onExpandedChange }: FileTreeProps) {
  const { state: workspace, openFolder } = useWorkspace();
  const [rootNodes, setRootNodes] = useState<FileNode[]>([]);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(
    new Set(initialExpanded || [])
  );

  const supportsFileSystemAccess = !!(window as any).ipcRenderer || 'showDirectoryPicker' in window;

  useEffect(() => {
    if (workspace.rootPath && workspace.folderName) {
      // Build a tree structure from the flat index
      
      const fileMap = new Map<string, FileNode>();
      const rootNode: FileNode = {
        name: workspace.folderName,
        path: workspace.folderName,
        isDirectory: true,
        children: []
      };
      
      fileMap.set(workspace.folderName, rootNode);

      workspace.filesIndex.forEach(file => {
        // file.path looks like "my-folder/src/index.ts"
        const parts = file.path.split('/');
        let currentPath = parts[0]; // "my-folder"
        
        for (let i = 1; i < parts.length; i++) {
          const partName = parts[i];
          const isLast = (i === parts.length - 1);
          const newPath = `${currentPath}/${partName}`;
          
          if (!fileMap.has(newPath)) {
            const newNode: FileNode = {
              name: partName,
              path: newPath,
              isDirectory: !isLast,
              absolutePath: isLast ? file.absolutePath : undefined,
              children: isLast ? undefined : []
            };
            fileMap.set(newPath, newNode);
            
            const parentNode = fileMap.get(currentPath);
            if (parentNode && parentNode.children) {
              parentNode.children.push(newNode);
            }
          }
          currentPath = newPath;
        }
      });
      
      // Sort function for children
      const sortNodes = (nodes?: FileNode[]) => {
        if (!nodes) return;
        nodes.sort((a, b) => {
           if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
           return a.name.localeCompare(b.name);
        });
        nodes.forEach(n => sortNodes(n.children));
      }
      
      sortNodes(rootNode.children);
      setRootNodes([rootNode]);
      
    } else {
      setRootNodes([]);
      setExpandedPaths(new Set());
    }
  }, [workspace.rootPath, workspace.folderName, workspace.filesIndex]);

  const toggleExpand = (node: FileNode) => {
    const newExpanded = new Set(expandedPaths);
    if (newExpanded.has(node.path)) {
      newExpanded.delete(node.path);
    } else {
      newExpanded.add(node.path);
    }
    setExpandedPaths(newExpanded);
    onExpandedChange?.(Array.from(newExpanded));
  };

  const handleFileClick = async (node: FileNode) => {
    if (node.isDirectory) {
      toggleExpand(node);
      return;
    }
    if (!node.absolutePath) return;
    
    try {
      // In electron, we need to read the actual file via Node or IPC. Let's pass the absolute path
      // to the parent onFileSelect. The parent or ChatInput can read it.
      // Currently, we don't have a direct "read file" IPC. Assuming we might need to add one.
      const content = await (window as any).ipcRenderer.invoke('fs:readFile', node.absolutePath);
      onFileSelect(content, node.name, node.path, node.absolutePath!);
    } catch (err) {
      console.error('Error reading file:', err);
    }
  };

  const getFileIcon = (name: string, isDir: boolean) => {
    if (isDir) return '📁';
    const ext = name.split('.').pop()?.toLowerCase() || '';
    const icons: Record<string, string> = {
      ts: '🟦', tsx: '⚛️', js: '🟨', jsx: '⚛️',
      py: '🐍', rb: '💎', go: '🔵', rs: '🦀',
      java: '☕', kt: '🟣', swift: '🍊',
      html: '🌐', css: '🎨', scss: '🎨',
      json: '📋', yaml: '📋', yml: '📋', toml: '📋',
      md: '📝', txt: '📄', csv: '📊',
      sql: '🗄️', sh: '⚡', bat: '⚡',
      png: '🖼️', jpg: '🖼️', svg: '🖼️', gif: '🖼️',
      pdf: '📕',
    };
    return icons[ext] || '📄';
  };

  const renderNode = (node: FileNode, depth: number = 0) => {
    const isExpanded = expandedPaths.has(node.path);
    return (
      <div key={node.path}>
        <div
          className={`tree-node ${node.isDirectory ? 'directory' : 'file'}`}
          style={{ paddingLeft: `${12 + depth * 16}px` }}
          onClick={() => handleFileClick(node)}
        >
          {node.isDirectory && (
            <span className={`tree-chevron ${isExpanded ? 'expanded' : ''}`}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
            </span>
          )}
          <span className="tree-icon">{getFileIcon(node.name, node.isDirectory)}</span>
          <span className="tree-name">{node.name}</span>
        </div>
        {node.isDirectory && isExpanded && node.children && (
          <div className="tree-children">
            {node.children.map(child => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="file-tree">
      <div className="file-tree-header">
        <h3>Explorer</h3>
        <button className="btn-icon" onClick={openFolder} title="Open Folder" disabled={workspace.isIndexing}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
            <line x1="12" y1="11" x2="12" y2="17"/>
            <line x1="9" y1="14" x2="15" y2="14"/>
          </svg>
        </button>
      </div>

      {workspace.error && <div className="tree-error">{workspace.error}</div>}

      {rootNodes.length === 0 ? (
        <div className="tree-empty">
          <p>No folder opened</p>
          <button className="btn btn-secondary" onClick={openFolder} disabled={workspace.isIndexing || !supportsFileSystemAccess}>
            {workspace.isIndexing ? 'Indexing...' : 'Open Folder'}
          </button>
          {!supportsFileSystemAccess && (
            <p className="tree-hint">Use Chrome or Edge for folder browsing</p>
          )}
        </div>
      ) : (
        <div className="tree-content">
          {rootNodes.map(node => renderNode(node))}
        </div>
      )}
    </div>
  );
}
