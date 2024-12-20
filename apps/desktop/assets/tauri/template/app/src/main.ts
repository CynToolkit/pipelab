import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

async function showOverlay() {
  // eslint-disable-next-line no-console
  console.log('show overlay')
  // Invoke the command
  await invoke('showOverlay')
}

async function hideOverlay() {
  // eslint-disable-next-line no-console
  console.log('hide overlay')
  // Invoke the command
  await invoke('hideOverlay')
}

function getRandomColour(){
  var red = Math.floor(Math.random() * 256);
  var green = Math.floor(Math.random() * 256);
  var blue = Math.floor(Math.random() * 256);

  return "rgb("+red+","+green+"," +blue+" )";
}

window.addEventListener('DOMContentLoaded', () => {
  const counter = document.querySelector('#counter')
  let counterValue = 0

  document.querySelector('#btn')?.addEventListener('click', async (e) => {
    e.preventDefault()
    await showOverlay()
  })

  document.querySelector('#btn2')?.addEventListener('click', async (e) => {
    e.preventDefault()
    await hideOverlay()
  })

  const canvas = document.getElementById('wgpuCanvas') as HTMLCanvasElement | null
  if (!canvas) {
    console.log('canvas not found')
    return
  }
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    console.log('ctx not found')
    return
  }

  ctx.fillStyle = getRandomColour();
  ctx.fillRect(70,50,100,100);

  ctx.fillStyle = getRandomColour();
  ctx.fillRect(10,10,100,100);

  setInterval(() => {
    if (!counter) {
      return
    }
    counter.innerHTML = counterValue.toString()
    counterValue += 1
  }, 100)
})

listen('frame-data', (event) => {
  const data = event.payload
  // console.log('data', data)
  // Process the frame data (e.g., create an ImageData object and draw it on a canvas)
  const canvas = document.getElementById('wgpuCanvas') as HTMLCanvasElement | null
  if (!canvas) {
    console.log('canvas not found')
    return
  }
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    console.log('ctx not found')
    return
  }
  const imageData = new ImageData(new Uint8ClampedArray(data), canvas.width, canvas.height)
  // console.log('imageData', imageData)
  ctx.putImageData(imageData, 0, 0)
})
