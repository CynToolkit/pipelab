const isDev = process.env.NODE_ENV === "development";

export const builtInPlugins = async () => {
  const base = [
    (await import("@pipelab/plugin-construct")).default,
    (await import("@pipelab/plugin-filesystem")).default,
    (await import("@pipelab/plugin-system")).default,
    (await import("@pipelab/plugin-steam")).default,
    (await import("@pipelab/plugin-itch")).default,
    (await import("@pipelab/plugin-electron")).default,
    (await import("@pipelab/plugin-discord")).default,
    (await import("@pipelab/plugin-poki")).default,
    (await import("@pipelab/plugin-nvpatch")).default,
    (await import("@pipelab/plugin-tauri")).default,
  ];

  if (isDev) {
    base.push((await import("@pipelab/plugin-netlify")).default);
  }

  return (await Promise.all([...base])).flat();
};
