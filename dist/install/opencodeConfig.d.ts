/** Canonicalize plugin entry to package name; variants compare as one install. */
export declare function normalizePluginEntry(e: string): string;
/**
 * Splice mesh entry into plugin array; malformed input returns unchanged, never throws.
 */
export declare function editPluginArrayText(text: string, desiredEntry: string, op: "add" | "remove"): {
    text: string;
    changed: boolean;
};
/**
 * List the raw specs of one array key (strings verbatim, objects by package
 * value, tuples by element 0). Empty when the key is absent or malformed.
 */
export declare function listPluginSpecs(text: string, key: "plugin" | "plugins"): string[];
/**
 * Splice the mesh entry into the V2 `plugins` array; malformed input returns
 * unchanged, never throws. String form is written (mesh takes no plugin
 * options); object-form `{package}` entries compare by package field.
 */
export declare function editPluginsArrayText(text: string, desiredEntry: string, op: "add" | "remove"): {
    text: string;
    changed: boolean;
};
//# sourceMappingURL=opencodeConfig.d.ts.map