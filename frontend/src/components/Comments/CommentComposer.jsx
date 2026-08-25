import CommentBox from "./CommentBox";

/** Casella di scrittura, oppure il motivo per cui non c'è. */
export default function CommentComposer({ canComment, authenticated, me, posting, onSubmit }) {
  if (canComment) {
    return (
      <CommentBox
        me={me}
        placeholder={me?.title ? `Commenta come ${me.title}...` : "Aggiungi un commento..."}
        busy={posting}
        onSubmit={onSubmit}
      />
    );
  }
  if (authenticated) {
    return (
      <p style={{ fontSize: 13, color: "var(--text3)", marginBottom: 20 }}>
        Per commentare serve il permesso di scrittura: ricollega l'account Google
        dalle <strong>Impostazioni</strong> (il collegamento attuale è di sola lettura).
      </p>
    );
  }
  return (
    <p style={{ fontSize: 13, color: "var(--text3)", marginBottom: 20 }}>
      Collega un account Google dalle <strong>Impostazioni</strong> per poter commentare.
    </p>
  );
}
