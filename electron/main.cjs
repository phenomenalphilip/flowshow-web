const { app, BrowserWindow, screen, ipcMain } = require('electron');
const path = require('path');

let projectors = {};

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    icon: path.join(__dirname, '../public/icon.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // To load the Vite dev server during development
  const startUrl = process.env.VITE_DEV_SERVER_URL || `file://${path.join(__dirname, '../dist/index.html')}`;
  mainWindow.loadURL(startUrl);
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

// IPC Handlers for Screens and Projector logic
ipcMain.handle('get-screens', async () => {
    const displays = screen.getAllDisplays();
    return displays.map((disp, i) => ({
      id: disp.id,
      label: `Display ${i + 1} (${disp.bounds.width}x${disp.bounds.height})`,
      bounds: disp.bounds,
      isPrimary: disp.bounds.x === 0 && disp.bounds.y === 0
    }));
});

ipcMain.handle('open-projector', async (event, outputId, displayLabel) => {
    // find the screen based on label hack since we built the label
    const displays = screen.getAllDisplays();
    const targetDisplay = displays.find((disp, i) => `Display ${i + 1} (${disp.bounds.width}x${disp.bounds.height})` === displayLabel);
    
    if (!targetDisplay) return;

    if (projectors[outputId]) {
      projectors[outputId].close();
    }

    const { x, y, width, height } = targetDisplay.bounds;

    const projectorWin = new BrowserWindow({
      x, y, width, height,
      fullscreen: true,
      frame: false,
      transparent: true,
      skipTaskbar: true,
      autoHideMenuBar: true,
      webPreferences: {
         nodeIntegration: false,
         contextIsolation: true
      }
    });

    const startUrl = process.env.VITE_DEV_SERVER_URL || `file://${path.join(__dirname, '../dist/index.html')}`;
    projectorWin.loadURL(`${startUrl}#/projector/${outputId}`);

    projectors[outputId] = projectorWin;
});

ipcMain.handle('close-projectors', async () => {
   for (const key of Object.keys(projectors)) {
      if (projectors[key] && !projectors[key].isDestroyed()) {
         projectors[key].close();
      }
      delete projectors[key];
   }
});
