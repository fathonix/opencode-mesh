// Copyright (c) 2026 DIVISION 7 | MI-7 (@divisionseven)
// SPDX-License-Identifier: MIT
// Opt-in Keychain password provider.
// Exact flag match only; sole /usr/bin/security owner.
import { execFile, execFileSync } from "node:child_process";
export const KEYCHAIN_USERNAME = "opencode";
const SECURITY_BIN = "/usr/bin/security";
const SECRET_TOOL_BIN = "/usr/bin/secret-tool";
let cached = null;
const TTL_MS = 5 * 60 * 1000;
function sanitizedLogin() {
    const rawUser = process.env.USER ?? "";
    return /^[A-Za-z0-9._-]{1,64}$/.test(rawUser) ? rawUser : "";
}
function securityVariants(login) {
    const variants = [];
    if (login)
        variants.push(["find-generic-password", "-a", login, "-s", "opencode-server-password", "-w"]);
    variants.push(["find-generic-password", "-s", "opencode-server-password", "-w"]);
    return variants;
}
function secretToolVariants(login) {
    const variants = [];
    if (login)
        variants.push(["lookup", "service", "opencode-server-password", "account", login]);
    variants.push(["lookup", "service", "opencode-server-password"]);
    return variants;
}
/**
 * Opt-in Keychain read; default installs never touch Keychain, failures read undefined.
 */
export function getKeychainPassword() {
    if (cached && Date.now() - cached.at < TTL_MS)
        return cached.value ?? undefined;
    for (const args of securityVariants(sanitizedLogin())) {
        try {
            const out = execFileSync(SECURITY_BIN, args, { encoding: "utf8", timeout: 2000, stdio: ["ignore", "pipe", "ignore"] });
            const pw = String(out).trim();
            if (pw) {
                cached = { value: pw, at: Date.now() };
                return pw;
            }
            // Why: best-effort — keychain access failure returns undefined, not a crash.
        }
        catch { }
    }
    cached = { value: undefined, at: Date.now() };
    return undefined;
}
function runAsync(cmd, args) {
    return new Promise((resolve, reject) => {
        execFile(cmd, args, { encoding: "utf8", timeout: 2000 }, (err, stdout) => {
            if (err)
                reject(err);
            else
                resolve(String(stdout));
        });
    });
}
/**
 * Non-blocking read with Linux fallback; macOS security first, then
 * secret-tool lookup. Shares the TTL cache with the sync reader.
 */
export async function getKeychainPasswordAsync() {
    if (cached && Date.now() - cached.at < TTL_MS)
        return cached.value ?? undefined;
    const login = sanitizedLogin();
    const attempts = [
        ...securityVariants(login).map((args) => [SECURITY_BIN, args]),
        ...secretToolVariants(login).map((args) => [SECRET_TOOL_BIN, args]),
    ];
    for (const [cmd, args] of attempts) {
        try {
            const pw = (await runAsync(cmd, args)).trim();
            if (pw) {
                cached = { value: pw, at: Date.now() };
                return pw;
            }
            // Why: best-effort — keychain access failure returns undefined, not a crash.
        }
        catch { }
    }
    cached = { value: undefined, at: Date.now() };
    return undefined;
}
//# sourceMappingURL=serverAuthKeychainProvider.js.map