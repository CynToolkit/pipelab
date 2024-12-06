import { invoke } from "@tauri-apps/api/core";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function showOverlay () {
  // eslint-disable-next-line no-console
  console.log('show overlay')
  // Invoke the command
  await invoke('showOverlay')
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function hideOverlay () {
  // eslint-disable-next-line no-console
  console.log('hide overlay')
  // Invoke the command
  await invoke('hideOverlay')
}

window.addEventListener("DOMContentLoaded", () => {
  const counter = document.querySelector('#counter')
  let counterValue = 0

  document.querySelector("#btn")?.addEventListener("click", async (e) => {
    e.preventDefault();
    await showOverlay()
  });

  document.querySelector("#btn2")?.addEventListener("click", async (e) => {
    e.preventDefault();
    await hideOverlay()
  });

  setInterval(() => {
    if (!counter) {
      return
    }
    counter.innerHTML = counterValue.toString()
    counterValue += 1
  }, 100)
});
