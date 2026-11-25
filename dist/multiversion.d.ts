import { Version } from "./pkgman.js";
export declare const browsersDir: () => string;
export declare const configFile: () => string;
export declare const compatFlag: () => string;
export interface CamoufoxConfig {
    active_version?: string | null;
    channel?: string;
    pinned?: string;
    pinned_sha?: string;
    [key: string]: unknown;
}
export declare function loadConfig(): CamoufoxConfig;
export declare function saveConfig(config: CamoufoxConfig): void;
export declare function setActive(relativePath: string): void;
export declare function getRepoName(githubRepo: string): string;
export declare function versionFolderName(version: string, build: string, sha256?: string): string;
export interface InstalledVersion {
    repoName: string;
    version: Version;
    path: string;
    relativePath: string;
    isActive: boolean;
    isPrerelease: boolean;
    sha256?: string;
}
export declare function listInstalled(): InstalledVersion[];
export declare function getActivePath(): string | null;
