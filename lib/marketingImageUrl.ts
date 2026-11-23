export type PublicImageUrlResult =
  | { valid: true; imageUrl: string | null }
  | { valid: false; error: string };

export function normalizePublicImageUrl(value: unknown): PublicImageUrlResult {
  if (value === undefined || value === null) return { valid: true, imageUrl: null };
  if (typeof value !== 'string') {
    return { valid: false, error: 'Enter a valid image URL.' };
  }

  const imageUrl = value.trim();
  if (!imageUrl) return { valid: true, imageUrl: null };
  if (imageUrl.length > 2000 || /[\u0000-\u001f]/.test(imageUrl)) {
    return { valid: false, error: 'Use an image URL under 2,000 characters.' };
  }
  if (imageUrl.startsWith('/') && !imageUrl.startsWith('//') && !imageUrl.includes('\\')) {
    return { valid: true, imageUrl };
  }

  try {
    const parsedImageUrl = new URL(imageUrl);
    if (parsedImageUrl.protocol !== 'https:' || parsedImageUrl.username || parsedImageUrl.password) {
      return { valid: false, error: 'Use a public HTTPS image URL or a site-relative image path.' };
    }
    return { valid: true, imageUrl: parsedImageUrl.toString() };
  } catch {
    return { valid: false, error: 'Enter a valid HTTPS image URL or a site-relative image path.' };
  }
}
