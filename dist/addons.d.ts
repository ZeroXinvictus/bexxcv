export declare const DefaultAddons: {
    UBO: string;
};
export declare function confirmPaths(paths: string[]): void;
export declare function addDefaultAddons(addonsList: string[], excludeList?: (keyof typeof DefaultAddons)[]): Promise<void>;
export declare function downloadAndExtract(url: string, extractPath: string, name: string): Promise<void>;
export declare function maybeDownloadAddons(addons: Record<string, string>, addonsList?: string[]): Promise<void>;
