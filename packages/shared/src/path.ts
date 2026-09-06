// Path data model — what the user configures. The compiler turns this into
// the internal SavedFile canvas at runtime. The user never sees a canvas.

export type DeliveryKind = "app" | "web" | "archive";

export type DestinationType =
  | "steam"
  | "itch"
  | "poki"
  | "discord-activity"
  | "netlify"
  | "web"
  | "folder";

export type EngineType = "construct3" | "godot" | "folder";

export type Source =
  | { type: "construct3"; path: string }
  | { type: "godot"; path: string }
  | { type: "folder"; path: string };

export type Destination =
  | { type: "steam"; delivery: "app"; appId: string; credentialId: string }
  | { type: "itch"; delivery: DeliveryKind; project: string; credentialId: string }
  | { type: "poki"; delivery: "web"; gameId: string; credentialId: string }
  | { type: "discord-activity"; delivery: "app"; appId: string; credentialId: string }
  | { type: "netlify"; delivery: "web"; site: string; credentialId: string }
  | { type: "web"; delivery: "web"; outputDir: string }
  | { type: "folder"; delivery: DeliveryKind; outputDir: string };

export type Path = {
  version: "1.0.0";
  source: Source;
  destinations: Destination[];
};

export type DestinationState = "ready" | "shipping" | "shipped" | "failed" | "skipped";

export type DestinationRun = {
  state: DestinationState;
  startedAt?: number;
  finishedAt?: number;
  lastLog?: string;
  error?: string;
};

export type PathRunState = {
  destinations: Record<string, DestinationRun>;
};
