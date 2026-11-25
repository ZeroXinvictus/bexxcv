export declare const PIN_FILE: string;
export interface BrowserPin {
    tag: string;
    repo: string;
    repoName: string;
    version: string;
    build: string;
}
export declare function pinSpec(pin: BrowserPin): string;
export declare function loadPin(file?: string): BrowserPin | null;
export declare function effectivePin(config: {
    channel?: string;
    pinned?: string;
}): BrowserPin | null;
export declare function pinMatches(pin: BrowserPin, repoName: string, version: string, build: string): boolean;
