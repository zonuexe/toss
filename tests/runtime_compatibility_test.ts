import assert from "node:assert/strict";
import { join } from "node:path";
import {
  compile,
  compileFile,
  generateRuntimeModule,
} from "../src/compiler.ts";
import {
  fingerprintRuntimeSource,
  runtimeModuleFingerprint,
} from "../src/runtime_module.ts";
import { text } from "./helpers.ts";

const mismatchMessage =
  "Toss runtime is missing or incompatible. Regenerate the runtime module with the matching compiler, then rebuild this artifact.";

type CompatibilityCase = {
  readonly name: string;
  readonly format: "program" | "esm";
  readonly bundle: boolean;
  readonly runtimeSource: string;
};

async function compileArtifact(
  directory: string,
  format: CompatibilityCase["format"],
  bundle: boolean,
): Promise<string> {
  if (!bundle) {
    return compile(
      "'TOSS_BODY_EFFECT' print.",
      "entry.toss",
      { format, runtimeImport: "./runtime.js" },
    );
  }
  await Deno.writeTextFile(
    join(directory, "dependency.toss"),
    "'TOSS_DEPENDENCY_EFFECT' print. %export(1).",
  );
  await Deno.writeTextFile(
    join(directory, "entry.toss"),
    "#dependency bind: %import('./dependency.toss'). 'TOSS_BODY_EFFECT' print. %export(2).",
  );
  return await compileFile(join(directory, "entry.toss"), undefined, {
    format,
    runtimeImport: "./runtime.js",
  });
}

async function runImport(directory: string): Promise<Deno.CommandOutput> {
  const probe = join(directory, "probe.js");
  await Deno.writeTextFile(
    probe,
    'import("./artifact.js").catch((error) => console.log(error.message));',
  );
  return await new Deno.Command(Deno.execPath(), {
    args: [
      "run",
      "--no-config",
      "--no-prompt",
      `--allow-read=${directory}`,
      probe,
    ],
    stdout: "piped",
    stderr: "piped",
  }).output();
}

async function runSuccessfulImport(
  directory: string,
): Promise<Deno.CommandOutput> {
  const probe = join(directory, "success.js");
  await Deno.writeTextFile(
    probe,
    'await import("./program.js"); const result = await import("./esm.js"); console.log(result.default);',
  );
  return await new Deno.Command(Deno.execPath(), {
    args: [
      "run",
      "--no-config",
      "--no-prompt",
      `--allow-read=${directory}`,
      probe,
    ],
    stdout: "piped",
    stderr: "piped",
  }).output();
}

Deno.test("runtime fingerprint is deterministic and derives from factory source", () => {
  const generated = generateRuntimeModule();
  const marker = generated.match(/runtimeFingerprint = "([^"]+)"/);
  const factory = generated.slice(
    generated.indexOf("export function createRuntime()"),
  );
  assert.ok(marker?.[1]);
  assert.equal(generated, generateRuntimeModule());
  assert.equal(marker[1], fingerprintRuntimeSource(factory));
  assert.notEqual(
    fingerprintRuntimeSource(`${factory}\n// changed`),
    marker[1],
  );
  assert.equal(marker[1], runtimeModuleFingerprint());
});

Deno.test("runtime mismatch fails before factory invocation or Toss body effects", async () => {
  const marker = runtimeModuleFingerprint();
  const cases: readonly CompatibilityCase[] = [
    {
      name: "old runtime export shape",
      format: "program",
      bundle: false,
      runtimeSource:
        "export function createRuntime() { console.log('FACTORY_EFFECT'); return {}; }",
    },
    {
      name: "wrong marker in bundled ESM",
      format: "esm",
      bundle: true,
      runtimeSource:
        `export const runtimeFingerprint = "wrong"; export function createRuntime() { console.log('FACTORY_EFFECT'); return {}; }`,
    },
    {
      name: "missing factory",
      format: "program",
      bundle: false,
      runtimeSource: `export const runtimeFingerprint = "${marker}";`,
    },
    {
      name: "invalid factory",
      format: "esm",
      bundle: true,
      runtimeSource:
        `export const runtimeFingerprint = "${marker}"; export const createRuntime = 42;`,
    },
    {
      name: "invalid factory result",
      format: "program",
      bundle: false,
      runtimeSource:
        `export const runtimeFingerprint = "${marker}"; export function createRuntime() { return {}; }`,
    },
    {
      name: "throwing factory",
      format: "esm",
      bundle: true,
      runtimeSource:
        `export const runtimeFingerprint = "${marker}"; export function createRuntime() { throw new Error("factory failure"); }`,
    },
  ];
  for (const testCase of cases) {
    const directory = await Deno.makeTempDir({
      prefix: "toss-runtime-mismatch-",
    });
    try {
      await Deno.writeTextFile(
        join(directory, "runtime.js"),
        testCase.runtimeSource,
      );
      const artifact = await compileArtifact(
        directory,
        testCase.format,
        testCase.bundle,
      );
      await Deno.writeTextFile(join(directory, "artifact.js"), artifact);
      const result = await runImport(directory);
      assert.equal(result.code, 0, `${testCase.name}: ${text(result.stderr)}`);
      assert.equal(text(result.stdout), `${mismatchMessage}\n`, testCase.name);
      assert.equal(text(result.stderr), "", testCase.name);
    } finally {
      await Deno.remove(directory, { recursive: true });
    }
  }
});

Deno.test("matching runtime runs program and ESM output", async () => {
  const directory = await Deno.makeTempDir({
    prefix: "toss-runtime-matching-",
  });
  try {
    await Deno.writeTextFile(
      join(directory, "runtime.js"),
      generateRuntimeModule(),
    );
    await Deno.writeTextFile(
      join(directory, "program.js"),
      compile("'PROGRAM_EFFECT' print.", "program.toss", {
        runtimeImport: "./runtime.js",
      }),
    );
    await Deno.writeTextFile(
      join(directory, "esm.js"),
      compile("%export(%js(Math.max(1, 42))).", "esm.toss", {
        format: "esm",
        runtimeImport: "./runtime.js",
      }),
    );
    const result = await runSuccessfulImport(directory);
    assert.equal(result.code, 0, text(result.stderr));
    assert.equal(text(result.stdout), "PROGRAM_EFFECT\n42\n");
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});
