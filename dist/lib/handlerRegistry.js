export class HandlerRegistry {
    handlers = new Map();
    register(name, fn, options) {
        this.handlers.set(name, { fn, options });
    }
    get(name) {
        return this.handlers.get(name);
    }
    validateParams(name, payload) {
        const handler = this.get(name);
        if (!handler) {
            return { isValid: false, message: `Handler ${name} is not registered`, source: null };
        }
        const { paramSchema } = handler.options || {};
        if (paramSchema) {
            const validationResult = paramSchema(payload);
            if (validationResult.isValid !== true) {
                return { isValid: false, message: `Invalid payload for ${name}: ${validationResult.message}`, source: 'param-schema' };
            }
        }
        else if (handler.options?.useAutoSchema) {
            const { params } = this.autoInspectHandlerParams(name);
            if (!params) {
                return { isValid: false, message: 'Invalid payload - must contain parameters or empty object {}', source: 'auto-schema' };
            }
            for (const key of params) {
                if (!payload?.hasOwnProperty(key)) {
                    return { isValid: false, message: `Missing required parameter: ${key}`, source: 'auto-schema' };
                }
            }
        }
        return { isValid: true, message: null, source: null };
    }
    autoInspectHandlerParams(name) {
        const handler = this.get(name);
        if (!handler) {
            return { params: undefined, fn: undefined, options: undefined };
        }
        const fnStr = handler.fn.toString().replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, '');
        // Match function ( { key1, key2 } ) or ( {key1, key2} )
        const match = fnStr.match(/\{\s*([^}]*)\s*\}/);
        if (!match || !match[1]) {
            return { params: undefined, ...handler };
        }
        // Split by comma, trim spaces, remove default values
        const params = match[1]
            .split(',')
            .map(k => k.split('=')[0]?.trim())
            .filter(Boolean);
        return { params, ...handler };
    }
}
//# sourceMappingURL=handlerRegistry.js.map