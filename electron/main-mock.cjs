/**
 * Electron main process - MOCK MODE (no backend required)
 * 
 * This version loads the app with static JSON data.
 * No backend server is needed - perfect for demos and presentations.
 */

const { app, BrowserWindow, shell } = require("electron");
const path = require("node:path");

let mainWindow = null;

/**
 * Create the main application window.
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    // Modern look
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 16 },
    title: "Atlantis Analyst (Demo)",
  });

  // Open external links in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  // Load built static files (with mock data)
  const indexPath = path.join(__dirname, "..", "frontend", "dist", "index.html");
  mainWindow.loadFile(indexPath);

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// App lifecycle
app.whenReady().then(() => {
  console.log("[Electron] Starting in MOCK MODE - no backend required");
  createWindow();

  app.on("activate", () => {
    // macOS: recreate window when dock icon is clicked
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  // macOS: keep app running unless explicitly quit
  if (process.platform !== "darwin") {
    app.quit();
  }
});

