import { useEffect, useCallback } from 'react';

interface KeyboardShortcuts {
  onNewChat: () => void;
  onToggleSidebar: () => void;
  onToggleFilePanel: () => void;
  onOpenSettings: () => void;
  onFocusInput: () => void;
  onShowShortcuts: () => void;
  onSemanticSearch?: () => void;
  onToggleTerminal?: () => void;
}

export function useKeyboardShortcuts(shortcuts: KeyboardShortcuts) {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const ctrl = e.ctrlKey || e.metaKey;
    const shift = e.shiftKey;

    // Don't capture when typing in inputs (unless it's a global shortcut)
    const target = e.target as HTMLElement;
    const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT';

    // Ctrl+Shift+N — New Chat
    if (ctrl && shift && e.key === 'N') {
      e.preventDefault();
      shortcuts.onNewChat();
      return;
    }

    // Ctrl+B — Toggle Sidebar
    if (ctrl && e.key === 'b') {
      e.preventDefault();
      shortcuts.onToggleSidebar();
      return;
    }

    // Ctrl+E — Toggle File Panel
    if (ctrl && e.key === 'e') {
      e.preventDefault();
      shortcuts.onToggleFilePanel();
      return;
    }

    // Ctrl+Shift+F — Semantic Search
    if (ctrl && shift && e.key === 'F') {
      e.preventDefault();
      shortcuts.onSemanticSearch?.();
      return;
    }

    // Ctrl+Shift+T — Toggle Terminal
    if (ctrl && shift && e.key === 'T') {
      e.preventDefault();
      shortcuts.onToggleTerminal?.();
      return;
    }

    // Ctrl+, — Open Settings
    if (ctrl && e.key === ',') {
      e.preventDefault();
      shortcuts.onOpenSettings();
      return;
    }

    // Ctrl+/ — Show Shortcuts
    if (ctrl && e.key === '/') {
      e.preventDefault();
      shortcuts.onShowShortcuts();
      return;
    }

    // / — Focus input (only when not in an input)
    if (e.key === '/' && !isInput) {
      e.preventDefault();
      shortcuts.onFocusInput();
      return;
    }

    // Escape — Close modals/panels (handled by individual components)
  }, [shortcuts]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}

export const SHORTCUTS_LIST = [
  { group: 'General', items: [
    { keys: ['Ctrl', 'Shift', 'N'], desc: 'New Chat' },
    { keys: ['Ctrl', ','], desc: 'Open Settings' },
    { keys: ['Ctrl', '/'], desc: 'Show Shortcuts' },
    { keys: ['/'], desc: 'Focus chat input' },
    { keys: ['Esc'], desc: 'Close modal/panel' },
  ]},
  { group: 'Layout', items: [
    { keys: ['Ctrl', 'B'], desc: 'Toggle Sidebar' },
    { keys: ['Ctrl', 'E'], desc: 'Toggle File Panel' },
  ]},
  { group: 'Chat', items: [
    { keys: ['Enter'], desc: 'Send message' },
    { keys: ['Shift', 'Enter'], desc: 'New line' },
  ]},
  { group: 'Search', items: [
    { keys: ['Ctrl', 'Shift', 'F'], desc: 'Semantic Code Search' },
  ]},
  { group: 'Terminal', items: [
    { keys: ['Ctrl', 'Shift', 'T'], desc: 'Toggle Terminal' },
  ]},
];
