import { useNavigate } from 'react-router-dom';

const sections: { heading: string; body: string[] }[] = [
  {
    heading: '1. Overview',
    body: [
      'We want you to be satisfied with every order placed on Dhakad Snazzy. This Refund Policy explains when and how refunds are issued for grocery and food orders placed through our platform.',
    ],
  },
  {
    heading: '2. Eligible Refund Situations',
    body: [
      'Order cancelled before the seller/restaurant accepts or begins preparing it.',
      'Item(s) missing, damaged, spoiled, or significantly different from what was ordered at the time of delivery.',
      'Wrong item delivered.',
      'Order not delivered within a reasonable time and confirmed as undelivered after investigation.',
      'Payment deducted but order failed to place due to a technical error.',
    ],
  },
  {
    heading: '3. How to Request a Refund',
    body: [
      'Report the issue through the "Order Details" page in the app within 48 hours of delivery (or immediately for non-delivery/payment issues), or contact us at help@dhakadsnazzy.com with your order ID and details of the issue.',
      'For damaged, spoiled, or incorrect items, please include photos where possible to help us resolve your request faster.',
    ],
  },
  {
    heading: '4. Refund Processing',
    body: [
      'Once a refund is approved, it will be initiated within 2-3 business days.',
      'Refunds to UPI, cards, or net banking are typically credited back to your original payment method within 5-7 business days, depending on your bank or payment provider.',
      'For Cash on Delivery (COD) orders eligible for a refund, the amount will be credited to your Dhakad Snazzy wallet or via bank transfer/UPI, as applicable.',
    ],
  },
  {
    heading: '5. Non-Refundable Situations',
    body: [
      'Change of mind after an order has been prepared or dispatched by the seller.',
      'Delay caused by incorrect address or unavailability of the customer to receive delivery.',
      'Complaints raised after the reporting window without valid reason.',
    ],
  },
  {
    heading: '6. Partial Refunds',
    body: [
      'If only part of your order is affected (for example, one missing item in a multi-item order), we will process a partial refund for the affected item(s) rather than the full order value.',
    ],
  },
  {
    heading: '7. Contact Us',
    body: [
      'For any refund-related queries, reach us at help@dhakadsnazzy.com. Our team will review your request and respond as soon as possible.',
    ],
  },
];

export default function RefundPolicy() {
  const navigate = useNavigate();

  return (
    <div className="pb-24 md:pb-8 bg-white min-h-screen">
      <div className="bg-gradient-to-b from-green-200 via-green-100 to-white pb-6 md:pb-8 pt-12 md:pt-16">
        <div className="px-4 md:px-6 lg:px-8">
          <button
            onClick={() => navigate(-1)}
            className="mb-4 text-neutral-900"
            aria-label="Back"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path
                d="M15 18L9 12L15 6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <div className="flex flex-col items-center mb-4 md:mb-6">
            <h1 className="text-xl md:text-2xl font-bold text-neutral-900 mb-2 text-center">
              Refund Policy
            </h1>
            <p className="text-sm md:text-base text-neutral-600 text-center px-4">
              When and how we issue refunds
            </p>
          </div>
        </div>
      </div>

      <div className="px-4 md:px-6 lg:px-8 py-6">
        <div className="max-w-3xl mx-auto space-y-6">
          <p className="text-xs text-neutral-500">Last updated: August 2026</p>
          {sections.map((s) => (
            <div key={s.heading}>
              <h2 className="text-base md:text-lg font-semibold text-neutral-900 mb-2">
                {s.heading}
              </h2>
              {s.body.length === 1 ? (
                <p className="text-sm md:text-base text-neutral-700 mb-2 leading-relaxed">
                  {s.body[0]}
                </p>
              ) : (
                <ul className="list-disc pl-5 space-y-1">
                  {s.body.map((p, i) => (
                    <li key={i} className="text-sm md:text-base text-neutral-700 leading-relaxed">
                      {p}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
