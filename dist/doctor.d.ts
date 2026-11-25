export declare const DEFAULT_MAX_AGE_DAYS = 180;
export interface DataStamp {
    updated: string;
    rows?: number;
    sha256?: string;
}
export interface DataStatus {
    exists: boolean;
    bytes: number;
    stamp: DataStamp | null;
    ageDays: number | null;
    stale: boolean;
}
export declare function readStamp(dir?: string): DataStamp | null;
export declare function dataStatus(options?: {
    dir?: string;
    maxAgeDays?: number;
}): DataStatus;
export declare function warnIfDataStale(maxAgeDays?: number): void;
export declare function doctor(options?: {
    dir?: string;
    maxAgeDays?: number;
}): Promise<{
    ok: boolean;
    lines: string[];
}>;
