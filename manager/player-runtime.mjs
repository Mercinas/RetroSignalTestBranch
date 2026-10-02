import { createHash } from "node:crypto";
import { copyFile, lstat, mkdir, readFile, readdir, realpath, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";

const ROOT_FILES = ["index.html", "emulator-frame.html", "LivelyInfo.json", "LivelyProperties.json", "VERSION", "docs/screenshots/selector.png"];
const DIRECTORIES = ["js", "models", "textures", "emulatorjs"];

// Runtime updates never copy or overwrite games, firmware or generated settings.
export async function prepareStandaloneRuntime(sourceRoot, dataRoot) {
  const source = await realpath(sourceRoot);
  const target = resolve(dataRoot, "Player");
  await mkdir(target, { recursive: true });
  if ((await lstat(target)).isSymbolicLink()) throw new Error("The standalone player folder must not be a symbolic link.");
  const files = [...ROOT_FILES];
  const releaseCores = new Set((await readFile(join(source, "emulatorjs", "cores", "RELEASE_FILES.txt"), "utf8")
    .catch(error => { if (error.code !== "ENOENT") throw error; return ""; })).split(/\r?\n/).filter(Boolean));
  async function visit(directory) {
    for (const entry of await readdir(join(source, directory), { withFileTypes: true })) {
      if (entry.isSymbolicLink()) throw new Error("The bundled player runtime contains a symbolic link.");
      const path = join(directory, entry.name);
      if (directory === join("emulatorjs", "cores") && entry.name.endsWith(".data") && !releaseCores.has(entry.name)) continue;
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) files.push(path);
    }
  }
  for (const directory of DIRECTORIES) await visit(directory);
  const hash = createHash("sha256");
  for (const path of files.sort()) {
    hash.update(path.replaceAll(sep, "/"));
    hash.update(await readFile(join(source, path)));
  }
  const fingerprint = hash.digest("hex");
  const marker = join(target, ".bundled-runtime.sha256");
  if (await readFile(marker, "utf8").catch(() => "") !== fingerprint) {
    for (const path of files) {
      const destination = resolve(target, path);
      if (relative(target, destination).startsWith("..")) throw new Error("Invalid bundled runtime path.");
      await mkdir(dirname(destination), { recursive: true });
      let current = destination;
      while (current !== target) {
        const details = await lstat(current).catch(error => { if (error.code !== "ENOENT") throw error; });
        if (details?.isSymbolicLink()) throw new Error("The standalone runtime contains an unsafe link.");
        current = dirname(current);
      }
      await copyFile(join(source, path), destination);
    }
    await writeFile(marker, fingerprint);
  }
  await mkdir(join(target, "roms"), { recursive: true });
  await mkdir(join(target, "bios"), { recursive: true });
  return target;
}
