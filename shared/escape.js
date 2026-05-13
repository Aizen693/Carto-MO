// Echappe les 5 caracteres HTML dangereux. A utiliser pour toute donnee
// user (point.name, display_name, log.details, etc.) avant interpolation
// dans innerHTML/insertAdjacentHTML.
export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// Permet l'usage en script classique : <script src="../shared/escape.js"></script>
if (typeof window !== 'undefined') window.escapeHtml = escapeHtml;
