import { useEffect, useMemo, useState } from 'react';
import { getDeliveryBoys, type DeliveryBoy } from '../../../services/api/admin/adminDeliveryService';
import {
    assignDeliveryBoy,
    bookShiprocketCourier,
    getShippingQuotes,
    type PackageDetails,
    type ShippingQuotes,
} from '../../../services/api/admin/adminOrderService';

interface AssignDeliveryBoyModalProps {
    isOpen: boolean;
    onClose: () => void;
    orderId: string;
    orderNumber: string;
    currentDeliveryBoy?: { name: string; _id: string } | string;
    currentProvider?: 'Personal' | 'Shiprocket';
    onAssignSuccess: () => void;
}

const emptyPackage = { weight: '', length: '', breadth: '', height: '' };

export default function AssignDeliveryBoyModal({
    isOpen,
    onClose,
    orderId,
    orderNumber,
    currentDeliveryBoy,
    currentProvider,
    onAssignSuccess,
}: AssignDeliveryBoyModalProps) {
    const [provider, setProvider] = useState<'Personal' | 'Shiprocket'>(currentProvider || 'Personal');
    const [deliveryBoys, setDeliveryBoys] = useState<DeliveryBoy[]>([]);
    const [selectedDeliveryBoyId, setSelectedDeliveryBoyId] = useState('');
    const [packageInput, setPackageInput] = useState(emptyPackage);
    const [quotes, setQuotes] = useState<ShippingQuotes | null>(null);
    const [selectedCourierId, setSelectedCourierId] = useState<number | null>(null);
    const [loading, setLoading] = useState(false);
    const [quoting, setQuoting] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const currentDeliveryBoyId = typeof currentDeliveryBoy === 'object' && currentDeliveryBoy?._id
        ? currentDeliveryBoy._id
        : typeof currentDeliveryBoy === 'string' ? currentDeliveryBoy : '';

    useEffect(() => {
        if (!isOpen) return;
        setProvider(currentProvider || 'Personal');
        setSelectedDeliveryBoyId(currentDeliveryBoyId);
        setPackageInput(emptyPackage);
        setQuotes(null);
        setSelectedCourierId(null);
        setError(null);
        void fetchDeliveryBoys();
    }, [isOpen, currentDeliveryBoyId, currentProvider]);

    const fetchDeliveryBoys = async () => {
        try {
            setLoading(true);
            const response = await getDeliveryBoys({ status: 'Active', available: 'Available', isOnline: true, limit: 100 });
            if (response.success) setDeliveryBoys(response.data || []);
        } catch (err: any) {
            setError(err?.response?.data?.message || 'Failed to load personal delivery partners');
        } finally {
            setLoading(false);
        }
    };

    const parsedPackage = useMemo<PackageDetails>(() => ({
        weight: Number(packageInput.weight),
        length: Number(packageInput.length),
        breadth: Number(packageInput.breadth),
        height: Number(packageInput.height),
    }), [packageInput]);

    const packageValid = parsedPackage.weight > 0
        && parsedPackage.length >= 0.5
        && parsedPackage.breadth >= 0.5
        && parsedPackage.height >= 0.5;

    const handleQuote = async () => {
        if (!packageValid) {
            setError('Enter weight above 0 kg and all dimensions at least 0.5 cm.');
            return;
        }
        try {
            setQuoting(true);
            setError(null);
            const response = await getShippingQuotes(orderId, parsedPackage);
            if (!response.success) throw new Error(response.message || 'Failed to get shipping quotes');
            setQuotes(response.data);
            const cheapest = response.data.couriers.find((courier) => courier.cheapest);
            setSelectedCourierId(cheapest?.courierId ?? null);
            if (!response.data.couriers.length) setError('No Shiprocket courier is serviceable for this route and package.');
        } catch (err: any) {
            setQuotes(null);
            setSelectedCourierId(null);
            setError(err?.response?.data?.message || err.message || 'Failed to get Shiprocket quotes');
        } finally {
            setQuoting(false);
        }
    };

    const handleAssign = async () => {
        try {
            setSubmitting(true);
            setError(null);
            if (provider === 'Personal') {
                if (!selectedDeliveryBoyId) throw new Error('Please select a personal delivery partner');
                const response = await assignDeliveryBoy(orderId, { deliveryBoyId: selectedDeliveryBoyId });
                if (!response.success) throw new Error(response.message || 'Failed to assign delivery partner');
            } else {
                if (!quotes || !selectedCourierId) throw new Error('Get rates and select a courier first');
                const response = await bookShiprocketCourier(orderId, parsedPackage, selectedCourierId);
                if (!response.success) throw new Error(response.message || 'Failed to book Shiprocket courier');
                if (response.warning) window.alert(response.warning);
            }
            onAssignSuccess();
            onClose();
        } catch (err: any) {
            setError(err?.response?.data?.message || err.message || 'Assignment failed');
        } finally {
            setSubmitting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <button className="fixed inset-0 bg-black/50" onClick={onClose} aria-label="Close" />
            <div className="relative bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[92vh] overflow-y-auto">
                <div className="sticky top-0 bg-white z-10 flex items-center justify-between px-6 py-4 border-b">
                    <div>
                        <h2 className="text-lg font-semibold text-neutral-900">Assign Delivery Service</h2>
                        <p className="text-xs text-neutral-500">Order #{orderNumber}</p>
                    </div>
                    <button onClick={onClose} disabled={submitting} className="text-neutral-500 text-2xl">×</button>
                </div>

                <div className="p-6 space-y-5">
                    {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}

                    <div className="grid grid-cols-2 gap-3">
                        <button type="button" onClick={() => setProvider('Personal')} className={`p-4 rounded-xl border-2 text-left ${provider === 'Personal' ? 'border-green-600 bg-green-50' : 'border-neutral-200'}`}>
                            <div className="font-bold text-neutral-900">Personal Partner</div>
                            <div className="text-xs text-neutral-500 mt-1">Use an active in-house delivery partner</div>
                        </button>
                        <button type="button" onClick={() => setProvider('Shiprocket')} disabled={currentProvider === 'Shiprocket'} className={`p-4 rounded-xl border-2 text-left ${provider === 'Shiprocket' ? 'border-blue-600 bg-blue-50' : 'border-neutral-200'}`}>
                            <div className="font-bold text-neutral-900">Shiprocket</div>
                            <div className="text-xs text-neutral-500 mt-1">Compare live courier rates and book pickup</div>
                        </button>
                    </div>

                    {provider === 'Personal' ? (
                        <div>
                            <label className="block text-sm font-medium text-neutral-700 mb-2">Delivery partner</label>
                            {loading ? <p className="text-sm text-neutral-500 py-4">Loading partners...</p> : (
                                <select value={selectedDeliveryBoyId} onChange={(event) => setSelectedDeliveryBoyId(event.target.value)} className="w-full px-3 py-2.5 border border-neutral-300 rounded-lg">
                                    <option value="">Select a partner</option>
                                    {deliveryBoys.map((boy) => <option key={boy._id} value={boy._id}>{boy.name} — {boy.mobile} ({boy.city})</option>)}
                                </select>
                            )}
                            {quotes?.personalOptions?.length ? (
                                <div className="mt-3 p-3 bg-neutral-50 rounded-lg text-xs text-neutral-600">
                                    Estimated cost for selected partner: <strong>₹{quotes.personalOptions.find((option) => option.deliveryBoyId === selectedDeliveryBoyId)?.cost.toFixed(2) || '—'}</strong>
                                </div>
                            ) : null}
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div>
                                <h3 className="font-semibold text-neutral-900">Packed shipment details</h3>
                                <p className="text-xs text-neutral-500">Enter the final packed weight and dimensions for accurate rates.</p>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                {([
                                    ['weight', 'Weight (kg)', '0.5'], ['length', 'Length (cm)', '10'],
                                    ['breadth', 'Breadth (cm)', '10'], ['height', 'Height (cm)', '10'],
                                ] as const).map(([field, label, placeholder]) => (
                                    <label key={field} className="text-xs font-medium text-neutral-700">
                                        {label}
                                        <input type="number" min={field === 'weight' ? '0.001' : '0.5'} step="0.01" value={packageInput[field]}
                                            onChange={(event) => { setPackageInput((current) => ({ ...current, [field]: event.target.value })); setQuotes(null); setSelectedCourierId(null); }}
                                            placeholder={placeholder} className="mt-1 w-full px-3 py-2 border border-neutral-300 rounded-lg" />
                                    </label>
                                ))}
                            </div>
                            <button type="button" onClick={handleQuote} disabled={!packageValid || quoting} className="w-full py-2.5 rounded-lg bg-blue-600 text-white font-semibold disabled:bg-neutral-300">
                                {quoting ? 'Checking live rates...' : 'Get live courier rates'}
                            </button>

                            {quotes && (
                                <>
                                    <div className={`p-3 rounded-lg border ${quotes.recommendation === 'Shiprocket' ? 'bg-blue-50 border-blue-200' : 'bg-green-50 border-green-200'}`}>
                                        <p className="text-sm font-semibold">Cost-friendly recommendation: {quotes.recommendation || 'Unavailable'}</p>
                                        <p className="text-xs mt-1">Personal from {quotes.cheapestPersonal == null ? 'unavailable' : `₹${quotes.cheapestPersonal.toFixed(2)}`} · Shiprocket from {quotes.cheapestShiprocket == null ? 'unavailable' : `₹${quotes.cheapestShiprocket.toFixed(2)}`}</p>
                                    </div>
                                    <div className="space-y-2">
                                        {quotes.couriers.map((courier) => (
                                            <label key={courier.courierId} className={`block p-3 rounded-lg border cursor-pointer ${selectedCourierId === courier.courierId ? 'border-blue-500 bg-blue-50' : 'border-neutral-200'}`}>
                                                <div className="flex items-center gap-3">
                                                    <input type="radio" name="courier" checked={selectedCourierId === courier.courierId} onChange={() => setSelectedCourierId(courier.courierId)} />
                                                    <div className="flex-1">
                                                        <div className="flex items-center gap-2"><span className="font-semibold text-sm">{courier.courierName}</span>{courier.cheapest && <span className="text-[10px] px-2 py-0.5 bg-green-100 text-green-800 rounded-full font-bold">CHEAPEST</span>}</div>
                                                        <div className="text-xs text-neutral-500">{courier.mode} · {courier.estimatedDeliveryDays || '—'} days · Rating {courier.rating || '—'}</div>
                                                    </div>
                                                    <div className="font-bold">₹{courier.rate.toFixed(2)}</div>
                                                </div>
                                            </label>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </div>

                <div className="sticky bottom-0 flex justify-end gap-3 px-6 py-4 border-t bg-white">
                    <button onClick={onClose} disabled={submitting} className="px-4 py-2 border rounded-lg">Cancel</button>
                    <button onClick={handleAssign} disabled={submitting || (provider === 'Personal' ? !selectedDeliveryBoyId : !selectedCourierId)} className="px-5 py-2 bg-green-600 text-white rounded-lg font-semibold disabled:bg-neutral-300">
                        {submitting ? 'Processing...' : provider === 'Personal' ? 'Assign Partner' : 'Book Courier & Pickup'}
                    </button>
                </div>
            </div>
        </div>
    );
}
