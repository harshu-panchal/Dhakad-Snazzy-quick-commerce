require("/opt/dhakadsnazzy/repo/backend/node_modules/dotenv").config({
  path: "/opt/dhakadsnazzy/shared/backend.env",
});

const { buildOtpMessage } = require(
  "/opt/dhakadsnazzy/repo/backend/dist/services/otpService.js"
);

const expected =
  "Welcome to Dhakad Snazzy, powered by BGADPL. Your OTP for registration 2779. This OTP is valid for 10 minutes. Please do not share it with anyone.BGADPL";
const actual = buildOtpMessage("2779");

if (actual !== expected) {
  throw new Error(`Production DLT message mismatch: ${actual}`);
}

const secretStatus = (name) => {
  const value = process.env[name] || "";
  return `${name}=PRESENT(length=${value.length})`;
};

console.log(`SMS_INDIA_HUB_USERNAME=${process.env.SMS_INDIA_HUB_USERNAME}`);
console.log(secretStatus("SMS_INDIA_HUB_PASSWORD"));
console.log(secretStatus("SMS_INDIA_HUB_API_KEY"));
console.log(`SMS_INDIA_HUB_AUTH=${process.env.SMS_INDIA_HUB_AUTH}`);
console.log(`SMS_INDIA_HUB_USE_APIKEY=${process.env.SMS_INDIA_HUB_USE_APIKEY}`);
console.log(`SMS_INDIA_HUB_SENDER_ID=${process.env.SMS_INDIA_HUB_SENDER_ID}`);
console.log(`SMS_INDIA_HUB_DLT_TEMPLATE_ID=${process.env.SMS_INDIA_HUB_DLT_TEMPLATE_ID}`);
console.log(`SMS_INDIA_HUB_GWID=${process.env.SMS_INDIA_HUB_GWID}`);
console.log(`SMS_POWERED_BY=${process.env.SMS_POWERED_BY}`);
console.log("PRODUCTION_TEMPLATE_RENDER_TEST_PASSED");
console.log(actual);
