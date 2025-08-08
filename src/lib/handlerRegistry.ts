import type { HandlerMap } from '../types/index.js';

type Validator<P> = (payload: P) => { isValid: boolean; message: string | null };

export type HandlerOptions<P> = {
  maxRetries?: number;
  maxProcessingTime?: number;
  paramSchema?: Validator<P>; // schema for validating parameters
  useAutoSchema?: boolean; // whether to use auto schema generation
};

export type HandlerWithOptions<P = Object> = {
  fn: (payload: P) => any;
  options?: HandlerOptions<P>;
};

type ParamValidatorReturnType = { isValid: boolean; message: string | null; source: 'auto-schema' | 'param-schema' | null };

export class HandlerRegistry<H extends HandlerMap> {
  private readonly handlers = new Map<keyof H, HandlerWithOptions<any>>();

  register<K extends keyof H>(name: K, fn: H[K], options?: HandlerOptions<Parameters<H[K]>[0]>) {
    this.handlers.set(name, { fn, options });
  }

  get<K extends keyof H>(name: K): HandlerWithOptions<Parameters<H[K]>[0]> | undefined {
    return this.handlers.get(name);
  }

  validateParams<K extends keyof H>(name: K, payload?: Parameters<H[K]>[0]): ParamValidatorReturnType {
    const handler = this.get(name);

    if (!handler) {
      return { isValid: false, message: `Handler ${name as string} is not registered`, source: null };
    }

    const { paramSchema } = handler.options || {};
    if (paramSchema) {
      const validationResult = paramSchema(payload);
      if (validationResult.isValid !== true) {
        return { isValid: false, message: `Invalid payload for ${name as string}: ${validationResult.message}`, source: 'param-schema' };
      }
    } else if (handler.options?.useAutoSchema) {
      const { params } = this.autoInspectHandlerParams(name);
      if (!params) {
        console.log(params);
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

  private autoInspectHandlerParams(name: keyof H) {
    const handler = this.get(name);
    if (!handler) {
      return { params: undefined, fn: undefined, options: undefined };
    }

    const fnStr = handler.fn.toString().replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, '');
    console.log(fnStr);
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
