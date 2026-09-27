"""
sync/ — sincronizzazione automatica in background delle iscrizioni.

  scheduler.py    SyncScheduler + singleton `scheduler`, loop orario
  runner.py        un singolo ciclo (iscrizioni + feed), isolato da
                    SyncScheduler perché insieme ai suoi metodi avrebbe
                    superato le 5 funzioni per file (vedi CLAUDE.md)
  feed_cookie.py   ciclo che riscarica il feed Iscrizioni dei cookie allo
                    scadere della copia in memoria (auth/cookie_feed.py)
"""
