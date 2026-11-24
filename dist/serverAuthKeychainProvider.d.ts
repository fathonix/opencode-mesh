export declare const KEYCHAIN_USERNAME = "opencode";
/**
 * Opt-in Keychain read; default installs never touch Keychain, failures read undefined.
 */
export declare function getKeychainPassword(): string | undefined;
/**
 * Non-blocking read with Linux fallback; macOS security first, then
 * secret-tool lookup. Shares the TTL cache with the sync reader.
 */
export declare function getKeychainPasswordAsync(): Promise<string | undefined>;
//# sourceMappingURL=serverAuthKeychainProvider.d.ts.map