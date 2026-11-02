export const MAX_MERCHANT_DOCUMENT_FILE_SIZE = 5 * 1024 * 1024;
export const MAX_MERCHANT_DOCUMENT_TOTAL_SIZE = 15 * 1024 * 1024;

export async function compressMerchantDocumentIfNeeded(file: File): Promise<File> {
  if (file.type === 'application/pdf'
    || file.size <= MAX_MERCHANT_DOCUMENT_FILE_SIZE
    || !file.type.startsWith('image/')) {
    return file;
  }

  try {
    const imageBitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) {
      imageBitmap.close?.();
      return file;
    }

    const scale = Math.min(1, 2200 / Math.max(imageBitmap.width, imageBitmap.height));
    const width = Math.max(1, Math.round(imageBitmap.width * scale));
    const height = Math.max(1, Math.round(imageBitmap.height * scale));
    canvas.width = width;
    canvas.height = height;
    context.drawImage(imageBitmap, 0, 0, width, height);
    imageBitmap.close?.();

    for (const quality of [0.72, 0.56, 0.4]) {
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(candidate => {
          if (!candidate) {
            reject(new Error('Image compression failed.'));
            return;
          }
          resolve(candidate);
        }, 'image/jpeg', quality);
      });
      if (blob.size <= MAX_MERCHANT_DOCUMENT_FILE_SIZE) {
        return new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), {
          type: 'image/jpeg',
          lastModified: Date.now()
        });
      }
    }
  } catch {
    return file;
  }
  return file;
}
