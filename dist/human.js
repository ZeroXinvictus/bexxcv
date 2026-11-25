const KEY_ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
function rand() {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0] / 4294967296;
}
function between(min, max) {
    return min + rand() * (max - min);
}
function gauss(mean, sd) {
    const u = 1 - rand();
    const v = rand();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
function logNormal(median, sigma) {
    return median * Math.exp(gauss(0, sigma));
}
function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}
function neighborKey(ch) {
    const lower = ch.toLowerCase();
    const candidates = [];
    for (let r = 0; r < KEY_ROWS.length; r++) {
        const idx = KEY_ROWS[r].indexOf(lower);
        if (idx === -1)
            continue;
        const row = KEY_ROWS[r];
        if (idx > 0)
            candidates.push(row[idx - 1]);
        if (idx < row.length - 1)
            candidates.push(row[idx + 1]);
        for (const other of [r - 1, r + 1]) {
            const otherRow = KEY_ROWS[other];
            if (otherRow && otherRow[idx])
                candidates.push(otherRow[idx]);
        }
        break;
    }
    if (candidates.length === 0)
        return null;
    const pick = candidates[Math.floor(rand() * candidates.length)];
    return ch === lower ? pick : pick.toUpperCase();
}
export class Human {
    page;
    speed;
    nativeCursor;
    typoRate;
    x;
    y;
    placed = false;
    constructor(page, options = {}) {
        this.page = page;
        this.speed = clamp(options.speed ?? 1, 0.2, 20);
        this.nativeCursor = options.nativeCursor ?? true;
        this.typoRate = clamp(options.typoRate ?? 0.015, 0, 0.2);
        const view = page.viewportSize() ?? { width: 1280, height: 720 };
        this.x = between(view.width * 0.25, view.width * 0.75);
        this.y = between(view.height * 0.25, view.height * 0.75);
    }
    async pause(min = 350, max = 1400) {
        const target = clamp(logNormal(Math.sqrt(min * max), 0.35), min, max);
        await sleep(target / this.speed);
    }
    async moveTo(x, y) {
        await this.ensurePlaced();
        if (this.nativeCursor) {
            await this.page.mouse.move(x, y);
            this.x = x;
            this.y = y;
            return;
        }
        const dx = x - this.x;
        const dy = y - this.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 2) {
            await this.page.mouse.move(x, y);
            this.x = x;
            this.y = y;
            return;
        }
        if (dist > 300 && rand() < 0.35) {
            const over = between(6, 18);
            await this.curve(x + (dx / dist) * over, y + (dy / dist) * over);
        }
        await this.curve(x, y);
    }
    async click(target, options = {}) {
        const point = typeof target === "string" ? await this.pointInside(target) : target;
        await this.moveTo(point.x, point.y);
        await sleep(between(50, 200) / this.speed);
        await this.page.mouse.down({ button: options.button });
        await sleep(between(45, 130));
        await this.page.mouse.up({ button: options.button });
    }
    async hover(target) {
        const point = typeof target === "string" ? await this.pointInside(target) : target;
        await this.moveTo(point.x, point.y);
        await sleep(between(80, 260) / this.speed);
    }
    async clear(selector) {
        await this.click(selector);
        await sleep(between(80, 220) / this.speed);
        await this.page.keyboard.press("ControlOrMeta+A");
        await sleep(between(60, 160) / this.speed);
        await this.page.keyboard.press("Backspace");
    }
    async type(target, text) {
        if (target) {
            await this.click(target);
            await sleep(between(120, 400) / this.speed);
        }
        let untilBreak = Math.round(between(6, 18));
        for (const ch of Array.from(text)) {
            if (this.typoRate > 0 && /[a-z]/i.test(ch) && rand() < this.typoRate) {
                const wrong = neighborKey(ch);
                if (wrong) {
                    await this.page.keyboard.type(wrong);
                    await sleep(this.keyDelay() + between(120, 380) / this.speed);
                    await this.page.keyboard.press("Backspace");
                    await sleep(between(60, 200) / this.speed);
                }
            }
            await this.page.keyboard.type(ch);
            let wait = this.keyDelay();
            if (ch === " ")
                wait += between(30, 140) / this.speed;
            else if (/[.,;:!?]/.test(ch))
                wait += between(80, 260) / this.speed;
            untilBreak--;
            if (untilBreak <= 0) {
                wait += between(200, 650) / this.speed;
                untilBreak = Math.round(between(6, 18));
            }
            await sleep(wait);
        }
    }
    async scroll(deltaY) {
        const dir = Math.sign(deltaY);
        if (!dir)
            return;
        await this.ensurePlaced();
        let remaining = Math.abs(deltaY);
        while (remaining > 0) {
            const chunk = Math.min(remaining, Math.round(between(60, 170)));
            await this.page.mouse.wheel(0, dir * chunk);
            remaining -= chunk;
            let wait = clamp(logNormal(38, 0.5), 12, 160) / this.speed;
            if (rand() < 0.06)
                wait += between(250, 900) / this.speed;
            await sleep(wait);
        }
    }
    async scrollTo(selector) {
        const box = await this.page.locator(selector).boundingBox();
        if (!box)
            throw new Error(`Element not found or not visible: ${selector}`);
        const height = await this.viewportHeight();
        const delta = box.y + box.height / 2 - height / 2;
        if (Math.abs(delta) > 40) {
            await this.scroll(delta + between(-60, 60));
        }
    }
    async idle(ms = 1500) {
        await this.ensurePlaced();
        const end = Date.now() + ms / this.speed;
        while (Date.now() < end) {
            this.x = Math.max(0, this.x + gauss(0, 10));
            this.y = Math.max(0, this.y + gauss(0, 8));
            await this.page.mouse.move(this.x, this.y);
            await sleep(between(120, 500) / this.speed);
        }
    }
    keyDelay() {
        return clamp(logNormal(105, 0.4), 35, 420) / this.speed;
    }
    async ensurePlaced() {
        if (this.placed)
            return;
        this.placed = true;
        await this.page.mouse.move(this.x, this.y);
    }
    async viewportHeight() {
        const view = this.page.viewportSize();
        if (view)
            return view.height;
        try {
            const value = await this.page.evaluate("window.innerHeight");
            if (typeof value === "number" && value > 0)
                return value;
        }
        catch {
            return 720;
        }
        return 720;
    }
    async pointInside(selector) {
        const locator = this.page.locator(selector);
        await locator.scrollIntoViewIfNeeded();
        const box = await locator.boundingBox();
        if (!box)
            throw new Error(`Element not found or not visible: ${selector}`);
        return {
            x: box.x + box.width * clamp(gauss(0.5, 0.15), 0.12, 0.88),
            y: box.y + box.height * clamp(gauss(0.5, 0.15), 0.12, 0.88),
        };
    }
    async curve(tx, ty) {
        const sx = this.x;
        const sy = this.y;
        const dx = tx - sx;
        const dy = ty - sy;
        const dist = Math.hypot(dx, dy);
        if (dist < 1) {
            await this.page.mouse.move(tx, ty);
            this.x = tx;
            this.y = ty;
            return;
        }
        const nx = -dy / dist;
        const ny = dx / dist;
        const side = rand() < 0.5 ? -1 : 1;
        const spread = dist * between(0.05, 0.25) * side;
        const c1 = {
            x: sx + dx * 0.3 + nx * spread,
            y: sy + dy * 0.3 + ny * spread,
        };
        const c2 = {
            x: sx + dx * 0.7 + nx * spread * between(0.3, 1),
            y: sy + dy * 0.7 + ny * spread * between(0.3, 1),
        };
        const steps = clamp(Math.round(dist / between(7, 14)), 6, 90);
        const duration = clamp(logNormal(180 + dist * 0.9, 0.2), 120, 1400) / this.speed;
        for (let i = 1; i <= steps; i++) {
            const raw = i / steps;
            const t = raw * raw * (3 - 2 * raw);
            const u = 1 - t;
            let px = u * u * u * sx + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * tx;
            let py = u * u * u * sy + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * ty;
            if (i < steps) {
                px += gauss(0, 0.5);
                py += gauss(0, 0.5);
            }
            else {
                px = tx;
                py = ty;
            }
            await this.page.mouse.move(Math.max(0, px), Math.max(0, py));
            await sleep((duration / steps) * between(0.6, 1.4));
        }
        this.x = tx;
        this.y = ty;
    }
}
export function createHuman(page, options = {}) {
    return new Human(page, options);
}
