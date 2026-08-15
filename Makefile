# YTProxy — scorciatoie per il server in Docker (vedi CLAUDE.md, sezione "Docker").
# Uso: `make up`, `make logs`, ecc. `make` da solo mostra l'elenco.

.PHONY: help up down build restart logs ps sh clean

help: ## Elenco dei target disponibili
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-10s\033[0m %s\n", $$1, $$2}'

up: ## Builda (se serve) e avvia il server in background — dati in ./data
	docker compose up -d --build

down: ## Ferma il container; ./data resta sul disco
	docker compose down

build: ## Ribuilda l'immagine senza avviarla (serve dopo un `npm run build` del frontend)
	docker compose build

restart: down up ## Riavvia da capo (ferma + build + avvia)

logs: ## Segue l'output del server al posto di un terminale aperto
	docker compose logs -f

ps: ## Stato del container
	docker compose ps

sh: ## Shell dentro il container in esecuzione
	docker compose exec ytproxy sh

clean: down ## Ferma e rimuove anche l'immagine buildata localmente
	docker compose down --rmi local
