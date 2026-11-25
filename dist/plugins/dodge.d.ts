import type { BexxcvPlugin } from "./types.js";
export interface DodgeOptions {
    pool: string[];
    rotateOn?: number[];
    healthCheck?: boolean;
    healthTimeout?: number;
    cooldown?: number;
    onBlocked?: (info: {
        proxy: string;
        status: number;
        url: string;
    }) => void;
}
type ProxyConfig = {
    server: string;
    username?: string;
    password?: string;
};
export declare function toProxyConfig(url: string): ProxyConfig;
export declare function dodge(input: string[] | DodgeOptions): BexxcvPlugin;
export {};
