# YTProxy — scorciatoie per il server in Docker (vedi CLAUDE.md, sezione "Docker").
# Uso: `make up`, `make logs`, ecc. `make` da solo mostra l'elenco.
# Va lanciato dalla radice del repo (i file Docker stanno in docker/).

DC := docker compose -f docker/docker-compose.yml

.PHONY: help up down build restart logs ps sh clean

help: ## Elenco dei target disponibili
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-10s\033[0m %s\n", $$1, $$2}'

up: ## Builda (se serve) e avvia il server in background — dati in ./data
	$(DC) up -d --build

down: ## Ferma il container; ./data resta sul disco
	$(DC) down

build: ## Ribuilda l'immagine senza avviarla (serve dopo un `npm run build` del frontend)
	$(DC) build

restart: down up ## Riavvia da capo (ferma + build + avvia)

logs: ## Segue l'output del server al posto di un terminale aperto
	$(DC) logs -f

ps: ## Stato del container
	$(DC) ps

sh: ## Shell dentro il container in esecuzione
	$(DC) exec ytproxy sh

clean: down ## Ferma e rimuove anche l'immagine buildata localmente
	$(DC) down --rmi local
