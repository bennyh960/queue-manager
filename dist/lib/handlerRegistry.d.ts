type HandlerOptions = {
    maxRetries?: number;
    maxProcessingTime?: number;
};
type HandlerWithOptions = {
    fn: (payload: any) => any;
    options?: HandlerOptions;
};
export declare class HandlerRegistry<H extends Record<string, (payload: Object) => any>> {
    private readonly handlers;
    register<K extends keyof H>(name: K, fn: H[K], options?: HandlerOptions): void;
    get(name: string): HandlerWithOptions | undefined;
}
export {};
