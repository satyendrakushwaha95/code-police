import { app, BrowserWindow, ipcMain, dialog, globalShortcut } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import { VectorDBService } from './services/vectordb';
import { OllamaEmbeddingsService } from './services/embeddings';
import { chunkFileContent } from './services/chunker';
import { registerToolHandlers } from './services/tools';
import { AgentMemoryService } from './services/memory';
import { getRoutingConfigStore, RoutingConfig, TaskCategory } from './services/routing-config';
import { getModelRouter, RoutingDecision } from './services/model-router';
import { getPipelineStateStore } from './services/pipeline-state';
import { getPipelineOrchestrator } from './services/pipeline-orchestrator';
import { PipelineOptions, PipelineStage } from './services/pipeline-types';
import { getAgentManager } from './services/agent-manager';
import { CreateAgentInput, UpdateAgentInput, AGENT_PRESETS } from './services/agent-types';
import { getProviderRegistry } from './services/providers/provider-registry';
import { ProviderConfig, PROVIDER_PRESETS } from './services/providers/provider-types';
import { getUsageTracker } from './services/usage-tracker';
import { getLongTermMemory } from './services/long-term-memory';

process.env.APP_ROOT = path.join(__dirname, '..');

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron');
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist');

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST;

let win: BrowserWindow | null;
let vectorDB: VectorDBService | null = null;
let embeddingsService = new OllamaEmbeddingsService();
let dbService: AgentMemoryService | null = null;

function createWindow() {
  win = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC || '', 'electron-vite.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    width: 1400,
    height: 900,
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: -100, y: -100 },
  });

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'));
  }
}

app.on('window-all-closed', () => {
  globalShortcut.unregisterAll();
  if (process.platform !== 'darwin') {
    app.quit();
    win = null;
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.whenReady().then(async () => {
  try {
    const userDataPath = app.getPath('userData');
    vectorDB = new VectorDBService(userDataPath);
    await vectorDB.initialize();
    dbService = new AgentMemoryService(userDataPath);
    registerToolHandlers(dbService);
    
    const routingConfigStore = getRoutingConfigStore();
    const modelRouter = getModelRouter();
    if (dbService) {
      modelRouter.setMemoryService(dbService);
    }
    
    routingConfigStore.watchFile(() => {
      console.log('[Main] Routing config changed, notifying renderer');
      if (win && !win.isDestroyed()) {
        win.webContents.send('router:configChanged');
      }
    });

    const agentManager = getAgentManager();
    agentManager.initialize();

    const providerRegistry = getProviderRegistry();
    console.log('[Main] Provider registry initialized with', providerRegistry.getEnabledProviderIds().length, 'providers');

    getUsageTracker(userDataPath);
    console.log('[Main] Usage tracker initialized');

    getLongTermMemory(userDataPath);
    console.log('[Main] Long-term memory initialized');
  } catch (err) {
    console.error('Failed to init services:', err);
    registerToolHandlers();
  }
  createWindow();

  // Global hotkey: Ctrl+Space brings the app to front and opens command palette
  globalShortcut.register('CommandOrControl+Space', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
      win.webContents.send('jarvis:summon');
    }
  });
});

// Helper to recursively scan directory
async function scanDirectory(dirPath: string, parentPath: string, depth = 0): Promise<any[]> {
  const IGNORED_DIRS = new Set([
    'node_modules', '.git', '.next', 'dist', 'build', 'coverage', '.svelte-kit', '.cache'
  ]);

  if (depth > 5) return [];

  const files: any[] = [];
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.posix.join(parentPath, entry.name);
      const absolutePath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) {
          const children = await scanDirectory(absolutePath, fullPath, depth + 1);
          files.push(...children);
        }
      } else if (entry.isFile()) {
        files.push({
          name: entry.name,
          path: fullPath,
          absolutePath: absolutePath
        });
      }
    }
  } catch (err) {
    console.error(`Error scanning directory ${dirPath}:`, err);
  }
  return files;
}

