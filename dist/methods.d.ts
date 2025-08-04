export type TaskPayloads = {
    sendEmail: {
        email: string;
    };
    resizeImage: {
        imageUrl: string;
    };
};
export type TaskHandlers = {
    [K in keyof TaskPayloads]: (payload: TaskPayloads[K]) => Promise<void>;
};
export declare function sendEmail(payload: {
    email: string;
}): Promise<void>;
export declare function resizeImage(payload: {
    imageUrl: string;
}): Promise<void>;
export interface HandlerMap {
    sendEmail: (payload: {
        email: string;
    }) => Promise<void>;
    resizeImage: (payload: {
        imageUrl: string;
    }) => Promise<void>;
}
