import type { Reel } from '../services/api/customerReelService';
import { buildReelShareUrl } from './appLink';

/**
 * Share a reel's canonical link (`/reels/:id`) via the device share sheet
 * (WhatsApp, Instagram, …), falling back to copying the link.
 *
 * Resolves true when the link was actually shared/copied, false when the user
 * dismissed the share sheet — callers only count a share on true.
 */
export async function shareReelLink(
    reel: Reel,
    showToast: (message: string, type?: 'success' | 'error' | 'info') => void,
): Promise<boolean> {
    const shareUrl = buildReelShareUrl(reel._id);
    const shareText = reel.product
        ? `Check out ${reel.product.productName} on Dhakad Snazzy!`
        : 'Check out this reel on Dhakad Snazzy!';

    try {
        if (navigator.share) {
            await navigator.share({ title: shareText, text: shareText, url: shareUrl });
        } else {
            await navigator.clipboard.writeText(shareUrl);
            showToast('Link copied to clipboard', 'success');
        }
        return true;
    } catch (err) {
        // AbortError = user closed the share sheet; not a failure worth reporting.
        if ((err as Error)?.name !== 'AbortError') {
            console.error('Share failed', err);
        }
        return false;
    }
}
