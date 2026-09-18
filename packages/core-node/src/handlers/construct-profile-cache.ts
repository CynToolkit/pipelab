import type { BrowserProfileCandidate } from "@pipelab/shared";

type DiscoverProfiles = () => Promise<BrowserProfileCandidate[]>;
type InspectProfile = (path: string) => Promise<BrowserProfileCandidate>;

const clone = (profiles: BrowserProfileCandidate[]) => profiles.map((profile) => ({ ...profile }));

export class ConstructProfileDiscoveryCache {
  private profiles?: BrowserProfileCandidate[];
  private discovery?: Promise<BrowserProfileCandidate[]>;
  private readonly inspections = new Map<string, Promise<BrowserProfileCandidate>>();

  constructor(
    private readonly discover: DiscoverProfiles,
    private readonly inspect: InspectProfile,
  ) {}

  async get(path?: string, forceRefresh = false): Promise<BrowserProfileCandidate[]> {
    let profiles: BrowserProfileCandidate[];

    if (this.discovery) {
      profiles = await this.discovery;
    } else if (this.profiles && !forceRefresh) {
      profiles = this.profiles;
    } else {
      const discovery = this.discover().then((result) => {
        this.profiles = clone(result);
        return this.profiles;
      });
      this.discovery = discovery;
      try {
        profiles = await discovery;
      } finally {
        if (this.discovery === discovery) this.discovery = undefined;
      }
    }

    if (path && !profiles.some((profile) => profile.path === path)) {
      let inspection = this.inspections.get(path);
      if (!inspection) {
        inspection = this.inspect(path);
        this.inspections.set(path, inspection);
      }
      try {
        const candidate = await inspection;
        if (!this.profiles?.some((profile) => profile.path === path)) {
          this.profiles = [candidate, ...(this.profiles || profiles)];
        }
        profiles = this.profiles;
      } finally {
        if (this.inspections.get(path) === inspection) this.inspections.delete(path);
      }
    }

    return clone(this.profiles || profiles);
  }
}
