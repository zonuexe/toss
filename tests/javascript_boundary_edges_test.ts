import assert from "node:assert/strict";
import { compile } from "../src/compiler.ts";
import { TossSyntaxError } from "../src/diagnostic.ts";
import { execute, executeJavaScript, text } from "./helpers.ts";
import { runModuleProgram } from "./module_helpers.ts";

for (
  const [name, source, expected] of [
    ["regex closing parenthesis", "%js(/\\)/.test(')')) print.", "true\n"],
    ["regex separator", "%js(/[;)]/.test(';')) print.", "true\n"],
    ["comment delimiters", "%js(/* ; ) */ 7 /* ) ; */) print.", "7\n"],
    ["trailing line comment", "%js(7 // ) ;\n) print.", "7\n"],
    [
      "template interpolation",
      "%js(`answer ${/[)]/.test(')') ? 7 : 0}`) print.",
      "answer 7\n",
    ],
    [
      "division after function expression",
      "%js((function () { return 8; })() / 2) print.",
      "4\n",
    ],
    [
      "regex after statement",
      "%js((() => { if (true) {} /[)]/.test(')'); return 8; })()) print.",
      "8\n",
    ],
    ["sequence expression", "%js((1, 2, 3)) print.", "3\n"],
    ["nested JS binding", "%js(x = %js(Math.max(1, 2)); x * 3) print.", "6\n"],
    [
      "nested JS regex in binding",
      "%js(x = %js(/[;)]/.test(')')); x) print.",
      "true\n",
    ],
    [
      "comment inside Toss binding",
      "%js(x = (3 // , ; )\n add: 4); x) print.",
      "7\n",
    ],
    [
      "comment before next binding",
      "%js(x = 3 // , ; )\n, y = 4; x + y) print.",
      "7\n",
    ],
    [
      "nested JS syntax before next binding",
      "%js(x = %js(/[;)]/.test(')')), y = 4; x ? y : 0) print.",
      "4\n",
    ],
    [
      "macro opener inside Toss string",
      "%js(x = '%js('; x.length) print.",
      "4\n",
    ],
    [
      "pipeline binding",
      "%js(x = (3 |> { n -> $n add: 1 } value:); x * 2) print.",
      "8\n",
    ],
    [
      "Block body in binding",
      "%js(x = ({ 'once' print. 4 } value); x * 2) print.",
      "once\n8\n",
    ],
    ["Toss literal delimiters", "%js(x = ') ; ,'; x.length) print.", "5\n"],
    ["binding shadows host global", "%js(Math = 4; Math + 1) print.", "5\n"],
    [
      "binding generator names",
      "%js(environment = 2, scope = 3, send = 4; environment + scope + send) print.",
      "9\n",
    ],
    [
      "local names stay JS only",
      "#x bind: 9. %js(x = 3, y = $x; x + y) print. $x print.",
      "12\n9\n",
    ],
    [
      "compiler locals hidden",
      "%js([typeof environment, typeof scope, typeof send, typeof moduleStates].join(',')) print.",
      "undefined,undefined,undefined,undefined\n",
    ],
    ["null this", "%js(this === undefined) print.", "true\n"],
    [
      "shared native Array mutation",
      "#xs bind: [1, 2]. %js(xs = $xs; xs.push(3)). $xs dump.",
      "[1, 2, 3]\n",
    ],
    [
      "returned Toss Array becomes reference",
      "#xs bind: [1]. %js(xs = $xs; xs) dump.",
      "<js>\n",
    ],
    [
      "wrapper identity",
      "#a bind: %js(globalThis). #b bind: %js(globalThis). %js(xs = [$a, $b]; xs[0] === xs[1]) print.",
      "true\n",
    ],
    [
      "opaque Proxy result",
      "%js(new Proxy({}, {get() {throw 1}, getPrototypeOf() {throw 2}})) dump.",
      "<js>\n",
    ],
    ["Promise not awaited", "%js(Promise.resolve(7)) dump.", "<js>\n"],
    ["async expression", "%js((async () => 7)()) dump.", "<js>\n"],
    ["Nil outbound is null", "%js(x = $Nil; x === null) print.", "true\n"],
    [
      "Symbol outbound retains identity",
      "%js(a = #name, b = #name; a === b) print.",
      "true\n",
    ],
    [
      "Toss Array inspect handles JS references",
      "[%js(Math), %js(Math.max)] dump.",
      "[<js>, <js>]\n",
    ],
    [
      "JS reference print returns receiver",
      "#r bind: %js(Math). %js(x = ($r print); x === Math) print.",
      "<js>\ntrue\n",
    ],
  ] as const
) {
  Deno.test(`JavaScript boundary: ${name}`, async () => {
    const result = await execute(source);
    assert.equal(result.code, 0, text(result.stderr));
    assert.equal(text(result.stdout), expected);
  });
}

