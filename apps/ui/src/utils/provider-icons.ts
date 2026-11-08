import type { IconType, ReleaseCatalogSource } from "@pipelab/shared";

/** Provider metadata is matched by package name, e.g. `@pipelab/plugin-steam/destination`. */
interface IconProvider {
  packageName: string;
  icon?: IconType;
}

export const providerIconClass = (
  icon: IconType | undefined,
  fallback = "mdi mdi-puzzle-outline",
) => {
  if (icon?.type !== "icon") return fallback;
  if (icon.icon.includes("mdi ") || icon.icon.includes("pi ")) return icon.icon;
  if (icon.icon.startsWith("pi-")) return `pi ${icon.icon}`;
  return `mdi ${icon.icon}`;
};

export const providerIconImage = (icon?: IconType) =>
  icon?.type === "image" ? icon.image : undefined;

export const providerMetadataIcon = (providers: IconProvider[], id: string) =>
  providers.find(
    (provider) => id === provider.packageName || id.startsWith(`${provider.packageName}/`),
  )?.icon;

export const destinationIcon = (providers: IconProvider[], id: string, icon?: IconType) =>
  icon || providerMetadataIcon(providers, id);

export const sourceIcon = (providers: IconProvider[], source?: ReleaseCatalogSource) => {
  if (!source) return undefined;
  if (source.icon?.type === "image") return source.icon;
  const icon = providerMetadataIcon(providers, source.id);
  if (icon) return icon;
  if (source.icon) return source.icon;
  const file = source.fields?.find((field) => field.type === "file");
  if (file?.fileExtensions?.includes("c3p")) return { type: "icon", icon: "pi pi-clone" } as const;
  if (source.output.technology === "godot") return { type: "icon", icon: "pi pi-gamepad" } as const;
  if (source.output.platform === "web") return { type: "icon", icon: "pi pi-globe" } as const;
  if (file?.fileExtensions?.includes("zip")) return { type: "icon", icon: "pi pi-file" } as const;
  return { type: "icon", icon: "pi pi-folder" } as const;
};
