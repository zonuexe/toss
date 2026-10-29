globalThis.browserReplDemoModuleLoads =
  (globalThis.browserReplDemoModuleLoads ?? 0) + 1;

export const answer = 42;
export const loads = globalThis.browserReplDemoModuleLoads;
