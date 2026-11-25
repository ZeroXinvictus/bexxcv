export declare class VirtualDisplay {
    private debug;
    private proc;
    private _display;
    constructor(debug?: boolean);
    private get xvfb_args();
    private get xvfb_path();
    private spawnXvfb;
    get(): Promise<string>;
    kill(): void;
    private static assert_linux;
}
