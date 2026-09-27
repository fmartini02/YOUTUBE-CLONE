"""
ffmpeg_pipe.py — far girare ffmpeg e girare l'uscita al client, un blocco
alla volta. Isolato da streaming.py (che lo usa per /api/mux e
/api/download) per restare sotto le 5 funzioni per file.
"""
import asyncio

from fastapi.responses import StreamingResponse


async def _drain_stderr(proc, errbuf: list):
    """Consuma stderr mentre il processo gira: a buffer pieno ffmpeg si bloccherebbe altrimenti."""
    while True:
        line = await proc.stderr.readline()
        if not line:
            break
        errbuf.append(line.decode(errors="replace").rstrip())
        del errbuf[:-20]


async def _stream_stdout(proc, tag: str, errbuf: list, err_task):
    sent = 0
    try:
        while True:
            chunk = await proc.stdout.read(65536)
            if not chunk:
                break
            sent += len(chunk)
            yield chunk
        if sent == 0:
            await asyncio.wait_for(err_task, timeout=2)
            print(f"[ffmpeg] nessun dato per {tag}: " + " | ".join(errbuf[-5:]))
    finally:
        await _termina(proc, err_task)


async def _termina(proc, err_task):
    """
    Il client può disconnettersi a metà (cambio pagina, seek che ricarica il
    player, download annullato): senza questo ffmpeg resterebbe orfano a
    scaricare da YouTube all'infinito. Idempotente: la chiamano sia la fine
    del generatore sia `_RispostaFfmpeg` (vedi sotto perché servono entrambe).
    """
    if proc.returncode is None:
        proc.kill()
    # `proc.wait()` di asyncio si sveglia solo quando anche le pipe sono
    # chiuse, e lo stdout di un client che non leggeva più è pieno e in
    # pausa: senza svuotarlo l'EOF non arriva e l'attesa non finiva mai
    # (processo già morto, coroutine della richiesta appesa per sempre).
    try:
        while await asyncio.wait_for(proc.stdout.read(65536), timeout=2):
            pass
        await asyncio.wait_for(proc.wait(), timeout=2)
    except Exception:
        pass
    err_task.cancel()


class _RispostaFfmpeg(StreamingResponse):
    """
    Il `finally` del generatore da solo NON basta. Se il client se ne va
    mentre il server aspetta di potergli scrivere (buffer del player pieno o
    video in pausa: il fetch non legge, `send` resta in attesa), Starlette
    annulla il task dello streaming ma non chiude il generatore, sospeso allo
    `yield`: il suo `finally` parte solo quando il garbage collector se ne
    ricorda. Verificato: ffmpeg ancora vivo quasi 3 minuti dopo la chiusura
    del browser, fermo in scrittura con ~50 MB di RAM — uno per ogni salto
    fatto a buffer pieno, cioè quasi tutti da quando il proxy a blocchi
    (ytdlp/proxy_blocchi.py) lo riempie in pochi secondi. Qui la chiusura
    avviene comunque alla fine della risposta, qualunque strada prenda
    Starlette (disconnessione ASGI 2.3 via annullamento, 2.4 via eccezione).
    """
    async def __call__(self, scope, receive, send):
        try:
            await super().__call__(scope, receive, send)
        finally:
            await _termina(*self.ffmpeg)


async def ffmpeg_pipe_response(cmd: list, tag: str, headers: dict = None,
                               media_type: str = "video/mp4") -> StreamingResponse:
    """
    Condivisa da /api/mux e /api/download: producono un flusso in tempo reale
    via ffmpeg in sola copia. `media_type` è `video/mp4` tranne il ramo VP9 4K
    del Cast, che esce in `video/webm` (Google Cast non regge il VP9 in MP4).
    """
    proc = await asyncio.create_subprocess_exec(
        *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
    errbuf: list = []
    err_task = asyncio.create_task(_drain_stderr(proc, errbuf))
    risposta = _RispostaFfmpeg(_stream_stdout(proc, tag, errbuf, err_task),
                               media_type=media_type, headers=headers or {})
    risposta.ffmpeg = (proc, err_task)
    return risposta