// IPC Handlers for File System Access
ipcMain.handle('dialog:openDirectory', async () => {
  if (!win) return null;
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    properties: ['openDirectory']
  });
  
  if (canceled || filePaths.length === 0) {
    return null;
  }

  const rootPath = filePaths[0];
  const folderName = path.basename(rootPath);
  
  const filesIndex = await scanDirectory(rootPath, folderName);
  
  return {
    rootPath,
    folderName,
    filesIndex
  };
});

// Example IPC handler for future RAG / Node functionality
ipcMain.handle('ping', () => 'pong');

// Window control handlers
ipcMain.on('window:minimize', () => {
  if (win) win.minimize();
});

ipcMain.on('window:maximize', () => {
  if (win) {
    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }
  }
});

ipcMain.on('window:close', () => {
  if (win) win.close();
});

// IPC Handler to read file content natively
ipcMain.handle('fs:readFile', async (_, filePath: string) => {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return content;
  } catch (err) {
    console.error(`Failed to read file ${filePath}:`, err);
    throw err;
  }
});

// IPC Handler to Index the Repository into LanceDB
ipcMain.handle('fs:indexRepository', async (_, model: string, filesIndex: any[]) => {
  if (!vectorDB) throw new Error('VectorDB not initialized');
  let indexedCount = 0;

  try {
    // 1. Clear old data from this root (simplification: we could just clear all for now, or match by path prefix)
    // For MVP, if they click index, we just want to clear and re-index
    // But since we don't have a clear "delete all" quickly in this setup, let's just index on top, or implement clear later.

    // 2. Process files
    for (const file of filesIndex) {
      if (!file.absolutePath) continue;
      
      try {
        const content = await fs.readFile(file.absolutePath, 'utf-8');
        const chunks = chunkFileContent(content);
        
        // Remove old chunks for this file
        await vectorDB.deleteByFilePath(file.path);

        const chunkRecords: Array<{
          filePath: string;
          relativeFilePath: string;
          content: string;
          startLine: number;
          endLine: number;
          vector: number[];
        }> = [];
        for (const chunk of chunks) {
          try {
            const vector = await embeddingsService.generateEmbedding(model, chunk.content);
            
            chunkRecords.push({
              filePath: file.absolutePath,
              relativeFilePath: file.path,
              content: chunk.content,
              startLine: chunk.startLine,
              endLine: chunk.endLine,
              vector
            });
          } catch (embedErr) {
            console.error(`Failed to embed chunk in ${file.path}:`, embedErr);
          }
        }

        if (chunkRecords.length > 0) {
          await vectorDB.insertChunks(chunkRecords);
          indexedCount++;
        }
      } catch (fileErr) {
         console.error(`Failed to read/index file ${file.path}:`, fileErr);
      }
    }
    
    return { success: true, indexedCount };
  } catch (err) {
    console.error('Failed to index repository:', err);
    throw err;
  }
});

// IPC Handler to Search The codebase
ipcMain.handle('fs:searchRepository', async (_, model: string, query: string, limit: number = 5) => {
  if (!vectorDB) throw new Error('VectorDB not initialized');
  
  try {
    const queryVector = await embeddingsService.generateEmbedding(model, query);
    const results = await vectorDB.searchSimilar(queryVector, limit);
    return results;
  } catch (err) {
    console.error('Search failed:', err);
    throw err;
  }
});

// IPC Handlers for SQLite Database (Sessions + Audit)
ipcMain.handle('db:loadState', async () => {
  if (!dbService) return null;
  
  const { conversations, messages, attachments } = dbService.getFullState();
  
  return {
    conversations,
    messages,
    attachments,
  };
});

ipcMain.handle('db:saveConversation', async (_, conv: any) => {
  if (!dbService) return;
  dbService.saveConversation(conv);
});

ipcMain.handle('db:saveMessage', async (_, msg: any) => {
  if (!dbService) return;
  dbService.saveMessage({
    ...msg,
    isStreaming: msg.isStreaming ? 1 : 0,
  });
});

ipcMain.handle('db:deleteConversation', async (_, id: string) => {
  if (!dbService) return;
  dbService.deleteConversation(id);
});

ipcMain.handle('db:deleteMessage', async (_, id: string) => {
  if (!dbService) return;
  dbService.deleteMessage(id);
});

