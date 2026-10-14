import { useNavigate } from 'react-router-dom';

const sections: { heading: string; body: string[] }[] = [
  {
    heading: '1. Overview',
    body: [
      'Because Dhakad Snazzy delivers groceries and prepared food from local sellers and restaurants, most items are perishable or time-sensitive. This Return Policy explains what can and cannot be returned, and how the process works.',
    ],
  },
  {
    heading: '2. Returnable Items',
    body: [
      'Packaged grocery items that are unopened, unused, and in original packaging, returned within 2 days of delivery.',
      'Items that were delivered damaged, expired, or materially different from their listing.',
      'Wrong item delivered in place of what you ordered.',
    ],
  },
  {
    heading: '3. Non-Returnable Items',
    body: [
      'Prepared food and beverages from restaurant partners, once delivered, cannot be returned due to hygiene and safety reasons — except in cases of a genuine quality issue reported immediately.',
      'Perishables such as fresh fruits, vegetables, dairy, and meat/fish, unless delivered damaged or spoiled.',
      'Items that have been opened, used, or are not in their original condition, unless the return is due to a seller error or product defect.',
    ],
  },
  {
    heading: '4. How to Initiate a Return',
    body: [
      'Go to "Order Details" in the app, select the item(s) you wish to return, and choose a reason. Alternatively, email us at help@dhakadsnazzy.com with your order ID.',
      'For damaged, spoiled, or incorrect items, please report within 48 hours of delivery with photos if possible.',
    ],
  },
  {
    heading: '5. Pickup and Verification',
    body: [
      'For eligible returns, our delivery partner may arrange a pickup of the item from your address, or you may be asked to share photo evidence for quick resolution without a physical pickup.',
      'Once the return is verified, we will process a refund as per our Refund Policy or arrange a replacement, based on availability.',
    ],
  },
  {
    heading: '6. Contact Us',
    body: [
      'For any questions about returning an item, contact us at help@dhakadsnazzy.com and our support team will guide you through the process.',
    ],
  },
];

export default function ReturnPolicy() {
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
              Return Policy
            </h1>
            <p className="text-sm md:text-base text-neutral-600 text-center px-4">
              What can be returned and how the process works
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
