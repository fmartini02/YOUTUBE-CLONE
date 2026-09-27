"""
routers/ffmpeg_pipe.py: il processo non deve sopravvivere al client.

Il caso che sfuggiva: il client smette di leggere (buffer del player pieno,
video in pausa), `send` resta in attesa, e poi il client se ne va. Starlette
annulla lo streaming ma non chiude il generatore sospeso allo `yield`, quindi
il suo `finally` non partiva — ffmpeg restava vivo, fermo in scrittura.
Qui ffmpeg è un processo qualunque che scrive all'infinito.
"""
import asyncio
import sys

from routers.ffmpeg_pipe import ffmpeg_pipe_response

SCRIVE_SEMPRE = [sys.executable, "-c",
                 "import sys\nwhile True: sys.stdout.buffer.write(b'x' * 65536)"]


async def _client_che_smette_di_leggere():
    """Primo blocco ricevuto, poi `send` non ritorna più; la disconnessione arriva dopo."""
    ricevuto = asyncio.Event()

    async def send(messaggio):
        if messaggio["type"] == "http.response.body":
            ricevuto.set()
            await asyncio.Event().wait()   # client che non legge più: send in attesa per sempre

    async def receive():
        await ricevuto.wait()
        await asyncio.sleep(0.2)
        return {"type": "http.disconnect"}

    risposta = await ffmpeg_pipe_response(SCRIVE_SEMPRE, "prova")
    proc = risposta.ffmpeg[0]
    await asyncio.wait_for(risposta({"type": "http", "asgi": {"spec_version": "2.3"}}, receive, send), timeout=10)
    return proc


def test_processo_chiuso_se_il_client_se_ne_va_mentre_non_legge():
    proc = asyncio.run(_client_che_smette_di_leggere())
    assert proc.returncode is not None
