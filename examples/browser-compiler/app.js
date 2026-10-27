import { compileSources } from "./compiler.js";

const mainSourceInput = document.querySelector("#main-source");
const mathSourceInput = document.querySelector("#math-source");
const compileButton = document.querySelector("#compile");
const status = document.querySelector("#status");
const output = document.querySelector("#output");

if (
  !(mainSourceInput instanceof HTMLTextAreaElement) ||
  !(mathSourceInput instanceof HTMLTextAreaElement) ||
  !(compileButton instanceof HTMLButtonElement) ||
  !(status instanceof HTMLElement) ||
  !(output instanceof HTMLTextAreaElement)
) {
  throw new Error("The compiler page is missing a required control.");
}

compileButton.addEventListener("click", () => {
  output.value = "";
  status.textContent = "Compiling…";
  try {
    output.value = compileSources(
      "main.toss",
      new Map([
        ["main.toss", mainSourceInput.value],
        ["math.toss", mathSourceInput.value],
      ]),
      { format: "esm" },
    );
    status.textContent = "Compilation succeeded.";
  } catch (error) {
    status.textContent = error instanceof Error
      ? error.message
      : "Compilation failed.";
  }
});
