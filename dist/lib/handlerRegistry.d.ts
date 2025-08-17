import type { HandlerMap } from '../types/index.js';
type Validator<P> = (payload: P) => {
    isValid: boolean;
    message: string | null;
};
export type HandlerOptions<P> = {
    maxRetries?: number;
    maxProcessingTime?: number;
    paramSchema?: Validator<P>;
    useAutoSchema?: boolean;
};
export type HandlerWithOptions<P = Object> = {
    fn: (payload: P) => any;
    options?: HandlerOptions<P>;
};
type ParamValidatorReturnType = {
    isValid: boolean;
    message: string | null;
    source: 'auto-schema' | 'param-schema' | null;
};
export declare class HandlerRegistry<H extends HandlerMap> {
    private readonly handlers;
    register<K extends keyof H>(name: K, fn: H[K], options?: HandlerOptions<Parameters<H[K]>[0]>): void;
    get<K extends keyof H>(name: K): HandlerWithOptions<Parameters<H[K]>[0]>;
    validateParams<K extends keyof H>(name: K, payload?: Parameters<H[K]>[0]): ParamValidatorReturnType;
    private autoInspectHandlerParams;
}
export {};
