export function getProductImageUrls(
  primaryImage: unknown,
  galleryImages: unknown,
  additionalGalleryImages?: unknown
): string[] {
  const collect = (value: unknown, results: string[]): void => {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return;
      if ((trimmed.startsWith('[') || trimmed.startsWith('{')) && /["'\[\]{]/.test(trimmed)) {
        try {
          collect(JSON.parse(trimmed), results);
          return;
        } catch {
          // Legacy text values that are not JSON are preserved below.
        }
      }
      if (trimmed !== '[object Object]' && trimmed !== '{}'
        && trimmed !== 'null' && trimmed !== 'undefined') results.push(trimmed);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(item => collect(item, results));
      return;
    }
    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      for (const key of ['url', 'src', 'image_url', 'imageUrl', 'path']) {
        if (typeof record[key] === 'string') {
          collect(record[key], results);
          return;
        }
      }
    }
  };

  const results: string[] = [];
  collect(primaryImage, results);
  collect(galleryImages, results);
  collect(additionalGalleryImages, results);
  return [...new Set(results)];
}
