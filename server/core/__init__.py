"""
core/ — infrastruttura dell'app condivisa dai router, non un dominio a sé.

  security.py    guardia sulle scritture esterne (blocca_scritture_esterne)
  config.py       SERVER_PORT
  startup.py       pulizia una tantum + avvio dello scheduler di sync
"""
