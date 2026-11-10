import metadata from "../deno.json" with { type: "json" };

export const version: string = metadata.version;
