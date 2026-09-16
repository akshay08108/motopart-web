import { cp, mkdir, readFile, rename, rm, symlink, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const stagingRoot = join(projectRoot, ".capacitor-build");
const stagingOutput = join(stagingRoot, "out");
const outputRoot = join(projectRoot, "out");
const previousOutput = join(projectRoot, ".capacitor-output-previous");

const excludedAppPaths = [
  "app/api",
  "app/shop/[id]",
  "app/orders/[id]",
  "app/seller/orders/[id]",
  "app/seller/pending",
];

function includeSource(sourcePath) {
  const pathFromRoot = relative(projectRoot, sourcePath).split("\\").join("/");
  return !excludedAppPaths.some((excluded) => pathFromRoot === excluded || pathFromRoot.startsWith(`${excluded}/`));
}

async function runNextBuild() {
  const nextCli = join(projectRoot, "node_modules", "next", "dist", "bin", "next");
  await new Promise((resolvePromise, rejectPromise) => {
    const build = spawn(process.execPath, [nextCli, "build", stagingRoot], {
      cwd: projectRoot,
      env: {
        ...process.env,
        CAPACITOR_BUILD: "1",
        NEXT_PUBLIC_CAPACITOR_BUILD: "1",
      },
      stdio: "inherit",
    });
    build.once("error", rejectPromise);
    build.once("exit", (code, signal) => {
      if (code === 0) resolvePromise();
      else rejectPromise(new Error(`Mobile Next.js build failed (${signal ?? `exit ${code}`}).`));
    });
  });
}

async function prepareStagingProject() {
  await rm(stagingRoot, { recursive: true, force: true });
  await mkdir(stagingRoot, { recursive: true });
  for (const directory of ["app", "components", "data", "lib", "public"]) {
    await cp(join(projectRoot, directory), join(stagingRoot, directory), { recursive: true, filter: includeSource });
  }
  for (const file of ["next.config.ts", "package.json", "tsconfig.json"]) {
    await cp(join(projectRoot, file), join(stagingRoot, file));
  }
  await symlink(join(projectRoot, "node_modules"), join(stagingRoot, "node_modules"), "dir");

  const packageJsonPath = join(stagingRoot, "package.json");
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
  packageJson.name = "partx-capacitor-build";
  await writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
}

async function publishOutput() {
  await rm(previousOutput, { recursive: true, force: true });
  try {
    await rename(outputRoot, previousOutput);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  try {
    await cp(stagingOutput, outputRoot, { recursive: true });
    await rm(previousOutput, { recursive: true, force: true });
  } catch (error) {
    await rm(outputRoot, { recursive: true, force: true });
    try {
      await rename(previousOutput, outputRoot);
    } catch {
      // No previous output existed.
    }
    throw error;
  }
}

try {
  await prepareStagingProject();
  await runNextBuild();
  await publishOutput();
  console.log(`PartX Android web assets are ready in ${outputRoot}`);
} finally {
  await rm(stagingRoot, { recursive: true, force: true });
  await rm(previousOutput, { recursive: true, force: true });
}