ipcMain.handle('db:deleteMessagesAfter', async (_, conversationId: string, timestamp: number) => {
  if (!dbService) return;
  dbService.deleteMessagesAfter(conversationId, timestamp);
});

ipcMain.handle('db:saveAttachment', async (_, att: any) => {
  if (!dbService) return;
  dbService.saveAttachment(att);
});

// Audit Log Handlers
ipcMain.handle('db:addAuditLog', async (_, entry: { action: string; toolName?: string; parameters?: string; result?: string; userConfirmed: boolean }) => {
  if (!dbService) return;
  dbService.addAuditLog({
    ...entry,
    timestamp: Date.now(),
  });
});

ipcMain.handle('db:getAuditLogs', async (_, limit?: number) => {
  if (!dbService) return [];
  return dbService.getAuditLogs(limit);
});

// Confirmation Prompt Handler
ipcMain.handle('dialog:confirmAction', async (_, options: { title: string; message: string; detail?: string }) => {
  if (!win) return false;
  
  const { response } = await dialog.showMessageBox(win, {
    type: 'warning',
    buttons: ['Cancel', 'Confirm'],
    defaultId: 0,
    cancelId: 0,
    title: options.title,
    message: options.message,
    detail: options.detail,
  });
  
  return response === 1;
});

// IPC Handlers for Model Routing
ipcMain.handle('router:getConfig', () => {
  const configStore = getRoutingConfigStore();
  return configStore.get();
});

ipcMain.handle('router:setConfig', (_, { config }: { config: RoutingConfig }) => {
  const configStore = getRoutingConfigStore();
  const errors: string[] = [];
  
  if (!configStore.validateSchema(config)) {
    return { success: false, errors: ['Invalid config schema'] };
  }
  
  try {
    configStore.save(config);
    return { success: true, errors: [] };
  } catch (err: any) {
    return { success: false, errors: [err.message] };
  }
});

ipcMain.handle('router:getAvailableModels', async () => {
  const router = getModelRouter();
  return router.getAvailableModels();
});

ipcMain.handle('router:validateModel', async (_, { model }: { model: string }) => {
  const router = getModelRouter();
  const available = await router.validate(model);
  return { available };
});

// IPC Handler for Chat with Model Routing
ipcMain.handle('ollama:chat', async (_, payload: {
  messages: Array<{ role: string; content: string }>;
  options?: { temperature?: number; top_p?: number; num_ctx?: number };
  taskCategory?: TaskCategory;
}) => {
  const { messages, options, taskCategory } = payload;
  const category: TaskCategory = taskCategory || 'chat_general';
  
  const router = getModelRouter();
  let decision: RoutingDecision;
  
  try {
    decision = await router.resolve(category);
  } catch (err) {
    decision = router.fallback();
  }
  
  return {
    resolvedModel: decision.resolvedModel,
    providerId: decision.providerId,
    category: decision.category,
    usedFallback: decision.usedFallback,
    messages,
    options
  };
});

// IPC Handler for Ollama listModels
ipcMain.handle('ollama:listModels', async () => {
  try {
    const response = await fetch('http://localhost:11434/api/tags');
    if (!response.ok) {
      return { models: [] };
    }
    const data = await response.json();
    return {
      models: (data.models || []).map((m: { name: string; size?: number; modified_at?: string }) => ({
        name: m.name,
        size: m.size || 0,
        modified_at: m.modified_at || new Date().toISOString()
      }))
    };
  } catch (err) {
    console.error('[Main] Failed to list models:', err);
    return { models: [] };
  }
});

// IPC Handler for Ollama connection check
ipcMain.handle('ollama:checkConnection', async () => {
  try {
    const response = await fetch('http://localhost:11434/api/tags', { 
      method: 'HEAD',
      signal: AbortSignal.timeout(5000)
    });
    return response.ok;
  } catch (err) {
    console.error('[Main] Ollama connection check failed:', err);
    return false;
  }
});

