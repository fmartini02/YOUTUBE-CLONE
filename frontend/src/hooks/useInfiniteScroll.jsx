import { useEffect, useRef } from "react";

/**
 * Scroll infinito: chiama onLoadMore quando l'elemento "sentinella" (da
 * mettere in fondo alla lista con il ref restituito) entra nel viewport.
 *
 * Usa IntersectionObserver invece di ascoltare l'evento scroll: non serve
 * calcolare posizioni a mano e non gira ad ogni pixel di scorrimento.
 * Il rootMargin fa partire il caricamento ~600px PRIMA di toccare il fondo,
 * così i nuovi video sono già lì quando ci arrivi.
 */
export function useInfiniteScroll({ hasMore, loading, onLoadMore }) {
  const sentinelRef = useRef(null);
  // L'observer va ricreato ad ogni cambio di stato, ma la callback cambia
  // identità ogni render: la teniamo in un ref per non ricrearlo inutilmente.
  const onLoadMoreRef = useRef(onLoadMore);
  onLoadMoreRef.current = onLoadMore;

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore || loading) return;

    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting) onLoadMoreRef.current();
      },
      { rootMargin: "600px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loading]);

  return sentinelRef;
}
