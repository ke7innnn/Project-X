/**
 * Compresses an image File using the browser Canvas API.
 * Resizes to maxWidthPx (maintaining aspect ratio) and re-encodes as JPEG
 * at `quality` (0–1). Returns a base64 data-URL string.
 *
 * This runs entirely in the browser — no server round-trip needed.
 * Safe to call from any client component.
 */
export async function compressImage(
  file: File,
  maxWidthPx = 1920,
  quality = 0.82
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (evt) => {
      const src = evt.target?.result as string;
      const img = new Image();
      img.onload = () => {
        const ratio = Math.min(maxWidthPx / img.width, 1);
        const w = Math.round(img.width * ratio);
        const h = Math.round(img.height * ratio);

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          // Fallback: return original if canvas not available
          resolve(src);
          return;
        }

        ctx.drawImage(img, 0, 0, w, h);
        const compressed = canvas.toDataURL('image/jpeg', quality);
        resolve(compressed);
      };
      img.onerror = () => reject(new Error('Failed to load image for compression'));
      img.src = src;
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}