// Pipeline IPC Handlers
ipcMain.handle('pipeline:run', async (_, payload: {
  task: string;
  options: PipelineOptions;
  projectRoot?: string;
  runId?: string;
  agentId?: string;
}) => {
  const { task, options, projectRoot, runId, agentId } = payload;
  try {
    console.log('[Pipeline] Starting pipeline run:', task, agentId ? `with agent ${agentId}` : '');
    
    const stateStore = getPipelineStateStore();
    console.log('[Pipeline] State store initialized');
    
    const orchestrator = getPipelineOrchestrator(stateStore, vectorDB || undefined);
    console.log('[Pipeline] Orchestrator initialized');
    
    if (projectRoot) {
      orchestrator.setProjectRoot(projectRoot);
    }
    
    if (agentId) {
      orchestrator.setActiveAgent(agentId);
    }
    
    const result = await orchestrator.run(task, options, undefined, runId);
    console.log('[Pipeline] Run completed:', result.runId);
    return result;
  } catch (err) {
    console.error('[Pipeline] Error during run:', err);
    throw err;
  }
});

ipcMain.handle('pipeline:cancel', async (_, { runId }: { runId: string }) => {
  const orchestrator = getPipelineOrchestrator();
  orchestrator.cancel(runId);
  return { ok: true };
});

ipcMain.handle('pipeline:getHistory', async () => {
  const stateStore = getPipelineStateStore();
  return stateStore.getRunHistory();
});

ipcMain.handle('pipeline:getRun', async (_, { runId }: { runId: string }) => {
  const stateStore = getPipelineStateStore();
  return stateStore.getRun(runId);
});

ipcMain.handle('pipeline:deleteRun', async (_, { runId }: { runId: string }) => {
  const stateStore = getPipelineStateStore();
  await stateStore.deleteRun(runId);
  return { success: true };
});

ipcMain.handle('pipeline:getStageOutput', async (_, { runId, stage }: { runId: string; stage: PipelineStage }) => {
  const stateStore = getPipelineStateStore();
  return stateStore.getStageOutput(runId, stage);
});

ipcMain.handle('pipeline:retryFix', async (_, { runId, suggestions }: { runId: string; suggestions: string[] }) => {
  const stateStore = getPipelineStateStore();
  const orchestrator = getPipelineOrchestrator(stateStore, vectorDB || undefined);
  
  const result = await orchestrator.retryFix(runId, suggestions);
  return result;
});

ipcMain.handle('pipeline:analyzeAndRetry', async (_, { runId, userPrompt }: { runId: string; userPrompt: string }) => {
  const stateStore = getPipelineStateStore();
  const orchestrator = getPipelineOrchestrator(stateStore, vectorDB || undefined);
  
  const result = await orchestrator.analyzeAndRetry(runId, userPrompt);
  return result;
});

// Routing Config IPC Handlers
ipcMain.handle('routing:getConfig', async () => {
  const routingConfigStore = getRoutingConfigStore();
  return routingConfigStore.get();
});

ipcMain.handle('routing:updateConfig', async (_, updates: Partial<RoutingConfig>) => {
  const routingConfigStore = getRoutingConfigStore();
  const current = routingConfigStore.get();
  const updated = { ...current, ...updates };
  routingConfigStore.save(updated);
  return { success: true };
});

// Agent Management IPC Handlers
ipcMain.handle('agent:list', async () => {
  const agentManager = getAgentManager();
  return agentManager.getAll();
});

ipcMain.handle('agent:get', async (_, id: string) => {
  const agentManager = getAgentManager();
  return agentManager.getById(id);
});

ipcMain.handle('agent:create', async (_, input: CreateAgentInput) => {
  const agentManager = getAgentManager();
  return agentManager.create(input);
});

ipcMain.handle('agent:update', async (_, id: string, input: UpdateAgentInput) => {
  const agentManager = getAgentManager();
  return agentManager.update(id, input);
});

ipcMain.handle('agent:delete', async (_, id: string) => {
  const agentManager = getAgentManager();
  return agentManager.delete(id);
});

ipcMain.handle('agent:clone', async (_, id: string, newName: string) => {
  const agentManager = getAgentManager();
  return agentManager.clone(id, newName);
});

ipcMain.handle('agent:getPresets', async () => {
  return AGENT_PRESETS;
});

ipcMain.handle('agent:export', async (_, id: string) => {
  const agentManager = getAgentManager();
  return agentManager.export(id);
});

