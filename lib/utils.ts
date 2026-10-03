import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const CANONICAL_PUBLIC_URL = 'https://onlinebar.onrender.com';

export function getPublicBaseUrl() {
    const configuredUrl = process.env.NEXT_PUBLIC_BASE_URL?.trim();
    const currentUrl = configuredUrl || (typeof window !== 'undefined' ? window.location.origin : '');
    if (!currentUrl) return CANONICAL_PUBLIC_URL;

    try {
        const parsedUrl = new URL(currentUrl);
        if (parsedUrl.hostname === 'onlinebar-os.onrender.com') return CANONICAL_PUBLIC_URL;
        return parsedUrl.origin;
    } catch {
        return CANONICAL_PUBLIC_URL;
    }
}
/**
 * Normalizes image URLs and provides robust fallbacks for missing or legacy assets.
 * Standardizes empty strings and objects to a valid fallback path.
 */
export const normalizeImage = (url: string | null | undefined | object) => {
    if (!url || (typeof url === 'string' && (url.trim() === "" || url.trim() === "null" || url.trim() === "undefined" || url.trim() === "[object Object]"))) {
        return '/images/NoImage.jpg';
    }

    if (typeof url === 'object') {
        return '/images/NoImage.jpg';
    }

    const trimmedUrl = (url as string).trim();

    if (trimmedUrl === '' || trimmedUrl === '{}' || trimmedUrl === 'null' || trimmedUrl === 'undefined') {
        return '/images/NoImage.jpg';
    }

    const isPlaceholder =
        trimmedUrl === '/placeholder.jpg' ||
        trimmedUrl === 'placeholder.jpg' ||
        trimmedUrl.includes('placeholder.jpg') ||
        trimmedUrl === 'https://onlinebar.co.ke/placeholder.jpg';

    if (isPlaceholder) {
        return '/images/NoImage.jpg';
    }

    // 🚀 [CLOUDINARY_AUTO_OPTIMIZE] Automatically inject WebP/AVIF auto-compression parameters for Cloudinary URLs
    if (trimmedUrl.includes('res.cloudinary.com') && !trimmedUrl.includes('f_auto')) {
        return trimmedUrl.replace('/upload/', '/upload/f_auto,q_auto,w_600/');
    }

    return trimmedUrl;
};

export const formatPrice = (price: number | string | undefined | null) => {
  const numericPrice = typeof price === 'string' ? parseFloat(price) : Number(price || 0);
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(isNaN(numericPrice) ? 0 : numericPrice);
};

export const getReferralLink = (code: string, path: string = '/shop') => {
    const baseUrl = getPublicBaseUrl();
    const separator = path.includes('?') ? '&' : '?';
    return `${baseUrl}${path}${separator}ref=${code}`;
};

/**
 * Calculates distance between two GPS coordinates in kilometers
 */
export const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371; // Earth radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
};

/**
 * Dispatches a global UI overlay state event to manage mutual exclusion.
 */
export const dispatchUIOverlay = (activeId: 'AI_CONCIERGE' | 'SUPPORT' | 'EXIT_INTENT' | null) => {
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('ob-overlay-state', { detail: { active: activeId } }));
    }
};
