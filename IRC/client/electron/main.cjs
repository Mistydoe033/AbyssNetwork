const { app, BrowserWindow, Menu } = require("electron");
const path = require("node:path");

function createWindow() {
  const iconPath = path.join(__dirname, "..", "public", "AIP.png");

  const window = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: iconPath,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.cjs")
    }
  });

  window.maximize();
  Menu.setApplicationMenu(null);

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    window.loadURL(devServerUrl);
  } else {
    window.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
