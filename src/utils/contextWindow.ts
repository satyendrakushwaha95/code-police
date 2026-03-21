import { estimateTokens } from '../services/fileReader';
import type { Message, FileAttachment } from '../types/chat';

export interface ContextWindowInfo {
  totalTokens: number;
  maxTokens: number;
  usagePercent: number;
  level: 'low' | 'medium' | 'high';
  breakdown: {
    systemPrompt: number;
    fileContext: number;
    conversationHistory: number;
    available: number;
  };
}

export function calculateContextWindow(
  messages: Message[],
  attachments: FileAttachment[],
  systemPrompt: string,
  maxTokens: number
): ContextWindowInfo {
  // Estimate tokens for each component
  const systemPromptTokens = estimateTokens(systemPrompt);

  let fileContextTokens = 0;
  for (const att of attachments) {
    fileContextTokens += estimateTokens(att.content) + estimateTokens(att.name) + 20; // overhead
  }

  let conversationTokens = 0;
  for (const msg of messages) {
    if (msg.role !== 'system') {
      conversationTokens += estimateTokens(msg.content) + 10; // role overhead
    }
  }

  const totalTokens = systemPromptTokens + fileContextTokens + conversationTokens;
  const usagePercent = Math.min((totalTokens / maxTokens) * 100, 100);

  let level: 'low' | 'medium' | 'high' = 'low';
  if (usagePercent > 80) level = 'high';
  else if (usagePercent > 50) level = 'medium';

  return {
    totalTokens,
    maxTokens,
    usagePercent,
    level,
    breakdown: {
      systemPrompt: systemPromptTokens,
      fileContext: fileContextTokens,
      conversationHistory: conversationTokens,
      available: Math.max(0, maxTokens - totalTokens),
    },
  };
}

/**
 * Truncate conversation messages to fit within context window.
 * Keeps system prompt + file context intact, removes oldest messages first.
 */
export function truncateMessagesForContext(
  messages: Message[],
  attachments: FileAttachment[],
  systemPrompt: string,
  maxTokens: number
): Message[] {
  const systemTokens = estimateTokens(systemPrompt);
  let fileTokens = 0;
  for (const att of attachments) {
    fileTokens += estimateTokens(att.content) + 20;
  }

  const reservedTokens = systemTokens + fileTokens;
  const availableForMessages = maxTokens - reservedTokens - 500; // 500 token buffer for response

  if (availableForMessages <= 0) {
    // Not enough space even for messages, return just the last user message
    const lastUser = messages.filter(m => m.role === 'user').pop();
    return lastUser ? [lastUser] : [];
  }

  // Build from newest to oldest, tracking tokens
  const reversed = [...messages].filter(m => m.role !== 'system').reverse();
  const result: Message[] = [];
  let usedTokens = 0;

  for (const msg of reversed) {
    const msgTokens = estimateTokens(msg.content) + 10;
    if (usedTokens + msgTokens > availableForMessages) break;
    result.unshift(msg);
    usedTokens += msgTokens;
  }

  return result;
}
