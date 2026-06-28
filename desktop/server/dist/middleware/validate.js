"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validate = validate;
const zod_1 = require("zod");
/**
 * Zod validation middleware factory.
 * Validates request body/query/params against a Zod schema.
 */
function validate(schema, target = 'body') {
    return (req, res, next) => {
        try {
            const data = schema.parse(req[target]);
            // Replace with parsed (cleaned) data
            req[target] = data;
            next();
        }
        catch (error) {
            if (error instanceof zod_1.ZodError) {
                res.status(400).json({
                    error: '请求参数错误',
                    details: error.errors.map((e) => ({
                        field: e.path.join('.'),
                        message: e.message,
                    })),
                });
                return;
            }
            next(error);
        }
    };
}
//# sourceMappingURL=validate.js.map