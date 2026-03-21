import type { FileAttachment } from '../types/chat';
import { v4 as uuidv4 } from 'uuid';

const TEXT_EXTENSIONS = [
  'txt', 'md', 'json', 'xml', 'yaml', 'yml', 'csv', 'log', 'env', 'ini', 'cfg',
  'html', 'htm', 'css', 'scss', 'less', 'svg',
  'js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs',
  'py', 'rb', 'go', 'rs', 'java', 'kt', 'scala', 'c', 'cpp', 'h', 'hpp',
  'cs', 'php', 'swift', 'dart', 'lua', 'r', 'sql',
  'sh', 'bash', 'zsh', 'ps1', 'bat', 'cmd',
  'dockerfile', 'makefile', 'toml', 'lock',
  'gitignore', 'editorconfig', 'prettierrc', 'eslintrc',
];

function getExtension(filename: string): string {
  const parts = filename.toLowerCase().split('.');
  return parts.length > 1 ? parts[parts.length - 1] : '';
}

function isTextFile(filename: string): boolean {
  const ext = getExtension(filename);
  const basename = filename.toLowerCase().split(/[/\\]/).pop() || '';
  return TEXT_EXTENSIONS.includes(ext) ||
    ['makefile', 'dockerfile', 'readme', 'license', 'changelog'].includes(basename);
}

export async function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

export async function readFileContent(file: File): Promise<FileAttachment> {
  // Reject image files - Ollama text models don't support images
  if (file.type.startsWith('image/')) {
    throw new Error(`Image files are not supported. The model does not support image input.`);
  }
  
  let content = '';
  const ext = getExtension(file.name);

  if (isTextFile(file.name) || file.type.startsWith('text/')) {
    content = await readFileAsText(file);
  } else if (ext === 'pdf') {
    content = await readPDFFile(file);
  } else if (file.type.startsWith('application/json')) {
    content = await readFileAsText(file);
  } else {
    // Try reading as text anyway
    try {
      content = await readFileAsText(file);
    } catch {
      content = `[Binary file: ${file.name} (${formatFileSize(file.size)})]`;
    }
  }

  // Truncate very large files
  const MAX_CHARS = 50000;
  const truncated = content.length > MAX_CHARS;
  if (truncated) {
    content = content.substring(0, MAX_CHARS) + '\n\n[... content truncated ...]';
  }

  return {
    id: uuidv4(),
    name: file.name,
    type: file.type || `text/${ext}`,
    content,
    size: file.size,
    truncated,
  };
}

async function readPDFFile(file: File): Promise<string> {
  // Simple PDF text extraction without pdfjs-dist (lighter weight)
  // Read as array buffer and try to extract visible text
  try {
    const text = await readFileAsText(file);
    // Basic PDF text extraction - extract text between stream markers
    const textContent = text.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\xff]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (textContent.length > 100) {
      return textContent;
    }
    return `[PDF file: ${file.name} - Text extraction limited. Consider converting to text first.]`;
  } catch {
    return `[PDF file: ${file.name} - Could not extract text.]`;
  }
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function estimateTokens(text: string): number {
  // Rough estimation: ~4 chars per token for English
  return Math.ceil(text.length / 4);
}

export function buildContextFromAttachments(attachments: FileAttachment[]): string {
  if (attachments.length === 0) return '';

  let context = 'You have access to the following files:\n\n';
  for (const att of attachments) {
    context += `--- File: ${att.name} ---\n`;
    context += att.content;
    context += '\n--- End of File ---\n\n';
  }
  context += 'Please use these files as context when answering.\n';
  return context;
}
