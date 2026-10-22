import assert from "node:assert/strict";
import { parseSyntax } from "../src/syntax_tokens.ts";
import { evaluateMacroExpression } from "../src/macro_evaluate.ts";
import { invokeMacroBlock } from "../src/macro_primitive.ts";
import {
  type MacroContext,
  type MacroNative,
  macroRootEnvironment,
  MacroState,
  type MacroValue,
} from "../src/macro_value.ts";
import { TossSyntaxError } from "../src/diagnostic.ts";
import { flattenSyntax } from "../src/syntax_flatten.ts";
import {
  type SyntaxGroup,
  type SyntaxNode,
  syntaxToken,
} from "../src/syntax.ts";

const introducedScope = { kind: "introduced", id: 91 } as const;
const callerScope = { kind: "caller", id: 37 } as const;
const trace = [{
  name: "make",
  definition: { file: "macro.toss", line: 2, column: 3 },
  invocation: { file: "call.toss", line: 4, column: 5 },
}];

function evaluate(
  source: string,
  bindings: Readonly<Record<string, MacroValue>> = {},
): SyntaxGroup {
  const expression = parseSyntax(source, { file: "quote.toss" })[0];
  assert.ok(expression);
  assert.equal(expression.kind, "quotation");
  if (expression.kind !== "quotation") throw new Error("Quotation expected.");
  const environment = macroRootEnvironment();
  for (const [name, value] of Object.entries(bindings)) {
    environment.bind(Symbol.for(name), value);
  }
  const context: MacroContext = {
    state: new MacroState(),
    environment,
    location: expression.location,
    quotation: { introducedScope, trace },
  };
  const value = evaluateMacroExpression(expression, context);
  assert.ok(isGroup(value));
  return value;
}

Deno.test("literal quotation keeps invalid Toss data inert and marks templates", () => {
  const fragment = evaluate("%quote($unbound %,(1 + 2)).");
  const children = fragment.children;
  assert.equal(children.length, 3);
  assert.equal(children[0]?.kind, "token");
  if (children[0]?.kind === "token") {
    assert.deepEqual(children[0].origin.scope, introducedScope);
    assert.deepEqual(children[0].origin.trace, trace);
  }
  assert.equal(children[1]?.kind, "token");
  if (children[1]?.kind === "token") {
    assert.equal(children[1].flavor, "unquote");
  }
  assert.notEqual(fragment.children, children);
});

Deno.test("quasiquotation substitutes a SyntaxNode and splices arrays in order", () => {
  const node = syntaxToken("fromCaller", {
    location: { file: "caller.toss", line: 8, column: 4 },
    scope: callerScope,
    trace: [],
  });
  const first = syntaxToken("one", {
    location: node.origin.location,
    scope: callerScope,
    trace: [],
  });
  const second = syntaxToken("two", {
    location: node.origin.location,
    scope: callerScope,
    trace: [],
  });
  const fragment = evaluate("%`(start %,($node) %,@($nodes) end).", {
    node,
    nodes: [first, second],
  });
  assert.deepEqual(fragment.children, [
    fragment.children[0],
    node,
    first,
    second,
    fragment.children[4],
  ]);
  assert.equal(fragment.children[1], node);
  assert.equal(fragment.children[2], first);
  assert.equal(fragment.children[3], second);
  const start = fragment.children[0];
  assert.ok(start?.kind === "token");
  if (start?.kind === "token") {
    assert.deepEqual(start.origin.scope, introducedScope);
  }
});

Deno.test("quasiquotation accepts an empty syntax splice", () => {
  const fragment = evaluate("%`(before %,@($nodes) after).", { nodes: [] });
  assert.deepEqual(fragment.children.map(spelling), ["before", "after"]);
});

Deno.test("quote holes reject values outside their syntax contracts at the marker", () => {
  const failures: readonly {
    readonly source: string;
    readonly bindings: Readonly<Record<string, MacroValue>>;
    readonly expected: string;
  }[] = [
    {
      source: "%`(%,($value)).",
      bindings: { value: 3 },
      expected: "SyntaxNode",
    },
    {
      source: "%`(%,@($value)).",
      bindings: { value: [3] },
      expected: "Array of SyntaxNodes",
    },
  ];
  for (const { source, bindings, expected } of failures) {
    assert.throws(
      () => evaluate(source, bindings),
      (error: unknown) =>
        error instanceof TossSyntaxError &&
        error.reason.includes(expected) && error.location.column === 4,
    );
  }
});

Deno.test("a quote hole parses exactly one Toss expression", () => {
  assert.throws(
    () => evaluate("%`(%,(1. 2))."),
    (error: unknown) =>
      error instanceof TossSyntaxError &&
      error.reason.includes("exactly one"),
  );
});

