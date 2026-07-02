"use strict";
/**
 * 多多AI客服 — Electron Main Process
 *
 * Responsibilities:
 * 1. Start Express server (port 3001)
 * 2. Create BrowserWindow loading React frontend
 * 3. Spawn companion process and manage its lifecycle
 * 4. Handle app quit / minimize to tray
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const child_process_1 = require("child_process");
const path = __importStar(require("path"));
const http = __importStar(require("http"));
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const crypto = __importStar(require("crypto"));
// Auto-update (electron-updater + generic source on pdd.fxisv.com/downloads).
// Required lazily inside setupAutoUpdater so a dev run without the dep installed
// still launches.
let autoUpdater = null;
// ── Embedded store browser (CDP bridge) ──
// The companion drives the store's PDD session via Playwright connectOverCDP
// against THIS app's Chromium, rendering into an in-app WebContentsView instead
// of a separate OS Chromium window. That requires a remote-debugging port, which
// must be set BEFORE app 'ready'.
//
// Threat model (reviewed, accepted): bind to loopback only + randomize the port.
// - Remote attacks: immune. Loopback bind rejects off-host connections, and
//   Electron 42 (Chromium ~140) enforces a Host-header check on the DevTools
//   /json endpoint, so DNS-rebinding from a web page can't reach it either.
// - Same-host attacks: CDP has no token auth (Chromium design — remote-debugging
//   has no key). A malicious LOCAL process could scan 9000-9999 and attach. But
//   such a process already has local code execution, so it could read this app's
//   userData (cookies / login state) directly — CDP adds no meaningful increment.
// Pipe transport (--remote-debugging-pipe) would close the port entirely but
// Playwright's connectOverCDP only accepts http/ws endpoints, not pipes.
// Decision: accepted as-is. This is a local desktop app; the only network-facing
// surfaces are the PDD requests and the API, not this loopback debug port.
const CDP_PORT = 9000 + Math.floor(Math.random() * 1000);
electron_1.app.commandLine.appendSwitch('remote-debugging-port', String(CDP_PORT));
electron_1.app.commandLine.appendSwitch('remote-debugging-address', '127.0.0.1');
// ── Paths ──
const isPackaged = electron_1.app.isPackaged;
const ROOT_DIR = isPackaged ? path.join(process.resourcesPath, '..') : path.join(__dirname, '..');
// In production, server is in extraResources (on filesystem, not in ASAR)
const RESOURCES_DIR = isPackaged ? process.resourcesPath : ROOT_DIR;
const SERVER_DIR = isPackaged ? path.join(RESOURCES_DIR, 'server') : path.join(ROOT_DIR, 'server');
// client/dist and companion are in extraResources (on filesystem in production)
const CLIENT_DIST_DIR = isPackaged ? path.join(RESOURCES_DIR, 'client', 'dist') : path.join(ROOT_DIR, 'client', 'dist');
const CLIENT_DIST = path.join(CLIENT_DIST_DIR, 'index.html');
// Log file for debugging. Write under userData (always writable) rather than
// next to the exe — a Program Files install dir is read-only for standard users,
// which would silently drop logs AND make the startup-error screen point at a
// file that was never written. Fall back to ROOT_DIR if userData isn't resolvable.
const LOG_FILE = (() => {
    try {
        const dir = electron_1.app.getPath('userData');
        fs.mkdirSync(dir, { recursive: true });
        return path.join(dir, 'duoduo-server.log');
    }
    catch {
        return path.join(ROOT_DIR, 'duoduo-server.log');
    }
})();
const LOG_MAX_BYTES = 5 * 1024 * 1024; // 5MB — rotate to .old beyond this to bound disk + limit PII retention
let serverLogLines = [];
function logToFile(msg) {
    const line = `[${new Date().toISOString()}] ${msg}`;
    serverLogLines.push(line);
    try {
        // Rotate when the log grows past the cap: keep one .old generation, start fresh.
        try {
            const st = fs.statSync(LOG_FILE);
            if (st.size > LOG_MAX_BYTES) {
                fs.renameSync(LOG_FILE, LOG_FILE + '.old');
            }
        }
        catch { }
        fs.appendFileSync(LOG_FILE, line + '\n');
    }
    catch { }
    console.log(msg);
}
function toFileUrl(filePath) {
    return `file:${filePath.replace(/\\/g, '/')}`;
}
function getDatabasePath() {
    if (!isPackaged) {
        return path.join(SERVER_DIR, 'prisma', 'pdd-ai-manager.db');
    }
    const dbDir = path.join(electron_1.app.getPath('userData'), 'data');
    const dbPath = path.join(dbDir, 'pdd-ai-manager.db');
    // Ship a schema-only, EMPTY pre-migrated template (no demo admin/store — users
    // register via the app). Copying this on first run is what makes a fresh
    // install work without needing the Prisma CLI / schema-engine at runtime
    // (neither is bundled). Falls back to the legacy filename if present.
    const templateDb = fs.existsSync(path.join(SERVER_DIR, 'prisma', 'template-empty.db'))
        ? path.join(SERVER_DIR, 'prisma', 'template-empty.db')
        : path.join(SERVER_DIR, 'prisma', 'pdd-ai-manager.db');
    fs.mkdirSync(dbDir, { recursive: true });
    if (!fs.existsSync(dbPath) && fs.existsSync(templateDb)) {
        fs.copyFileSync(templateDb, dbPath);
        logToFile(`Copied database template to user data: ${dbPath} (from ${path.basename(templateDb)})`);
    }
    return dbPath;
}
function getDatabaseUrl() {
    return toFileUrl(getDatabasePath());
}
function getCompanionDataDir() {
    const dataDir = isPackaged
        ? path.join(electron_1.app.getPath('userData'), 'companion')
        : path.join(ROOT_DIR, 'companion');
    fs.mkdirSync(dataDir, { recursive: true });
    return dataDir;
}
const RUNTIME_SECRET_KEYS = [
    'JWT_ACCESS_SECRET',
    'JWT_REFRESH_SECRET',
    'API_KEY_ENCRYPTION_KEY',
    'COMPANION_WS_TOKEN',
];
let mainWindow = null;
let tray = null;
let companionProcess = null;
let serverProcess = null;
let serverStarted = false;
let runtimeSecrets = null;
const storeViews = new Map();
// Crash-rebuild tracking, kept OUTSIDE StoreView so it survives close→recreate.
// Bounds the render-process-gone rebuild loop (H1): a view that crashes on every
// load must not rebuild forever.
const viewCrashCounts = new Map();
const MAX_VIEW_REBUILDS = 5;
// ── 白屏根治(2026-07-02)──
// H1: 主窗口渲染进程崩溃/卡死次数,超上限则软重启整个 app。
let mainWindowCrashCount = 0;
const MAX_MAIN_RECOVERS = 3;
// H2: 店铺视图(常驻的 PDD 重型 SPA)长跑内存只增,周期性 reload 释放。
const STORE_VIEW_RELOAD_MS = 3 * 60 * 60 * 1000; // 每 3 小时
// 内存水位监控:兜底防"跑两天白屏"。超软阈值先 reload 隐藏的店铺视图放内存,
// 连续两次超硬阈值才软重启(避免瞬时尖峰误杀)。仅统计 Electron 自身进程
// (server/companion 是独立子进程,不计入 getAppMetrics)。
const MEM_SAMPLE_MS = 10 * 60 * 1000; // 每 10 分钟采样
const MEM_SOFT_MB = 2200;
const MEM_HARD_MB = 3600;
let memHardHits = 0;
const PDD_HOME = 'https://mms.pinduoduo.com/home/';
// A clean desktop-Chrome User-Agent. Electron's default UA contains
// "duoduo-ai-desk/1.0.0" and "Electron/<ver>" tokens, which PDD anti-bot can
// fingerprint. Rebuild it from the bundled Chromium version with the app and
// Electron tokens stripped so the view looks like ordinary Chrome on Windows.
function desktopChromeUA() {
    const chromeVer = process.versions.chrome || '120.0.0.0';
    return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVer} Safari/537.36`;
}
// Injected into every store view before page scripts run: neutralize the
// common headless/automation tells PDD may probe. Mirrors (and extends) the old
// Playwright addInitScript.
const ANTI_DETECT_JS = `
  Object.defineProperty(navigator, 'webdriver', { get: () => false });
  if (!window.chrome) { window.chrome = { runtime: {} }; }
  try {
    const orig = navigator.permissions && navigator.permissions.query;
    if (orig) navigator.permissions.query = (p) => (
      p && p.name === 'notifications'
        ? Promise.resolve({ state: Notification.permission })
        : orig.call(navigator.permissions, p)
    );
  } catch (e) {}
`;
function createStoreView(storeId) {
    if (!mainWindow)
        return;
    if (storeViews.has(storeId))
        return; // idempotent — reuse existing
    const view = new electron_1.WebContentsView({
        webPreferences: {
            // Persist login per store so a re-connect doesn't force re-login.
            partition: `persist:store-${storeId}`,
            // This view loads untrusted third-party content (PDD + its CDN/ad domains).
            // Keep it fully isolated and sandboxed from the app.
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
        },
    });
    // Look like ordinary desktop Chrome, not Electron, to PDD anti-bot.
    view.webContents.setUserAgent(desktopChromeUA());
    // Anti-detection + per-store tag. The window.__DD_STORE_ID__ tag lets the
    // companion match this exact view to its store over CDP (URL alone can't
    // disambiguate multiple views on the same PDD origin). did-start-navigation
    // alone races the document swap, so we (re)assert the tag at several early
    // lifecycle points; the companion also retries lookup for ~10s. We persist a
    // page-level marker via document.title-independent global on each.
    const injectJs = `try{window.__DD_STORE_ID__=${JSON.stringify(storeId)};}catch(e){}` + ANTI_DETECT_JS;
    const reinject = () => { view.webContents.executeJavaScript(injectJs).catch(() => { }); };
    view.webContents.on('did-start-navigation', reinject);
    view.webContents.on('dom-ready', reinject);
    view.webContents.on('did-finish-load', reinject);
    // White-screen guard: if a navigation fails (transient network, PDD edge),
    // reload the home page after a short backoff instead of leaving a blank view.
    // Ignore user-aborted (-3) and sub-frame failures.
    view.webContents.on('did-fail-load', (_e, errorCode, errorDesc, validatedURL, isMainFrame) => {
        if (!isMainFrame || errorCode === -3)
            return;
        logToFile(`Store view ${storeId} load failed (${errorCode} ${errorDesc}) ${validatedURL} — retrying`);
        setTimeout(() => {
            // Look up the CURRENT view (a crash-rebuild may have replaced it; the
            // captured `view` could be a closed webContents).
            const cur = storeViews.get(storeId);
            if (cur)
                cur.view.webContents.loadURL(PDD_HOME).catch(() => { });
        }, 3000);
    });
    // Crash recovery: if the view's renderer dies, rebuild it — but with a hard
    // cap + backoff so a page that crashes on every load can't loop forever
    // (memory/CPU leak on a long-running app). Count survives close→recreate via
    // viewCrashCounts; reset on a successful load below.
    view.webContents.on('render-process-gone', (_e, details) => {
        const n = (viewCrashCounts.get(storeId) || 0) + 1;
        viewCrashCounts.set(storeId, n);
        if (n > MAX_VIEW_REBUILDS) {
            logToFile(`Store view ${storeId} crashed ${n}x (${details.reason}) — giving up rebuild`);
            // H3 修复:放弃后必须清零,否则残留计数会让该店铺下次 create 时首崩即
            // 超上限、秒放弃 → 自愈对该店铺永久失效。
            viewCrashCounts.delete(storeId);
            closeStoreView(storeId);
            return;
        }
        const delay = Math.min(1500 * 2 ** (n - 1), 30000); // 1.5s,3s,6s,12s,24s
        logToFile(`Store view ${storeId} render process gone (${details.reason}) — rebuild ${n}/${MAX_VIEW_REBUILDS} in ${delay}ms`);
        closeStoreView(storeId);
        setTimeout(() => createStoreView(storeId), delay);
    });
    // A successful load means the view is healthy — reset its crash budget.
    view.webContents.on('did-finish-load', () => { viewCrashCounts.delete(storeId); });
    // Route popups into the same view rather than spawning OS windows. PDD
    // in-site navigation is otherwise unrestricted (the main window's
    // will-navigate/CSP don't apply to this independent webContents).
    view.webContents.setWindowOpenHandler(({ url }) => {
        view.webContents.loadURL(url).catch(() => { });
        return { action: 'deny' };
    });
    mainWindow.contentView.addChildView(view);
    view.setVisible(false);
    view.webContents.loadURL(PDD_HOME).catch((e) => logToFile(`Store view loadURL failed: ${e?.message}`));
    // H2: 周期性 reload 打断 PDD SPA 的长期内存增长。只在视图当前隐藏(商家没在
    // 看)时 reload,避免打断商家操作;正在看就跳过本轮,等下个周期。
    const reloadTimer = setInterval(() => {
        const cur = storeViews.get(storeId);
        if (cur && !cur.visible) {
            logToFile(`Store view ${storeId} periodic reload (release memory)`);
            cur.view.webContents.loadURL(PDD_HOME).catch(() => { });
        }
    }, STORE_VIEW_RELOAD_MS);
    if (reloadTimer.unref)
        reloadTimer.unref();
    storeViews.set(storeId, {
        view,
        bounds: { x: 0, y: 0, width: 0, height: 0 },
        visible: false,
        reloadTimer,
    });
    logToFile(`Created store view: ${storeId} (CDP port ${CDP_PORT})`);
}
function setStoreViewBounds(storeId, rect) {
    const sv = storeViews.get(storeId);
    if (!sv)
        return;
    sv.bounds = rect;
    const b = {
        x: Math.round(rect.x), y: Math.round(rect.y),
        width: Math.round(rect.width), height: Math.round(rect.height),
    };
    sv.view.setBounds(b);
    logToFile(`Store view ${storeId} bounds set: ${JSON.stringify(b)} visible=${sv.visible}`);
}
function showStoreView(storeId) {
    for (const [id, sv] of storeViews) {
        const show = id === storeId;
        sv.view.setVisible(show);
        sv.visible = show;
    }
}
function hideStoreView(storeId) {
    const sv = storeViews.get(storeId);
    if (!sv)
        return;
    sv.view.setVisible(false);
    sv.visible = false;
}
function closeStoreView(storeId) {
    const sv = storeViews.get(storeId);
    if (!sv)
        return;
    if (sv.reloadTimer)
        clearInterval(sv.reloadTimer); // H2:清掉周期 reload 定时器,防泄漏
    try {
        if (mainWindow)
            mainWindow.contentView.removeChildView(sv.view);
        sv.view.webContents.close();
    }
    catch (e) {
        logToFile(`closeStoreView error: ${e?.message}`);
    }
    storeViews.delete(storeId);
    logToFile(`Closed store view: ${storeId}`);
}
function destroyAllStoreViews() {
    for (const id of [...storeViews.keys()])
        closeStoreView(id);
}
// ── 内存水位监控(兜底防"跑两天白屏")──
// 超软阈值:reload 隐藏的店铺视图释放内存;连续两次超硬阈值:软重启整个 app。
function startMemoryWatch() {
    const timer = setInterval(() => {
        try {
            const metrics = electron_1.app.getAppMetrics();
            let totalKB = 0;
            for (const m of metrics)
                totalKB += (m.memory?.workingSetSize || 0);
            const totalMB = Math.round(totalKB / 1024);
            if (totalMB >= MEM_HARD_MB) {
                memHardHits += 1;
                logToFile(`Memory ${totalMB}MB >= hard ${MEM_HARD_MB}MB (hit ${memHardHits}/2)`);
                if (memHardHits >= 2) {
                    logToFile('Memory over hard limit twice — relaunching app');
                    electron_1.app.relaunch();
                    electron_1.app.exit(0);
                }
                return;
            }
            memHardHits = 0;
            if (totalMB >= MEM_SOFT_MB) {
                logToFile(`Memory ${totalMB}MB >= soft ${MEM_SOFT_MB}MB — reloading hidden store views to release`);
                for (const [, sv] of storeViews) {
                    if (!sv.visible)
                        sv.view.webContents.loadURL(PDD_HOME).catch(() => { });
                }
            }
        }
        catch (e) {
            logToFile(`memory watch error: ${e?.message}`);
        }
    }, MEM_SAMPLE_MS);
    if (timer.unref)
        timer.unref();
}
// IPC: renderer (StoreDetailPage) drives the embedded store view — create it,
// position it over the page's container rect, show/hide on navigation, close it.
function registerStoreViewIpc() {
    // Sync getter for the sandboxed preload (which can't read app.isPackaged).
    electron_1.ipcMain.on('app:is-packaged', (e) => {
        logToFile('IPC app:is-packaged called (preload is running)');
        e.returnValue = electron_1.app.isPackaged;
    });
    electron_1.ipcMain.on('preload:loaded', () => { logToFile('IPC preload:loaded — preload script executed'); });
    electron_1.ipcMain.handle('store-view:create', (_e, storeId) => {
        logToFile(`IPC store-view:create storeId=${storeId}`);
        if (typeof storeId !== 'string' || !storeId)
            return false;
        createStoreView(storeId);
        return true;
    });
    electron_1.ipcMain.handle('store-view:set-bounds', (_e, storeId, rect) => {
        if (typeof storeId !== 'string' || !rect)
            return false;
        setStoreViewBounds(storeId, rect);
        return true;
    });
    electron_1.ipcMain.handle('store-view:show', (_e, storeId) => { logToFile(`IPC store-view:show storeId=${storeId}`); showStoreView(storeId); return true; });
    electron_1.ipcMain.handle('store-view:hide', (_e, storeId) => { hideStoreView(storeId); return true; });
    electron_1.ipcMain.handle('store-view:close', (_e, storeId) => { viewCrashCounts.delete(storeId); closeStoreView(storeId); return true; });
}
function createRuntimeSecrets() {
    return {
        JWT_ACCESS_SECRET: crypto.randomBytes(32).toString('hex'),
        JWT_REFRESH_SECRET: crypto.randomBytes(32).toString('hex'),
        API_KEY_ENCRYPTION_KEY: crypto.randomBytes(32).toString('hex'),
        COMPANION_WS_TOKEN: crypto.randomBytes(32).toString('hex'),
    };
}
function isRuntimeSecrets(value) {
    if (!value || typeof value !== 'object')
        return false;
    const candidate = value;
    return RUNTIME_SECRET_KEYS.every((key) => {
        const secret = candidate[key];
        return typeof secret === 'string' && secret.length >= 32;
    });
}
function getRuntimeSecrets() {
    if (runtimeSecrets)
        return runtimeSecrets;
    const secretsPath = path.join(electron_1.app.getPath('userData'), 'runtime-secrets.json');
    try {
        if (fs.existsSync(secretsPath)) {
            const parsed = JSON.parse(fs.readFileSync(secretsPath, 'utf8'));
            if (isRuntimeSecrets(parsed)) {
                runtimeSecrets = parsed;
                return runtimeSecrets;
            }
            logToFile('Runtime secrets file is invalid; regenerating');
        }
    }
    catch (err) {
        logToFile(`Failed to read runtime secrets; regenerating: ${err.message}`);
    }
    runtimeSecrets = createRuntimeSecrets();
    fs.mkdirSync(path.dirname(secretsPath), { recursive: true });
    fs.writeFileSync(secretsPath, JSON.stringify(runtimeSecrets, null, 2), { mode: 0o600 });
    logToFile(`Runtime secrets ready: ${secretsPath}`);
    return runtimeSecrets;
}
// ── Machine ID (license activation) ──
// A stable per-machine fingerprint. Persisted to userData so it survives app
// upgrades and stays identical across restarts (the activation code is bound to
// it). On Windows we prefer the registry MachineGuid (stable across reinstalls);
// otherwise we hash hostname + first non-internal MAC + CPU model. Persistence
// is the source of truth — the derivation only runs once.
let machineIdCache = null;
function deriveMachineId() {
    // 1) Windows registry MachineGuid — the most stable, survives app reinstall.
    if (process.platform === 'win32') {
        try {
            const out = (0, child_process_1.execSync)('reg query "HKLM\\SOFTWARE\\Microsoft\\Cryptography" /v MachineGuid', { encoding: 'utf8', windowsHide: true, timeout: 5000 });
            const m = out.match(/MachineGuid\s+REG_SZ\s+([0-9a-fA-F-]+)/);
            if (m && m[1]) {
                return crypto.createHash('sha256').update('pdd-ai:' + m[1].trim()).digest('hex').slice(0, 32).toUpperCase();
            }
        }
        catch { /* fall through to the generic fingerprint */ }
    }
    // 2) Generic fallback: hostname + first non-internal MAC + CPU model.
    const nics = os.networkInterfaces();
    let mac = '';
    for (const name of Object.keys(nics)) {
        for (const ni of nics[name] || []) {
            if (!ni.internal && ni.mac && ni.mac !== '00:00:00:00:00:00') {
                mac = ni.mac;
                break;
            }
        }
        if (mac)
            break;
    }
    const cpu = (os.cpus()[0]?.model || '').trim();
    const raw = `${os.hostname()}|${mac}|${cpu}`;
    return crypto.createHash('sha256').update('pdd-ai:' + raw).digest('hex').slice(0, 32).toUpperCase();
}
function getMachineId() {
    if (machineIdCache)
        return machineIdCache;
    const idPath = path.join(electron_1.app.getPath('userData'), 'machine-id.txt');
    try {
        if (fs.existsSync(idPath)) {
            const saved = fs.readFileSync(idPath, 'utf8').trim();
            if (saved.length >= 16) {
                machineIdCache = saved;
                return saved;
            }
        }
    }
    catch { /* regenerate below */ }
    const id = deriveMachineId();
    try {
        fs.mkdirSync(path.dirname(idPath), { recursive: true });
        fs.writeFileSync(idPath, id, { mode: 0o600 });
    }
    catch (err) {
        logToFile(`Failed to persist machine id (continuing with derived value): ${err?.message || err}`);
    }
    machineIdCache = id;
    return id;
}
// ── Server ──
async function startServer() {
    return new Promise((resolve, reject) => {
        const isDev = !electron_1.app.isPackaged;
        const databaseUrl = getDatabaseUrl();
        if (isDev) {
            // Dev: use spawn with npx tsx
            const serverProc = (0, child_process_1.spawn)('npx', ['tsx', 'src/index.ts'], {
                cwd: SERVER_DIR,
                env: { ...process.env, ...getRuntimeSecrets(), MACHINE_ID: getMachineId(), PORT: '3001', NODE_ENV: 'development', DATABASE_URL: databaseUrl },
                stdio: ['ignore', 'pipe', 'pipe'],
            });
            let started = false;
            const timeout = setTimeout(() => {
                if (!started) {
                    serverProc.kill();
                    reject(new Error('Server start timeout'));
                }
            }, 15000);
            serverProc.stdout?.on('data', (data) => {
                const text = data.toString();
                console.log('[server]', text.trim());
                if (!started && (text.includes('running') || text.includes('3001'))) {
                    started = true;
                    clearTimeout(timeout);
                    serverStarted = true;
                    resolve();
                }
            });
            serverProc.stderr?.on('data', (data) => console.error('[server:err]', data.toString().trim()));
            serverProcess = serverProc;
            serverProc.on('exit', (code) => { serverStarted = false; });
            serverProc.on('error', (err) => reject(err));
        }
        else {
            // Production: spawn the server with Node via Electron-as-Node
            // (process.execPath + ELECTRON_RUN_AS_NODE=1). This reuses Electron's
            // own embedded Node on every platform — no separate node.exe to bundle,
            // one code path for Windows/macOS. Server files are on disk
            // (extraResources) — no ASAR subprocess issues.
            const nodeExe = process.execPath;
            const serverJs = path.join(process.resourcesPath, 'server', 'dist', 'index.js');
            const serverCwd = path.join(process.resourcesPath, 'server');
            logToFile(`Node exe: ${nodeExe}`);
            logToFile(`Server JS: ${serverJs}`);
            logToFile(`Server CWD: ${serverCwd}`);
            logToFile(`Database URL: ${databaseUrl}`);
            const child = (0, child_process_1.spawn)(nodeExe, [serverJs], {
                cwd: serverCwd,
                env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', ...getRuntimeSecrets(), MACHINE_ID: getMachineId(), PORT: '3001', NODE_ENV: 'production', DATABASE_URL: databaseUrl },
                stdio: ['ignore', 'pipe', 'pipe'],
            });
            let started = false;
            const timeout = setTimeout(() => {
                if (!started) {
                    logToFile('ERROR: Server start timeout (15s)');
                    child.kill();
                    reject(new Error('Server start timeout'));
                }
            }, 15000);
            child.stdout?.on('data', (data) => {
                const text = data.toString();
                logToFile(`[server:out] ${text.trim()}`);
                if (!started && (text.includes('running') || text.includes('3001'))) {
                    started = true;
                    clearTimeout(timeout);
                    serverStarted = true;
                    resolve();
                }
            });
            child.stderr?.on('data', (data) => {
                const text = data.toString();
                logToFile(`[server:err] ${text.trim()}`);
            });
            serverProcess = child;
            child.on('exit', (code) => {
                logToFile(`Server exited with code ${code}`);
                serverStarted = false;
            });
            child.on('error', (err) => {
                logToFile(`Server spawn error: ${err.message}`);
            });
        }
    });
}
// ── Companion ──
function startCompanion() {
    if (companionProcess) {
        companionProcess.kill();
        companionProcess = null;
    }
    const browsersPath = isPackaged
        ? path.join(process.resourcesPath, 'browsers')
        : path.join(ROOT_DIR, 'browsers');
    const companionDataDir = getCompanionDataDir();
    // Companion dir: on filesystem in production (extraResources), in source tree in dev
    const companionDir = isPackaged
        ? path.join(process.resourcesPath, 'companion')
        : path.join(ROOT_DIR, 'companion');
    if (isPackaged) {
        // Production: spawn the companion via Electron-as-Node (process.execPath +
        // ELECTRON_RUN_AS_NODE=1) on every platform — same engine, no node.exe.
        const nodeBin = process.execPath;
        const serverNodeModules = path.join(process.resourcesPath, 'server', 'node_modules');
        const companionEntry = path.join(companionDir, 'index.js');
        if (!fs.existsSync(companionEntry)) {
            logToFile('Companion JS not found, skipping: ' + companionEntry);
            return;
        }
        logToFile('Starting companion: ' + companionEntry);
        companionProcess = (0, child_process_1.spawn)(nodeBin, [companionEntry], {
            cwd: companionDir,
            env: {
                ...process.env,
                ELECTRON_RUN_AS_NODE: '1',
                NODE_ENV: 'production',
                NODE_PATH: serverNodeModules,
                // Dial 127.0.0.1 (IPv4) explicitly, NOT "localhost": the server binds
                // 127.0.0.1 (BIND_HOST default), but on Windows "localhost" resolves to
                // IPv6 ::1 first, so a localhost WS hits ::1:3001 → ECONNREFUSED and the
                // companion never connects (every /connect then 503). IPv4 matches the bind.
                SERVER_URL: 'ws://127.0.0.1:3001/ws',
                PLAYWRIGHT_BROWSERS_PATH: browsersPath,
                PDD_USER_DATA_DIR: companionDataDir,
                COMPANION_WS_TOKEN: getRuntimeSecrets().COMPANION_WS_TOKEN,
                // Drive the in-app WebContentsView over CDP instead of launching a
                // separate Chromium window.
                COMPANION_CDP_URL: `http://127.0.0.1:${CDP_PORT}`,
            },
            stdio: ['ignore', 'pipe', 'pipe'],
        });
    }
    else {
        // Dev: use npx tsx
        companionProcess = (0, child_process_1.spawn)('npx', ['tsx', 'index.ts'], {
            cwd: companionDir,
            env: {
                ...process.env,
                NODE_ENV: 'development',
                // IPv4 explicitly — see production branch above (Windows localhost→::1).
                SERVER_URL: 'ws://127.0.0.1:3001/ws',
                PLAYWRIGHT_BROWSERS_PATH: browsersPath,
                PDD_USER_DATA_DIR: companionDataDir,
                COMPANION_WS_TOKEN: getRuntimeSecrets().COMPANION_WS_TOKEN,
                COMPANION_CDP_URL: `http://127.0.0.1:${CDP_PORT}`,
            },
            stdio: ['ignore', 'pipe', 'pipe'],
        });
    }
    companionProcess.stdout?.on('data', (data) => {
        const text = data.toString();
        logToFile('[companion] ' + text.trim());
    });
    companionProcess.stderr?.on('data', (data) => {
        const text = data.toString();
        logToFile('[companion:err] ' + text.trim());
    });
    companionProcess.on('exit', (code) => {
        logToFile('Companion exited with code ' + code);
        companionProcess = null;
        // Auto-restart companion after 5 seconds
        setTimeout(() => {
            if (serverStarted)
                startCompanion();
        }, 5000);
    });
    companionProcess.on('error', (err) => {
        logToFile('Companion failed: ' + err.message);
        companionProcess = null;
    });
}
// ── Window ──
function createWindow() {
    mainWindow = new electron_1.BrowserWindow({
        width: 1280,
        height: 860,
        minWidth: 1024,
        minHeight: 680,
        title: '多多AI客服',
        icon: getAppIcon(),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
        show: false,
    });
    // ── Renderer hardening: navigation + window-open + CSP ──
    // Deny all new-window popups; route external http(s) links to the user's
    // browser. Defense-in-depth against XSS in the SPA.
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (/^https?:\/\//.test(url)) {
            electron_1.shell.openExternal(url);
        }
        return { action: 'deny' };
    });
    // Only allow navigation to the local app origins (and data: error pages).
    mainWindow.webContents.on('will-navigate', (e, url) => {
        const allowed = /^http:\/\/localhost:(3001|5173)\//.test(url) || url.startsWith('data:');
        if (!allowed)
            e.preventDefault();
    });
    // ── H1: 主窗口崩溃/卡死自愈 ──
    // 原来只有内嵌店铺视图有 render-process-gone 自愈,主窗口自己崩了没人管 →
    // 白屏根因。这里补上:渲染进程崩了先 reload,连续崩太多次则软重启整个 app;
    // 卡死(unresponsive)超 15s 仍未恢复也 reload。
    let unresponsiveTimer = null;
    mainWindow.webContents.on('render-process-gone', (_e, details) => {
        if (details.reason === 'clean-exit')
            return;
        mainWindowCrashCount += 1;
        logToFile(`Main window render process gone (${details.reason}) — recover ${mainWindowCrashCount}/${MAX_MAIN_RECOVERS}`);
        if (mainWindowCrashCount > MAX_MAIN_RECOVERS) {
            logToFile('Main window crashed too many times — relaunching app');
            electron_1.app.relaunch();
            electron_1.app.exit(0);
            return;
        }
        try {
            mainWindow?.webContents.reload();
        }
        catch {
            electron_1.app.relaunch();
            electron_1.app.exit(0);
        }
    });
    mainWindow.webContents.on('unresponsive', () => {
        logToFile('Main window unresponsive — will reload if still hung after 15s');
        if (unresponsiveTimer)
            clearTimeout(unresponsiveTimer);
        unresponsiveTimer = setTimeout(() => {
            logToFile('Main window still unresponsive — reloading');
            try {
                mainWindow?.webContents.reload();
            }
            catch { /* ignore */ }
        }, 15000);
    });
    mainWindow.webContents.on('responsive', () => {
        if (unresponsiveTimer) {
            clearTimeout(unresponsiveTimer);
            unresponsiveTimer = null;
        }
        logToFile('Main window responsive again');
    });
    // 成功加载视为健康,重置主窗口崩溃预算。
    mainWindow.webContents.on('did-finish-load', () => { mainWindowCrashCount = 0; });
    // Enforce a strict CSP on the renderer in packaged mode (Vite dev server
    // needs eval/inline, so skip in dev).
    if (electron_1.app.isPackaged) {
        electron_1.session.defaultSession.webRequest.onHeadersReceived((details, cb) => {
            // ONLY enforce our CSP on the app's own pages (localhost SPA). The embedded
            // store views load mms.pinduoduo.com, which pulls scripts/styles from
            // mms-static.pddpic.com etc. — our 'self' CSP would block ALL of them and
            // leave a white screen. PDD requests must pass through with PDD's own CSP.
            const url = details.url || '';
            const isAppOrigin = /^http:\/\/localhost:(3001|5173)\//.test(url);
            if (!isAppOrigin) {
                cb({ responseHeaders: details.responseHeaders });
                return;
            }
            cb({
                responseHeaders: {
                    ...details.responseHeaders,
                    'Content-Security-Policy': [
                        "default-src 'self'; " +
                            "script-src 'self'; " +
                            "style-src 'self' 'unsafe-inline'; " +
                            "img-src 'self' data: https:; " +
                            "connect-src 'self' ws://localhost:3001 http://localhost:3001; " +
                            "font-src 'self' data:; " +
                            "object-src 'none'; " +
                            "frame-ancestors 'none'",
                    ],
                },
            });
        });
    }
    // ── Ready timeout (prevents invisible window on load failure) ──
    let shown = false;
    const showWindow = () => {
        if (!shown) {
            shown = true;
            mainWindow?.show();
        }
    };
    // Show window within 30s even if not ready (fallback)
    const readyTimeout = setTimeout(() => {
        console.warn('⚠️ Window load timeout — showing anyway');
        showWindow();
    }, 30000);
    mainWindow.once('ready-to-show', () => {
        clearTimeout(readyTimeout);
        showWindow();
    });
    // Catch load failures
    mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
        clearTimeout(readyTimeout);
        console.error(`❌ Failed to load: ${validatedURL} (${errorCode}: ${errorDescription})`);
        showWindow();
        // Show inline error so user knows something went wrong
        const errorHtml = `
      <html><body style="font-family:sans-serif;padding:40px;text-align:center;">
        <h1 style="color:#e53e3e;">⚠️ 页面加载失败</h1>
        <p>${errorDescription}</p>
        <p style="color:#8a8a8a;">请检查应用文件是否完整</p>
      </body></html>`;
        mainWindow?.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(errorHtml)}`);
    });
    // Load frontend
    // Dev: use Vite dev server on :5173
    // Production: Express serves the SPA on :3001 — load from localhost so
    //   API calls to /api resolve to the same origin (critical fix for file://)
    const isDev = !electron_1.app.isPackaged;
    if (isDev) {
        mainWindow.loadURL('http://localhost:5173');
        mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
    else {
        // Wait for server to be ready, then load from localhost
        const tryLoad = (retries) => {
            http.get('http://localhost:3001/', (res) => {
                if (res.statusCode === 200) {
                    mainWindow?.loadURL('http://localhost:3001/');
                    // DevTools only in dev, or when explicitly opted in via env. A shipped
                    // build must not auto-open a detached DevTools window for end users.
                    if (!isPackaged || process.env.PDD_DEVTOOLS === '1') {
                        mainWindow?.webContents.openDevTools({ mode: 'detach' });
                    }
                }
                else if (retries > 0) {
                    setTimeout(() => tryLoad(retries - 1), 1000);
                }
                else {
                    const logTxt = serverLogLines.join('\\n');
                    console.error('❌ Server returned', res.statusCode);
                    logToFile(`FATAL: Server returned ${res.statusCode}`);
                    clearTimeout(readyTimeout);
                    showWindow();
                    electron_1.dialog.showErrorBox('多多AI客服 - 启动失败', `服务返回 HTTP ${res.statusCode}\\n\\n日志: ${LOG_FILE}`);
                    const e = encodeURIComponent;
                    mainWindow?.loadURL('data:text/html;charset=utf-8,' + e('<html><body style="font-family:monospace;padding:20px;background:#1a1a1a;color:#e0e0e0;">' +
                        '<h2 style="color:#e53e3e;">⚠️ 服务异常 (HTTP ' + res.statusCode + ')</h2>' +
                        '<p>日志: ' + LOG_FILE + '</p>' +
                        '<pre style="background:#2a2a2a;padding:12px;border-radius:4px;overflow:auto;max-height:400px;font-size:11px;">' + logTxt + '</pre>' +
                        '</body></html>'));
                }
            }).on('error', (err) => {
                if (retries > 0) {
                    setTimeout(() => tryLoad(retries - 1), 1000);
                }
                else {
                    const logTxt = serverLogLines.join('\\n');
                    console.error('❌ Server not reachable:', err.code || err.message);
                    logToFile(`FATAL: Server not reachable: ${err.code || err.message}`);
                    clearTimeout(readyTimeout);
                    showWindow();
                    electron_1.dialog.showErrorBox('多多AI客服 - 启动失败', `服务未能启动 (${err.code || err.message})\\n\\n日志: ${LOG_FILE}`);
                    const e = encodeURIComponent;
                    mainWindow?.loadURL('data:text/html;charset=utf-8,' + e('<html><body style="font-family:monospace;padding:20px;background:#1a1a1a;color:#e0e0e0;">' +
                        '<h2 style="color:#e53e3e;">⚠️ 服务未启动</h2>' +
                        '<p>日志: ' + LOG_FILE + '</p>' +
                        '<pre style="background:#2a2a2a;padding:12px;border-radius:4px;overflow:auto;max-height:400px;font-size:11px;">' + logTxt + '</pre>' +
                        '</body></html>'));
                }
            });
        };
        tryLoad(10); // up to 10 retries (10 seconds)
    }
    mainWindow.on('closed', () => {
        if (unresponsiveTimer) {
            clearTimeout(unresponsiveTimer);
            unresponsiveTimer = null;
        }
        mainWindow = null;
    });
}
// ── Tray ──
function getAppIcon() {
    // Bundled next to the compiled main.js (copied into dist-electron at build).
    const iconPath = path.join(__dirname, 'icon.png');
    const img = electron_1.nativeImage.createFromPath(iconPath);
    if (img.isEmpty())
        logToFile(`Tray/app icon missing or empty at ${iconPath}`);
    return img;
}
function createTray() {
    const base = getAppIcon();
    // Tray wants a small icon; resize the 256px source to 16px. Fall back to the
    // raw image if resize yields nothing.
    const trayIcon = base.isEmpty() ? base : base.resize({ width: 16, height: 16 });
    tray = new electron_1.Tray(trayIcon);
    const contextMenu = electron_1.Menu.buildFromTemplate([
        { label: '显示主窗口', click: () => mainWindow?.show() },
        { label: '退出', click: () => electron_1.app.quit() },
    ]);
    tray.setToolTip('多多AI客服');
    tray.setContextMenu(contextMenu);
    tray.on('double-click', () => mainWindow?.show());
}
// ── Auto-update ──
// Checks pdd.fxisv.com/downloads/ (generic provider, configured in
// electron-builder.yml → app-update.yml). Only runs in a packaged build.
// Downloads in the background and notifies; never force-restarts (the app lives
// in the tray serving merchants, so we install on the next manual quit).
function setupAutoUpdater() {
    if (!isPackaged) {
        logToFile('Auto-update skipped (not packaged)');
        return;
    }
    try {
        autoUpdater = require('electron-updater').autoUpdater;
    }
    catch (err) {
        logToFile(`electron-updater not available: ${err?.message || err}`);
        return;
    }
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.logger = { info: logToFile, warn: logToFile, error: logToFile, debug: () => { } };
    autoUpdater.on('checking-for-update', () => logToFile('[updater] checking for update'));
    autoUpdater.on('update-available', (info) => logToFile(`[updater] update available: ${info?.version}`));
    autoUpdater.on('update-not-available', () => logToFile('[updater] no update available'));
    autoUpdater.on('error', (err) => logToFile(`[updater] error: ${err?.message || err}`));
    autoUpdater.on('download-progress', (p) => logToFile(`[updater] downloading ${Math.round(p?.percent || 0)}%`));
    autoUpdater.on('update-downloaded', (info) => {
        logToFile(`[updater] update downloaded: ${info?.version}`);
        const choice = electron_1.dialog.showMessageBoxSync({
            type: 'info',
            buttons: ['立即重启更新', '稍后'],
            defaultId: 0,
            cancelId: 1,
            title: '多多AI客服 · 有新版本',
            message: `新版本 ${info?.version || ''} 已下载完成`,
            detail: '点击「立即重启更新」完成安装，或稍后退出软件时自动更新。',
        });
        if (choice === 0) {
            autoUpdater.quitAndInstall();
        }
    });
    autoUpdater.checkForUpdates().catch((err) => logToFile(`[updater] check failed: ${err?.message || err}`));
}
// ── App Lifecycle ──
electron_1.app.whenReady().then(async () => {
    console.log('🚀 Starting 多多AI客服...');
    // DB init is now handled by the server on first start
    // (auto migration + seed using Electron's built-in Node.js)
    try {
        await startServer();
        console.log('✅ Server ready');
        // Start companion after server is ready
        startCompanion();
        console.log('🔌 Companion launched');
    }
    catch (err) {
        console.error('❌ Server failed:', err.message);
    }
    // Register IPC handlers BEFORE creating the window. The preload runs the
    // instant the window loads and does a sendSync('app:is-packaged'); if the
    // handler isn't registered yet that call fails and the embedded store view
    // wiring degrades. Order matters.
    registerStoreViewIpc();
    createWindow();
    createTray();
    setupAutoUpdater();
    startMemoryWatch();
    electron_1.app.on('activate', () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0)
            createWindow();
    });
});
electron_1.app.on('window-all-closed', () => {
    // Don't quit on macOS — keep in tray
    if (process.platform !== 'darwin') {
        // On Windows, minimize to tray instead of quitting
    }
});
electron_1.app.on('before-quit', () => {
    console.log('🛑 Shutting down...');
    destroyAllStoreViews();
    if (companionProcess) {
        companionProcess.kill();
        companionProcess = null;
    }
    if (serverProcess) {
        serverProcess.kill();
        serverProcess = null;
    }
});
// Prevent multiple instances
const gotLock = electron_1.app.requestSingleInstanceLock();
if (!gotLock) {
    electron_1.app.quit();
}
else {
    electron_1.app.on('second-instance', () => {
        if (mainWindow) {
            if (mainWindow.isMinimized())
                mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();
        }
    });
}
