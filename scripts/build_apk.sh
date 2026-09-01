#!/bin/bash
# ─────────────────────────────────────────────────────────────
#  YTProxy — Build APK Android
#
#  Fa tutta la catena: build del frontend → cap sync → gradlew,
#  e copia l'APK finito in dist-android/ alla radice del progetto.
#
#  Uso (dalla radice del progetto):
#    ./scripts/build_apk.sh              build debug
#    ./scripts/build_apk.sh --clean      pulisce prima di ricompilare
#    ./scripts/build_apk.sh --install    installa sul telefono collegato via adb
# ─────────────────────────────────────────────────────────────

set -e

DIR="$(cd "$(dirname "$0")/.." && pwd)"
ANDROID_DIR="$DIR/frontend/android"

CLEAN=0
INSTALL=0
for arg in "$@"; do
  case "$arg" in
    --clean)   CLEAN=1 ;;
    --install) INSTALL=1 ;;
    -h|--help)
      echo "Uso: ./scripts/build_apk.sh [--clean] [--install]"
      exit 0 ;;
    *)
      echo "  ❌ Opzione sconosciuta: $arg (usa --help)"
      exit 1 ;;
  esac
done

echo ""
echo "  ▶  YTProxy — build APK"
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
    PKG_MANAGER="apt"
  elif command -v dnf &>/dev/null; then
    PKG_MANAGER="dnf"
  elif command -v yum &>/dev/null; then
    PKG_MANAGER="yum"
  elif command -v pacman &>/dev/null; then
    PKG_MANAGER="pacman"
  elif command -v zypper &>/dev/null; then
    PKG_MANAGER="zypper"
  fi
fi

echo "  Sistema rilevato: $OS / package manager: $PKG_MANAGER"
echo ""

# ── Node.js + npm ─────────────────────────────────────────────
if ! command -v node &>/dev/null || ! command -v npm &>/dev/null; then
  echo "⬇️  Node.js non trovato, installazione in corso..."
  case "$PKG_MANAGER" in
    apt)
      curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
      sudo apt-get install -y nodejs -qq
      ;;
    dnf|yum)
      curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash - -q
      sudo $PKG_MANAGER install -y nodejs -q
      ;;
    pacman) sudo pacman -S --noconfirm nodejs npm -q ;;
    zypper) sudo zypper install -y nodejs20 npm20 -q ;;
    brew)   brew install node ;;
    *)
      echo "  ❌ Installa Node.js manualmente da https://nodejs.org"
      exit 1 ;;
  esac
else
  echo "✓  Node.js: $(node --version)"
fi

# ── JDK 17+ ───────────────────────────────────────────────────
# Gradle 8.14 + AGP 8.13 vogliono almeno Java 17. Un JDK spesso c'è già
# ma fuori dal PATH: Android Studio si porta dietro il suo (jbr), e chi
# ha usato Studio per creare il progetto ha i JDK sotto ~/Android.
# Stampa la major version se è un JDK utilizzabile (>= 17), altrimenti niente.
java_major() {
  local bin="$1/bin/java"
  [ -x "$bin" ] || return 1
  # Serve un JDK, non solo un JRE: senza javac Gradle non compila.
  [ -x "$1/bin/javac" ] || return 1
  local major
  major=$("$bin" -version 2>&1 | head -1 | grep -oE '"[0-9]+' | tr -d '"')
  [ -n "$major" ] && [ "$major" -ge 17 ] && echo "$major"
}

# Tra più JDK installati si sceglie il più recente: con la glob ordinata
# alfabeticamente il primo match sarebbe il 17 anche avendo il 21.
find_jdk() {
  local candidate major best="" best_major=0
  local java_path=""
  command -v java &>/dev/null && java_path=$(dirname "$(dirname "$(readlink -f "$(command -v java)")")")

  for candidate in \
    "$JAVA_HOME" \
    "$java_path" \
    /opt/android-studio/jbr \
    "$HOME/android-studio/jbr" \
    /usr/local/android-studio/jbr \
    "/Applications/Android Studio.app/Contents/jbr/Contents/Home" \
    "$HOME/Android"/jdk-* \
    "$HOME/android-toolchain"/jdk-* \
    /usr/lib/jvm/* \
    /Library/Java/JavaVirtualMachines/*/Contents/Home
  do
    [ -n "$candidate" ] || continue
    major=$(java_major "$candidate" || true)
    if [ -n "$major" ] && [ "$major" -gt "$best_major" ]; then
      best="$candidate"
      best_major="$major"
    fi
  done

  [ -n "$best" ] && echo "$best"
}

JDK=$(find_jdk || true)

if [ -z "$JDK" ]; then
  echo "⬇️  Nessun JDK 17+ trovato, installazione in corso..."
  case "$PKG_MANAGER" in
    apt)    sudo apt-get install -y openjdk-21-jdk -qq ;;
    dnf)    sudo dnf install -y java-21-openjdk-devel -q ;;
    yum)    sudo yum install -y java-21-openjdk-devel -q ;;
    pacman) sudo pacman -S --noconfirm jdk21-openjdk -q ;;
    zypper) sudo zypper install -y java-21-openjdk-devel -q ;;
    brew)   brew install openjdk@21 ;;
    *)
      echo "  ❌ Installa un JDK 17 o superiore manualmente."
      exit 1 ;;
  esac
  JDK=$(find_jdk || true)
  if [ -z "$JDK" ]; then
    echo "  ❌ JDK installato ma non trovato. Imposta JAVA_HOME e riprova."
    exit 1
  fi
fi

export JAVA_HOME="$JDK"
export PATH="$JAVA_HOME/bin:$PATH"
echo "✓  JDK: $("$JAVA_HOME/bin/java" -version 2>&1 | head -1) ($JAVA_HOME)"

