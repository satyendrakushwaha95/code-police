import React, { createContext, useContext, useReducer, useEffect, type ReactNode } from 'react';
import type { Conversation, Message, FileAttachment, MessageUsage } from '../types/chat';
import { loadFromDatabase, saveConversation, saveMessage, deleteConversationFromDb, deleteMessageFromDb, saveAttachment } from '../services/database';
import { v4 as uuidv4 } from 'uuid';
import { generateTitle } from '../utils/helpers';

interface ConversationState {
  conversations: Conversation[];
  activeConversationId: string | null;
}

type ConversationAction =
  | { type: 'CREATE_CONVERSATION'; payload?: { model?: string } }
  | { type: 'DELETE_CONVERSATION'; payload: string }
  | { type: 'RENAME_CONVERSATION'; payload: { id: string; title: string } }
  | { type: 'SET_ACTIVE'; payload: string | null }
  | { type: 'ADD_MESSAGE'; payload: { conversationId: string; message: Message } }
  | { type: 'UPDATE_MESSAGE'; payload: { conversationId: string; messageId: string; content?: string; isStreaming?: boolean; pipelineStatus?: 'starting' | 'running' | 'complete' | 'failed' | 'cancelled'; pipelineRunId?: string; usage?: MessageUsage; suggestions?: string[] } }
  | { type: 'DELETE_MESSAGE'; payload: { conversationId: string; messageId: string } }
  | { type: 'ADD_ATTACHMENTS'; payload: { conversationId: string; attachments: FileAttachment[] } }
  | { type: 'REMOVE_ATTACHMENT'; payload: { conversationId: string; attachmentId: string } }
  | { type: 'LOAD_STATE'; payload: ConversationState };

function conversationReducer(state: ConversationState, action: ConversationAction): ConversationState {
  switch (action.type) {
    case 'CREATE_CONVERSATION': {
      const newConv: Conversation = {
        id: uuidv4(),
        title: 'New Chat',
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        model: action.payload?.model || 'qwen2.5-coder',
        attachments: [],
      };
      return {
        ...state,
        conversations: [newConv, ...state.conversations],
        activeConversationId: newConv.id,
      };
    }

    case 'DELETE_CONVERSATION': {
      const filtered = state.conversations.filter(c => c.id !== action.payload);
      deleteConversationFromDb(action.payload);
      return {
        ...state,
        conversations: filtered,
        activeConversationId: state.activeConversationId === action.payload
          ? (filtered[0]?.id || null)
          : state.activeConversationId,
      };
    }

    case 'RENAME_CONVERSATION':
      return {
        ...state,
        conversations: state.conversations.map(c =>
          c.id === action.payload.id ? { ...c, title: action.payload.title, updatedAt: Date.now() } : c
        ),
      };

    case 'SET_ACTIVE':
      return { ...state, activeConversationId: action.payload };

    case 'ADD_MESSAGE': {
      return {
        ...state,
        conversations: state.conversations.map(c => {
          if (c.id !== action.payload.conversationId) return c;
          const updatedMessages = [...c.messages, action.payload.message];
          // Auto-title from first user message
          let title = c.title;
          if (title === 'New Chat' && action.payload.message.role === 'user') {
            title = generateTitle(action.payload.message.content);
          }
          return { ...c, messages: updatedMessages, title, updatedAt: Date.now() };
        }),
      };
    }

    case 'UPDATE_MESSAGE':
      return {
        ...state,
        conversations: state.conversations.map(c => {
          if (c.id !== action.payload.conversationId) return c;
          return {
            ...c,
            messages: c.messages.map(m =>
              m.id === action.payload.messageId
                ? { 
                    ...m, 
                    content: action.payload.content ?? m.content, 
                    isStreaming: action.payload.isStreaming ?? m.isStreaming,
                    pipelineStatus: action.payload.pipelineStatus ?? m.pipelineStatus,
                    pipelineRunId: action.payload.pipelineRunId ?? m.pipelineRunId,
                    usage: action.payload.usage ?? m.usage,
                    suggestions: action.payload.suggestions ?? m.suggestions,
                  }
                : m
            ),
            updatedAt: Date.now(),
          };
        }),
      };

    case 'DELETE_MESSAGE':
      deleteMessageFromDb(action.payload.messageId);
      return {
        ...state,
        conversations: state.conversations.map(c => {
          if (c.id !== action.payload.conversationId) return c;
          return {
            ...c,
            messages: c.messages.filter(m => m.id !== action.payload.messageId),
            updatedAt: Date.now(),
          };
        }),
      };

    case 'ADD_ATTACHMENTS':
      return {
        ...state,
        conversations: state.conversations.map(c => {
          if (c.id !== action.payload.conversationId) return c;
          return {
            ...c,
            attachments: [...c.attachments, ...action.payload.attachments],
            updatedAt: Date.now(),
          };
        }),
      };

    case 'REMOVE_ATTACHMENT':
      return {
        ...state,
        conversations: state.conversations.map(c => {
          if (c.id !== action.payload.conversationId) return c;
          return {
            ...c,
            attachments: c.attachments.filter(a => a.id !== action.payload.attachmentId),
            updatedAt: Date.now(),
          };
        }),
      };

    case 'LOAD_STATE':
      return action.payload;

    default:
      return state;
  }
}

const initialState: ConversationState = {
  conversations: [],
  activeConversationId: null,
};

interface ConversationContextValue {
  state: ConversationState;
  dispatch: React.Dispatch<ConversationAction>;
  activeConversation: Conversation | null;
}

const ConversationContext = createContext<ConversationContextValue | null>(null);

export function ConversationProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(conversationReducer, initialState);
  const [isLoaded, setIsLoaded] = React.useState(false);

  // Load initial state from SQLite
  useEffect(() => {
    const loadInitial = async () => {
      try {
        const loaded = await loadFromDatabase();
        if (loaded.conversations.length > 0) {
          dispatch({
            type: 'LOAD_STATE',
            payload: {
              conversations: loaded.conversations,
              activeConversationId: loaded.conversations[0].id,
            },
          });
        }
      } catch (err) {
        console.error('Failed to load from SQLite:', err);
      } finally {
        setIsLoaded(true);
      }
    };
    loadInitial();
  }, []);

  // Persist on every state change to SQLite (after initial load)
  useEffect(() => {
    if (!isLoaded) return;
    
    const persistState = async () => {
      for (const conv of state.conversations) {
        await saveConversation(conv);
        for (const msg of conv.messages) {
          await saveMessage(conv.id, msg);
        }
        for (const att of conv.attachments) {
          await saveAttachment(conv.id, att);
        }
      }
    };
    
    if (state.conversations.length > 0) {
      persistState();
    }
  }, [state, isLoaded]);

  const activeConversation = state.conversations.find(c => c.id === state.activeConversationId) || null;

  return (
    <ConversationContext.Provider value={{ state, dispatch, activeConversation }}>
      {children}
    </ConversationContext.Provider>
  );
}

export function useConversations() {
  const ctx = useContext(ConversationContext);
  if (!ctx) throw new Error('useConversations must be within ConversationProvider');
  return ctx;
}
