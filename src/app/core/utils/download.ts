// Déclenche le téléchargement d'une data URL via une ancre temporaire
// (export PNG du plan de salle, LOT B4). L'ancre n'est jamais insérée au DOM.
export function downloadDataUrl(dataUrl: string, filename: string): void {
  const anchor = document.createElement('a');
  anchor.href = dataUrl;
  anchor.download = filename;
  anchor.click();
}
