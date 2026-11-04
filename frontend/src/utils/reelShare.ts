import type { Reel } from '../services/api/customerReelService';
import { buildReelShareUrl } from './appLink';

type ShowToast = (message: string, type?: 'success' | 'error' | 'info') => void;

/** Copy a reel's canonical URL, including older/in-app browser fallback support. */
export async function copyReelLink(reel: Reel, showToast: ShowToast): Promise<boolean> {
    const shareUrl = buildReelShareUrl(reel._id);

    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(shareUrl);
        } else {
            const input = document.createElement('textarea');
            input.value = shareUrl;
            input.setAttribute('readonly', '');
            input.style.position = 'fixed';
            input.style.opacity = '0';
            document.body.appendChild(input);
            input.select();
            const copied = document.execCommand('copy');
            input.remove();
            if (!copied) throw new Error('Copy command was rejected');
        }
        showToast('Reel URL copied', 'success');
        return true;
    } catch (err) {
        console.error('Copy failed', err);
        showToast('Could not copy reel URL', 'error');
        return false;
    }
}

/**
 * Share a reel's canonical link (`/reels/:id`) via the device share sheet
 * (WhatsApp, Instagram, …), falling back to copying the link.
 *
 * Resolves true when the link was actually shared/copied, false when the user
 * dismissed the share sheet — callers only count a share on true.
 */
export async function shareReelLink(
    reel: Reel,
    showToast: ShowToast,
): Promise<boolean> {
    const shareUrl = buildReelShareUrl(reel._id);
    const shareText = reel.product
        ? `Check out ${reel.product.productName} on Dhakad Snazzy!`
        : 'Check out this reel on Dhakad Snazzy!';

    try {
        if (navigator.share) {
            await navigator.share({ title: shareText, text: shareText, url: shareUrl });
        } else {
            return copyReelLink(reel, showToast);
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
