const { app, BrowserWindow } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const http = require("http");

let mainWindow;
let serverProcess;

// Deve combaciare con SERVER_PORT in server/main.py, il proxy di
// frontend/vite.config.js e start_server.sh/.bat. Si legge da YTPROXY_PORT
// come fa il server: con il valore scritto a mano qui, avviare l'app con una
// porta diversa faceva partire il server su quella porta e la finestra andava
// a cercarlo sulla 8090, dove non c'era nessuno.
const PORT = Number(process.env.YTPROXY_PORT) || 8090;
const BASE_URL = `http://localhost:${PORT}`;

// ── Start Python server ───────────────────────────────────────────────────────
function startServer() {
  // Su macOS chiudere la finestra non chiude l'app: se il server sta ancora
  // girando, riaprire dal Dock non deve farne partire un secondo (che
  // troverebbe comunque la porta occupata e morirebbe subito).
  if (serverProcess && serverProcess.exitCode === null && !serverProcess.killed) return;

  const serverDir = path.join(__dirname, "..", "server");
  serverProcess = spawn(
    "python3",
    ["-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", String(PORT)],
    { cwd: serverDir, stdio: "pipe", env: { ...process.env, YTPROXY_PORT: String(PORT) } },
  );
  serverProcess.stdout.on("data", d => console.log("[server]", d.toString()));
  serverProcess.stderr.on("data", d => console.error("[server]", d.toString()));
  serverProcess.on("exit", () => { serverProcess = null; });
}

function stopServer() {
  if (!serverProcess) return;
  serverProcess.kill();
  serverProcess = null;
}

// ── Wait for server ready ─────────────────────────────────────────────────────
function waitForServer(retries = 30) {
  return new Promise((resolve, reject) => {
    function check() {
      http.get(`${BASE_URL}/api/health`, res => {
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
    },
    titleBarStyle: "hiddenInset",
    title: "YTProxy",
  });

  mainWindow.on("closed", () => { mainWindow = null; });

  // Loading screen
  mainWindow.loadURL("data:text/html,<html style='background:#0f0f0f;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column;gap:16px'><div style='font-size:48px'>▶</div><div style='font-size:18px;font-weight:700'>YTProxy</div><div style='color:#aaa;font-size:14px'>Avvio del server...</div></html>");

  try {
    await waitForServer();
    // La finestra può essere già stata chiusa mentre si aspettava il server.
    if (!mainWindow) return;
    mainWindow.loadURL(BASE_URL);
    // Inject electron flag
    mainWindow.webContents.on("did-finish-load", () => {
      mainWindow.webContents.executeJavaScript(`window.__YTPROXY_ELECTRON__ = true;`);
    });
  } catch (e) {
    if (!mainWindow) return;
    mainWindow.loadURL("data:text/html,<html style='background:#0f0f0f;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh'><div>Errore: server non avviato. Controlla che Python e yt-dlp siano installati.</div></html>");
  }
}

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  // Su macOS l'app resta viva senza finestre: il server va lasciato acceso,
  // altrimenti riaprendo dal Dock si ripartiva da zero (e prima si finiva per
  // avviarne un secondo). Lo si chiude in will-quit, che su macOS scatta con
  // Cmd+Q e sugli altri sistemi subito dopo questo evento.
  if (process.platform !== "darwin") app.quit();
});

app.on("will-quit", stopServer);

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
