export const runtimeJavaScript = `class TossRuntimeError extends Error {
  constructor(message, location) {
    super(location.file + ":" + location.line + ":" + location.column +
      ": RuntimeError: Unknown message " + JSON.stringify(message) + " for String.");
    this.name = "TossRuntimeError";
    this.stack = this.name + ": " + this.message;
  }
}

function send(receiver, message, location) {
  const implementation = stringMessages.get(message);
  if (implementation === undefined) {
    throw new TossRuntimeError(message, location);
  }
  return implementation(receiver);
}`;
