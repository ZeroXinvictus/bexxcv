export declare function needsXvfb(): boolean;
export declare function startXvfb(debug?: boolean): Promise<{
    display: string;
    kill: () => void;
}>;
export declare function withXvfb<T>(fn: (display: string) => Promise<T>, debug?: boolean): Promise<T>;
