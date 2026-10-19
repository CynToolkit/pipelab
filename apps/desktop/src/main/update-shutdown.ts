export async function installUpdateAfterServerStops(options: {
  stopServer: () => Promise<void>;
  quitAndInstall: () => void;
  setInstalling: (installing: boolean) => void;
  onFailure: (error: unknown) => void;
}): Promise<void> {
  try {
    await options.stopServer();
    options.setInstalling(true);
    options.quitAndInstall();
  } catch (error) {
    options.setInstalling(false);
    options.onFailure(error);
  }
}
