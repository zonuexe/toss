import { type SourceLocation, TossSyntaxError } from "./diagnostic.ts";
import { type SyntaxGroup, syntaxGroup } from "./syntax.ts";
import type { SyntaxFrame } from "./syntax_reader_support.ts";

export function openSyntaxGroup(
  stack: SyntaxFrame[],
  open: string,
  close: string,
  start: SourceLocation,
): void {
  stack.push({ open, close, start, children: [] });
}

export function closeSyntaxGroup(
  stack: SyntaxFrame[],
  closing: string,
  location: SourceLocation,
  origin: (location: SourceLocation) => SyntaxGroup["origin"],
): void {
  const frame = stack.at(-1);
  if (frame === undefined) throw new TypeError("Syntax reader stack is empty.");
  if (frame.open === "") return;
  if (frame.close !== closing) {
    throw new TossSyntaxError(
      location,
      `Mismatched delimiter ${closing}; expected ${frame.close}.`,
    );
  }
  stack.pop();
  stack.at(-1)?.children.push(groupFromFrame(frame, origin, location));
}

export function finishSyntaxGroups(
  stack: SyntaxFrame[],
  location: SourceLocation,
  origin: (location: SourceLocation) => SyntaxGroup["origin"],
): SyntaxGroup {
  const root = stack[0];
  if (root === undefined) throw new TypeError("Syntax reader stack is empty.");
  while (stack.length > 1) {
    const frame = stack.pop();
    if (frame === undefined) {
      throw new TypeError("Syntax reader stack is empty.");
    }
    stack.at(-1)?.children.push(groupFromFrame(frame, origin, location, false));
  }
  return syntaxGroup("", root.children, origin(root.start), "", location);
}

function groupFromFrame(
  frame: SyntaxFrame,
  origin: (location: SourceLocation) => SyntaxGroup["origin"],
  endLocation: SourceLocation,
  closed = true,
): SyntaxGroup {
  const delimiter = frame.open === "(" || frame.open === "$("
    ? "()"
    : frame.open === "["
    ? "[]"
    : "{}";
  return syntaxGroup(
    delimiter,
    frame.children,
    origin(frame.start),
    frame.open === "$(" ? "$" : "",
    endLocation,
    closed,
  );
}
