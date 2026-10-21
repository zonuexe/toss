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

export const objectPerform = {
  name: "perform:",
  javascript: `function perform(receiver, context, key) {
  if (typeof key !== "string" && typeof key !== "symbol") {
    throw new TossRuntimeError("Object key must be a string or symbol.", context.location);
  }
  if (typeof key === "string" && key.includes(":") &&
    !Reflect.has(receiver, key) && objectMessages.has(key)) {
    throw new TossRuntimeError("Message " + keyDescription(key) + " requires arguments.", context.location);
  }
  return send(receiver, {name: key, arguments: []}, context);
}`,
} as const;

export const objectPerformWithArguments = {
  name: "perform:withArguments:",
  javascript:
    `function performWithArguments(receiver, context, key, argumentsList) {
  if (typeof key !== "string" && typeof key !== "symbol") {
    throw new TossRuntimeError("Object key must be a string or symbol.", context.location);
  }
  if (!Array.isArray(argumentsList)) {
    throw new TossRuntimeError("Arguments must be an Array.", context.location);
  }
  if (typeof key === "string" && !Reflect.has(receiver, key) && objectMessages.has(key)) {
    const expected = [...key].filter((character) => character === ":").length;
    if (argumentsList.length !== expected) {
      throw new TossRuntimeError("Message " + keyDescription(key) + " expects " + expected +
        " argument(s), received " + argumentsList.length + ".", context.location);
    }
  }
  return send(receiver, {name: key, arguments: argumentsList.slice()}, context);
}`,
} as const;
