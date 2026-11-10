import assert from "node:assert/strict";
const result = await new Deno.Command(Deno.execPath(), {
  args: ["task", "effects:demo"],
  stdout: "piped",
  stderr: "piped",
}).output();
const decoder = new TextDecoder();
assert.equal(result.success, true, decoder.decode(result.stderr));
assert.equal(
  decoder.decode(result.stdout),
  "reading\nconfig.txt\n2030-01-01T00:00:00Z\nexample configuration\ncleanup\n",
);
console.log("PASS: experimental Toss effect demo");
