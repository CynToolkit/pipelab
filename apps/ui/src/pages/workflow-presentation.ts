export const readableProviderId = (id: string) => {
  const normalizedId = id
    .replace(/^@pipelab\/plugin-/, "")
    .replace(/^@pipelab\/core\//, "")
    .replace(/\/(?:source|destination|producer)$/, "")
    .replace(/^@/, "")
    .replace(/[/_-]+/g, " ")
    .trim();

  return normalizedId.replace(/\b\w/g, (letter) => letter.toUpperCase()) || id;
};
