import assert from "node:assert/strict";
import { compileExperimentalEffects } from "./effects-compiler.ts";

async function execute(source) {
  const javascript = compileExperimentalEffects(source, "async-boundary.toss");
  const result = await new Deno.Command(Deno.execPath(), {
    args: ["eval", javascript],
    stdout: "piped",
    stderr: "piped",
  }).output();
  const decoder = new TextDecoder();
  return {
    success: result.success,
    stdout: decoder.decode(result.stdout),
    stderr: decoder.decode(result.stderr),
  };
}
const order = await execute(
  "#work bind: %async({ 'before' print. %await(%js(Promise.resolve(1))). 'after' print. 7 }). $work value. 'outside' print.",
);
assert.equal(order.success, true, order.stderr);
assert.equal(order.stdout, "before\noutside\nafter\n");
const local = await execute(
  "#work bind: %async({ %await(%js(Promise.resolve(1))). #h bind: $Object clone. $h at: #A put: { p, k -> $k value: 7 }. { $Effect raise: #A with: $Nil } handleWith: $h }) asJSCallback. %js(f = $work; f().then(v => console.log(v))).",
);
assert.equal(local.success, true, local.stderr);
assert.equal(local.stdout, "7\n");
const concurrent = await execute(
  "#work bind: %async({ x -> %await(%js(Promise.resolve())). #h bind: $Object clone. $h at: #A put: { p, k -> $k value: $p }. { $Effect raise: #A with: $x } handleWith: $h }) asJSCallback. %js(f = $work; Promise.all([f(1), f(2)]).then(v => console.log(v.join(',')))).",
);
assert.equal(concurrent.success, true, concurrent.stderr);
assert.equal(concurrent.stdout, "1,2\n");
for (
  const expression of [
    "$Effect raise: #A with: $Nil",
    "%await(%js(Promise.resolve(1))). $Effect raise: #A with: $Nil",
  ]
) {
  const crossed = await execute(
    `#h bind: $Object clone. $h at: #A put: { p, k -> $k value: 7 }. #run bind: { { %async({ ${expression} }) value } handleWith: $h } asJSCallback. %js(f = $run; f().then(v => console.log('unexpected'), e => console.log(e.message))).`,
  );
  assert.equal(crossed.success, true, crossed.stderr);
  assert.match(crossed.stdout, /Effect cannot cross the async boundary: #A/);
}
const crossResume = await execute(
  "#h bind: $Object clone. $h at: #A put: { p, k -> %async({ $k value: 1 }) value }. #run bind: { { $Effect raise: #A with: $Nil } handleWith: $h } asJSCallback. %js(f = $run; f().then(v => console.log('unexpected'), e => console.log(e.message))).",
);
assert.equal(crossResume.success, true, crossResume.stderr);
assert.match(crossResume.stdout, /Invalid resume/);
for (
  const source of [
    "#h bind: $Object clone. %async({ 'never' print }) handleWith: $h.",
    "{ 'never' print } ensure: %async({ 1 }).",
    "%async({ 'never' print }) ensure: { 1 }.",
  ]
) {
  const rejected = await execute(source);
  assert.equal(rejected.success, false);
  assert.equal(rejected.stdout, "");
  assert.match(rejected.stderr, /Async Blocks are not supported here/);
}
console.log(
  "PASS: async startup, local handlers, concurrency and boundary rejection",
);
const identity = await execute(
  "#o bind: $Object clone. $o at: 'then' put: { ok, bad -> 'unexpected then' print }. #make bind: %async({ $o }). #run bind: %async({ #v bind: %await($make value). $v at: 'answer' put: 7. $o answer }) asJSCallback. %js(f = $run; f().then(v => console.log(v))).",
);
assert.equal(identity.success, true, identity.stderr);
assert.equal(identity.stdout, "7\n");
const immediateAwait = await execute(
  "#run bind: %async({ 'before' print. %await(1). 'after' print }) value. 'outside' print.",
);
assert.equal(immediateAwait.success, true, immediateAwait.stderr);
assert.equal(immediateAwait.stdout, "before\noutside\nafter\n");
const asyncCleanup = await execute(
  "#work bind: %async({ 'work-start' print. %await(%js(Promise.resolve(1))). 'work-end' print }). { $work value } ensure: { 'cleanup' print }. 'outside' print.",
);
assert.equal(asyncCleanup.success, true, asyncCleanup.stderr);
assert.equal(asyncCleanup.stdout, "work-start\ncleanup\noutside\nwork-end\n");
const cleanupFailure = await execute(
  "#work bind: %async({ { $primary } ensure: { $cleanup } }) asJSCallback. %js(f = $work; f().catch(e => console.log(e.stack))).",
);
assert.equal(cleanupFailure.success, true, cleanupFailure.stderr);
const primary = cleanupFailure.stdout.indexOf('Unbound name "primary"');
const cleanup = cleanupFailure.stdout.indexOf('Unbound name "cleanup"');
assert.ok(primary >= 0 && cleanup > primary, cleanupFailure.stdout);
console.log(
  "PASS: async identity, non-assimilation, cleanup timing and error details",
);
const extensionAwait = await execute(
  "#work bind: %async({ #o bind: $Object clone. $o |> %extend(value: %await(%js(Promise.resolve(9)))). $o value }) asJSCallback. %js(f = $work; f().then(v => console.log(v))).",
);
assert.equal(extensionAwait.success, true, extensionAwait.stderr);
assert.equal(extensionAwait.stdout, "9\n");
const asyncCase = await execute(
  "#h bind: $Object clone. $h at: #A put: %async({ p, k -> 'never' print }). { $Effect raise: #A with: $Nil } handleWith: $h.",
);
assert.equal(asyncCase.success, false);
assert.equal(asyncCase.stdout, "");
assert.match(asyncCase.stderr, /Handler case must be a synchronous Block/);
const rejectedPromise = await execute(
  "#work bind: %async({ %await(%js(Promise.reject(new Error('original')))) }) asJSCallback. %js(f = $work; f().catch(e => console.log(e.message, e.cause.message))).",
);
assert.equal(rejectedPromise.success, true, rejectedPromise.stderr);
assert.match(rejectedPromise.stdout, /JavaScript Promise rejected\. original/);
const stablePromise = await execute(
  "#work bind: %async({ 7 }). #result bind: ($work value). (%js(a = $result, b = $result; a === b)) print.",
);
assert.equal(stablePromise.success, true, stablePromise.stderr);
assert.equal(stablePromise.stdout, "true\n");
assert.throws(
  () => compileExperimentalEffects("%await(1).", "async-boundary.toss"),
  /only valid directly inside an async Block/,
);
console.log(
  "PASS: async extension, validation, promise rejection cause and promise identity",
);
const asyncUnhandledCleanup = await execute(
  "#work bind: %async({ { $Effect raise: #A with: 'secret' } ensure: { $cleanup } }) asJSCallback. %js(f = $work; f().catch(e => console.log(e.stack))).",
);
assert.equal(asyncUnhandledCleanup.success, true, asyncUnhandledCleanup.stderr);
const asyncBoundaryIndex = asyncUnhandledCleanup.stdout.indexOf(
  "Effect cannot cross the async boundary: #A",
);
const asyncCleanupIndex = asyncUnhandledCleanup.stdout.indexOf(
  'Unbound name "cleanup"',
);
assert.ok(
  asyncBoundaryIndex >= 0 && asyncCleanupIndex > asyncBoundaryIndex,
  asyncUnhandledCleanup.stdout,
);
assert.ok(!asyncUnhandledCleanup.stdout.includes("secret"));
console.log(
  "PASS: async boundary keeps unhandled effect primary over cleanup failure",
);
const caseAsyncResult = await execute(
  "#work bind: %async({ 'work-start' print. %await(1). 'work-end' print. 7 }). #h bind: $Object clone. $h at: #A put: { p, k -> $work value }. #run bind: { { { $Effect raise: #A with: $Nil } ensure: { 'cleanup' print } } handleWith: $h } asJSCallback. %js(f = $run; f().then(v => console.log(v))).",
);
assert.equal(caseAsyncResult.success, true, caseAsyncResult.stderr);
assert.equal(caseAsyncResult.stdout, "work-start\ncleanup\nwork-end\n7\n");
console.log(
  "PASS: synchronous handler returns an async result without extending its scope",
);
const hostileRejection = await execute(
  "%js((globalThis.bad = new Proxy({}, {getPrototypeOf() { throw 99; }, get() { throw 98; }}), 1)). #work bind: %async({ %await(%js(Promise.reject(globalThis.bad))) }) asJSCallback. %js(f = $work; f().catch(e => console.log(e.cause === globalThis.bad))).",
);
assert.equal(hostileRejection.success, true, hostileRejection.stderr);
assert.equal(hostileRejection.stdout, "true\n");
const undefinedRejection = await execute(
  "#work bind: %async({ %await(%js(Promise.reject(undefined))) }) asJSCallback. %js(f = $work; f().catch(e => console.log('cause' in e && e.cause === undefined))).",
);
assert.equal(undefinedRejection.success, true, undefinedRejection.stderr);
assert.equal(undefinedRejection.stdout, "true\n");
console.log("PASS: async rejection keeps primitive and hostile Proxy causes");