Deno.test("nested quasiquote delays unquote by one quotation depth", () => {
  const node = syntaxToken("caller", {
    location: { file: "caller.toss", line: 1, column: 1 },
    scope: callerScope,
    trace: [],
  });
  const fragment = evaluate("%`(outer %`(inner %,($node))).", { node });
  const nested = fragment.children[1];
  assert.ok(nested?.kind === "token");
  const nestedGroup = fragment.children[2];
  assert.ok(nestedGroup?.kind === "group");
  assert.equal(nestedGroup.children[1]?.kind, "token");
  if (nestedGroup.children[1]?.kind === "token") {
    assert.equal(nestedGroup.children[1].spelling, "%,");
  }
});

Deno.test("literal quote marker data does not shield an outer quasiquote", () => {
  const node = syntaxToken("caller", {
    location: { file: "caller.toss", line: 1, column: 1 },
    scope: callerScope,
    trace: [],
  });
  const fragment = evaluate("%`(%quote(%,($node))).", { node });
  assert.equal(fragment.children[0]?.kind, "token");
  const inner = fragment.children[1];
  assert.ok(inner?.kind === "group");
  assert.equal(inner.children[0], node);
});

Deno.test("quasiquotation evaluates holes once in left-to-right order", () => {
  const first = syntaxToken("first", {
    location: { file: "caller.toss", line: 1, column: 1 },
    scope: callerScope,
    trace: [],
  });
  const second = syntaxToken("second", {
    location: { file: "caller.toss", line: 1, column: 2 },
    scope: callerScope,
    trace: [],
  });
  const calls: number[] = [];
  const firstHole: MacroNative = {
    kind: "macroNative",
    arity: 0,
    invoke: () => {
      calls.push(1);
      return first;
    },
  };
  const secondHole: MacroNative = {
    kind: "macroNative",
    arity: 0,
    invoke: () => {
      calls.push(2);
      return second;
    },
  };
  const fragment = evaluate(
    "%`(%,($firstHole value) %,($secondHole value)).",
    { firstHole, secondHole },
  );
  assert.deepEqual(calls, [1, 2]);
  assert.equal(fragment.children[0], first);
  assert.equal(fragment.children[1], second);
});

Deno.test("block invocation preserves quotation settings and selected method context", () => {
  const expressions = parseSyntax("{ %`(introduced) }.", {
    file: "block.toss",
  });
  const expression = expressions[0];
  assert.ok(expression?.kind === "block");
  if (expression?.kind !== "block") return;
  const environment = macroRootEnvironment();
  const context: MacroContext = {
    state: new MacroState(),
    environment,
    location: expression.location,
    method: {
      receiver: {
        kind: "macroObject",
        slots: new Map(),
        prototype: null,
      },
      key: "run",
      owner: {
        kind: "macroObject",
        slots: new Map(),
        prototype: null,
      },
    },
    quotation: { introducedScope, trace },
  };
  const block = evaluateMacroExpression(expression, context);
  const result = invokeMacroBlock(block, [], context);
  assert.ok(isGroup(result));
  assert.deepEqual(result.children[0]?.origin.scope, introducedScope);
  assert.deepEqual(result.children[0]?.origin.trace, trace);
});

Deno.test("JavaScript binding prefixes are traversed while JavaScript source stays opaque", () => {
  const node = syntaxToken("value", {
    location: { file: "caller.toss", line: 6, column: 2 },
    scope: callerScope,
    trace: [],
  });
  const fragment = evaluate("%`(%js(x = %,($node); '%,($opaque)')).", {
    node,
  });
  const javascript = fragment.children[0];
  assert.ok(javascript?.kind === "token");
  assert.ok(javascript.rawJavaScript?.prefix.some((part) => part === node));
  assert.equal(javascript.rawJavaScript?.source, "'%,($opaque)'");
  assert.ok(flattenSyntax(fragment).source.includes("x = value"));
});

Deno.test("JavaScript prefix scanning skips comments and nested raw JavaScript", () => {
  const node = syntaxToken("value", {
    location: { file: "caller.toss", line: 1, column: 1 },
    scope: callerScope,
    trace: [],
  });
  const fragment = evaluate(
    "%`(%js(x = %js('%,($nested)') // %,( $comment )\n + %,(( $node )); x)).",
    { node },
  );
  const source = flattenSyntax(fragment).source;
  assert.ok(source.includes("%,($nested)"));
  assert.ok(!source.includes("%,( $comment )"));
  assert.ok(source.includes("value"));
});

function isGroup(value: unknown): value is SyntaxGroup {
  return value !== null && typeof value === "object" && "kind" in value &&
    value.kind === "group";
}

function spelling(node: SyntaxNode): string {
  return node.kind === "token" ? node.spelling : node.delimiter;
}
