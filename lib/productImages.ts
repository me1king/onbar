export function getProductImageUrls(primaryImage: unknown, galleryImages: unknown): string[] {
  const candidates = [
    primaryImage,
    ...(Array.isArray(galleryImages) ? galleryImages : [])
  ];
  return [...new Set(candidates
    .filter((image): image is string => typeof image === 'string' && image.trim().length > 0)
    .map(image => image.trim()))];
}
