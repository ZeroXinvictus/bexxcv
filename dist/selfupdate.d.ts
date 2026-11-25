export interface SelfUpdateInfo {
    current: string;
    latest: string;
    hasUpdate: boolean;
    releaseUrl: string;
}
export declare function checkSelfUpdate(): Promise<SelfUpdateInfo>;
export declare function applySelfUpdate(): Promise<void>;
