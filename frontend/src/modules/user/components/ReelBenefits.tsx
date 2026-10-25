import { useReelConfig } from '../../../hooks/useReelConfig';

interface ReelBenefitsProps {
    /**
     * compact — a one-line nudge (order detail, wallet).
     * full    — the bulleted list (upload screen, empty states).
     */
    variant?: 'compact' | 'full';
    className?: string;
}

/**
 * "Why create a reel" copy, shown wherever a customer might start or track a
 * reel. The commission percentage comes from live app settings so it never
 * drifts from what's actually paid out; until it loads (or if it fails) the
 * copy reads without a number rather than showing a wrong one.
 */
export default function ReelBenefits({
    variant = 'full',
    className = '',
}: ReelBenefitsProps) {
    const config = useReelConfig();
    const rate = config?.reelCommissionRate;
    const earnText = rate
        ? `Earn ${rate}% commission on every sale through your reel`
        : 'Earn commission on every sale through your reel';

    if (variant === 'compact') {
        return (
            <div
                className={`flex items-start gap-2 rounded-lg bg-green-50 px-3 py-2 ${className}`}
            >
                <span className="text-base leading-none mt-0.5">💰</span>
                <p className="text-xs text-green-800">
                    <span className="font-semibold">{earnText}</span> — paid straight to
                    your wallet once the order is delivered.
                </p>
            </div>
        );
    }

    return (
        <div className={`rounded-xl bg-green-50 border border-green-100 p-4 ${className}`}>
            <h3 className="text-sm font-bold text-green-900 mb-2">
                Why create a reel?
            </h3>
            <ul className="space-y-1.5 text-xs text-green-800">
                <li className="flex items-start gap-2">
                    <span className="leading-none mt-0.5">💰</span>
                    <span>
                        <span className="font-semibold">{earnText}.</span> Credited to your
                        wallet after the buyer's order is delivered.
                    </span>
                </li>
                <li className="flex items-start gap-2">
                    <span className="leading-none mt-0.5">🔁</span>
                    <span>Earn again and again — every new order through the same reel pays you.</span>
                </li>
                <li className="flex items-start gap-2">
                    <span className="leading-none mt-0.5">📈</span>
                    <span>Your reel is shown to shoppers near you who can actually buy the product.</span>
                </li>
                <li className="flex items-start gap-2">
                    <span className="leading-none mt-0.5">🤝</span>
                    <span>Help others shop with confidence by showing the real product.</span>
                </li>
            </ul>
        </div>
    );
}
