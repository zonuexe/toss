import type { Token } from "./token.ts";

export type SpecialMacroToken = Extract<
  Token,
  {
    readonly kind:
      | "importOpen"
      | "javascriptImportOpen"
      | "exportOpen"
      | "extendOpen"
      | "superOpen"
      | "asyncOpen"
      | "awaitOpen";
  }
>;

export function specialMacro(
  spelling: string,
): SpecialMacroToken["kind"] | undefined {
  switch (spelling) {
    case "%import":
      return "importOpen";
    case "%jsImport":
      return "javascriptImportOpen";
    case "%export":
      return "exportOpen";
    case "%extend":
      return "extendOpen";
    case "%super":
      return "superOpen";
    case "%async":
      return "asyncOpen";
    case "%await":
      return "awaitOpen";
    default:
      return undefined;
  }
}
