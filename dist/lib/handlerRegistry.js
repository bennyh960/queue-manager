export class HandlerRegistry {
    handlers = new Map();
    register(name, fn, options) {
        this.handlers.set(name, { fn, options });
    }
    get(name) {
        return this.handlers.get(name);
    }
}
//# sourceMappingURL=handlerRegistry.js.map