// Runs only the isolated experimental compiler, not the public Toss CLI.
import { compileExperimentalEffects } from "./effects-compiler.ts";

const source = await Deno.readTextFile(
  new URL("./effects-demo.toss", import.meta.url),
);
const javascript = compileExperimentalEffects(source, "effects-demo.toss");
const result = await new Deno.Command(Deno.execPath(), {
  args: ["eval", javascript],
  stdin: "null",
  stdout: "inherit",
  stderr: "inherit",
}).spawn().status;
if (!result.success) Deno.exit(result.code);
