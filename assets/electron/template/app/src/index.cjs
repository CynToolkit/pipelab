const { app, BrowserWindow } = require('electron');
const { join } = require('node:path');
const { Hono } = require('hono')
const { serveStatic } = require('@hono/node-server/serve-static')
const { serve } = require('@hono/node-server')
const { createCA, createCert } = require("mkcert");
const { createSecureServer } = require('node:http2')

const honoServer = new Hono()

honoServer.use('/*', serveStatic({ root: './src/app/' }))

const awaitServer = async () => {
  // const ca = await createCA({
  //   organization: "Hello CA",
  //   countryCode: "NP",
  //   state: "Bagmati",
  //   locality: "Kathmandu",
  //   validity: 365
  // });

  // const cert = await createCert({
  //   ca: { key: ca.key, cert: ca.cert },
  //   domains: ["127.0.0.1", "localhost", "0.0.0.0", "::1"],
  //   validity: 365
  // });

  // console.log('cert', cert)

  return new Promise((res, rej) => {
    try {
      serve({
        fetch: honoServer.fetch,
        // createServer: createSecureServer,
        // serverOptions: {
        //   key: cert.key,
        //   cert: cert.cert,
        // },
        hostname: '127.0.0.1',
      }, (infos) => {
        return res(infos)
      })
    } catch (e) {
      console.log("e", e)
      return rej(e)
    }
  })
}


// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  app.quit();
}

const createWindow = (url) => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
    },
  });

  // and load the index.html of the app.
  mainWindow.loadURL(url);
  // mainWindow.loadFile(join(__dirname, 'index.html'));

  // Open the DevTools.
  mainWindow.webContents.openDevTools();
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
  const infos = await awaitServer()

  const urlStr = `http://${infos.address}:${infos.port}`
  console.log('urlStr', urlStr)

  // const url = new URL(urlStr)
  // console.log('url', url)

  createWindow(urlStr);
  // createWindow(url);

  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
