// Copyright (c) 2026 DIVISION 7 | MI-7 (@divisionseven)
// SPDX-License-Identifier: MIT
// V2 route legs for the OpenCode v2 HTTP API (host-free, raw fetch only).
// V1 paths (/session/status, /session/:id, prompt_async) do not exist on v2
// servers (verified: @opencode/* ships zero prompt_async routes; v2 serves
// /api/* and answers unknown paths with the SPA shell). Every helper here
// tries the v1 shape first so v1 behavior stays byte-identical, then falls
// back to the v2 shape. No host-SDK imports; the v2 adapter and the shared
// cores are the only callers.
import { POST_TIMEOUT_MS, ROUTE_PROBE_TIMEOUT_MS } from "./constants.js";
import { enumPorts } from "./enumerate.js";
import { withDiscoveredPorts } from "./serviceDiscovery.js";
import { assertBodySendable } from "./outbox.js";
import { fetchSessionStatusMap, unwrapStatusMap } from "./registry.js";
import { getServerAuthHeaderSync } from "./serverAuth.js";
import { isSilent } from "./wake.js";
/** v2 liveness path: answers {data: {sessionId: {type}}} like v1 status. */
export const V2_ACTIVE_PATH = "/api/session/active";
/** v2 session read path (GET answers {data: SessionInfo} or SessionInfo). */
export function v2SessionPath(sessionId) {
    return `/api/session/${sessionId}`;
}
/** v2 inject path: user admission renders the chat bubble like v1. */
export function v2PromptPath(sessionId) {
    return `/api/session/${sessionId}/prompt`;
}
/** v2 delivery mirrors wake: steer admits now, queue waits its turn. */
export function v2DeliveryForWake(opts) {
    return isSilent(opts) ? "queue" : "steer";
}
/** Ports to probe: explicit list wins, else MESH_ENUM_PORTS, else the pin. */
export function portsToProbe(explicit) {
    if (explicit && explicit.length > 0)
        return [...new Set(explicit)];
    return enumPorts();
}
/**
 * Async portsToProbe: folds in the host service record so an ephemeral
 * service port leads the probe list. Every caller on this path is already
 * async, and with no record the sync list is returned untouched.
 */
export async function portsToProbeAsync(explicit) {
    return withDiscoveredPorts(portsToProbe(explicit));
}
/** Loopback base for one port; registry addresses are never dialed. */
function baseFor(port) {
    return `http://127.0.0.1:${port}`;
}
function authHeaders(auth) {
    return auth ? { Authorization: auth } : {};
}
/** One v2 active view; null on any miss (timeout, refused, non-ok). */
export async function fetchV2Active(port, auth) {
    try {
        const res = await fetch(`${baseFor(port)}${V2_ACTIVE_PATH}`, {
            headers: authHeaders(auth),
            signal: AbortSignal.timeout(ROUTE_PROBE_TIMEOUT_MS),
        });
        if (!res.ok)
            return null;
        const raw = (await res.json());
        return unwrapStatusMap(raw);
    }
    catch {
        return null;
    }
}
/** Merged liveness across v1 status plus v2 active on every probed port. */
export async function activeUnion(ports, auth, opts) {
    const viaAuth = auth ?? getServerAuthHeaderSync();
    const withV1 = opts?.v1 ?? true;
    const merged = {};
    for (const port of await portsToProbeAsync(ports)) {
        const view = (withV1 ? await fetchSessionStatusMap(port) : null) ??
            (await fetchV2Active(port, viaAuth));
        if (view)
            for (const [id, st] of Object.entries(view))
                merged[id] ??= st;
    }
    return Object.keys(merged).length > 0 ? merged : null;
}
/** One v2 session row; null on miss or unparseable body. */
export async function fetchV2Session(port, sessionId, auth) {
    try {
        const res = await fetch(`${baseFor(port)}${v2SessionPath(sessionId)}`, {
            headers: authHeaders(auth),
            signal: AbortSignal.timeout(ROUTE_PROBE_TIMEOUT_MS),
        });
        if (!res.ok)
            return null;
        const raw = (await res.json());
        if (raw && typeof raw === "object") {
            const data = raw.data;
            if (data && typeof data === "object")
                return data;
            return raw;
        }
        return null;
    }
    catch {
        return null;
    }
}
/**
 * First session row across ports, v1 shape first per port (v1 behavior
 * unchanged when a v1 server answers; v2 servers answer the v2 leg only).
 */
