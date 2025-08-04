export declare class HandlerRegistry<H extends Record<string, (payload: any) => any>> {
    private handlers;
    register<K extends keyof H>(name: K, handler: H[K]): void;
    get<K extends keyof H>(name: K): H[K] | undefined;
}
