"""
sync/ — sincronizzazione automatica in background delle iscrizioni.

  scheduler.py    SyncScheduler + singleton `scheduler`, loop orario
  runner.py        un singolo ciclo (iscrizioni + feed), isolato da
                    SyncScheduler perché insieme ai suoi metodi avrebbe
                    superato le 5 funzioni per file (vedi CLAUDE.md)
"""
