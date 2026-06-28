"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const winston_1 = __importDefault(require("winston"));
const env_1 = require("../config/env");
const logger = winston_1.default.createLogger({
    level: env_1.env.NODE_ENV === 'production' ? 'info' : 'debug',
    format: winston_1.default.format.combine(winston_1.default.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), winston_1.default.format.errors({ stack: true }), winston_1.default.format.json()),
    defaultMeta: { service: 'duoduo-ai-desk' },
    transports: [
        new winston_1.default.transports.Console({
            format: env_1.env.NODE_ENV === 'development'
                ? winston_1.default.format.combine(winston_1.default.format.colorize(), winston_1.default.format.printf(({ timestamp, level, message, ...meta }) => {
                    const metaStr = Object.keys(meta).length > 1
                        ? ` ${JSON.stringify(meta)}`
                        : '';
                    return `${timestamp} [${level}]: ${message}${metaStr}`;
                }))
                : winston_1.default.format.json(),
        }),
    ],
});
exports.default = logger;
//# sourceMappingURL=logger.js.map