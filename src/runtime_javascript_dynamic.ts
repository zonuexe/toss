export const runtimeJavaScriptDynamic =
  `function evaluateJavaScript(source, values, context, names) {
  const nativeValues = values.map((value) => toJavaScript(value, context));
  let privateName = "__tossJsValues";
  while (source.includes(privateName) || names.includes(privateName)) privateName += "_";
  const declarations = names.map((name, index) => "const " + name + " = " + privateName + "[" + index + "];").join("\\n");
  let evaluator;
  try {
    evaluator = Function(
      privateName,
      "\\\"use strict\\\";\\n" + declarations +
        "\\nreturn (function(){\\\"use strict\\\"; return (" + source + "); }).call(void 0);",
    );
  } catch (error) {
    throw new TossRuntimeError("JavaScript expression threw.", context.location, {cause: error});
  }
  return invokeJavaScript(evaluator, nativeValues, context);
}`;
