import { describe, test, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { createMigration, finalVersion } from "./createMigration";
import { createMigrator, MigratorFactory } from "./createMigrator";
import { Migrator, MigrationSchema } from "./migration";
import { z } from "zod";

export const withMigration = (obj: z.ZodObject<any>) =>
  z
    .object({
      version: z.string(),
    })
    .merge(obj);

interface V1 extends MigrationSchema {
  dummyV1: string;
}

interface V2 extends MigrationSchema {
  dummyV2: string;
}

interface V3 extends MigrationSchema {
  dummyV3: string;
}

interface V4 extends MigrationSchema {
  dummy: string;
}

const outputV1: V1 = {
  dummyV1: "aaa",
  version: "1.0.0",
};

const outputV2: V2 = {
  dummyV2: "aaa",
  version: "2.0.0",
};

const outputV3: V3 = {
  dummyV3: "aaa",
  version: "3.0.0",
};

const outputV4: V4 = {
  dummy: "aaa",
  version: "4.0.0",
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("migrator", () => {
  let migratorInstance: MigratorFactory<V1, V4>;
  let migratorMigrations: Migrator<V1, V4>;
  beforeAll(() => {
    migratorInstance = createMigrator<V1, V4>();
    migratorMigrations = migratorInstance.createMigrations({
      defaultValue: outputV4,
      migrations: [
        createMigration<V1, V2>({
          version: "1.0.0",
          up: (state) => ({
            dummyV2: state.dummyV1,
          }),
        }),
        createMigration<V2, V3>({
          version: "2.0.0",
          up: (state) => ({
            dummyV3: state.dummyV2,
          }),
        }),
        createMigration<V3, V4>({
          version: "3.0.0",
          up: (state) => ({
            dummy: state.dummyV3,
          }),
        }),
        createMigration<V4, never>({
          version: "4.0.0",
          up: finalVersion,
        }),
      ],
    });
  });

  test("should not need migration", () => {
    expect(migratorMigrations.needMigration("4.0.0")).toBe(false);
    expect(migratorMigrations.needMigration("5.0.0")).toBe(false);
    expect(migratorMigrations.needMigration("4.1.0")).toBe(false);
    expect(migratorMigrations.needMigration("4.0.1")).toBe(false);
    expect(migratorMigrations.needMigration("5.0.1")).toBe(false);
  });

  test("should need migration", () => {
    expect(migratorMigrations.needMigration("0.0.0")).toBe(true);
    expect(migratorMigrations.needMigration("0.1.0")).toBe(true);
    expect(migratorMigrations.needMigration("0.0.1")).toBe(true);
    expect(migratorMigrations.needMigration("1.0.1")).toBe(true);
    expect(migratorMigrations.needMigration("2.3.1")).toBe(true);
    expect(migratorMigrations.needMigration("3.4.1")).toBe(true);
  });

  test("should migrate", async () => {
    const input: V1 = {
      dummyV1: "aaa",
      version: "1.0.0",
    };
    const result = await migratorMigrations.migrate(input);
    expect(result).toStrictEqual(outputV4);
  });

  test("should return instance if same target version", async () => {
    const input: V4 = {
      dummy: "aaa",
      version: "4.0.0",
    };
    const result = await migratorMigrations.migrate(input);
    expect(result).toStrictEqual(outputV4);
  });

  test("should not do anything if migrate up but nothing more", () => {
    const input: V4 = {
      dummy: "aaa",
      version: "4.0.0",
    };
    return expect(migratorMigrations.migrate(input)).resolves.toStrictEqual(outputV4);
  });

  test("should skip downgrades silently / not support them", async () => {
    const input: V4 = {
      dummy: "aaa",
      version: "4.0.0",
    };
    // Migrate should return the exact state since downgrades are bypassed
    const result = await migratorMigrations.migrate(input, {
      target: "3.0.0",
    });
    expect(result).toEqual(input);
  });

  test("should support onStep callback during migration", async () => {
    const input: V1 = {
      dummyV1: "aaa",
      version: "1.0.0",
    };

    const steps: any[] = [];
    await migratorMigrations.migrate(input, {
      onStep: async (state, version) => {
        steps.push({ ...state, version });
      },
    });

    expect(steps).toHaveLength(3); // 1 -> 2, 2 -> 3, 3 -> 4
    expect(steps[0]).toEqual(expect.objectContaining({ dummyV2: "aaa", version: "2.0.0" }));
    expect(steps[1]).toEqual(expect.objectContaining({ dummyV3: "aaa", version: "3.0.0" }));
    expect(steps[2]).toEqual(expect.objectContaining({ dummy: "aaa", version: "4.0.0" }));
  });

  test("should throw if target is not in migrations", async () => {
    const input: V4 = {
      dummy: "aaa",
      version: "1.2.0",
    };

    const badMigratorInstance = createMigrator<V1, V4>().createMigrations({
      migrations: [
        createMigration<V1, V2>({
          version: "1.0.0",
          up: (state) => ({
            dummyV2: state.dummyV1,
          }),
        }),
        createMigration<V4, never>({
          version: "4.0.0",
          up: finalVersion,
        }),
      ],
    });

    return expect(badMigratorInstance.migrate(input)).rejects.toThrow();
  });

  test("should migrate an incomplete version (loose)", async () => {
    const input: V1 = {
      dummyV1: "aaa",
      // @ts-expect-error specific to the test
      version: "1",
    };

    const migrator = createMigrator<V1, V4>().createMigrations({
      migrations: [
        createMigration<V1, V2>({
          version: "1.0.0",
          up: (state) => ({
            dummyV2: state.dummyV1,
          }),
        }),
        createMigration<V2, never>({
          version: "2.0.0",
          up: finalVersion,
        }),
      ],
    });

    const result = await migrator.migrate(input);

    expect(result).toEqual(expect.objectContaining({ version: "2.0.0" }));
  });

  test("should not migrate an incomplete version when coerce option disabled", async () => {
    const input: V1 = {
      dummyV1: "aaa",
      // @ts-expect-error specific to the test
      version: "1",
    };

    const migrator = createMigrator<V1, V2>().createMigrations({
      migrations: [
        createMigration<V1, V2>({
          version: "1.0.0",
          up: (state) => ({
            dummyV2: state.dummyV1,
          }),
        }),
        createMigration<V2, never>({
          version: "2.0.0",
          up: finalVersion,
        }),
      ],
      coerce: false,
    });

    await expect(migrator.migrate(input)).rejects.toThrow(
      'Current version "1" not found in migrations',
    );
  });
});

describe("async", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("should support async migration", async () => {
    const input: V1 = {
      dummyV1: "aaa",
      version: "1.0.0",
    };

    const migrator = createMigrator<V1, V2>().createMigrations({
      migrations: [
        createMigration<V1, V2>({
          version: "1.0.0",
          up: async (state) => {
            await sleep(1000);
            return {
              dummyV2: state.dummyV1,
            };
          },
        }),
        createMigration<V2, never>({
          version: "2.0.0",
          up: finalVersion,
        }),
      ],
    });

    const promise = migrator.migrate(input);

    vi.advanceTimersByTime(1000);

    const result = await promise;

    expect(result).toStrictEqual({
      dummyV2: "aaa",
      version: "2.0.0",
    });
  });
});
