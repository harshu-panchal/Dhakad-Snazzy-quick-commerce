import { useNavigate } from 'react-router-dom';

const sections: { heading: string; body: string[] }[] = [
  {
    heading: '1. About Dhakad Snazzy',
    body: [
      'Dhakad Snazzy ("we", "us", "our") operates a quick-commerce marketplace app and website that connects customers with independent grocery sellers and food/restaurant partners for fast delivery of products and prepared food.',
      'By creating an account or placing an order through our app or website, you agree to be bound by these Terms and Conditions.',
    ],
  },
  {
    heading: '2. Account Registration',
    body: [
      'You must provide accurate, current, and complete information when creating an account, including a valid mobile number for OTP verification.',
      'You are responsible for maintaining the confidentiality of your account and for all activity that occurs under it. Notify us immediately of any unauthorized use.',
    ],
  },
  {
    heading: '3. Orders and Availability',
    body: [
      'All orders are subject to product/menu-item availability at the seller or restaurant you order from. Prices, images, and availability may change without prior notice.',
      'We and our seller partners reserve the right to refuse, cancel, or modify any order, including in cases of pricing errors, stock unavailability, or suspected fraud.',
      'Once an order is confirmed by the seller, cancellation may no longer be possible; please refer to our Return & Refund Policy for details.',
    ],
  },
  {
    heading: '4. Pricing and Payment',
    body: [
      'All prices displayed are inclusive of applicable taxes unless stated otherwise. Delivery charges, if any, are shown at checkout before payment.',
      'We accept payments via UPI, credit/debit cards, net banking, and digital wallets through our payment partner Razorpay, as well as Cash on Delivery (COD) where available.',
      'Payment must be completed at the time of order placement for prepaid orders.',
    ],
  },
  {
    heading: '5. Delivery',
    body: [
      'Delivery times shown in the app are estimates and may vary due to traffic, weather, seller preparation time, or other circumstances beyond our control.',
      'You must ensure someone is available to receive the order at the address provided. Repeated failed deliveries may result in order cancellation.',
    ],
  },
  {
    heading: '6. Seller and Restaurant Partners',
    body: [
      'Products and food items sold through Dhakad Snazzy are listed and fulfilled by independent third-party sellers and restaurant partners. We facilitate the marketplace connecting you with them but are not the manufacturer of grocery products or preparer of food items.',
      'Quality, packaging, and preparation of items are the responsibility of the respective seller/restaurant, though we work with our partners to maintain service standards.',
    ],
  },
  {
    heading: '7. User Conduct',
    body: [
      'You agree not to misuse the platform, including placing fraudulent orders, abusing promotional offers, or engaging in any activity that disrupts our services or harms other users, sellers, or delivery partners.',
    ],
  },
  {
    heading: '8. Limitation of Liability',
    body: [
      'To the extent permitted by law, our liability for any claim relating to an order is limited to the value of that order. We are not liable for indirect, incidental, or consequential damages arising from use of our platform.',
    ],
  },
  {
    heading: '9. Changes to These Terms',
    body: [
      'We may update these Terms and Conditions from time to time. Continued use of the app or website after changes are posted constitutes your acceptance of the revised terms.',
    ],
  },
  {
    heading: '10. Contact Us',
    body: [
      'For any questions about these Terms and Conditions, please contact us at help@dhakadsnazzy.com.',
    ],
  },
];

export default function TermsAndConditions() {
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
              Terms and Conditions
            </h1>
            <p className="text-sm md:text-base text-neutral-600 text-center px-4">
              Please read these terms carefully before using Dhakad Snazzy
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
              {s.body.map((p, i) => (
                <p key={i} className="text-sm md:text-base text-neutral-700 mb-2 leading-relaxed">
                  {p}
                </p>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
