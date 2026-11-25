export declare function isKnownPhysical(width: number, height: number): boolean;
export declare function coherentDprWeights(pool: [number, number][], width: number, height: number): [number[], number[]];
export declare function reconcileWebglKeys(data: Record<string, unknown>, known: Record<string, string>): Record<string, unknown>;
export declare const REALISM_PROPERTIES: string[];
export declare function realismDefaults(known: Record<string, string>): Record<string, unknown>;
export declare function snapScreen(config: Record<string, unknown>, pool: [number, number][]): boolean;
export declare function languageList(language: string, region: string): string;
