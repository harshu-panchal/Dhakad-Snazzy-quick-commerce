import { useNavigate } from 'react-router-dom';

const sections: { heading: string; body: string[] }[] = [
  {
    heading: '1. Delivery Coverage',
    body: [
      'Dhakad Snazzy delivers within the local service areas of our seller and restaurant partners. Available sellers, restaurants, and delivery radius are shown automatically based on the delivery address you select in the app.',
    ],
  },
  {
    heading: '2. Delivery Time',
    body: [
      'For grocery orders, typical delivery time is around 17-20 minutes from order confirmation, depending on your location and order size.',
      'For food orders from restaurant partners, delivery time depends on preparation time at the restaurant and distance, and will be shown as an estimate at checkout.',
      'Delivery times are estimates only and may be affected by weather, traffic, high order volumes, or other circumstances beyond our control.',
    ],
  },
  {
    heading: '3. Delivery Charges',
    body: [
      'We offer free delivery on orders above ₹199. For orders below this threshold, a nominal delivery fee applies, shown clearly at checkout before you complete payment.',
      'Delivery charges may vary for certain locations, restaurant partners, or during high-demand periods, and will always be displayed before you confirm your order.',
    ],
  },
  {
    heading: '4. Order Tracking',
    body: [
      'Once your order is confirmed, you can track its status in real time from the Orders section of the app, including preparation, dispatch, and delivery updates via SMS and push notifications.',
    ],
  },
  {
    heading: '5. Delivery Attempts',
    body: [
      'Please ensure you are available at the delivery address provided. Our delivery partner will attempt to contact you upon arrival.',
      'If delivery cannot be completed due to an incorrect address, unavailability, or refusal to accept the order, the order may be cancelled and refund eligibility will be assessed as per our Refund Policy.',
    ],
  },
  {
    heading: '6. Contact Us',
    body: [
      'For questions about delivery for a specific order, or general shipping queries, contact us at help@dhakadsnazzy.com.',
    ],
  },
];

export default function ShippingPolicy() {
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
              Shipping Policy
            </h1>
            <p className="text-sm md:text-base text-neutral-600 text-center px-4">
              How delivery works on Dhakad Snazzy
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
