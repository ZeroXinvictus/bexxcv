import type { BrowserContext } from "playwright-core";
import type { BexxcvPlugin } from "./types.js";
export interface WiretapOptions {
    match?: string[];
    methods?: string[];
    out?: string;
    bodies?: boolean;
    maxBodyBytes?: number;
    streamTimeout?: number;
    redact?: boolean;
}
export interface WiretapEntry {
    time: string;
    method: string;
    url: string;
    status: number;
    requestHeaders: Record<string, string>;
    postData: string | null;
    responseHeaders: Record<string, string>;
    contentType: string;
    body: string | null;
    bodyNote?: string;
    events?: string[];
}
export declare function wiretapEntries(context: BrowserContext): WiretapEntry[];
export declare function wiretap(input?: string | string[] | WiretapOptions): BexxcvPlugin;
