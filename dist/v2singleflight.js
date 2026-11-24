// Copyright (c) 2026 DIVISION 7 | MI-7 (@divisionseven)
// SPDX-License-Identifier: MIT
// V2 single-flight guard: one heartbeat, one claimer, one attach poller per
// process, merged ownership by union, refcounted teardown. Host-free; the V2
// adapter is the only writer. The frozen V1 entry predates this guard (it arms
// its own module-let timers), so cross-shape same-process dedupe is a named
// gap; two same-shape setups in one process are fully arbitrated here.
import { HEARTBEAT_INTERVAL_MS } from "./constants.js";
/** globalThis key; module `let` cannot dedupe across two bundles. */
const GUARD_KEY = "__opencode_mesh_v2_singleflight__";
function loadState() {
    const g = globalThis;
    let s = g[GUARD_KEY];
    if (!s) {
        s = { setups: 0, ids: new Set(), timer: null };
        g[GUARD_KEY] = s;
    }
    return s;
}
/**
 * Acquire one V2 setup slot. The first acquirer arms shared timers; later
 * setups register cheaply and arm zero timers. Merges nothing by itself; call
 * mergeV2Ids for union ownership.
 */
export function acquireV2Setup() {
    const s = loadState();
    const first = s.setups === 0;
    s.setups += 1;
    return { first };
}
/**
 * Release one V2 setup slot. The last release stops the shared timer; every
 * other release only decrements. Returns true when the caller released last.
 */
export function releaseV2Setup() {
    const s = loadState();
    s.setups = Math.max(0, s.setups - 1);
    const last = s.setups === 0;
    if (last && s.timer) {
        clearInterval(s.timer);
        s.timer = null;
    }
    return { last };
}
/** Merge ids into shared ownership by union; never overwrite. */
export function mergeV2Ids(ids) {
    const s = loadState();
    for (const id of ids)
        s.ids.add(id);
}
/** Drop ids from shared ownership (per-setup teardown calls this with its own ids only). */
export function removeV2Ids(ids) {
    const s = loadState();
    for (const id of ids)
        s.ids.delete(id);
}
/** Snapshot of shared owned ids (union across live setups). */
export function v2OwnedIds() {
    return [...loadState().ids];
}
/** Live V2 setup count (0 when fully torn down). */
export function v2SetupCount() {
    return loadState().setups;
}
/**
 * Arm the shared heartbeat tick; no-op unless this process holds no timer.
 * The tick callback owns zero I/O beyond the callback itself.
 */
export function armV2SharedTimer(tick) {
    const s = loadState();
    if (s.timer)
        return;
    s.timer = setInterval(tick, HEARTBEAT_INTERVAL_MS);
    const t = s.timer;
    if (typeof t.unref === "function")
        t.unref();
}
/** Test/harness reset: stop the timer and drop all slots and ids. */
export function resetV2Singleflight() {
    const s = loadState();
    if (s.timer)
        clearInterval(s.timer);
    s.timer = null;
    s.setups = 0;
    s.ids.clear();
}
/**
 * One shared tick: adopt database-fresh sessions so restarts re-own live
 * rows, then heartbeat the union. Never throws; setup arms it, tests drive
 * it directly with no timers involved.
 */
export async function runV2SharedTick() {
    try {
        const { adoptDbSessions } = await import("./adopt.js");
        const pass = await adoptDbSessions().catch(() => null);
        if (pass)
            mergeV2Ids([...pass.adopted, ...pass.heartbeated]);
    }
    catch { }
    for (const sid of v2OwnedIds()) {
        try {
            const { heartbeat } = await import("./registry.js");
            await heartbeat(sid);
        }
        catch { }
    }
}
//# sourceMappingURL=v2singleflight.js.map