# ── Android SDK ───────────────────────────────────────────────
# Serve solo il percorso: Gradle scarica da sé le piattaforme mancanti
# se le licenze sono già accettate (lo fa Android Studio la prima volta).
find_sdk() {
  local candidate
  for candidate in \
    "$ANDROID_HOME" \
    "$ANDROID_SDK_ROOT" \
    "$HOME/Android/Sdk" \
    "$HOME/Library/Android/sdk" \
    /usr/lib/android-sdk
  do
    [ -n "$candidate" ] && [ -d "$candidate/platform-tools" ] && { echo "$candidate"; return 0; }
  done
  # Ultimo tentativo: quello già scritto in local.properties
  if [ -f "$ANDROID_DIR/local.properties" ]; then
    candidate=$(grep -E '^sdk\.dir=' "$ANDROID_DIR/local.properties" | cut -d= -f2-)
    [ -n "$candidate" ] && [ -d "$candidate" ] && { echo "$candidate"; return 0; }
  fi
  return 1
}

SDK=$(find_sdk || true)
if [ -z "$SDK" ]; then
  echo ""
  echo "  ❌ Android SDK non trovato."
  echo ""
  echo "     Installa Android Studio (https://developer.android.com/studio),"
  echo "     aprilo una volta per far scaricare SDK e accettare le licenze,"
  echo "     oppure imposta ANDROID_HOME sul percorso di un SDK esistente."
  echo ""
  exit 1
fi
export ANDROID_HOME="$SDK"
echo "✓  Android SDK: $SDK"

# local.properties non è versionato: se manca (o punta altrove) va riscritto,
# altrimenti Gradle non sa dov'è l'SDK.
if ! grep -qxF "sdk.dir=$SDK" "$ANDROID_DIR/local.properties" 2>/dev/null; then
  echo "sdk.dir=$SDK" > "$ANDROID_DIR/local.properties"
  echo "   ↳ scritto $ANDROID_DIR/local.properties"
fi

# ── Dipendenze npm ────────────────────────────────────────────
cd "$DIR/frontend"
if [ ! -d node_modules ]; then
  echo "📦 Installazione dipendenze npm (prima volta, ~1 minuto)..."
  npm install --silent
else
  echo "✓  Dipendenze npm già installate"
fi

# ── Build frontend ────────────────────────────────────────────
echo "🔨 Build del frontend..."
npm run build --silent

# ── Copia del web build dentro il progetto Android ────────────
echo "🔄 Sincronizzazione Capacitor..."
npx cap sync android

# ── Compilazione APK ──────────────────────────────────────────
cd "$ANDROID_DIR"
chmod +x gradlew
if [ $CLEAN -eq 1 ]; then
  echo "🧹 Pulizia build precedente..."
  ./gradlew clean --console=plain -q
fi
echo "🔨 Compilazione APK (la prima volta Gradle scarica parecchia roba)..."
./gradlew assembleDebug --console=plain

APK="$ANDROID_DIR/app/build/outputs/apk/debug/app-debug.apk"
if [ ! -f "$APK" ]; then
  echo "  ❌ Build finita ma l'APK non c'è: $APK"
  exit 1
fi

mkdir -p "$DIR/dist-android"
OUT="$DIR/dist-android/YTProxy.apk"
cp "$APK" "$OUT"

# ── Verifica della firma ──────────────────────────────────────
# Un APK firmato con una chiave diversa dal precedente non si installa sopra
# quello già sul telefono (INSTALL_FAILED_UPDATE_INCOMPATIBLE): meglio saperlo
# qui che davanti al dialogo di installazione.
if [ ! -f "$ANDROID_DIR/keystore/keystore.properties" ]; then
  echo "  ⚠️  keystore/keystore.properties non trovato: APK firmato con la chiave"
  echo "      di debug dell'SDK. Vedi frontend/android/keystore/README.md."
fi
APKSIGNER=$(ls "$SDK"/build-tools/*/apksigner 2>/dev/null | sort -V | tail -1)
if [ -n "$APKSIGNER" ]; then
  FINGERPRINT=$("$APKSIGNER" verify --print-certs "$OUT" 2>/dev/null \
    | grep -i "SHA-256 digest" | head -1 | awk '{print $NF}')
  [ -n "$FINGERPRINT" ] && echo "✓  Firmato con la chiave $(echo "$FINGERPRINT" | cut -c1-16)…"
fi

# ── Installazione sul telefono (opzionale) ────────────────────
if [ $INSTALL -eq 1 ]; then
  ADB="adb"
  command -v adb &>/dev/null || ADB="$SDK/platform-tools/adb"
  if [ ! -x "$ADB" ] && ! command -v "$ADB" &>/dev/null; then
    echo "  ⚠️  adb non trovato: installa l'APK a mano."
  elif [ -z "$("$ADB" devices | sed 1d | grep -w device || true)" ]; then
    echo "  ⚠️  Nessun telefono collegato (serve il debug USB attivo)."
  else
    echo "📲 Installazione sul telefono..."
    "$ADB" install -r "$OUT"
  fi
fi

SIZE=$(du -h "$OUT" | cut -f1)

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ APK pronto!"
echo ""
echo "  📦 $OUT  ($SIZE)"
echo ""
echo "  Per installarlo: copialo sul telefono e aprilo"
echo "  (serve consentire le app da origini sconosciute),"
echo "  oppure rilancia con ./scripts/build_apk.sh --install"
echo ""
echo "  Al primo avvio l'app chiede l'indirizzo del server."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  ℹ️  frontend/dist/ è versionato: se hai toccato il frontend,"
echo "     ricordati di committare anche il build."
echo ""
