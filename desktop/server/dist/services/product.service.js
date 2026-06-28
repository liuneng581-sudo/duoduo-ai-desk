"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.productService = void 0;
exports.parseProductId = parseProductId;
const exceljs_1 = require("exceljs");
const product_repository_1 = require("../repositories/product.repository");
const gateway_1 = require("./companion/gateway");
const syncTasks = new Map();
/**
 * Extract the PDD product id (goods_id) from a product link so re-imports of the
 * same product dedupe instead of duplicating. PDD links look like:
 *   https://mobile.yangkeduo.com/goods.html?goods_id=1234567890
 *   https://yangkeduo.com/goods2.html?goods_id=1234567890&...
 * Falls back to null when no goods_id is present (row then always inserts).
 */
function parseProductId(url) {
    if (!url)
        return null;
    const m = url.match(/goods_id=(\d+)/);
    return m ? m[1] : null;
}
/**
 * Normalize an exceljs cell value to a plain string. cell.value can be a
 * primitive, or { richText }, { hyperlink, text }, { formula, result }, or
 * { error }. Naively String()-ing those yields "[object Object]" and corrupts
 * the import (e.g. a hyperlinked product-URL column).
 */
function cellText(raw) {
    if (raw == null)
        return '';
    if (typeof raw === 'string')
        return raw.trim();
    if (typeof raw === 'number' || typeof raw === 'boolean')
        return String(raw);
    if (raw instanceof Date)
        return raw.toISOString();
    if (typeof raw === 'object') {
        if (Array.isArray(raw.richText))
            return raw.richText.map((t) => t.text ?? '').join('').trim();
        if (raw.text != null)
            return String(raw.text).trim(); // hyperlink cells
        if (raw.result != null)
            return String(raw.result).trim(); // formula cells
        if (raw.hyperlink != null)
            return String(raw.hyperlink).trim();
        if (raw.error != null)
            return ''; // #REF! etc.
    }
    return String(raw).trim();
}
const MAX_IMPORT_ROWS = 5000;
/** Chinese/English header → ProductInput field. Matched case-insensitively, trimmed. */
const HEADER_MAP = {
    '商品名': 'name', '商品名称': 'name', '名称': 'name', name: 'name', title: 'name',
    '价格': 'price', '售价': 'price', price: 'price',
    '库存': 'stock', stock: 'stock',
    '分类': 'category', '类目': 'category', category: 'category',
    '链接': 'productUrl', '商品链接': 'productUrl', url: 'productUrl', link: 'productUrl',
    '描述': 'description', '商品描述': 'description', description: 'description', desc: 'description',
};
exports.productService = {
    list: (storeId, opts) => product_repository_1.productRepository.findByStore(storeId, opts),
    get: (storeId, id) => product_repository_1.productRepository.findByIdInStore(storeId, id),
    create: (storeId, data) => {
        const externalId = data.externalId ?? parseProductId(data.productUrl);
        return product_repository_1.productRepository.create(storeId, { ...data, externalId });
    },
    /** Returns the updated product, or null if the id isn't in this store (IDOR guard). */
    async update(storeId, id, data) {
        // Re-derive externalId when the link changes
        const patch = { ...data };
        if (data.productUrl !== undefined && data.externalId === undefined) {
            patch.externalId = parseProductId(data.productUrl);
        }
        const { count } = await product_repository_1.productRepository.updateInStore(storeId, id, patch);
        if (count === 0)
            return null;
        return product_repository_1.productRepository.findByIdInStore(storeId, id);
    },
    /** Returns true if a product was deleted, false if the id wasn't in this store. */
    async remove(storeId, id) {
        const { count } = await product_repository_1.productRepository.deleteInStore(storeId, id);
        return count > 0;
    },
    /**
     * Parse an uploaded .xlsx buffer and upsert each row into the store's catalog.
     * First row is treated as the header. Unknown columns are ignored; rows missing
     * a name or a valid price are reported as failures (not thrown) so a single bad
     * row never aborts the whole import.
     */
    async importFromExcel(storeId, buffer) {
        const wb = new exceljs_1.Workbook();
        await wb.xlsx.load(buffer);
        const sheet = wb.worksheets[0];
        if (!sheet)
            return { imported: 0, failed: 0, errors: [{ row: 0, reason: '文件没有工作表' }] };
        // Map column index → field from the header row
        const colToField = {};
        const headerRow = sheet.getRow(1);
        headerRow.eachCell((cell, col) => {
            const key = cellText(cell.value).toLowerCase();
            const field = HEADER_MAP[key] || HEADER_MAP[cellText(cell.value)];
            if (field)
                colToField[col] = field;
        });
        const hasName = Object.values(colToField).includes('name');
        if (!hasName) {
            return { imported: 0, failed: 0, errors: [{ row: 1, reason: '缺少“商品名”列,请使用模板' }] };
        }
        if (sheet.rowCount - 1 > MAX_IMPORT_ROWS) {
            return { imported: 0, failed: 0, errors: [{ row: 0, reason: `行数超过上限 ${MAX_IMPORT_ROWS},请拆分文件` }] };
        }
        const result = { imported: 0, failed: 0, errors: [] };
        const rows = [];
        const seenExternalIds = new Set(); // dedupe within one file
        for (let r = 2; r <= sheet.rowCount; r++) {
            const row = sheet.getRow(r);
            const rec = {};
            let empty = true;
            for (const [colStr, field] of Object.entries(colToField)) {
                const text = cellText(row.getCell(Number(colStr)).value);
                if (text !== '')
                    empty = false;
                rec[field] = text;
            }
            if (empty)
                continue; // skip blank rows
            const name = (rec.name || '').trim();
            if (!name) {
                result.failed++;
                result.errors.push({ row: r, reason: '商品名为空' });
                continue;
            }
            const price = rec.price ? Number(rec.price) : NaN;
            if (!Number.isFinite(price) || price < 0) {
                result.failed++;
                result.errors.push({ row: r, reason: `价格无效: "${rec.price ?? ''}"` });
                continue;
            }
            const stockNum = rec.stock ? Number(rec.stock) : 0;
            const stock = Number.isFinite(stockNum) && stockNum >= 0 ? Math.floor(stockNum) : 0;
            const productUrl = rec.productUrl ? rec.productUrl.trim().slice(0, 1000) : null;
            const externalId = parseProductId(productUrl);
            // Within-file dedupe: collapse repeated goods_id so import counts are honest.
            if (externalId) {
                if (seenExternalIds.has(externalId)) {
                    // Replace the earlier row's data with this later one (last wins), don't double-count.
                    const idx = rows.findIndex((x) => x.data.externalId === externalId);
                    if (idx >= 0)
                        rows[idx].data = {
                            name: name.slice(0, 200), price, stock,
                            category: rec.category ? rec.category.slice(0, 50) : null,
                            description: rec.description ? rec.description.slice(0, 2000) : null,
                            productUrl, externalId,
                        };
                    continue;
                }
                seenExternalIds.add(externalId);
            }
            rows.push({
                rowNum: r,
                data: {
                    name: name.slice(0, 200),
                    price,
                    stock,
                    category: rec.category ? rec.category.slice(0, 50) : null,
                    description: rec.description ? rec.description.slice(0, 2000) : null,
                    productUrl,
                    externalId,
                },
            });
        }
        for (const { rowNum, data } of rows) {
            try {
                await product_repository_1.productRepository.upsertByExternalId(storeId, data);
                result.imported++;
            }
            catch (e) {
                result.failed++;
                result.errors.push({ row: rowNum, reason: '写入失败' });
            }
        }
        return result;
    },
    /** Build a downloadable .xlsx template with the expected headers + one example row. */
    async buildTemplate() {
        const wb = new exceljs_1.Workbook();
        const sheet = wb.addWorksheet('商品');
        sheet.columns = [
            { header: '商品名', key: 'name', width: 30 },
            { header: '价格', key: 'price', width: 12 },
            { header: '库存', key: 'stock', width: 10 },
            { header: '分类', key: 'category', width: 16 },
            { header: '商品链接', key: 'productUrl', width: 50 },
            { header: '商品描述', key: 'description', width: 40 },
        ];
        sheet.getRow(1).font = { bold: true };
        sheet.addRow({
            name: '示例商品-纯棉T恤',
            price: 39.9,
            stock: 100,
            category: '服装',
            productUrl: 'https://mobile.yangkeduo.com/goods.html?goods_id=1234567890',
            description: '100%纯棉,夏季短袖,多色可选',
        });
        const out = await wb.xlsx.writeBuffer();
        return Buffer.from(out);
    },
    /** Export a store's whole catalog as .xlsx — same column shape as the template
     *  so an export can be edited and re-imported (round-trips via goods_id upsert). */
    async exportToExcel(storeId) {
        const products = await product_repository_1.productRepository.findByStore(storeId, { take: 100000 });
        const wb = new exceljs_1.Workbook();
        const sheet = wb.addWorksheet('商品');
        sheet.columns = [
            { header: '商品名', key: 'name', width: 30 },
            { header: '价格', key: 'price', width: 12 },
            { header: '库存', key: 'stock', width: 10 },
            { header: '分类', key: 'category', width: 16 },
            { header: '商品链接', key: 'productUrl', width: 50 },
            { header: '商品描述', key: 'description', width: 40 },
        ];
        sheet.getRow(1).font = { bold: true };
        for (const p of products) {
            sheet.addRow({
                name: p.name,
                price: p.price,
                stock: p.stock,
                category: p.category || '',
                productUrl: p.productUrl || '',
                description: p.description || '',
            });
        }
        const out = await wb.xlsx.writeBuffer();
        return Buffer.from(out);
    },
    /**
     * Start a BACKGROUND sync of the store's full PDD catalog. Returns immediately
     * with the task state; the actual scrape + upsert runs detached and reports
     * progress into syncTasks (poll via getSyncStatus). This avoids HTTP/gateway
     * timeouts on large catalogs (thousands of goods take minutes) and lets the UI
     * show a progress bar + disable the button. Clicking again while running is a
     * no-op (returns the in-flight task) — that's the "don't let the customer spam
     * the button" guard.
     */
    startSyncFromPdd(storeId) {
        const existing = syncTasks.get(storeId);
        if (existing && existing.status === 'running')
            return existing;
        const task = {
            status: 'running', fetched: 0, total: 0, synced: 0, failed: 0,
            startedAt: Date.now(), error: null,
        };
        syncTasks.set(storeId, task);
        // Detached async runner — not awaited.
        (async () => {
            try {
                const goods = await gateway_1.companionGateway.requestAllGoods(storeId, (fetched, total) => {
                    task.fetched = fetched;
                    task.total = total;
                });
                task.total = goods.length || task.total;
                for (const g of goods) {
                    const externalId = g.externalId ? String(g.externalId) : null;
                    if (!externalId) {
                        task.failed++;
                        continue;
                    }
                    const name = String(g.name || '').trim();
                    if (!name) {
                        task.failed++;
                        continue;
                    }
                    const price = Number(g.price);
                    const data = {
                        externalId,
                        name: name.slice(0, 200),
                        price: Number.isFinite(price) && price >= 0 ? price : 0,
                        stock: Number.isFinite(Number(g.stock)) && Number(g.stock) >= 0 ? Math.floor(Number(g.stock)) : 0,
                        category: g.category ? String(g.category).slice(0, 50) : null,
                        description: g.description ? String(g.description).slice(0, 2000) : null,
                        productUrl: `https://mobile.yangkeduo.com/goods.html?goods_id=${externalId}`,
                        status: g.isOnsale === false ? 'off_sale' : 'on_sale',
                    };
                    try {
                        await product_repository_1.productRepository.upsertByExternalId(storeId, data);
                        task.synced++;
                    }
                    catch {
                        task.failed++;
                    }
                }
                task.status = 'done';
                task.finishedAt = Date.now();
            }
            catch (e) {
                task.status = 'error';
                task.error = e?.message || '抓取失败';
                task.finishedAt = Date.now();
            }
        })();
        return task;
    },
    /** Read the current/last sync task state for a store (for progress polling). */
    getSyncStatus(storeId) {
        return syncTasks.get(storeId) || null;
    },
};
//# sourceMappingURL=product.service.js.map