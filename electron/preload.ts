import { ipcRenderer, contextBridge } from 'electron';

const listenerMap = new Map<Function, Function>();

contextBridge.exposeInMainWorld('ipcRenderer', {
  on(channel: string, listener: (...args: any[]) => void) {
    const wrapped = (_event: Electron.IpcRendererEvent, ...args: any[]) => listener(_event, ...args);
    listenerMap.set(listener, wrapped);
    ipcRenderer.on(channel, wrapped);
  },
  off(channel: string, listener: (...args: any[]) => void) {
    const wrapped = listenerMap.get(listener);
    if (wrapped) {
      ipcRenderer.off(channel, wrapped as any);
      listenerMap.delete(listener);
    }
  },
  send(channel: string, ...args: any[]) {
    ipcRenderer.send(channel, ...args);
  },
  invoke(channel: string, ...args: any[]) {
    return ipcRenderer.invoke(channel, ...args);
  },
});
