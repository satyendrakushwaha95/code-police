import type { Conversation, Message, FileAttachment } from '../types/chat';

const ipcRenderer = (window as any).ipcRenderer;

export interface LoadedState {
  conversations: Conversation[];
  messages: Record<string, Message[]>;
  attachments: Record<string, FileAttachment[]>;
}

export async function loadFromDatabase(): Promise<LoadedState> {
  try {
    const data = await ipcRenderer.invoke('db:loadState');
    if (!data) {
      return { conversations: [], messages: {}, attachments: {} };
    }

    const { conversations, messages, attachments } = data;

    const convs: Conversation[] = conversations.map((c: any) => ({
      id: c.id,
      title: c.title,
      model: c.model,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      messages: (messages[c.id] || []).map((m: any) => ({
        ...m,
        isStreaming: Boolean(m.isStreaming),
      })),
      attachments: attachments[c.id] || [],
    }));

    return { conversations: convs, messages, attachments };
  } catch (err) {
    console.error('Failed to load from SQLite:', err);
    return { conversations: [], messages: {}, attachments: {} };
  }
}

export async function saveConversation(conv: Conversation): Promise<void> {
  try {
    await ipcRenderer.invoke('db:saveConversation', {
      id: conv.id,
      title: conv.title,
      model: conv.model,
      createdAt: conv.createdAt,
      updatedAt: conv.updatedAt,
    });
  } catch (err) {
    console.error('Failed to save conversation:', err);
  }
}

export async function saveMessage(convId: string, msg: Message): Promise<void> {
  try {
    await ipcRenderer.invoke('db:saveMessage', {
      id: msg.id,
      conversationId: convId,
      role: msg.role,
      content: msg.content,
      timestamp: msg.timestamp,
      isStreaming: msg.isStreaming ? 1 : 0,
    });
  } catch (err) {
    console.error('Failed to save message:', err);
  }
}

export async function deleteConversationFromDb(id: string): Promise<void> {
  try {
    await ipcRenderer.invoke('db:deleteConversation', id);
  } catch (err) {
    console.error('Failed to delete conversation:', err);
  }
}

export async function deleteMessageFromDb(id: string): Promise<void> {
  try {
    await ipcRenderer.invoke('db:deleteMessage', id);
  } catch (err) {
    console.error('Failed to delete message:', err);
  }
}

export async function deleteMessagesAfterDb(convId: string, timestamp: number): Promise<void> {
  try {
    await ipcRenderer.invoke('db:deleteMessagesAfter', convId, timestamp);
  } catch (err) {
    console.error('Failed to delete messages:', err);
  }
}

export async function saveAttachment(convId: string, att: FileAttachment): Promise<void> {
  try {
    await ipcRenderer.invoke('db:saveAttachment', {
      id: att.id,
      conversationId: convId,
      name: att.name,
      type: att.type,
      content: att.content,
      size: att.size,
    });
  } catch (err) {
    console.error('Failed to save attachment:', err);
  }
}

export async function addAuditLog(entry: { action: string; toolName?: string; parameters?: string; result?: string; userConfirmed: boolean }): Promise<void> {
  try {
    await ipcRenderer.invoke('db:addAuditLog', entry);
  } catch (err) {
    console.error('Failed to add audit log:', err);
  }
}

export async function getAuditLogs(limit = 100): Promise<any[]> {
  try {
    return await ipcRenderer.invoke('db:getAuditLogs', limit);
  } catch (err) {
    console.error('Failed to get audit logs:', err);
    return [];
  }
}

export async function confirmAction(title: string, message: string, detail?: string): Promise<boolean> {
  try {
    return await ipcRenderer.invoke('dialog:confirmAction', { title, message, detail });
  } catch (err) {
    console.error('Failed to confirm action:', err);
    return false;
  }
}
