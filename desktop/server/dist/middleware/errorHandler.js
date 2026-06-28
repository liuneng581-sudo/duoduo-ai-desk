"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppError = void 0;
exports.errorHandler = errorHandler;
const logger_1 = __importDefault(require("../utils/logger"));
class AppError extends Error {
    statusCode;
    isOperational;
    constructor(statusCode, message, isOperational = true) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = isOperational;
        Object.setPrototypeOf(this, AppError.prototype);
    }
}
exports.AppError = AppError;
/**
 * Global error handling middleware.
 */
function errorHandler(err, _req, res, _next) {
    if (err instanceof AppError) {
        res.status(err.statusCode).json({
            error: err.message,
        });
        return;
    }
    logger_1.default.error('Unhandled error', {
        message: err.message,
        stack: err.stack,
    });
    res.status(500).json({
        error: '服务器内部错误，请稍后重试',
    });
}
//# sourceMappingURL=errorHandler.js.map