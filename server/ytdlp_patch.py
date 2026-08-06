"""
Correzioni locali all'estrattore YouTube di yt-dlp.

Ce n'è una sola, per i video "in collaborazione" (più canali accreditati sullo
stesso video). Nelle card di quei video YouTube non mette il link al canale dove
lo mette sempre: al suo posto c'è una pila di avatar e un testo non cliccabile
("Nova Lectio and 1 more"), mentre i canali veri stanno nell'elenco che si apre
cliccando la pila. yt-dlp quel testo lo legge — infatti il nome del canale
arriva — ma cerca il comando "vai al canale" in un punto dell'elenco dove non
c'è, e restituisce `channel_id` vuoto.

Senza `channel_id` il frontend non può né chiedere il logo (che si risolve per
id, vedi `/api/channel-avatars`) né rendere cliccabile il nome: la card mostrava
la sola iniziale al posto del logo. La patch riempie l'id mancante leggendolo
dove YouTube lo mette davvero, cioè accanto al nome nell'elenco dei
collaboratori (o, nella ricerca, sotto la miniatura del canale).

Vanno corretti due punti diversi perché YouTube serve due formati di card e
yt-dlp ha un estrattore per ciascuno: `lockupViewModel` (home, iscrizioni,
correlati, pagina canale) e `videoRenderer` (ricerca).

È scritta per non fare nulla di suo: interviene solo quando `channel_id` manca,
quindi il giorno in cui yt-dlp lo estrarrà da sé questo file diventerà
silenziosamente inerte (e si potrà cancellare).
"""

# Il modulo `_tab` esiste da quando l'estrattore YouTube è stato diviso in più
# file; su una yt-dlp più vecchia l'import fallisce e il server deve partire
# lo stesso, semplicemente senza la correzione.
try:
    from yt_dlp.extractor.youtube._tab import YoutubeTabBaseInfoExtractor
    from yt_dlp.utils import traverse_obj
except ImportError as e:  # pragma: no cover
    YoutubeTabBaseInfoExtractor = None
    print(f"[ytdlp_patch] yt-dlp incompatibile, patch collaborazioni non applicata: {e}")


# Coda comune dei due percorsi: la finestra "Collaborators" che YouTube tiene
# pronta dentro la card. Il primo della lista è il canale che ospita il video —
# lo stesso da cui yt-dlp ha già preso il nome, quindi nome e id restano
# coerenti.
_PRIMO_COLLABORATORE = (
    "showDialogCommand", "panelLoadingStrategy", "inlineContent", "dialogViewModel",
    "customContent", "listViewModel", "listItems", 0, "listItemViewModel",
)


def _id_ospite(comando, ucid_or_none):
    """Id del canale ospite dal comando che apre l'elenco dei collaboratori."""
    return traverse_obj(comando, (
        *_PRIMO_COLLABORATORE, "rendererContext", "commandContext", "onTap",
        "innertubeCommand", "browseEndpoint", "browseId", {ucid_or_none}))


def applica_patch_collaborazioni():
    """Avvolge i due estrattori di card di yt-dlp. Chiamarla una volta all'avvio."""
    if YoutubeTabBaseInfoExtractor is None:
        return
    if getattr(YoutubeTabBaseInfoExtractor._extract_lockup_view_model, "_ytproxy_patched", False):
        return

    lockup_originale = YoutubeTabBaseInfoExtractor._extract_lockup_view_model
    video_originale = YoutubeTabBaseInfoExtractor._extract_video

    def _completa(entry, channel_id):
        if not channel_id:
            return entry
        entry["channel_id"] = channel_id
        entry["channel_url"] = f"https://www.youtube.com/channel/{channel_id}"
        return entry

    def _extract_lockup_view_model(self, view_model):
        """Card di home, iscrizioni, correlati e pagina canale."""
        entry = lockup_originale(self, view_model)
        if not isinstance(entry, dict) or entry.get("channel_id"):
            return entry
        comando = traverse_obj(view_model, (
            "metadata", "lockupMetadataViewModel", "image", "avatarStackViewModel",
            "rendererContext", "commandContext", "onTap", "innertubeCommand", {dict}))
        return _completa(entry, _id_ospite(comando, self.ucid_or_none))

    def _extract_video(self, renderer):
        """Card della ricerca."""
        entry = video_originale(self, renderer)
        if not isinstance(entry, dict) or entry.get("channel_id"):
            return entry
        # Qui c'è una scorciatoia che nell'altro formato non esiste: la miniatura
        # del canale accanto alla card è già un link al canale ospite.
        miniatura = traverse_obj(renderer, (
            "channelThumbnailSupportedRenderers", "channelThumbnailWithLinkRenderer",
            "navigationEndpoint", "browseEndpoint", {dict}))
        channel_id = traverse_obj(miniatura, ("browseId", {self.ucid_or_none}))
        if not channel_id:
            channel_id = _id_ospite(traverse_obj(renderer, (
                "ownerText", "runs", 0, "navigationEndpoint", {dict})), self.ucid_or_none)
        return _completa(entry, channel_id)

    _extract_lockup_view_model._ytproxy_patched = True
    YoutubeTabBaseInfoExtractor._extract_lockup_view_model = _extract_lockup_view_model
    YoutubeTabBaseInfoExtractor._extract_video = _extract_video
