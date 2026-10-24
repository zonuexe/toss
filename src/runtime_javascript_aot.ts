export const runtimeJavaScriptAot =
  `function evaluateCompiledJavaScript(evaluator, values, context) {
  const nativeValues = values.map((value) => toJavaScript(value, context));
  return invokeJavaScript(evaluator, nativeValues, context);
}

function invokeJavaScript(evaluator, nativeValues, context) {
  let result;
  try {
    result = Reflect.apply(evaluator, undefined, [nativeValues]);
  } catch (error) {
    throw new TossRuntimeError("JavaScript expression threw.", context.location, {cause: error});
  }
  return fromJavaScript(result, context);
}`;
