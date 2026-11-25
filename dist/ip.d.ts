import { InvalidIP, InvalidProxy } from "./exceptions.js";
export { InvalidIP, InvalidProxy };
export interface Proxy {
    server: string;
    username?: string;
    password?: string;
    bypass?: string;
}
export declare class ProxyHelper {
    static parseServer(server: string): {
        schema: string;
        url: string;
        port?: string;
    };
    static asString(proxy: Proxy): string;
    static asAxiosProxy(proxyString: string): {
        [key: string]: string;
    };
}
export declare function validIPv4(ip: string | false): boolean;
export declare function validIPv6(ip: string | false): boolean;
export declare function validateIP(ip: string): void;
export declare function publicIP(proxy?: string): Promise<string>;
