"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.param = param;
/** Narrow req.params[id] to string for Express 5 compat */
function param(req, name) {
    const v = req.params[name];
    return Array.isArray(v) ? v[0] : v;
}
//# sourceMappingURL=express.js.map