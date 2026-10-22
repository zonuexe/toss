import { tokenizer } from "acorn";

type ParserOffsets = { readonly pos: number; readonly raisedAt: number };

export function unterminatedLexicalError(
  source: string,
  error: unknown,
): boolean {
  const offsets = parserOffsets(error);
  if (
    offsets === undefined || offsets.pos < 0 || offsets.pos >= source.length
  ) return false;
  const start = source.startsWith("/*", offsets.pos)
    ? offsets.pos
    : offsets.pos - 1;
  return unterminatedLexicalSuffix(source, Math.max(0, start));
}

export function unterminatedLexicalSuffix(
  source: string,
  start: number,
): boolean {
  const suffix = source.slice(start);
  if (suffix.length === 0) return false;
  if (!(suffix.startsWith("`") || suffix.startsWith("/*"))) return false;
  try {
    const stream = tokenizer(suffix, {
      ecmaVersion: "latest",
      sourceType: "script",
    });
    let token = stream.getToken();
    while (token.type.label !== "eof") token = stream.getToken();
    return false;
  } catch (error) {
    const offsets = parserOffsets(error);
    if (!(error instanceof SyntaxError)) throw error;
    return offsets !== undefined && offsets.pos >= 0 &&
      offsets.raisedAt > offsets.pos;
  }
}

export function hasOpenTemplateAtEof(
  source: string,
  start: number,
  error: unknown,
): boolean {
  const offsets = parserOffsets(error);
  if (
    !(error instanceof SyntaxError) || offsets === undefined ||
    !isAtEnd(source, offsets.raisedAt)
  ) return false;
  const stream = tokenizer(source.slice(start), {
    ecmaVersion: "latest",
    sourceType: "script",
  });
  let openTemplates = 0;
  let previous = "";
  try {
    while (true) {
      const label = stream.getToken().type.label;
      if (label === "eof") return openTemplates > 0;
      if (label === "`") {
        openTemplates += previous === "template" ? -1 : 1;
      }
      previous = label;
    }
  } catch (tokenError) {
    if (tokenError instanceof SyntaxError) return false;
    throw tokenError;
  }
}

export function hasUnclosedJavaScriptGroup(
  source: string,
  start: number,
): boolean {
  const stream = tokenizer(source.slice(start), {
    ecmaVersion: "latest",
    sourceType: "script",
  });
  const closers = new Map([
    ["(", ")"],
    ["[", "]"],
    ["{", "}"],
  ]);
  const expected: string[] = [];
  try {
    while (true) {
      const label = stream.getToken().type.label;
      if (label === "eof") return expected.length > 0;
      const close = closers.get(label);
      if (close !== undefined) {
        expected.push(close);
        continue;
      }
      if ([")", "]", "}"].includes(label)) {
        if (expected.pop() !== label) return false;
      }
    }
  } catch (error) {
    if (error instanceof SyntaxError) return false;
    throw error;
  }
}

function parserOffsets(error: unknown): ParserOffsets | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const pos = Reflect.get(error, "pos");
  const raisedAt = Reflect.get(error, "raisedAt");
  return typeof pos === "number" && typeof raisedAt === "number"
    ? { pos, raisedAt }
    : undefined;
}

function isAtEnd(source: string, offset: number): boolean {
  return offset >= 0 && offset <= source.length &&
    source.slice(offset).trim().length === 0;
}
