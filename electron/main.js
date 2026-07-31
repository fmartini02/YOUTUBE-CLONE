const { app, BrowserWindow, ipcMain, shell } = require("electron");
const { spawn, exec } = require("child_process");
const path = require("path");
const http = require("http");

let mainWindow;
let serverProcess;

// ── Start Python server ───────────────────────────────────────────────────────
function startServer() {
  const serverDir = path.join(__dirname, "..", "server");
  serverProcess = spawn("python3", ["-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"], {
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
      http.get("http://localhost:8080/api/health", res => {
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
    mainWindow.loadURL("http://localhost:8080");
    // Inject electron flag
    mainWindow.webContents.on("did-finish-load", () => {
      mainWindow.webContents.executeJavaScript(`
        window.__YTPROXY_ELECTRON__ = true;
        window.__ytproxy_open_vlc = (url, title) => {
          window.__electron_ipc.openVlc(url, title);
        };
      `);
    });
  } catch (e) {
    mainWindow.loadURL("data:text/html,<html style='background:#0f0f0f;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh'><div>Errore: server non avviato. Controlla che Python e yt-dlp siano installati.</div></html>");
  }
}

// ── IPC: open in VLC ──────────────────────────────────────────────────────────
ipcMain.handle("open-vlc", (event, url, title) => {
  const vlcPaths = {
    win32: ["C:\\Program Files\\VideoLAN\\VLC\\vlc.exe", "C:\\Program Files (x86)\\VideoLAN\\VLC\\vlc.exe"],
    darwin: ["/Applications/VLC.app/Contents/MacOS/VLC"],
    linux: ["vlc", "/usr/bin/vlc", "/snap/bin/vlc"],
  };

  const candidates = vlcPaths[process.platform] || ["vlc"];

  function tryNext(i) {
    if (i >= candidates.length) {
      // Fallback: open in default app
      shell.openExternal(url);
      return;
    }
    const proc = spawn(candidates[i], [url, `--meta-title=${title}`], { detached: true, stdio: "ignore" });
    proc.on("error", () => tryNext(i + 1));
    proc.unref();
  }

  tryNext(0);
});

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (serverProcess) serverProcess.kill();
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
