#!/bin/bash
# ─────────────────────────────────────────────────────────────
#  YTProxy — Avvio server
#  Supporta: Ubuntu/Debian, Fedora/RHEL, Arch, openSUSE, Mac
# ─────────────────────────────────────────────────────────────

set -e

DIR="$(cd "$(dirname "$0")" && pwd)"

echo ""
echo "  ▶  YTProxy Server"
echo ""

# ── Detect OS e package manager ───────────────────────────────
OS="unknown"
PKG_MANAGER="unknown"

if [[ "$OSTYPE" == "darwin"* ]]; then
  OS="mac"
  PKG_MANAGER="brew"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
  OS="linux"
  if command -v apt-get &>/dev/null; then
    PKG_MANAGER="apt"       # Ubuntu, Debian, Mint, Pop!_OS
  elif command -v dnf &>/dev/null; then
    PKG_MANAGER="dnf"       # Fedora, RHEL 8+, CentOS Stream
  elif command -v yum &>/dev/null; then
    PKG_MANAGER="yum"       # RHEL 7, CentOS 7
  elif command -v pacman &>/dev/null; then
    PKG_MANAGER="pacman"    # Arch, Manjaro, EndeavourOS
  elif command -v zypper &>/dev/null; then
    PKG_MANAGER="zypper"    # openSUSE
  fi
fi

echo "  Sistema rilevato: $OS / package manager: $PKG_MANAGER"
echo ""

# ── Helper: aggiorna lista pacchetti (solo la prima volta) ────
_updated=0
pkg_update() {
  if [[ $_updated -eq 0 ]]; then
    case "$PKG_MANAGER" in
      apt)    sudo apt-get update -qq ;;
      dnf)    sudo dnf check-update -q || true ;;
      yum)    sudo yum check-update -q || true ;;
      pacman) sudo pacman -Sy --noconfirm -q ;;
      zypper) sudo zypper refresh -q ;;
    esac
    _updated=1
  fi
}

# ── Helper: installa un pacchetto di sistema ──────────────────
# Argomenti: apt  dnf  pacman  zypper  brew
pkg_install() {
  pkg_update
  echo "  📦 Installazione $1..."
  case "$PKG_MANAGER" in
    apt)    sudo apt-get install -y "$1" -qq ;;
    dnf)    sudo dnf install -y "$2" -q ;;
    yum)    sudo yum install -y "$2" -q ;;
    pacman) sudo pacman -S --noconfirm -q "$3" ;;
    zypper) sudo zypper install -y -q "$4" ;;
    brew)   brew install "$5" ;;
    *)
      echo "  ❌ Package manager non supportato. Installa $1 manualmente."
      exit 1 ;;
  esac
}

# ── Homebrew su Mac (prerequisito) ───────────────────────────
if [[ "$OS" == "mac" ]] && ! command -v brew &>/dev/null; then
  echo "⬇️  Homebrew non trovato, installazione in corso..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
fi

# ── Python 3 ──────────────────────────────────────────────────
if ! command -v python3 &>/dev/null; then
  echo "⬇️  Python 3 non trovato, installazione in corso..."
  pkg_install "python3" "python3" "python" "python3" "python3"
else
  echo "✓  Python 3: $(python3 --version)"
fi

# ── pip ───────────────────────────────────────────────────────
if ! python3 -m pip --version &>/dev/null 2>&1; then
  echo "⬇️  pip non trovato, installazione in corso..."
  pkg_install "python3-pip" "python3-pip" "python-pip" "python3-pip" "python3"
else
  echo "✓  pip trovato"
fi

# ── ffmpeg ────────────────────────────────────────────────────
if ! command -v ffmpeg &>/dev/null; then
  echo "⬇️  ffmpeg non trovato, installazione in corso..."
  pkg_install "ffmpeg" "ffmpeg" "ffmpeg" "ffmpeg" "ffmpeg"
else
  echo "✓  ffmpeg trovato"
fi

