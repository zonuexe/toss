import { type SourceLocation, TossSyntaxError } from "./diagnostic.ts";

export class JavaScriptBindingPrefix {
  #enabled: boolean;
  #nameExpected: boolean;

  constructor(enabled: boolean) {
    this.#enabled = enabled;
    this.#nameExpected = enabled;
  }

  readName(
    source: string,
    offset: number,
    location: SourceLocation,
    advance: () => string,
    add: (spelling: string, flavor: "ordinary", start: SourceLocation) => void,
  ): boolean {
    if (!this.#enabled || !this.#nameExpected) return false;
    const name = /^[A-Za-z_$][A-Za-z0-9_$]*/.exec(source.slice(offset))?.[0];
    if (name === undefined) return false;
    for (let index = 0; index < name.length; index++) advance();
    add(name, "ordinary", location);
    this.#nameExpected = false;
    return true;
  }

  comma(location: SourceLocation, depth: number): void {
    if (!this.#enabled || depth !== 1) return;
    if (this.#nameExpected) {
      throw new TossSyntaxError(
        location,
        "Expected a JavaScript binding name.",
      );
    }
    this.#nameExpected = true;
  }

  finish(location: SourceLocation): void {
    if (this.#enabled && this.#nameExpected) {
      throw new TossSyntaxError(
        location,
        "Expected a JavaScript binding name.",
      );
    }
  }
}
