"use strict";
/**
 * Browser lifecycle management.
 * One browser instance per store — each runs a Chromium context.
 *
 * The browser runs in headful mode (visible window) to avoid Pinduoduo's
 * anti-automation detection. Each store gets its own persistent user data
 * directory so cookies survive restarts.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.browserManager = void 0;
const playwright_1 = require("playwright");
const env_1 = require("../../config/env");
const logger_1 = __importDefault(require("../../utils/logger"));
const BROWSER_DATA_DIR = env_1.env.PDD_USER_DATA_DIR || './browser-data';
const HEADFUL = env_1.env.PDD_BROWSER_MODE !== 'headless';
exports.browserManager = {
    /**
     * Launch a new browser instance for a store.
     */
    async launch(storeId) {
        const userDataDir = `${BROWSER_DATA_DIR}/store-${storeId}`;
        logger_1.default.info(`Launching browser for store ${storeId}`, { userDataDir, headful: HEADFUL });
        const browser = await playwright_1.chromium.launchPersistentContext(userDataDir, {
            headless: !HEADFUL,
            viewport: { width: 1280, height: 900 },
            // Anti-detection: set common browser properties
            args: [
                '--disable-blink-features=AutomationControlled',
                '--no-sandbox',
                '--disable-setuid-sandbox',
            ],
        });
        // Get or create a page
        const pages = browser.pages();
        const page = pages.length > 0 ? pages[0] : await browser.newPage();
        // Clear automation flags
        await page.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => false });
        });
        return { browser, context: browser, page };
    },
    /**
     * Save cookies for later reuse (avoids re-login).
     */
    async saveCookies(context) {
        return context.cookies();
    },
    /**
     * Navigate to the chat page. Returns false if login is needed.
     */
    async navigateToChat(page) {
        await page.goto('https://mms.pinduoduo.com/home/', {
            waitUntil: 'domcontentloaded',
            timeout: 30000,
        });
        // Check if we're on the login page or the main page
        const url = page.url();
        if (url.includes('login') || url.includes('passport')) {
            logger_1.default.warn('Login page detected — manual login required');
            return { loggedIn: false };
        }
        // Navigate to chat
        await page.goto('https://mms.pinduoduo.com/chat', {
            waitUntil: 'domcontentloaded',
            timeout: 30000,
        });
        return { loggedIn: true };
    },
    /**
     * Close a browser instance.
     */
    async close(session) {
        if (session.browser) {
            try {
                await session.browser.close();
                logger_1.default.info(`Browser closed for store ${session.storeId}`);
            }
            catch (err) {
                logger_1.default.error(`Error closing browser for store ${session.storeId}`, { error: err });
            }
        }
    },
    /**
     * Wait for manual login. Keeps the browser open and polls for login completion.
     * Returns true when the user has logged in (page navigates away from login).
     */
    async waitForLogin(page, timeoutMs = 300_000) {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            try {
                const url = page.url();
                if (!url.includes('login') && !url.includes('passport') && url.includes('mms')) {
                    logger_1.default.info('Login detected — browser is now authenticated');
                    return true;
                }
            }
            catch {
                // Page may be in transition
            }
            await new Promise((r) => setTimeout(r, 3000));
        }
        logger_1.default.error('Timed out waiting for login');
        return false;
    },
};
//# sourceMappingURL=browserManager.js.map