export async function locateSession(sessionId, ports, auth) {
    const viaAuth = auth ?? getServerAuthHeaderSync();
    const headers = authHeaders(viaAuth);
    for (const port of await portsToProbeAsync(ports)) {
        try {
            const res = await fetch(`${baseFor(port)}/session/${sessionId}`, {
                headers,
                signal: AbortSignal.timeout(ROUTE_PROBE_TIMEOUT_MS),
            });
            if (res.status === 200) {
                try {
                    return { kind: "v1", port, row: (await res.json()) };
                }
                catch {
                    // Parse failure falls through to the v2 leg on the same port.
                }
            }
        }
        catch {
            // Network failure falls through to the v2 leg on the same port.
        }
        const v2row = await fetchV2Session(port, sessionId, viaAuth);
        if (v2row)
            return { kind: "v2", port, row: v2row };
    }
    return null;
}
/**
 * v2 inject via user admission (renders the user chat bubble exactly like
 * the v1 prompt_async leg; synthetic admission wakes but never draws it).
 * 2xx admits; callers own the status contract (404 miss, 401 auth, 413
 * guard, 429 busy all stay typed there).
 */
export async function postV2Prompt(port, sessionId, text, opts, auth) {
    const viaAuth = auth ?? getServerAuthHeaderSync();
    const headers = { "Content-Type": "application/json" };
    if (viaAuth)
        headers.Authorization = viaAuth;
    const body = JSON.stringify({
        text,
        delivery: v2DeliveryForWake(opts),
    });
    assertBodySendable(Buffer.byteLength(body, "utf8"));
    try {
        const res = await fetch(`${baseFor(port)}${v2PromptPath(sessionId)}`, {
            method: "POST",
            headers,
            body,
            signal: AbortSignal.timeout(POST_TIMEOUT_MS),
        });
        if (!res.ok)
            return { ok: false, status: res.status };
        try {
            const raw = (await res.json());
            const id = raw && typeof raw === "object"
                ? raw.id
                : undefined;
            if (typeof id === "string" && id.length > 0)
                return { ok: true, id };
        }
        catch {
            // Bodyless 2xx still admits; the caller brands the wire id itself.
        }
        return { ok: true };
    }
    catch {
        return { ok: false };
    }
}
/** ModelRef-ish ({providerID, id|modelID}) to the registry model string. */
export function v2ModelString(model) {
    if (!model || typeof model !== "object")
        return undefined;
    const rec = model;
    const providerID = rec.providerID;
    const modelID = rec.modelID ?? rec.id;
    if (typeof providerID === "string" &&
        providerID.length > 0 &&
        typeof modelID === "string" &&
        modelID.length > 0) {
        return `${providerID}/${modelID}`;
    }
    return undefined;
}
/**
 * v2 SessionInfo to the receiver-parser shape ({agent, model}); null when
 * the row cannot address a wire triple (unknown agent or unusable model).
 */
export function v2RowToTriple(row) {
    if (!row || typeof row !== "object")
        return null;
    const rec = row;
    const agent = rec.agent;
    if (typeof agent !== "string" || agent.length === 0 || agent === "unknown") {
        return null;
    }
    const model = v2ModelString(rec.model);
    if (typeof model !== "string" || model.length === 0)
        return null;
    return { agent, model };
}
//# sourceMappingURL=v2routes.js.map