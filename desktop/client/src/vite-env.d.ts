/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPPORT_CONTACT_URL?: string;
  readonly VITE_SUPPORT_QR_IMAGE_URL?: string;
}

// Bridge exposed by electron/preload.ts via contextBridge. Present only when
// running inside the Electron app (undefined in a plain browser / dev page).
interface StoreViewBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ElectronAPI {
  platform: string;
  isPackaged: boolean;
  storeView?: {
    create: (storeId: string) => Promise<boolean>;
    setBounds: (storeId: string, rect: StoreViewBounds) => Promise<boolean>;
    show: (storeId: string) => Promise<boolean>;
    hide: (storeId: string) => Promise<boolean>;
    close: (storeId: string) => Promise<boolean>;
  };
}

interface Window {
  electronAPI?: ElectronAPI;
}

