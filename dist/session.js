const SESSIONS = new WeakMap();
const ACTIVE_SESSIONS = new Map();
let sessionIdCounter = 0;
function generateSeed(length) {
    const buf = new Uint8Array(length);
    crypto.getRandomValues(buf);
    return buf;
}
function deriveByte(seed, index) {
    let hash = 0x9e3779b9;
    const data = new Uint8Array(seed.length + 4);
    data.set(seed);
    const view = new DataView(data.buffer);
    view.setUint32(seed.length, index, false);
    for (let i = 0; i < data.length; i++) {
        hash ^= data[i];
        hash = (hash * 0x5bd1e995 + 0x7b5a9a7f) >>> 0;
    }
    return hash >>> 0;
}
function seededRandom(seed, index) {
    const value = deriveByte(seed, index);
    return value / 0x100000000;
}
function gaussFromSeed(seed, index, mean, sd) {
    const u1 = Math.max(seededRandom(seed, index * 2), 1e-10);
    const u2 = seededRandom(seed, index * 2 + 1);
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + sd * z;
}
export function getSessionId(page) {
    const state = SESSIONS.get(page);
    if (!state)
        return null;
    for (const [id, s] of ACTIVE_SESSIONS) {
        if (s === state)
            return id;
    }
    return null;
}
export function initSession(page, options = {}) {
    const existingId = getSessionId(page);
    if (existingId)
        return existingId;
    const id = `sess_${++sessionIdCounter}_${Date.now().toString(36)}`;
    const state = {
        createdAt: Date.now(),
        pageCount: 0,
        seedBuffer: generateSeed(options.seedLength ?? 32),
    };
    SESSIONS.set(page, state);
    ACTIVE_SESSIONS.set(id, state);
    return id;
}
export function getSession(state) {
    return {
        seed: state.seedBuffer,
        now: Date.now(),
        elapsedMs: Date.now() - state.createdAt,
        pageIndex: state.pageCount,
    };
}
export function getSeededFloat(state, index) {
    return seededRandom(state.seedBuffer, index);
}
export function getSeededInt(state, index, min, max) {
    const range = max - min + 1;
    return min + (deriveByte(state.seedBuffer, index) % range);
}
export function getSeededGauss(state, index, mean, sd) {
    return gaussFromSeed(state.seedBuffer, index, mean, sd);
}
export function advancePage(page) {
    const state = SESSIONS.get(page);
    if (state)
        state.pageCount++;
}
export function endSession(page) {
    const state = SESSIONS.get(page);
    if (!state)
        return;
    for (const [id, s] of ACTIVE_SESSIONS) {
        if (s === state) {
            ACTIVE_SESSIONS.delete(id);
            break;
        }
    }
    SESSIONS.delete(page);
}
export function isSessionExpired(page, timeoutMs) {
    const state = SESSIONS.get(page);
    if (!state)
        return true;
    const timeout = timeoutMs ?? 1_800_000;
    return Date.now() - state.createdAt > timeout;
}
