/**
 * @param {Object} json
 * @param {string} json.correlationId
 * @param {string} json.url
 * @param {{ ignore: boolean, forward?: boolean }} json.body
 * @param {import('ws').WebSocket} ws
 * @param {import('electron').BrowserWindow} mainWindow
 */
export default async (json, ws, mainWindow) => {
<<<<<<< HEAD:assets/electron/template/app/src/handlers/window/set-ignore-mouse-events.js
  const { ignore, forward } = json.body

  mainWindow.setIgnoreMouseEvents(ignore, { forward })
=======
  const { ignore, forward } = json.body;

  mainWindow.setIgnoreMouseEvents(ignore, { forward });
>>>>>>> origin/feature/monorepo:assets/asset-electron/template/src/handlers/window/set-ignore-mouse-events.js

  const result = {
    correlationId: json.correlationId,
    url: json.url,
    body: {
<<<<<<< HEAD:assets/electron/template/app/src/handlers/window/set-ignore-mouse-events.js
      success: true
    }
  }
  ws.send(JSON.stringify(result))
}
=======
      success: true,
    },
  };
  ws.send(JSON.stringify(result));
};
>>>>>>> origin/feature/monorepo:assets/asset-electron/template/src/handlers/window/set-ignore-mouse-events.js
