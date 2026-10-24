export const runtimeJavaScriptCallback =
  `function createJavaScriptCallback(receiver, context) {
  const previous = javascriptCallbacks.get(receiver);
  if (previous !== undefined) return fromJavaScript(previous, context);
  const callback = function(...hostArguments) {
    const expected = receiver.length;
    if (hostArguments.length < expected) {
      throw new TossRuntimeError("JavaScript callback expects " + expected +
        " argument(s), received " + hostArguments.length + ".", context.location);
    }
    const argumentsList = hostArguments.slice(0, expected).map((value) =>
      fromJavaScript(value, context)
    );
    const lexicalContext = {location: context.location, environment: context.environment};
    return toJavaScript(invokeBlock(receiver, argumentsList, lexicalContext), context);
  };
  javascriptCallbacks.set(receiver, callback);
  return fromJavaScript(callback, context);
}`;
