export declare const KNOWN_GPUS: Record<"win" | "mac" | "lin", Array<{
    vendor: string;
    renderer: string;
    weight: number;
}>>;
export declare function sampleGPUProfile(os: "win" | "mac" | "lin"): {
    vendor: string;
    renderer: string;
    webglExtensions: string[];
    glslVersion: string;
};
export declare function resolveUAOS(userAgent: string): "win" | "mac" | "lin";
