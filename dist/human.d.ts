export interface HumanBox {
    x: number;
    y: number;
    width: number;
    height: number;
}
export interface HumanLocator {
    scrollIntoViewIfNeeded(): Promise<void>;
    boundingBox(): Promise<HumanBox | null>;
}
export interface HumanPage {
    mouse: {
        move(x: number, y: number): Promise<void>;
        down(options?: {
            button?: "left" | "right" | "middle";
        }): Promise<void>;
        up(options?: {
            button?: "left" | "right" | "middle";
        }): Promise<void>;
        wheel(deltaX: number, deltaY: number): Promise<void>;
    };
    keyboard: {
        type(text: string): Promise<void>;
        press(key: string): Promise<void>;
    };
    locator(selector: string): HumanLocator;
    viewportSize(): {
        width: number;
        height: number;
    } | null;
    evaluate(pageFunction: any): Promise<any>;
}
export interface HumanOptions {
    speed?: number;
    nativeCursor?: boolean;
    typoRate?: number;
}
export interface HumanClickOptions {
    button?: "left" | "right" | "middle";
}
type Point = {
    x: number;
    y: number;
};
export declare class Human {
    private readonly page;
    private readonly speed;
    private readonly nativeCursor;
    private readonly typoRate;
    private x;
    private y;
    private placed;
    constructor(page: HumanPage, options?: HumanOptions);
    pause(min?: number, max?: number): Promise<void>;
    moveTo(x: number, y: number): Promise<void>;
    click(target: string | Point, options?: HumanClickOptions): Promise<void>;
    hover(target: string | Point): Promise<void>;
    clear(selector: string): Promise<void>;
    type(target: string | null, text: string): Promise<void>;
    scroll(deltaY: number): Promise<void>;
    scrollTo(selector: string): Promise<void>;
    idle(ms?: number): Promise<void>;
    private keyDelay;
    private ensurePlaced;
    private viewportHeight;
    private pointInside;
    private curve;
}
export declare function createHuman(page: HumanPage, options?: HumanOptions): Human;
export {};