# ── Node.js + npm ─────────────────────────────────────────────
if ! command -v node &>/dev/null || ! command -v npm &>/dev/null; then
  echo "⬇️  Node.js non trovato, installazione in corso..."
  case "$PKG_MANAGER" in
    apt)
      # NodeSource garantisce Node 20 (apt di default ha versioni vecchie)
      curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
      sudo apt-get install -y nodejs -qq
      ;;
    dnf|yum)
      curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash - -q
      sudo $PKG_MANAGER install -y nodejs -q
      ;;
    pacman)
      # Arch ha sempre Node aggiornato nei repo ufficiali
      sudo pacman -S --noconfirm nodejs npm -q
      ;;
    zypper)
      sudo zypper install -y nodejs20 npm20 -q
      ;;
    brew)
      brew install node
      ;;
    *)
      echo "  ❌ Installa Node.js manualmente da https://nodejs.org"
      exit 1 ;;
  esac
else
  echo "✓  Node.js: $(node --version)"
fi

# ── Dipendenze Python ─────────────────────────────────────────
if ! python3 -c "import yt_dlp, fastapi, uvicorn, httpx, pydantic" &>/dev/null; then
  echo "⬇️  Installazione dipendenze Python..."
  python3 -m pip install -r "$DIR/server/requirements.txt" --quiet --break-system-packages 2>/dev/null \
    || python3 -m pip install -r "$DIR/server/requirements.txt" --quiet
else
  echo "✓  Dipendenze Python già installate"
fi

# ── Aggiornamento yt-dlp ──────────────────────────────────────
# yt-dlp si aggiorna spesso per stare al passo con i cambiamenti di YouTube.
# Controlliamo se c'è una versione più recente (max una volta al giorno).
YTDLP_STAMP="$DIR/.ytdlp_last_update"
YTDLP_CURRENT=$(python3 -m yt_dlp --version 2>/dev/null || echo "0")
UPDATE_NEEDED=0

if [ ! -f "$YTDLP_STAMP" ]; then
  UPDATE_NEEDED=1
else
  # Aggiorna solo se l'ultimo check è più vecchio di 24 ore
  LAST=$(cat "$YTDLP_STAMP")
  NOW=$(date +%s)
  DIFF=$((NOW - LAST))
  if [ $DIFF -gt 86400 ]; then
    UPDATE_NEEDED=1
  fi
fi

if [ $UPDATE_NEEDED -eq 1 ]; then
  echo "🔄 Controllo aggiornamenti yt-dlp (versione attuale: $YTDLP_CURRENT)..."
  YTDLP_LATEST=$(python3 -m pip index versions yt-dlp 2>/dev/null | grep -oP '[\d.]+' | head -1 || echo "")
  if [ -n "$YTDLP_LATEST" ] && [ "$YTDLP_LATEST" != "$YTDLP_CURRENT" ]; then
    echo "  ⬆️  Aggiornamento yt-dlp $YTDLP_CURRENT → $YTDLP_LATEST..."
    python3 -m pip install --upgrade yt-dlp --quiet --break-system-packages 2>/dev/null \
      || python3 -m pip install --upgrade yt-dlp --quiet
    echo "  ✓  yt-dlp aggiornato a $(python3 -m yt_dlp --version 2>/dev/null)"
  else
    echo "✓  yt-dlp aggiornato ($YTDLP_CURRENT)"
  fi
  date +%s > "$YTDLP_STAMP"
else
  echo "✓  yt-dlp $YTDLP_CURRENT (check aggiornamenti: oggi già fatto)"
fi

# ── Build frontend ────────────────────────────────────────────
if [ ! -d "$DIR/frontend/dist" ]; then
  echo "🔨 Build del frontend (prima volta, ~1 minuto)..."
  cd "$DIR/frontend"
  npm install --silent
  npm run build --silent
  cd "$DIR"
else
  echo "✓  Frontend già buildato"
fi

# ── Get local IP ──────────────────────────────────────────────
LOCAL_IP=$(hostname -I 2>/dev/null | awk '{print $1}' \
  || ipconfig getifaddr en0 2>/dev/null \
  || echo "localhost")

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ YTProxy pronto!"
echo ""
echo "  💻 Questo PC:     http://localhost:8080"
echo "  📱 Telefono/TV:   http://$LOCAL_IP:8080"
echo ""
echo "  ⚠️  Telefono e PC devono essere sulla stessa WiFi"
echo "  💡 Per accedere fuori casa: usa Tailscale"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  Premi Ctrl+C per fermare"
echo ""

# ── Avvia server ──────────────────────────────────────────────
cd "$DIR/server"
python3 -m uvicorn main:app --host 0.0.0.0 --port 8080 --reload
