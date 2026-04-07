import { useRef } from 'react';
import Editor from '@monaco-editor/react';
import { useSettings } from '../../store/SettingsContext';

const MAX_MONACO_SIZE = 50000; // chars

interface CodeEditorProps {
  code: string;
  language?: string;
  readOnly?: boolean;
  onChange?: (value: string) => void;
  onSave?: (value: string) => void;
}

export default function CodeEditor({ 
  code, 
  language = 'typescript', 
  readOnly = false,
  onChange,
  onSave
}: CodeEditorProps) {
  const { settings } = useSettings();
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  const handleEditorChange = (value: string | undefined) => {
    if (onChange && value !== undefined) {
      onChange(value);
    }
  };

  const handleEditorMount = (editor: any, monaco: any) => {
    if (!readOnly) {
      editor.addCommand(
        // eslint-disable-next-line no-bitwise
        monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
        () => {
          onSaveRef.current?.(editor.getValue());
        }
      );
    }
  };

  const getLanguage = (lang: string): string => {
    const languageMap: Record<string, string> = {
      'ts': 'typescript',
      'tsx': 'typescript',
      'js': 'javascript',
      'jsx': 'javascript',
      'py': 'python',
      'rb': 'ruby',
      'java': 'java',
      'cpp': 'cpp',
      'c': 'c',
      'go': 'go',
      'rs': 'rust',
      'sql': 'sql',
      'json': 'json',
      'html': 'html',
      'css': 'css',
      'md': 'markdown',
      'yaml': 'yaml',
      'yml': 'yaml',
      'sh': 'shell',
      'bash': 'shell',
    };
    
    const ext = lang.split('.').pop()?.toLowerCase() || '';
    return languageMap[ext] || lang;
  };

  const isLargeFile = code.length > MAX_MONACO_SIZE;

  if (isLargeFile) {
    return (
      <div className="code-editor-container" style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ 
          padding: '8px 12px', 
          background: 'var(--warning)', 
          color: '#000',
          fontSize: '12px',
          fontWeight: 500
        }}>
          File too large for Monaco Editor ({code.length.toLocaleString()} chars). Using plain text view.
        </div>
        <textarea
          value={code}
          onChange={(e) => onChange?.(e.target.value)}
          readOnly={readOnly}
          style={{
            flex: 1,
            width: '100%',
            background: 'var(--bg-code)',
            color: 'var(--text-primary)',
            border: 'none',
            padding: '12px',
            fontFamily: 'var(--font-mono)',
            fontSize: '13px',
            lineHeight: 1.5,
            resize: 'none',
            outline: 'none',
          }}
        />
      </div>
    );
  }

  return (
    <div className="code-editor-container">
      <Editor
        height="100%"
        language={getLanguage(language)}
        value={code}
        theme={settings.theme === 'dark' ? 'vs-dark' : 'vs'}
        onChange={handleEditorChange}
        onMount={handleEditorMount}
        loading={<div style={{ padding: '20px', color: 'var(--text-secondary)' }}>Loading editor...</div>}
        options={{
          readOnly,
          minimap: { enabled: false },
          fontSize: 13,
          fontFamily: 'var(--font-mono)',
          lineNumbers: 'on',
          scrollBeyondLastLine: false,
          automaticLayout: true,
          tabSize: 2,
          wordWrap: 'on',
          padding: { top: 10, bottom: 10 },
          scrollbar: {
            vertical: 'auto',
            horizontal: 'auto',
            verticalScrollbarSize: 10,
            horizontalScrollbarSize: 10,
          },
        }}
      />
    </div>
  );
}
