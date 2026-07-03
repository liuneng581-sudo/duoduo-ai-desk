import { contextBridge, ipcRenderer } from 'electron';

// Diagnostic: prove the preload actually loads. ipcRenderer.send is available
// even in a sandboxed preload; main logs it to duoduo-server.log.
try { ipcRenderer.send('preload:loaded'); } catch { /* ignore */ }

// NOTE: this preload runs sandboxed, so `require('electron').app` is UNDEFINED
// here — touching `.isPackaged` on it throws and aborts the WHOLE preload, which
// left window.electronAPI undefined (the embedded store view then never got
// created → white screen). Get isPackaged via a sync IPC instead of `app`.
let isPackaged = false;
try { isPackaged = ipcRenderer.sendSync('app:is-packaged') === true; } catch { /* leave false */ }

// Expose safe APIs to renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  isPackaged,

  // Embedded store browser view control. StoreDetailPage uses these to host the
  // PDD session inside the app window (instead of a separate Chromium window):
  // create the view, keep it positioned over the page's container, show/hide on
  // navigation, and tear it down.
  storeView: {
    create: (storeId: string) => ipcRenderer.invoke('store-view:create', storeId),
    setBounds: (storeId: string, rect: { x: number; y: number; width: number; height: number }) =>
      ipcRenderer.invoke('store-view:set-bounds', storeId, rect),
    show: (storeId: string) => ipcRenderer.invoke('store-view:show', storeId),
    hide: (storeId: string) => ipcRenderer.invoke('store-view:hide', storeId),
    close: (storeId: string) => ipcRenderer.invoke('store-view:close', storeId),
  },
});