ipcMain.handle('agent:import', async (_, json: string) => {
  const agentManager = getAgentManager();
  return agentManager.import(json);
});

ipcMain.handle('agent:setActive', async (_, id: string | null) => {
  const agentManager = getAgentManager();
  agentManager.setActive(id);
  return { success: true };
});

ipcMain.handle('agent:getActive', async () => {
  const agentManager = getAgentManager();
  return agentManager.getActive();
});

// ─── Provider Management IPC Handlers ────────────────────────────────────────

ipcMain.handle('provider:list', async () => {
  const registry = getProviderRegistry();
  return registry.getMaskedConfigs();
});

ipcMain.handle('provider:add', async (_, config: ProviderConfig) => {
  try {
    const registry = getProviderRegistry();
    const saved = registry.addProvider(config);
    return { success: true, provider: { ...saved, apiKey: saved.apiKey ? '••••••••' : null } };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('provider:update', async (_, { id, updates }: { id: string; updates: Partial<ProviderConfig> }) => {
  try {
    const registry = getProviderRegistry();
    const updated = registry.updateProvider(id, updates);
    return { success: true, provider: { ...updated, apiKey: updated.apiKey ? '••••••••' : null } };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('provider:remove', async (_, { id }: { id: string }) => {
  try {
    const registry = getProviderRegistry();
    registry.removeProvider(id);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('provider:test', async (_, { id }: { id: string }) => {
  const registry = getProviderRegistry();
  const ok = await registry.checkConnection(id);
  return { connected: ok };
});

ipcMain.handle('provider:listModels', async (_, { id }: { id: string }) => {
  const registry = getProviderRegistry();
  return registry.listModels(id);
});

ipcMain.handle('provider:listAllModels', async () => {
  const registry = getProviderRegistry();
  return registry.listAllModels();
});

ipcMain.handle('provider:getPresets', async () => {
  return PROVIDER_PRESETS;
});

// ─── Chat Streaming via IPC ──────────────────────────────────────────────────

const activeStreams = new Map<string, AbortController>();

ipcMain.handle('chat:stream', async (_, payload: {
  streamId: string;
  providerId: string;
  model: string;
  messages: Array<{ role: string; content: string }>;
  options?: { temperature?: number; top_p?: number; max_tokens?: number; num_ctx?: number };
  messageId?: string;
  conversationId?: string;
}) => {
  const { streamId, providerId, model, messages, options, messageId, conversationId } = payload;
  const abortController = new AbortController();
  activeStreams.set(streamId, abortController);

  const registry = getProviderRegistry();
  const startTime = Date.now();

  (async () => {
    try {
      for await (const chunk of registry.chatStream(
        providerId,
        model,
        messages.map(m => ({ role: m.role as 'system' | 'user' | 'assistant', content: m.content })),
        options,
        abortController.signal
      )) {
        const windows = BrowserWindow.getAllWindows();
        for (const w of windows) {
          if (!w.isDestroyed()) {
            w.webContents.send('chat:chunk', {
              streamId,
              content: chunk.content,
              done: chunk.done,
              model: chunk.model,
              usage: chunk.usage,
            });
          }
        }

        if (chunk.done && chunk.usage && messageId && conversationId) {
          try {
            const tracker = getUsageTracker();
            tracker.record({
              messageId,
              conversationId,
              providerId,
              model,
              promptTokens: chunk.usage.prompt_tokens,
              completionTokens: chunk.usage.completion_tokens,
              totalTokens: chunk.usage.total_tokens,
              durationMs: Date.now() - startTime,
              timestamp: Date.now(),
            });
          } catch (err) {
            console.warn('[Main] Failed to record usage:', err);
          }
        }
        if (chunk.done) break;
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      const windows = BrowserWindow.getAllWindows();
      for (const w of windows) {
        if (!w.isDestroyed()) {
          w.webContents.send('chat:error', { streamId, error: err.message || String(err) });
        }
      }
    } finally {
      activeStreams.delete(streamId);
    }
  })();

  return { streamId };
});

ipcMain.handle('chat:complete', async (_, payload: {
  providerId: string;
  model: string;
  messages: Array<{ role: string; content: string }>;
  options?: { temperature?: number; top_p?: number; max_tokens?: number; num_ctx?: number };
  feature?: string;
}) => {
  const { providerId, model, messages, options, feature } = payload;
  const registry = getProviderRegistry();
  const startTime = Date.now();

  let fullContent = '';
  let usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | undefined;

  try {
    for await (const chunk of registry.chatStream(
      providerId,
      model,
      messages.map(m => ({ role: m.role as 'system' | 'user' | 'assistant', content: m.content })),
      options
    )) {
      if (chunk.content) fullContent += chunk.content;
      if (chunk.done && chunk.usage) usage = chunk.usage;
    }

    const durationMs = Date.now() - startTime;

    if (usage) {
      try {
        const tracker = getUsageTracker();
        tracker.record({
          messageId: `${feature || 'tool'}:${Date.now()}`,
          conversationId: `${feature || 'tool'}:session`,
          providerId,
          model,
          promptTokens: usage.prompt_tokens,
          completionTokens: usage.completion_tokens,
          totalTokens: usage.total_tokens,
          durationMs,
          timestamp: Date.now(),
        });
      } catch (err) {
        console.warn('[Main] Failed to record usage for chat:complete:', err);
      }
    }

    return { content: fullContent, model, usage, durationMs };
  } catch (err: any) {
    throw new Error(err.message || String(err));
  }
});

ipcMain.on('chat:abort', (_, streamId: string) => {
  const controller = activeStreams.get(streamId);
  if (controller) {
    controller.abort();
    activeStreams.delete(streamId);
  }
});

// ─── Multi-Model Comparison Streaming ────────────────────────────────────────

ipcMain.handle('compare:stream', async (_, payload: {
  comparisonId: string;
  models: Array<{ providerId: string; model: string }>;
  messages: Array<{ role: string; content: string }>;
  options?: { temperature?: number; top_p?: number; max_tokens?: number };
}) => {
  const { comparisonId, models, messages, options } = payload;
  const registry = getProviderRegistry();
  const controllers: AbortController[] = [];

  for (const entry of models) {
    const controller = new AbortController();
    controllers.push(controller);
    const streamKey = `${comparisonId}:${entry.providerId}:${entry.model}`;
    activeStreams.set(streamKey, controller);

    // Each model streams independently in parallel
    (async () => {
      const startTime = Date.now();
      try {
        for await (const chunk of registry.chatStream(
          entry.providerId,
          entry.model,
          messages.map(m => ({ role: m.role as 'system' | 'user' | 'assistant', content: m.content })),
          options,
          controller.signal
        )) {
          const windows = BrowserWindow.getAllWindows();
          for (const w of windows) {
            if (!w.isDestroyed()) {
              w.webContents.send('compare:chunk', {
                comparisonId,
                providerId: entry.providerId,
                model: entry.model,
                content: chunk.content,
                done: chunk.done,
                usage: chunk.usage,
                durationMs: Date.now() - startTime,
              });
            }
          }
          if (chunk.done) break;
        }
      } catch (err: any) {
        if (err.name === 'AbortError') return;
        const windows = BrowserWindow.getAllWindows();
        for (const w of windows) {
          if (!w.isDestroyed()) {
            w.webContents.send('compare:error', {
              comparisonId,
              providerId: entry.providerId,
              model: entry.model,
              error: err.message || String(err),
            });
          }
        }
      } finally {
        activeStreams.delete(streamKey);
      }
    })();
  }

  return { comparisonId, modelCount: models.length };
});

ipcMain.on('compare:abort', (_, comparisonId: string) => {
  for (const [key, controller] of activeStreams.entries()) {
    if (key.startsWith(`${comparisonId}:`)) {
      controller.abort();
      activeStreams.delete(key);
    }
  }
});

// ─── Usage Tracking IPC Handlers ─────────────────────────────────────────────

ipcMain.handle('usage:getSummary', async (_, { from, to }: { from?: number; to?: number }) => {
  const tracker = getUsageTracker();
  return tracker.getSummary(from, to);
});

ipcMain.handle('usage:getByModel', async (_, { from, to }: { from?: number; to?: number }) => {
  const tracker = getUsageTracker();
  return tracker.getByModel(from, to);
});

ipcMain.handle('usage:getByDay', async (_, { days }: { days?: number }) => {
  const tracker = getUsageTracker();
  return tracker.getByDay(days);
});

ipcMain.handle('usage:getByMessage', async (_, { messageId }: { messageId: string }) => {
  const tracker = getUsageTracker();
  return tracker.getByMessage(messageId);
});

ipcMain.handle('usage:getRecent', async (_, { limit }: { limit?: number }) => {
  const tracker = getUsageTracker();
  return tracker.getRecentUsage(limit);
});

ipcMain.handle('usage:getPricing', async () => {
  const tracker = getUsageTracker();
  return {
    builtin: tracker.getBuiltinPricing(),
    custom: tracker.getCustomPricing(),
  };
});

ipcMain.handle('usage:setCustomPricing', async (_, pricing: { providerId: string; model: string; inputPricePerMToken: number; outputPricePerMToken: number }) => {
  const tracker = getUsageTracker();
  tracker.setCustomPricing(pricing);
  return { success: true };
});

// ─── Long-Term Memory IPC Handlers ───────────────────────────────────────────

ipcMain.handle('memory:add', async (_, fact: { category: string; content: string; source?: string; confidence?: number; importance?: number }) => {
  const memory = getLongTermMemory();
  return memory.addFact({
    category: fact.category as any,
    content: fact.content,
    source: fact.source || 'user',
    confidence: fact.confidence || 1.0,
    importance: fact.importance || 1.0,
    createdAt: Date.now(),
  });
});

ipcMain.handle('memory:recall', async (_, { query, limit }: { query: string; limit?: number }) => {
  const memory = getLongTermMemory();
  return memory.recall(query, limit);
});

ipcMain.handle('memory:getAll', async () => {
  const memory = getLongTermMemory();
  return memory.getAll();
});

ipcMain.handle('memory:getByCategory', async (_, { category }: { category: string }) => {
  const memory = getLongTermMemory();
  return memory.getByCategory(category);
});

ipcMain.handle('memory:delete', async (_, { id }: { id: number }) => {
  const memory = getLongTermMemory();
  memory.deleteFact(id);
  return { success: true };
});

ipcMain.handle('memory:update', async (_, { id, updates }: { id: number; updates: { content?: string; category?: string; importance?: number } }) => {
  const memory = getLongTermMemory();
  memory.updateFact(id, updates);
  return { success: true };
});

ipcMain.handle('memory:getCount', async () => {
  const memory = getLongTermMemory();
  return memory.getCount();
});

ipcMain.handle('memory:buildContext', async (_, { query }: { query: string }) => {
  const memory = getLongTermMemory();
  const facts = await memory.recall(query, 8);
  const personalityPrompt = memory.buildPersonalityPrompt();
  const memoryBlock = memory.buildContextBlock(facts);
  return personalityPrompt + memoryBlock;
});

ipcMain.handle('memory:applyDecay', async () => {
  const memory = getLongTermMemory();
  return memory.applyDecay();
});

ipcMain.handle('memory:export', async () => {
  const memory = getLongTermMemory();
  return memory.exportAll();
});

ipcMain.handle('memory:import', async (_, { json }: { json: string }) => {
  const memory = getLongTermMemory();
  return memory.importData(json);
});

ipcMain.handle('memory:getExtractionPrompt', async (_, { conversationText }: { conversationText: string }) => {
  const memory = getLongTermMemory();
  return memory.getExtractionPrompt(conversationText);
});

// ─── User Profile & Personality IPC ──────────────────────────────────────────

ipcMain.handle('profile:get', async () => {
  const memory = getLongTermMemory();
  return memory.getProfile();
});

ipcMain.handle('profile:update', async (_, updates: Record<string, any>) => {
  const memory = getLongTermMemory();
  memory.updateProfile(updates);
  return { success: true };
});

ipcMain.handle('profile:getPersonalityModes', async () => {
  const memory = getLongTermMemory();
  return memory.getPersonalityModes();
});

ipcMain.handle('profile:getPersonalityPrompt', async () => {
  const memory = getLongTermMemory();
  return memory.buildPersonalityPrompt();
});
