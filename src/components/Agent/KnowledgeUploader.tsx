import { useState, useCallback } from 'react';
import type { KnowledgeFile } from '../../store/AgentContext';
import './Agent.css';

interface KnowledgeUploaderProps {
  files: KnowledgeFile[];
  agentId: string;
  onFilesChange: (files: KnowledgeFile[]) => void;
  maxSizeBytes?: number;
}

export default function KnowledgeUploader({
  files,
  agentId,
  onFilesChange,
  maxSizeBytes = 100 * 1024 * 1024,
}: KnowledgeUploaderProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const handleFileSelect = useCallback(async (selectedFiles: FileList | null) => {
    if (!selectedFiles || selectedFiles.length === 0) return;

    setIsUploading(true);
    try {
      const newFiles: KnowledgeFile[] = [];
      
      for (const file of Array.from(selectedFiles)) {
        const currentTotal = files.reduce((sum, f) => sum + f.size, 0);
        
        if (currentTotal + file.size > maxSizeBytes) {
          console.warn(`File ${file.name} exceeds size limit`);
          continue;
        }

        const ext = file.name.split('.').pop()?.toLowerCase() || '';
        let type: 'text' | 'markdown' | 'code' = 'text';
        
        if (['md', 'mdx'].includes(ext)) {
          type = 'markdown';
        } else if (['ts', 'tsx', 'js', 'jsx', 'py', 'java', 'cpp', 'c', 'go', 'rs'].includes(ext)) {
          type = 'code';
        }

        const knowledgeFile: KnowledgeFile = {
          id: `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          name: file.name,
          path: file.name,
          type,
          size: file.size,
          addedAt: Date.now(),
        };

        newFiles.push(knowledgeFile);
      }

      onFilesChange([...files, ...newFiles]);
    } finally {
      setIsUploading(false);
    }
  }, [files, onFilesChange, maxSizeBytes]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFileSelect(e.dataTransfer.files);
  }, [handleFileSelect]);

  const handleRemove = useCallback((fileId: string) => {
    onFilesChange(files.filter(f => f.id !== fileId));
  }, [files, onFilesChange]);

  const totalSize = files.reduce((sum, f) => sum + f.size, 0);
  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="knowledge-uploader">
      <div
        className={`upload-zone ${dragOver ? 'drag-over' : ''} ${isUploading ? 'uploading' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <input
          type="file"
          multiple
          onChange={(e) => handleFileSelect(e.target.files)}
          className="upload-input"
          id={`upload-${agentId}`}
        />
        <label htmlFor={`upload-${agentId}`} className="upload-label">
          <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          <span>Drop files here or click to upload</span>
          <span className="upload-hint">
            {formatSize(totalSize)} / {formatSize(maxSizeBytes)}
          </span>
        </label>
      </div>

      {files.length > 0 && (
        <div className="file-list">
          {files.map((file) => (
            <div key={file.id} className="file-item">
              <div className="file-icon">
                {file.type === 'markdown' && '📝'}
                {file.type === 'code' && '💻'}
                {file.type === 'text' && '📄'}
              </div>
              <div className="file-info">
                <span className="file-name">{file.name}</span>
                <span className="file-meta">
                  {formatSize(file.size)} • Added {new Date(file.addedAt).toLocaleDateString()}
                </span>
              </div>
              <button
                className="btn-icon btn-sm"
                onClick={() => handleRemove(file.id)}
                title="Remove file"
              >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {files.length === 0 && (
        <p className="empty-knowledge">
          Add knowledge files to give your agent context about your codebase or domain.
        </p>
      )}
    </div>
  );
}
