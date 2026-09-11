import { useEffect, useState } from 'react';

/** Explain a slow network/startup without flickering during ordinary requests. */
export default function ConnectionWaitHint() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), 6_000);
    return () => clearTimeout(timer);
  }, []);
  return slow ? (
    <p
      role="status"
      className="max-w-sm text-xs leading-relaxed text-content-muted"
    >
      Il primo accesso può richiedere circa un minuto se il server si sta
      riattivando. Attendi senza ricaricare la pagina.
    </p>
  ) : null;
}
