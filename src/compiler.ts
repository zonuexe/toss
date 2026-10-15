import { generate } from "./codegen.ts";
import { parse } from "./parser.ts";

export function compile(source: string, file: string): string {
  return generate(parse(source, file));
}
