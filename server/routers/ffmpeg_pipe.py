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
        # Il client può disconnettersi a metà (cambio pagina, seek che
        # ricarica il player, download annullato): senza questo ffmpeg
        # resterebbe orfano a scaricare da YouTube all'infinito.
        if proc.returncode is None:
            proc.kill()
            await proc.wait()
        err_task.cancel()


async def ffmpeg_pipe_response(cmd: list, tag: str, headers: dict = None) -> StreamingResponse:
    """Condivisa da /api/mux e /api/download: entrambi producono un MP4 in tempo reale via ffmpeg in sola copia."""
    proc = await asyncio.create_subprocess_exec(
        *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
    errbuf: list = []
    err_task = asyncio.create_task(_drain_stderr(proc, errbuf))
    return StreamingResponse(_stream_stdout(proc, tag, errbuf, err_task),
                             media_type="video/mp4", headers=headers or {})
