import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createAction, createActionRunner, createNodeDefinition } from "@pipelab/plugin-core";
import type { ReleaseProducerDefinition, ReleaseSourceDefinition } from "@pipelab/shared";
import { exportGodotProject, godotPresetMatchesTarget, hasGodotTemplates } from "./export";
export { godotPresetMatchesTarget } from "./export";

const targetDescriptors = {
  "windows-x64": { kind: "application" as const, technology: "godot", platform: "windows", architecture: "x64", format: "directory" },
  "linux-x64": { kind: "application" as const, technology: "godot", platform: "linux", architecture: "x64", format: "directory" },
  "macos-arm64": { kind: "application" as const, technology: "godot", platform: "macos", architecture: "arm64", format: "directory" },
  web: { kind: "application" as const, technology: "godot", platform: "web", format: "directory" },
};

const inspect = async (path: string) => {
  const project = await readFile(join(path, "project.godot"), "utf8");
  const projectName = project.match(/^config\/name\s*=\s*"([^"]+)"/m)?.[1] || "Godot project";
  const presets: string[] = [];
  const presetPlatforms: Record<string, string> = {};
  try {
    const config = await readFile(join(path, "export_presets.cfg"), "utf8");
    for (const section of config.split(/(?=^\[preset\.\d+\]\s*$)/m)) {
      const name = section.match(/^name\s*=\s*"([^"]+)"/m)?.[1];
      const platform = section.match(/^platform\s*=\s*"([^"]+)"/m)?.[1];
      if (name) { presets.push(name); if (platform) presetPlatforms[name] = platform; }
    }
  } catch { /* Presets are reported as missing through issues. */ }
  let executable: string | undefined;
  let godotVersion: string | undefined;
  for (const candidate of ["godot", "godot4"]) {
    try { godotVersion = execFileSync(candidate, ["--version"], { encoding: "utf8", timeout: 3000 }).trim(); executable = candidate; break; } catch { /* Try next executable. */ }
  }
  let templatesAvailable = false;
  templatesAvailable = await hasGodotTemplates(process.platform);
  return { metadata: { projectName, godotVersion }, data: { executable, templatesAvailable, presets, presetPlatforms }, issues: [
    ...(!executable ? [{ code: "godot.executable.missing", message: "Godot executable not found.", severity: "error" as const }] : []),
    ...(!templatesAvailable ? [{ code: "godot.templates.missing", message: "Godot export templates are missing.", severity: "warning" as const }] : []),
  ] };
};

export const godotSource: ReleaseSourceDefinition = {
  id: "@pipelab/plugin-godot/source",
  label: "Godot project",
  output: { kind: "project", technology: "godot" },
  createDefaultConfig: () => ({ path: "" }),
  validate: (config) => typeof config.path === "string" && config.path ? [] : [{ code: "source.path.required", message: "A project path is required.", severity: "error" }],
  inspect: async (config) => inspect(String(config.path || "")),
  compile: (config) => ({ steps: [{ id: "release-godot-source", uses: "@pipelab/core/passthrough", with: { path: config.path }, artifacts: { output: { descriptor: godotSource.output } } }], artifact: { reference: { stepId: "release-godot-source", artifact: "output" }, descriptor: godotSource.output } }),
};

const godotExportAction = createAction({ id: "godot:export", name: "Export Godot project", displayString: "Export Godot project", icon: "", description: "Export a Godot project", meta: {}, params: {}, outputs: {} });
const godotExportRunner = createActionRunner(async (data) => {
  const inputs = data.inputs as Record<string, unknown>;
  const project = String(inputs.project || "");
  const preset = String(inputs.preset || "").trim();
  const target = String(inputs.target || "");
  if (!project || !preset) throw new Error("Godot export requires a project folder and preset.");
  const result = await exportGodotProject({ executable: String(inputs.executable || "godot"), project, preset, platform: target.startsWith("windows") ? "windows" : target.startsWith("linux") ? "linux" : target.startsWith("macos") ? "macos" : "web", projectName: String(inputs.projectName || "game"), outputDirectory: join(data.cwd, ".pipelab-godot", target), signal: data.abortSignal, log: (stream, chunk) => data.log(chunk), ensureDirectory: async (path) => { await (await import("node:fs/promises")).mkdir(path, { recursive: true }); } });
  data.setArtifact("output", result.path);
  data.setOutput("output", result.path);
});

export const godotExporter: ReleaseProducerDefinition = {
  id: "@pipelab/plugin-godot/producer",
  label: "Godot exporter",
  accepts: { kind: "project", technology: "godot" },
  targets: Object.entries(targetDescriptors).map(([id, output]) => ({ id, label: id, output, fields: [{ key: "preset", type: "select" as const, label: "Godot export preset", required: true }], createDefaultConfig: () => ({ preset: "" }), isAvailable: () => ({ available: true }) })),
  createDefaultConfig: () => ({ executable: "godot" }),
  validate: (config) => config.targets.filter((target) => target.enabled).flatMap((target) => !String(target.config.preset || "").trim() ? [{ code: "godot.preset.required", message: `Choose a preset for ${target.id}.`, severity: "error" as const, path: `targets.${target.id}.config.preset` }] : String(target.config.presetPlatform || "") && !godotPresetMatchesTarget(String(target.config.presetPlatform), target.id) ? [{ code: "godot.preset.target-mismatch", message: `Preset ${target.config.preset} does not match target ${target.id}.`, severity: "error" as const, path: `targets.${target.id}.config.preset` }] : []),
  inspect: async (config) => ({ issues: config.targets.filter((target) => target.enabled).flatMap((target) => { const preset = String(target.config.preset || ""); const presetPlatform = String(target.config.presetPlatform || ""); return !preset ? [{ code: "godot.preset.required", message: `Choose a preset for ${target.id}.`, severity: "error" as const }] : presetPlatform && !godotPresetMatchesTarget(presetPlatform, target.id) ? [{ code: "godot.preset.target-mismatch", message: `Preset ${preset} does not match target ${target.id}.`, severity: "error" as const }] : []; }) }),
  compile: (input, config) => ({ steps: config.targets.filter((target) => target.enabled).map((target) => ({ id: `${config.id}-${target.id}`, uses: "@pipelab/plugin-godot/godot:export", needs: [input.stepId], artifactInputs: { project: input }, with: { preset: target.config.preset, target: target.id, executable: config.config.executable }, artifacts: { output: { descriptor: targetDescriptors[target.id as keyof typeof targetDescriptors] } } })), artifacts: Object.fromEntries(config.targets.filter((target) => target.enabled).map((target) => [target.id, { reference: { stepId: `${config.id}-${target.id}`, artifact: "output" }, descriptor: targetDescriptors[target.id as keyof typeof targetDescriptors] }])) }),
};

export default createNodeDefinition({ id: "@pipelab/plugin-godot", packageName: "@pipelab/plugin-godot", name: "Godot", description: "Godot release integration", icon: { type: "icon", icon: "pi-gamepad" }, isOfficial: true, nodes: [{ node: godotExportAction, runner: godotExportRunner }], release: { sources: [godotSource], producers: [godotExporter] } });
