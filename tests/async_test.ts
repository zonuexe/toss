import assert from "node:assert/strict";
import { execute, text } from "./helpers.ts";

Deno.test("async Block suspends at each await and runs immediately to suspension", async () => {
  const result = await execute(
    "#events bind: $Object clone. #promise bind: %js(Promise.resolve(5)). #block bind: %async({ $events at: 'started' put: $True. #value bind: %await($promise). $events at: 'value' put: $value. $events }). #callback bind: $block asJSCallback. %js(callback = $callback; callback().then(events => console.log(events.started && events.value === 5))).",
  );
  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "true\n");
});

Deno.test("await operands preserve Toss evaluation order in pipeline and extend", async () => {
  const result = await execute(
    "#events bind: $Object clone. #value bind: %async({ $events at: 'input' put: $True. 7 }). #entry bind: %async({ $events at: 'entry' put: $True. 'answer' }). #target bind: $Object clone. #receiver bind: { $events at: 'receiver' put: $True. $target }. #runner bind: %async({ %await($value value) |> ($receiver value) at: %await($entry value) put:. [$target, $events] }). #callback bind: $runner asJSCallback. %js(callback = $callback; callback().then(values => console.log(Object.keys(values[1]).join(',') === 'input,receiver,entry' && values[0].answer === 7))).",
  );
  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "true\n");
});

Deno.test("extend awaits each key and value in order", async () => {
  const result = await execute(
    "#events bind: $Object clone. #target bind: $Object clone. #key bind: %async({ $events at: 'key' put: $True. 'answer' }). #entry bind: %async({ $events at: 'value' put: $True. 19 }). #runner bind: %async({ $target |> %extend((%await($key value)): %await($entry value)). [$target, $events] }). #callback bind: $runner asJSCallback. %js(callback = $callback; callback().then(values => console.log(values[0].answer === 19 && Object.keys(values[1]).join(',') === 'key,value'))).",
  );
  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "true\n");
});

Deno.test("awaiting a JS binding evaluates Toss bindings before JavaScript", async () => {
  const result = await execute(
    "#promise bind: %js(Promise.resolve(6)). #block bind: %async({ %js(value = %await($promise); value + 1) }). #callback bind: $block asJSCallback. %js(callback = $callback; callback().then(value => console.log(value))).",
  );
  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "7\n");
});

Deno.test("repeated awaits preserve Toss Symbols and Blocks", async () => {
  const result = await execute(
    "#identity bind: %async({ #same }). #closure bind: { 23 }. #closureResult bind: %async({ $closure }). #runner bind: %async({ #symbol bind: %await($identity value). #block bind: %await($closureResult value). [$symbol equals: #same, $block value] }). #callback bind: $runner asJSCallback. %js(callback = $callback; callback().then(values => console.log(values[0] && values[1] === 23))).",
  );
  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "true\n");
});

Deno.test("async method keeps lexical self and parent context after suspension", async () => {
  const result = await execute(
    "#base bind: $Object clone. $base at: 'run' put: %async({ $self name }). #child bind: $base clone. $child at: 'run' put: %async({ %await(%js(Promise.resolve(1))). %super() }). $child at: 'name' put: 'child'. %js(promise = $child run; promise.then(value => console.log(value))).",
  );
  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "child\n");
});

Deno.test("delayed async closures retain captured bindings", async () => {
  const result = await execute(
    "#make bind: { captured -> %async({ %await(%js(Promise.resolve(1))). $captured }) }. #block bind: ($make value: 'kept'). #callback bind: $block asJSCallback. %js(callback = $callback; callback().then(value => console.log(value))).",
  );
  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "kept\n");
});
