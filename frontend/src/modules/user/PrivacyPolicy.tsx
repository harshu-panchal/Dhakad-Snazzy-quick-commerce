import { useNavigate } from 'react-router-dom';

const sections: { heading: string; body: string[] }[] = [
  {
    heading: '1. Introduction',
    body: [
      'Dhakad Snazzy ("we", "us", "our") is committed to protecting your privacy. This Privacy Policy explains what information we collect, how we use it, and the choices you have.',
      'By using our app or website, you consent to the practices described in this policy.',
    ],
  },
  {
    heading: '2. Information We Collect',
    body: [
      'Account information: your name, mobile number, email address, and delivery addresses.',
      'Order information: items purchased, order value, payment method, and order history.',
      'Location information: your delivery location and, with permission, your device location to show nearby sellers and enable accurate delivery.',
      'Device and usage information: app version, device type, and how you interact with our platform, used to improve our services.',
    ],
  },
  {
    heading: '3. How We Use Your Information',
    body: [
      'To process and deliver your orders, including sharing your name, address, and phone number with the seller and delivery partner fulfilling your order.',
      'To send order updates, OTPs for verification, and important account or service notifications via SMS, email, or push notification.',
      'To improve our app, personalize your experience, and offer relevant promotions or recommendations.',
      'To detect and prevent fraud, abuse, or violations of our Terms and Conditions.',
    ],
  },
  {
    heading: '4. Sharing of Information',
    body: [
      'We share your order details with the seller/restaurant and delivery partner assigned to fulfill your order, to the extent necessary to complete delivery.',
      'We share payment information with our payment gateway partner (Razorpay) to process transactions securely; we do not store your full card details on our servers.',
      'We do not sell your personal information to third parties. We may share information with service providers who help us operate our platform (such as cloud hosting and SMS/notification providers), bound by confidentiality obligations, or when required by law.',
    ],
  },
  {
    heading: '5. Data Security',
    body: [
      'We use reasonable technical and organizational measures to protect your personal information from unauthorized access, alteration, or disclosure. However, no method of transmission over the internet is 100% secure.',
    ],
  },
  {
    heading: '6. Your Choices',
    body: [
      'You can review and update your account information at any time from the Account section of the app.',
      'You may disable location or notification permissions through your device settings, though this may limit certain features.',
      'To request deletion of your account and associated data, contact us at help@dhakadsnazzy.com.',
    ],
  },
  {
    heading: '7. Children’s Privacy',
    body: [
      'Our services are not directed to children under 18. We do not knowingly collect personal information from children.',
    ],
  },
  {
    heading: '8. Changes to This Policy',
    body: [
      'We may update this Privacy Policy from time to time. Material changes will be reflected by an updated "Last updated" date below.',
    ],
  },
  {
    heading: '9. Contact Us',
    body: [
      'If you have questions about this Privacy Policy or how your data is handled, contact us at help@dhakadsnazzy.com.',
    ],
  },
];

export default function PrivacyPolicy() {
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
              Privacy Policy
            </h1>
            <p className="text-sm md:text-base text-neutral-600 text-center px-4">
              How we collect, use, and protect your information
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
