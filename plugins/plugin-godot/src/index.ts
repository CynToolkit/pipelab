import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createAction, createActionRunner, createNodeDefinition } from "@pipelab/plugin-core";
import type { ReleaseProducerDefinition, ReleaseSourceDefinition } from "@pipelab/shared";
import { exportGodotProject, findGodotExecutable, godotPresetMatchesTarget, hasGodotTemplates } from "./export";
export { godotPresetMatchesTarget } from "./export";

const targetDescriptors = {
  "windows-x64": { kind: "application" as const, technology: "godot", platform: "windows", architecture: "x64", container: "directory" as const },
  "linux-x64": { kind: "application" as const, technology: "godot", platform: "linux", architecture: "x64", container: "directory" as const },
  "macos-arm64": { kind: "application" as const, technology: "godot", platform: "macos", architecture: "arm64", container: "directory" as const },
  web: { kind: "application" as const, technology: "godot", platform: "web", container: "directory" as const },
};

const presetInfoForProject = (projectPath: string, preset: string): { found: boolean; checked: boolean; platform?: string } => {
  try {
    const config = readFileSync(join(projectPath, "export_presets.cfg"), "utf8");
    for (const section of config.split(/(?=^\[preset\.\d+\]\s*$)/m)) {
      const name = section.match(/^name\s*=\s*"([^"]+)"/m)?.[1];
      if (name === preset) return { found: true, checked: true, platform: section.match(/^platform\s*=\s*"([^"]+)"/m)?.[1] };
    }
  } catch { return { found: false, checked: false }; }
  return { found: false, checked: true };
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
  executable = findGodotExecutable();
  if (executable) try { godotVersion = execFileSync(executable, ["--version"], { encoding: "utf8", timeout: 3000 }).trim(); } catch { /* Version is optional metadata. */ }
  let templatesAvailable = false;
  templatesAvailable = await hasGodotTemplates(process.platform);
  return { metadata: { projectName, godotVersion }, data: { executable, templatesAvailable, presets, presetPlatforms }, fieldOptions: { preset: presets.map((preset) => ({ label: preset, value: preset })) }, issues: [
    ...(!executable ? [{ code: "godot.executable.missing", message: "Godot executable not found.", severity: "error" as const }] : []),
    ...(!templatesAvailable ? [{ code: "godot.templates.missing", message: "Godot export templates are missing.", severity: "warning" as const }] : []),
  ] };
};

export const godotSource: ReleaseSourceDefinition = {
  id: "@pipelab/plugin-godot/source",
  label: "Godot project",
  fields: [{ key: "path", type: "directory", label: "Project path", required: true }],
  output: { kind: "project", technology: "godot", container: "directory" },
  createDefaultConfig: () => ({ path: "" }),
  validate: (config) => typeof config.path === "string" && config.path ? [] : [{ code: "source.path.required", message: "A project path is required.", severity: "error" }],
  inspect: async (config) => { const result = await inspect(String(config.path || "")); return { ...result, fieldValues: result.data?.executable ? { "source.executable": result.data.executable } : undefined }; },
  compile: (config) => ({ steps: [{ id: "release-godot-source", uses: "@pipelab/core/passthrough", with: { path: config.path }, artifacts: { output: { descriptor: godotSource.output } } }], artifact: { reference: { stepId: "release-godot-source", artifact: "output" }, descriptor: godotSource.output } }),
};

const godotExportAction = createAction({ id: "godot:export", name: "Export Godot project", displayString: "Export Godot project", icon: "", description: "Export a Godot project", meta: {}, params: {}, outputs: {} });
const godotExportRunner = createActionRunner(async (data) => {
  const inputs = data.inputs as Record<string, unknown>;
  const project = String(inputs.project || "");
  const preset = String(inputs.preset || "").trim();
  const target = String(inputs.target || "");
  if (!project || !preset) throw new Error("Godot export requires a project folder and preset.");
  const result = await exportGodotProject({ executable: String(inputs.executable || findGodotExecutable() || "godot"), project, preset, platform: target.startsWith("windows") ? "windows" : target.startsWith("linux") ? "linux" : target.startsWith("macos") ? "macos" : "web", projectName: String(inputs.projectName || "game"), outputDirectory: join(data.cwd, ".pipelab-godot", target), signal: data.abortSignal, log: (stream, chunk) => data.log(chunk), ensureDirectory: async (path) => { await (await import("node:fs/promises")).mkdir(path, { recursive: true }); } });
  data.setArtifact("output", result.path);
  data.setOutput("output", result.path);
});

export const godotExporter: ReleaseProducerDefinition = {
  id: "@pipelab/plugin-godot/producer",
  label: "Godot exporter",
  planning: { mode: "build" },
  accepts: { kind: "project", technology: "godot", container: "directory" },
  targets: Object.entries(targetDescriptors).map(([id, output]) => ({ id, label: id, buildType: id === "web" ? "web" : "desktop", output, fields: [{ key: "preset", type: "select" as const, label: "Godot export preset", required: true }], createDefaultConfig: () => ({ preset: "" }), isAvailable: () => ({ available: true }) })),
  createDefaultConfig: () => ({ executable: "" }),
  validate: (config, context) => config.targets.filter((target) => target.enabled).flatMap((target) => {
    const preset = String(target.config.preset || "").trim();
    if (!preset) return [{ code: "godot.preset.required", message: `Choose a preset for ${target.id}.`, severity: "error" as const, path: `targets.${target.id}.config.preset` }];
    const presetInfo = context.sourceConfig?.path ? presetInfoForProject(String(context.sourceConfig.path), preset) : { found: true, checked: false };
    if (presetInfo.checked && !presetInfo.found) return [{ code: "godot.preset.unknown", message: `Preset ${preset} does not exist in export_presets.cfg.`, severity: "error" as const, path: `targets.${target.id}.config.preset` }];
    return presetInfo.platform && !godotPresetMatchesTarget(presetInfo.platform, target.id) ? [{ code: "godot.preset.target-mismatch", message: `Preset ${preset} does not match target ${target.id}.`, severity: "error" as const, path: `targets.${target.id}.config.preset` }] : [];
  }),
  inspect: async (config) => ({ issues: [...(!findGodotExecutable() ? [{ code: "godot.executable.missing", message: "Godot executable not found.", severity: "error" as const }] : []), ...config.targets.filter((target) => target.enabled).flatMap((target) => !String(target.config.preset || "").trim() ? [{ code: "godot.preset.required", message: `Choose a preset for ${target.id}.`, severity: "error" as const }] : [])] }),
  compile: (input, config) => ({ steps: config.targets.filter((target) => target.enabled).map((target) => ({ id: `${config.id}-${target.id}`, uses: "@pipelab/plugin-godot/godot:export", needs: [input.reference.stepId], artifactInputs: { project: input.reference }, with: { preset: target.config.preset, target: target.id, executable: config.config.executable || findGodotExecutable() }, artifacts: { output: { descriptor: targetDescriptors[target.id as keyof typeof targetDescriptors] } } })), artifacts: Object.fromEntries(config.targets.filter((target) => target.enabled).map((target) => [target.id, { reference: { stepId: `${config.id}-${target.id}`, artifact: "output" }, descriptor: targetDescriptors[target.id as keyof typeof targetDescriptors] }])) }),
};

export default createNodeDefinition({ id: "@pipelab/plugin-godot", packageName: "@pipelab/plugin-godot", name: "Godot", description: "Godot release integration", icon: { type: "icon", icon: "pi-gamepad" }, isOfficial: true, nodes: [{ node: godotExportAction, runner: godotExportRunner }], release: { sources: [godotSource], producers: [godotExporter] } });
