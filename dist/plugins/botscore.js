const SCORES = new WeakMap();
const WATCHED = new WeakSet();
/** Parse a bot-management score from a response. Returns null if not present. */
function parseBotScore(response) {
    const headers = response.headers();
    // Cloudflare Enterprise Bot Management sometimes echoes score
    const raw = headers["cf-bot-management-score"] ??
        headers["x-cf-bot-score"] ??
        headers["x-moz"] ??
        null;
    if (!raw)
        return null;
    const score = Number(raw);
    if (!Number.isFinite(score))
        return null;
    return { score, src: raw };
}
export function botScore(options = {}) {
    const cacheEnabled = options.cache ?? true;
    return {
        name: "bot-score-monitor",
        order: 41,
        onContext(context) {
            if (!cacheEnabled)
                return;
            SCORES.set(context, []);
        },
        onPage(page) {
            if (WATCHED.has(page))
                return;
            WATCHED.add(page);
            page.context()?.on?.("response", (response) => {
                const result = parseBotScore(response);
                if (!result || result.score === null)
                    return;
                const entry = {
                    url: response.url(),
                    score: result.score,
                    src: result.src,
                    timestamp: Date.now(),
                };
                if (cacheEnabled && page.context()) {
                    const list = SCORES.get(page.context()) ?? [];
                    list.push(entry);
                    if (list.length > 50)
                        list.shift();
                    if (page.context())
                        SCORES.set(page.context(), list);
                }
                // Log low scores as warnings (score < 30 = likely automated per CF docs)
                if (result.score < 30) {
                    console.warn(`[bexxcv] bot-score: low score ${result.score} on ${response.url()} (src: ${result.src})`);
                }
            });
        },
    };
}
/** Retrieve cached bot-score entries for a context. */
export function getBotScores(context) {
    return SCORES.get(context) ?? [];
}
/** Get the average bot score across all cached entries for a context. */
export function avgBotScore(context) {
    const entries = SCORES.get(context) ?? [];
    const scored = entries.filter((e) => e.score !== null && e.score !== undefined);
    if (scored.length === 0)
        return null;
    return scored.reduce((sum, e) => sum + (e.score ?? 0), 0) / scored.length;
}
/** Check whether any recent score fell below threshold. */
export function hadLowScore(context, threshold = 30, windowMs = 300_000) {
    const now = Date.now();
    return SCORES.get(context)?.some((e) => e.score !== null && e.score < threshold && now - e.timestamp < windowMs) ?? false;
}
/** Attach bot-score monitoring to an existing browser or context. */
export function attachBotScore(target, _options = {}) {
    void botScore(_options);
    return target;
}
