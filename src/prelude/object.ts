export const objectClone = {
  name: "clone",
  javascript: `function clone(receiver) {
  return Object.create(receiver);
}`,
} as const;

export const objectAt = {
  name: "at:",
  javascript: `function at(receiver, context, key) {
  if (typeof key !== "string" && typeof key !== "symbol") {
    throw new TossRuntimeError("Object key must be a string or symbol.", context.location);
  }
  if (!Reflect.has(receiver, key)) {
    throw new TossRuntimeError("Object has no key " + keyDescription(key) + ".", context.location);
  }
  return Reflect.get(receiver, key);
}`,
} as const;

export const objectAtPut = {
  name: "at:put:",
  javascript: `function atPut(receiver, context, key, value) {
  if (typeof key !== "string" && typeof key !== "symbol") {
    throw new TossRuntimeError("Object key must be a string or symbol.", context.location);
  }
  Object.defineProperty(receiver, key, {value, writable: true, enumerable: true, configurable: true});
  return value;
}`,
} as const;
