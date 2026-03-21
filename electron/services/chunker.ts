export interface CodeChunk {
  content: string;
  startLine: number;
  endLine: number;
}

/**
 * A regex-based chunker that splits source code by classes, functions, and logical blocks.
 * This is a fallback since tree-sitter C++ bindings failed to compile on Windows.
 */
export function chunkFileContent(content: string, maxTokensPerChunk: number = 800): CodeChunk[] {
  const lines = content.split('\n');
  const chunks: CodeChunk[] = [];
  
  let currentChunkLines: string[] = [];
  let currentStartLine = 1;

  // Very rough heuristic: 1 token ≈ 4 characters
  const estTokenCount = (str: string) => Math.ceil(str.length / 4);

  // Helper to flush current buffer
  const flushChunk = (endLine: number) => {
    if (currentChunkLines.length > 0) {
      chunks.push({
        content: currentChunkLines.join('\n'),
        startLine: currentStartLine,
        endLine: endLine
      });
      currentChunkLines = [];
      currentStartLine = endLine + 1;
    }
  };

  // Simple heuristic boundary regexes for TS/JS/Python/Java
  const boundaryRegex = /^(export\s+)?(class|interface|function|const\s+\w+\s*=\s*(async\s*)?\([^)]*\)\s*=>|def\s+\w+|class\s+\w+:)/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isBoundary = boundaryRegex.test(line.trim());
    
    const currentTokens = estTokenCount(currentChunkLines.join('\n'));
    const lineTokens = estTokenCount(line);

    if ((isBoundary && currentTokens > 100) || (currentTokens + lineTokens > maxTokensPerChunk)) {
      flushChunk(i);
    }

    currentChunkLines.push(line);
  }

  // Flush remaining
  if (currentChunkLines.length > 0) {
    flushChunk(lines.length);
  }

  return chunks;
}
