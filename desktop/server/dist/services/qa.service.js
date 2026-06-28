"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.qaService = void 0;
const exceljs_1 = require("exceljs");
const qa_repository_1 = require("../repositories/qa.repository");
const MAX_IMPORT_ROWS = 5000;
/** Chinese/English header → QAInput field. Matched case-insensitively, trimmed. */
const HEADER_MAP = {
    '问题': 'question', '问': 'question', question: 'question', q: 'question',
    '答案': 'answer', '回答': 'answer', '答': 'answer', answer: 'answer', a: 'answer',
    '关键词': 'keywords', '关键字': 'keywords', keywords: 'keywords', keyword: 'keywords',
    '分类': 'category', '类目': 'category', category: 'category',
};
/** Normalize an exceljs cell value to a plain string (mirrors product.service). */
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
            return String(raw.text).trim();
        if (raw.result != null)
            return String(raw.result).trim();
        if (raw.hyperlink != null)
            return String(raw.hyperlink).trim();
        if (raw.error != null)
            return '';
    }
    return String(raw).trim();
}
exports.qaService = {
    list: (storeId, opts) => qa_repository_1.qaRepository.findByStore(storeId, opts),
    create: (storeId, data) => qa_repository_1.qaRepository.create(storeId, data),
    /** Returns the updated entry, or null if the id isn't in this store (IDOR guard). */
    async update(storeId, id, data) {
        const { count } = await qa_repository_1.qaRepository.updateInStore(storeId, id, data);
        if (count === 0)
            return null;
        return qa_repository_1.qaRepository.findByIdInStore(storeId, id);
    },
    /** Returns true if an entry was deleted, false if the id wasn't in this store. */
    async remove(storeId, id) {
        const { count } = await qa_repository_1.qaRepository.deleteInStore(storeId, id);
        return count > 0;
    },
    /**
     * Parse an uploaded .xlsx buffer and insert each row as a Q&A entry. First row
     * is the header. Rows missing a question or answer are reported as failures
     * (not thrown) so one bad row never aborts the whole import.
     */
    async importFromExcel(storeId, buffer) {
        const wb = new exceljs_1.Workbook();
        await wb.xlsx.load(buffer);
        const sheet = wb.worksheets[0];
        if (!sheet)
            return { imported: 0, failed: 0, errors: [{ row: 0, reason: '文件没有工作表' }] };
        const colToField = {};
        const headerRow = sheet.getRow(1);
        headerRow.eachCell((cell, col) => {
            const key = cellText(cell.value).toLowerCase();
            const field = HEADER_MAP[key] || HEADER_MAP[cellText(cell.value)];
            if (field)
                colToField[col] = field;
        });
        const fields = Object.values(colToField);
        if (!fields.includes('question') || !fields.includes('answer')) {
            return { imported: 0, failed: 0, errors: [{ row: 1, reason: '缺少“问题”或“答案”列,请使用模板' }] };
        }
        if (sheet.rowCount - 1 > MAX_IMPORT_ROWS) {
            return { imported: 0, failed: 0, errors: [{ row: 0, reason: `行数超过上限 ${MAX_IMPORT_ROWS},请拆分文件` }] };
        }
        const result = { imported: 0, failed: 0, errors: [] };
        const rows = [];
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
                continue;
            const question = (rec.question || '').trim();
            const answer = (rec.answer || '').trim();
            if (!question) {
                result.failed++;
                result.errors.push({ row: r, reason: '问题为空' });
                continue;
            }
            if (!answer) {
                result.failed++;
                result.errors.push({ row: r, reason: '答案为空' });
                continue;
            }
            rows.push({
                question: question.slice(0, 500),
                answer: answer.slice(0, 2000),
                keywords: rec.keywords ? rec.keywords.slice(0, 200) : null,
                category: rec.category ? rec.category.slice(0, 50) : null,
                enabled: true,
            });
        }
        for (let i = 0; i < rows.length; i++) {
            try {
                await qa_repository_1.qaRepository.create(storeId, rows[i]);
                result.imported++;
            }
            catch {
                result.failed++;
                result.errors.push({ row: i + 2, reason: '写入失败' });
            }
        }
        return result;
    },
    /** Build a downloadable .xlsx template with the expected headers + one example row. */
    async buildTemplate() {
        const wb = new exceljs_1.Workbook();
        const sheet = wb.addWorksheet('问答');
        sheet.columns = [
            { header: '问题', key: 'question', width: 40 },
            { header: '答案', key: 'answer', width: 60 },
            { header: '关键词', key: 'keywords', width: 24 },
            { header: '分类', key: 'category', width: 16 },
        ];
        sheet.getRow(1).font = { bold: true };
        sheet.addRow({
            question: '你们开通退货包运费吗',
            answer: '亲，本店已开通退货包运费，退货时运费由保险公司承担，您可以放心购买哈',
            keywords: '退货包运费 运费险 包邮退',
            category: '售后',
        });
        const out = await wb.xlsx.writeBuffer();
        return Buffer.from(out);
    },
    /** Export all Q&A entries for a store as an .xlsx buffer. */
    async exportToExcel(storeId) {
        // Pass a high take so the backup contains every entry (import allows up to
        // 5000), not just the list view's default 1000-row cap.
        const entries = await qa_repository_1.qaRepository.findByStore(storeId, { take: 100000 });
        const wb = new exceljs_1.Workbook();
        const sheet = wb.addWorksheet('问答');
        sheet.columns = [
            { header: '问题', key: 'question', width: 40 },
            { header: '答案', key: 'answer', width: 60 },
            { header: '关键词', key: 'keywords', width: 24 },
            { header: '分类', key: 'category', width: 16 },
            { header: '启用', key: 'enabled', width: 8 },
        ];
        sheet.getRow(1).font = { bold: true };
        for (const e of entries) {
            sheet.addRow({
                question: e.question,
                answer: e.answer,
                keywords: e.keywords || '',
                category: e.category || '',
                enabled: e.enabled ? '是' : '否',
            });
        }
        const out = await wb.xlsx.writeBuffer();
        return Buffer.from(out);
    },
};
//# sourceMappingURL=qa.service.js.map