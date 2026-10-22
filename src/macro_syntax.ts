import { TossSyntaxError } from "./diagnostic.ts";
import type { MacroContext, MacroValue } from "./macro_value.ts";
import type { SyntaxNode } from "./syntax.ts";

export function isMacroSyntax(value: MacroValue): value is SyntaxNode {
  if (!isRecord(value)) return false;
  if (value.kind === "token") {
    return typeof value.spelling === "string" &&
      isSyntaxOrigin(value.origin) &&
      [
        "ordinary",
        "number",
        "string",
        "symbol",
        "fetch",
        "macro",
        "quote",
        "quasiquote",
        "unquote",
        "splice",
        "arithmetic",
        "rawJavaScript",
      ].includes(String(value.flavor)) &&
      (value.macroAdjacent === undefined ||
        typeof value.macroAdjacent === "boolean") &&
      (value.rawJavaScript === undefined ||
        isRawJavaScript(value.rawJavaScript));
  }
  if (value.kind === "group") {
    const children = value.children;
    return ["()", "[]", "{}", ""].includes(String(value.delimiter)) &&
      typeof value.prefix === "string" && isSyntaxOrigin(value.origin) &&
      Array.isArray(children) && children.every(isMacroSyntax);
  }
  return false;
}

function isRawJavaScript(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const prefix = value["prefix"];
  return typeof value["source"] === "string" && Array.isArray(prefix) &&
    prefix.every(isMacroSyntax);
}

function isSyntaxOrigin(value: unknown): boolean {
  if (
    !isRecord(value) || !isLocation(value["location"]) ||
    !isRecord(value["scope"])
  ) return false;
  const scope = value["scope"];
  const trace = value["trace"];
  if (!isRecord(scope)) return false;
  return ["definition", "caller", "introduced"].includes(
    String(scope["kind"]),
  ) && typeof scope["id"] === "number" && Array.isArray(trace) &&
    trace.every((entry) =>
      isRecord(entry) &&
      typeof entry["name"] === "string" && isLocation(entry["definition"]) &&
      isLocation(entry["invocation"])
    );
}

function isLocation(value: unknown): boolean {
  return isRecord(value) && typeof value["file"] === "string" &&
    typeof value["line"] === "number" && typeof value["column"] === "number";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

export function performMacroSyntax(
  value: SyntaxNode,
  name: string,
  args: readonly MacroValue[],
  context: MacroContext,
): MacroValue {
  if (args.length !== 0) {
    throw new TossSyntaxError(
      context.location,
      `Message ${name} takes no arguments.`,
    );
  }
  if (name === "kind") return Symbol.for(value.kind);
  if (name === "children" && value.kind === "group") return [...value.children];
  if (name === "delimiter" && value.kind === "group") return value.delimiter;
  if (name === "spelling" && value.kind === "token") return value.spelling;
  throw new TossSyntaxError(
    context.location,
    `Unsupported Syntax message ${name}.`,
  );
}