for (
  const source of [
    "%js(1; 2).",
    "%js(; 1).",
    "%js( ; 1).",
    "%js(await Promise.resolve(1)).",
    "%js(x = 1,; x).",
    "%js(x = 1, x = 2; x).",
    "%js(arguments = 1; arguments).",
    "%js(eval = 1; eval).",
    "%js(class = 1; class).",
    "%js(x = ; x).",
    "%js(x = 1;).",
    "%js(x = %export(1); x).",
    "$(%js(1) + 2).",
  ]
) {
  Deno.test(`JavaScript boundary rejects invalid syntax: ${source}`, () => {
    assert.throws(() => compile(source, "boundary.toss"), TossSyntaxError);
  });
}

for (
  const source of [
    "%js(Math) clone.",
    "%js(Math) at: 'PI'.",
    "%js(Math) at: 'PI' put: 1.",
    "%js(Math.max) value.",
    "%js(Math) |> %extend().",
    "%js(Math) perform: 'inspect'.",
    "%js(x = {}; x).",
    "%js(x = 1; x = 2).",
    "%js(NaN).",
    "%js(Infinity).",
    "%js(1n).",
    "%js(Symbol('x')).",
  ]
) {
  Deno.test(`JavaScript boundary runtime error: ${source}`, async () => {
    const result = await execute(source);
    assert.notEqual(result.code, 0);
    assert.match(text(result.stderr), /fixture\.toss:1:\d+: RuntimeError:/);
  });
}

Deno.test("JS cause retains the original thrown object", async () => {
  const javascript = compile(
    "#boom bind: { %js((() => { globalThis.jsCause = {value: 7}; throw globalThis.jsCause; })()) }.",
    "cause.toss",
  );
  const result = await executeJavaScript(
    javascript + `
const context = {location: {file: 'host', line: 1, column: 1}, environment};
try {
  invokeBlock(fetchBinding('boom', context), [], context);
  console.log('did not throw');
} catch (error) {
  console.log(error instanceof TossRuntimeError, error.cause === globalThis.jsCause);
}
`,
  );
  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "true true\n");
});

Deno.test("JS cause accepts a Proxy whose prototype lookup throws", async () => {
  const javascript = compile(
    "#boom bind: { %js((() => { globalThis.jsCause = new Proxy({}, {getPrototypeOf() {throw 99}}); throw globalThis.jsCause; })()) }.",
    "cause.toss",
  );
  const result = await executeJavaScript(
    javascript + `
const context = {location: {file: 'host', line: 1, column: 1}, environment};
try {
  invokeBlock(fetchBinding('boom', context), [], context);
  console.log('did not throw');
} catch (error) {
  console.log(error instanceof TossRuntimeError, error.cause === globalThis.jsCause);
}
`,
  );
  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "true true\n");
});

Deno.test("JS binding failure stops later bindings and keeps the Toss location", async () => {
  const result = await execute(
    "%js(x = $missing, y = ('never' print); x + y).",
  );
  assert.notEqual(result.code, 0);
  assert.equal(text(result.stdout), "");
  assert.match(text(result.stderr), /fixture\.toss:1:9: RuntimeError: Unbound/);
});

Deno.test("JS binding imports participate in a standalone module bundle", async () => {
  const result = await runModuleProgram({
    "main.toss": "%js(x = %import('./value.toss'); Math.max(x, 7)) print.",
    "value.toss": "'init' print. %export(9).",
  }, "main.toss");
  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "init\n9\n");
});
