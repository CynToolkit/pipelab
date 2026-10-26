import type { ReleaseConfig } from "@pipelab/shared";

export const invalidEnvironmentBindingPaths = (
  config: Pick<ReleaseConfig, "source" | "builds" | "destinations">,
) => {
  const invalidPaths: string[] = [];
  const reference = /\$\{\{\s*env\.([\s\S]*?)\s*\}\}/g;
  const validName = /^[A-Za-z_][A-Za-z0-9_]*$/;
  const visit = (value: unknown, path: string) => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${path}.${index}`));
      return;
    }
    if (typeof value === "object" && value !== null) {
      Object.entries(value).forEach(([key, item]) => visit(item, `${path}.${key}`));
      return;
    }
    if (typeof value !== "string") return;
    if ([...value.matchAll(reference)].some((match) => !validName.test(match[1])))
      invalidPaths.push(path);
  };

  visit(config.source.config, "source.config");
  config.builds.forEach((build, index) => {
    visit(build.config, `builds.${index}.config`);
    build.targets.forEach((target, targetIndex) =>
      visit(target.config, `builds.${index}.targets.${targetIndex}.config`),
    );
  });
  config.destinations.forEach((destination, index) => {
    visit(destination.config, `destinations.${index}.config`);
    destination.slots.forEach((slot, slotIndex) =>
      visit(slot.config, `destinations.${index}.slots.${slotIndex}.config`),
    );
  });
  return invalidPaths;
};
