"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.stripThinking = stripThinking;
exports.stripMarkdownSymbols = stripMarkdownSymbols;
exports.capEmoji = capEmoji;
exports.sanitizeForCustomer = sanitizeForCustomer;
exports.checkCompliance = checkCompliance;
/**
 * Strip model reasoning/thinking from a reply before it is shown to a customer.
 *
 * Reasoning models (and some prompt setups) emit a chain-of-thought wrapped in
 * <think>...</think> (or <thinking>...</think>) ahead of the real answer. That
 * must never reach the buyer. Observed in production: replies sent to PDD
 * customers still contained the full <think> block.
 */
function stripThinking(text) {
    if (!text)
        return text;
    let out = text;
    // Complete blocks: <think> ... </think> / <thinking ...> ... </thinking>.
    out = out.replace(/<think(?:ing)?\b[^>]*>[\s\S]*?<\/think(?:ing)?\s*>/gi, '');
    // Unclosed opener: everything from <think...> to the end (truncated/streamed).
    out = out.replace(/<think(?:ing)?\b[^>]*>[\s\S]*$/i, '');
    // Stray closing tag with no opener
    out = out.replace(/<\/think(?:ing)?\s*>/gi, '');
    return out.trim();
}
/**
 * Strip Markdown / formatting symbols so the reply reads like a real person
 * typing in chat, not a formatted document. Keep text + CJK punctuation; only
 * remove markup. Does NOT blanket-strip '_' (product links use goods_id=...).
 */
function stripMarkdownSymbols(text) {
    if (!text)
        return text;
    let out = text;
    // Bold/italic/strikethrough markers: keep inner text
    out = out.replace(/(\*\*\*|\*\*|\*|___|__|_|~~)(.+?)\1/g, '$2');
    out = out.replace(/^\s{0,3}#{1,6}\s*/gm, ''); // headings
    out = out.replace(/^\s{0,3}>+\s?/gm, ''); // blockquotes
    out = out.replace(/^\s{0,3}[-+*]\s+/gm, ''); // bullets
    out = out.replace(/```[\s\S]*?```/g, (m) => m.replace(/```/g, '')); // code fences
    out = out.replace(/`([^`]+)`/g, '$1'); // inline code
    out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 $2'); // links → text url
    // Markdown table separator rows (only | - : space) → drop the line
    out = out.replace(/^\s*\|?[\s:|-]+\|?\s*$/gm, (m) => (/-/.test(m) ? '' : m));
    // Table cell pipes → comma so the row reads as text, not a leaked pipe
    out = out.replace(/\s*\|\s*/g, '，').replace(/，+$/gm, '').replace(/^，/gm, '');
    out = out.replace(/[*`~]/g, ''); // stray markers
    out = out.replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n');
    return out.trim();
}
/**
 * Remove emoji/pictographs. A flood of emoji is a giveaway the text is machine-
 * generated and reads nothing like a real PDD CS rep, so we strip them — a
 * deterministic net on top of the prompt. Uses Unicode property escapes so it
 * only targets pictographs and never touches Chinese text or punctuation.
 */
function capEmoji(text) {
    if (!text)
        return text;
    return text
        .replace(/\p{Extended_Pictographic}/gu, '')
        .replace(/[\u{FE0F}\u{200D}\u{1F3FB}-\u{1F3FF}]/gu, '')
        .replace(/[ \t]{2,}/g, ' ')
        .trim();
}
/** Full sanitize for a customer-facing reply: drop reasoning + formatting + emoji. */
function sanitizeForCustomer(text) {
    return capEmoji(stripMarkdownSymbols(stripThinking(text)));
}
// ── PDD 客服合规检查 ──
// 拼多多对客服聊天有强制红线，违一次就扣服务分/罚款/降权。光靠 prompt 不保险，
// 这里在「发送前」硬扫描 AI 生成的回复，命中红线就拒发并转人工。
// 站外引流 / 私下交易（处罚最重）。用正则容忍变体（vx、微 信、加好友等）。
const OFF_PLATFORM = [
    /微\s*信/, /\bv\s*x\b/i, /\bvx\b/i, /\bwx\b/i, /\bqq\b/i, /支付宝/, /淘宝/, /京东/, /抖音/,
    /加\s*(好友|微|我)/, /私\s*聊/, /线\s*下/, /转\s*账/, /银行卡/, /扫\s*码/, /二维码/,
    /\b1[3-9]\d{9}\b/, // 手机号
];
// 诱导好评 / 好评返现
// 注:平台对好评返现现已监管宽松,商家普遍隐晦答复(不直说"返现金/先好评返钱"机制)。
// 因此不再把它列入"硬拦截"组(见 checkCompliance 的 groups),改由 system prompt
// 引导 AI 用隐晦话术回答。保留此常量供将来需要时复用。
const REVIEW_BAIT = [/好评返现/, /好评.*红包/, /五星.*(奖|钱|返|补)/, /晒图.*红包/, /先好评/, /返现/];
// 服务态度负面话术
const NEGATIVE = [
    /不知道/, /不关我事/, /没办法/, /随便你/, /爱退不退/, /嫌贵别买/, /自己看详情/,
    /懒得(管|理)/, /有病/, /神经/, /穷/,
];
// 极限词 / 虚假承诺（广告法 + 平台双重管控）
// 注意:JS 的 \b 是 ASCII 单词边界,对中文永远不匹配(中文都算"非单词字符"),
// 所以早期的 /\b最\b/ 形同虚设——最常见的"最好/最低价/最便宜"全漏过。改成直接列
// 广告法明令的"最X"极限词组合,避免 /最/ 裸匹配误伤"最近/最好您先…"等正常用语。
const EXTREME = [
    /最(好|佳|优|强|高级|高端|低价?|便宜|划算|实惠|畅销|热销|受欢迎|新|先进|顶级|领先|大|小|多|少|快|省)/,
    /第一/, /绝对/, /100%/, /百分百/, /根治/, /永久/, /国家级/, /国际级/, /特供/, /专供/,
    /假一赔[万十三四百]/, /无效全额赔/, /终身包换/, /史上(最|最低)/, /全网(最低|最便宜)/, /独家/,
    /唯一/, /顶级/, /王牌/, /精确/, /秒杀全场/,
];
/**
 * Scan an outbound reply for PDD compliance red lines. Returns ok:false with the
 * category when it must NOT be sent (caller should suppress + hand off to human).
 */
function checkCompliance(text) {
    if (!text)
        return { ok: true };
    const groups = [
        ['站外引流', OFF_PLATFORM],
        // '诱导好评'(REVIEW_BAIT)已移出硬拦截:平台监管宽松,允许隐晦答复,改由 prompt 引导。
        ['负面态度', NEGATIVE],
        ['极限词/虚假承诺', EXTREME],
    ];
    for (const [category, patterns] of groups) {
        for (const re of patterns) {
            const m = text.match(re);
            if (m)
                return { ok: false, category, matched: m[0] };
        }
    }
    return { ok: true };
}
//# sourceMappingURL=sanitizeReply.js.map