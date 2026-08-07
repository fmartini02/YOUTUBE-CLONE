# Chiave di firma dell'APK

Android non installa un APK non firmato, e la firma è l'identità dell'app nel
tempo: un aggiornamento si installa **sopra** quello già presente sul telefono
solo se firmato con la stessa identica chiave privata. Firma diversa →
`INSTALL_FAILED_UPDATE_INCOMPATIBLE`, si deve disinstallare, e si perde quello
che l'app tiene in locale (in pratica l'indirizzo del server salvato in
localStorage durante l'onboarding).

## Cosa c'è in questa cartella

| File | Versionato | Cos'è |
|---|---|---|
| `ytproxy.jks` | no (`*.jks`) | La chiave privata e il certificato. PKCS12. |
| `keystore.properties` | no (regola esplicita) | Password e alias, letti da `app/build.gradle`. |
| `README.md` | sì | Questo file. |

`app/build.gradle` legge `keystore.properties` all'avvio del build e ne ricava
la `signingConfig` usata sia per il debug sia per il release. **Se i due file non
ci sono il build non fallisce**: ricade sulla chiave di debug dell'SDK, così il
progetto resta compilabile su una macchina qualsiasi — solo che l'APK che ne
esce ha una firma diversa e non si installerà sopra quello vecchio.

## Perché non basta la chiave di default

L'SDK ne genera una da sé in `~/.android/debug.keystore`, ed è quella che
firmava l'APK prima di questa cartella. Il problema non è la chiave — quella è
unica, generata sulla tua macchina — ma la password che la protegge: è la
stringa `android`, uguale ovunque e scritta nella documentazione Android.
Chiunque abbia quel file può quindi estrarne la chiave e produrre un APK che il
telefono accetta come aggiornamento di `com.ytproxy.app`.

`ytproxy.jks` contiene **la stessa coppia di chiavi**, importata da
`debug.keystore` e riprotetta con una password casuale di 32 caratteri. Il
certificato ha la stessa impronta SHA-256, quindi il passaggio è stato
trasparente: gli APK firmati prima e dopo restano intercambiabili sul telefono.

Il certificato dice ancora `CN=Android Debug` perché è quello originale. È
cosmetico — non lo vede nessuno, se non leggendolo con `keytool` — e cambiarlo
richiederebbe una chiave nuova, cioè una disinstallazione sul telefono.

## Fanne una copia

Se perdi `ytproxy.jks` non lo rigenera nessuno. Sul telefono te ne accorgi al
primo aggiornamento, che verrà rifiutato: si risolve disinstallando e
reinserendo l'indirizzo del server, ma è seccante. Tienine una copia fuori dal
repo (chiavetta, password manager, backup cifrato) insieme alla password.

## Ispezionare la chiave

```bash
# La password sta in keystore.properties, che il comando legge da sé
keytool -list -v -keystore ytproxy.jks \
  -storepass "$(grep '^storePassword=' keystore.properties | cut -d= -f2-)"
```

`keytool` sta dentro il JDK; se `java` non è nel PATH il percorso è quello che
`build_apk.sh` stampa all'avvio (di solito sotto `~/Android/`).

Per vedere con quale chiave è firmato un APK già costruito:

```bash
$ANDROID_HOME/build-tools/*/apksigner verify --print-certs ../../../YTProxy.apk
```

## Rigenerare da zero

Solo se la chiave attuale è persa e hai già accettato di dover disinstallare
l'app dal telefono:

```bash
keytool -genkeypair -v -keystore ytproxy.jks -storetype PKCS12 \
  -keyalg RSA -keysize 4096 -validity 10000 -alias ytproxy
```

Poi aggiorna `storePassword`/`keyPassword` in `keystore.properties` con la
password scelta.
