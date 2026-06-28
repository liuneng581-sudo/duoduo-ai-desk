"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startOfTodayShanghai = startOfTodayShanghai;
/**
 * Business-timezone day boundaries.
 *
 * The app serves Pinduoduo (China) merchants, so "today" must mean today in
 * Asia/Shanghai (UTC+8, no DST), NOT the server's local timezone. A server
 * running in UTC would otherwise put orders placed 00:00–08:00 CST into
 * "yesterday", skewing daily counts/revenue by an 8-hour band.
 *
 * Prisma stores DateTime as UTC, so we return the UTC instant that corresponds
 * to 00:00 Asia/Shanghai today and compare against it directly.
 */
const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;
function startOfTodayShanghai(now = Date.now()) {
    // View the current instant as Shanghai wall-clock by shifting +8h, floor to
    // midnight, then shift back to the real UTC instant.
    const shifted = new Date(now + SHANGHAI_OFFSET_MS);
    shifted.setUTCHours(0, 0, 0, 0);
    return new Date(shifted.getTime() - SHANGHAI_OFFSET_MS);
}
//# sourceMappingURL=time.js.map