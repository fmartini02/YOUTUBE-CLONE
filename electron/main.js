const { app, BrowserWindow } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const http = require("http");

let mainWindow;
let serverProcess;

// ── Start Python server ───────────────────────────────────────────────────────
function startServer() {
  const serverDir = path.join(__dirname, "..", "server");
  serverProcess = spawn("python3", ["-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8090"], {
    cwd: serverDir,
    stdio: "pipe",
  });
  serverProcess.stdout.on("data", d => console.log("[server]", d.toString()));
  serverProcess.stderr.on("data", d => console.error("[server]", d.toString()));
}

// ── Wait for server ready ─────────────────────────────────────────────────────
function waitForServer(retries = 30) {
  return new Promise((resolve, reject) => {
    function check() {
      http.get("http://localhost:8090/api/health", res => {
        if (res.statusCode === 200) resolve();
        else retry();
      }).on("error", () => retry());
    }
    function retry() {
      if (retries-- <= 0) reject(new Error("Server non risponde"));
      else setTimeout(check, 1000);
    }
    check();
  });
}

// ── Create window ─────────────────────────────────────────────────────────────
async function createWindow() {
  startServer();

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: "#0f0f0f",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
    titleBarStyle: "hiddenInset",
    title: "YTProxy",
  });

  // Loading screen
  mainWindow.loadURL("data:text/html,<html style='background:#0f0f0f;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column;gap:16px'><div style='font-size:48px'>▶</div><div style='font-size:18px;font-weight:700'>YTProxy</div><div style='color:#aaa;font-size:14px'>Avvio del server...</div></html>");

  try {
    await waitForServer();
    mainWindow.loadURL("http://localhost:8090");
    // Inject electron flag
    mainWindow.webContents.on("did-finish-load", () => {
      mainWindow.webContents.executeJavaScript(`window.__YTPROXY_ELECTRON__ = true;`);
    });
  } catch (e) {
    mainWindow.loadURL("data:text/html,<html style='background:#0f0f0f;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh'><div>Errore: server non avviato. Controlla che Python e yt-dlp siano installati.</div></html>");
  }
}

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (serverProcess) serverProcess.kill();
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
