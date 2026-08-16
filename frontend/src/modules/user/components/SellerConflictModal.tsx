import Button from '../../../components/ui/button';

interface SellerConflictModalProps {
  isOpen: boolean;
  currentSellerName?: string;
  newSellerName?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function SellerConflictModal({
  isOpen,
  currentSellerName,
  newSellerName,
  onConfirm,
  onCancel,
}: SellerConflictModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end md:items-center justify-center bg-black/50 backdrop-blur-sm px-4"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby="seller-conflict-title"
    >
      <div
        className="bg-white rounded-t-2xl md:rounded-2xl w-full md:max-w-sm p-6 shadow-xl animate-in fade-in zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-center mb-5">
          <div className="text-4xl mb-3">🛒</div>
          <h2 id="seller-conflict-title" className="text-lg font-bold text-neutral-900 mb-2">
            Start a new cart?
          </h2>
          <p className="text-sm text-neutral-600 leading-relaxed">
            Your cart has items from{' '}
            <span className="font-semibold text-neutral-900">{currentSellerName || 'another store'}</span>.
            Adding items from{' '}
            <span className="font-semibold text-neutral-900">{newSellerName || 'this store'}</span> will clear
            your current cart.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Button variant="default" size="lg" onClick={onConfirm} className="w-full">
            Yes, start new cart
          </Button>
          <Button variant="outline" size="lg" onClick={onCancel} className="w-full">
            No, keep my cart
          </Button>
        </div>
      </div>
    </div>
  );
}
