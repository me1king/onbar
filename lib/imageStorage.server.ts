import sharp from 'sharp';

const MAX_IMAGE_PIXELS = 40_000_000;
const IMAGE_FORMATS: Record<string, { format: string; compression?: string }> = {
    'image/jpeg': { format: 'jpeg' },
    'image/png': { format: 'png' },
    'image/webp': { format: 'webp' },
    'image/avif': { format: 'heif', compression: 'av1' }
};

export class InvalidImageUploadError extends Error {}

export async function normalizeImageToAvif(input: Buffer, contentType: string): Promise<Buffer> {
    const expected = IMAGE_FORMATS[contentType];
    if (!expected || input.length === 0) {
        throw new InvalidImageUploadError('Choose a valid JPEG, PNG, WebP, or AVIF image.');
    }

    let metadata: Awaited<ReturnType<ReturnType<typeof sharp>['metadata']>>;
    try {
        metadata = await sharp(input, { failOn: 'error', limitInputPixels: MAX_IMAGE_PIXELS }).metadata();
    } catch {
        throw new InvalidImageUploadError('The image file is invalid or could not be decoded.');
    }

    if (
        metadata.format !== expected.format
        || (expected.compression && metadata.compression !== expected.compression)
        || !metadata.width
        || !metadata.height
        || metadata.width * metadata.height > MAX_IMAGE_PIXELS
    ) {
        throw new InvalidImageUploadError('The image contents do not match the selected file type.');
    }

    return sharp(input, { failOn: 'error', limitInputPixels: MAX_IMAGE_PIXELS })
        .rotate()
        .avif({ quality: 60, effort: 4, chromaSubsampling: '4:2:0' })
        .toBuffer();
}
