export function getProductImageUrls(
  primaryImage: unknown,
  galleryImages: unknown,
  additionalGalleryImages?: unknown
): string[] {
  const candidates = [
    primaryImage,
    ...(Array.isArray(galleryImages) ? galleryImages : []),
    ...(Array.isArray(additionalGalleryImages) ? additionalGalleryImages : [])
  ];
  return [...new Set(candidates
    .filter((image): image is string => typeof image === 'string' && image.trim().length > 0)
    .map(image => image.trim()))];
}
