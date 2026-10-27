import { parse, tokenizer } from "acorn";
import type { Expression } from "./ast.ts";
import { TossSyntaxError } from "./diagnostic.ts";

export type JavaScriptExpression = Extract<Expression, { kind: "javascript" }>;

export function collectJavaScriptExpressions(
  expressions: readonly Expression[],
): JavaScriptExpression[] {
  const found: JavaScriptExpression[] = [];
  const visit = (expression: Expression): void => {
    switch (expression.kind) {
      case "javascript":
        found.push(expression);
        expression.bindings.forEach((binding) => visit(binding.value));
        return;
      case "block":
        expression.body.forEach(visit);
        return;
      case "array":
        expression.elements.forEach(visit);
        return;
      case "send":
        visit(expression.receiver);
        expression.arguments.forEach(visit);
        return;
      case "pipeline":
        visit(expression.input);
        visit(expression.receiver);
        expression.arguments.forEach(visit);
        return;
      case "extend":
        visit(expression.input);
        expression.entries.forEach((entry) => {
          visit(entry.key);
          visit(entry.value);
        });
        return;
      case "super":
        expression.arguments.forEach(visit);
        return;
      case "export":
        visit(expression.value);
        return;
      case "await":
        visit(expression.expression);
        return;
      case "string":
      case "number":
      case "symbol":
      case "fetch":
      case "import":
      case "javascriptImport":
      case "quotation":
        return;
      default: {
        const exhaustive: never = expression;
        throw new TypeError(JSON.stringify(exhaustive));
      }
    }
  };
  expressions.forEach(visit);
  return found;
}

export function emitJavaScriptEvaluators(
  expressions: readonly JavaScriptExpression[],
): { readonly parameter: string; readonly source: string } {
  const identifiers = javascriptIdentifiers(expressions);
  let parameter = "__tossJsValues";
  while (identifiers.has(parameter)) parameter += "_";
  const evaluators = expressions.map((expression) => {
    const declarations = expression.bindings.map((binding, index) =>
      `const ${binding.name} = ${parameter}[${index}];`
    );
    const source = normalizeHtmlLineComments(expression.source);
    const evaluator = `function(${parameter}) {\n"use strict";\n${
      declarations.join("\n")
    }\nreturn (function() {\n"use strict";\nreturn (${source}\n);\n}).call(void 0);\n}`;
    try {
      parse(`(${evaluator})`, {
        ecmaVersion: "latest",
        sourceType: "module",
      });
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      throw new TossSyntaxError(
        expression.location,
        `Invalid %js expression in an ES module: ${error.message}. Rename module-reserved identifiers such as "await".`,
      );
    }
    return evaluator;
  });
  return { parameter, source: `[${evaluators.join(",\n")}]` };
}

function normalizeHtmlLineComments(source: string): string {
  const replacements: { readonly start: number; readonly text: string }[] = [];
  const stream = tokenizer(source, {
    ecmaVersion: "latest",
    sourceType: "script",
    onComment(_block, _text, start, end) {
      const raw = source.slice(start, end);
      if (raw.startsWith("<!--")) replacements.push({ start, text: "//  " });
      else if (raw.startsWith("-->")) replacements.push({ start, text: "// " });
    },
  });
  let token = stream.getToken();
  while (token.type.label !== "eof") token = stream.getToken();
  let normalized = source;
  for (let index = replacements.length - 1; index >= 0; index--) {
    const replacement = replacements[index];
    if (replacement === undefined) continue;
    normalized = normalized.slice(0, replacement.start) + replacement.text +
      normalized.slice(replacement.start + replacement.text.length);
  }
  return normalized;
}

export function javascriptImportAliases(
  specifiers: readonly string[],
  expressions: readonly JavaScriptExpression[],
): readonly string[] {
  const identifiers = javascriptIdentifiers(expressions);
  return specifiers.map((_, index) => {
    let alias = `__tossJavaScriptImport${index}`;
    while (identifiers.has(alias)) alias += "_";
    identifiers.add(alias);
    return alias;
  });
}

export function javascriptRuntimeAlias(
  expressions: readonly JavaScriptExpression[],
): string {
  const identifiers = javascriptIdentifiers(expressions);
  for (
    const name of [
      "javascriptEvaluators",
      "javascriptImportNames",
      "tossRuntime",
    ]
  ) identifiers.add(name);
  let alias = "__tossCreateRuntime";
  while (identifiers.has(alias)) alias += "_";
  return alias;
}

function javascriptIdentifiers(
  expressions: readonly JavaScriptExpression[],
): Set<string> {
  const identifiers = new Set<string>();
  for (const expression of expressions) {
    for (const binding of expression.bindings) identifiers.add(binding.name);
    const stream = tokenizer(expression.source, {
      ecmaVersion: "latest",
      sourceType: "script",
    });
    while (true) {
      const token = stream.getToken();
      if (token.type.label === "eof") break;
      if (token.type.label === "name") {
        const value = identifierTokenValue(token);
        if (value !== undefined) identifiers.add(value);
      }
    }
  }
  return identifiers;
}

function identifierTokenValue(token: object): string | undefined {
  if ("value" in token && typeof token.value === "string") {
    return token.value;
  }
  return undefined;
}
