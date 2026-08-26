"""subscription_guards.py — permessi ed errori condivisi da subscriptions.py."""
from fastapi import HTTPException

from auth import oauth_status
from auth.errors import YouTubeAPIError
from auth.state import state


def subscription_write_guard():
    if not oauth_status.is_authenticated(state):
        raise HTTPException(403, "Collega un account Google per gestire le iscrizioni")
    if not oauth_status.can_write(state):
        raise HTTPException(403, "L'account collegato non ha il permesso di gestire le iscrizioni: "
                                 "ricollegalo dalle impostazioni per concederlo")


def subscription_api_error(ex: YouTubeAPIError) -> HTTPException:
    if ex.reason in ("insufficientPermissions", "forbidden"):
        return HTTPException(403, "Permesso negato da YouTube: ricollega l'account dalle impostazioni")
    if ex.reason in ("quotaExceeded", "rateLimitExceeded"):
        return HTTPException(429, "Quota giornaliera della YouTube Data API esaurita")
    if ex.reason in ("subscriptionNotFound", "channelNotFound", "publisherNotFound"):
        return HTTPException(404, "Canale non trovato su YouTube")
    return HTTPException(400, ex.message)
