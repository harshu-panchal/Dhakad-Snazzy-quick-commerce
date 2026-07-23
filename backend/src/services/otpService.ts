import axios from "axios";
import Otp from "../models/Otp";

// SMS India HUB Configuration - exact URL from official documentation
// Ref: https://www.smsindiahub.in/free-sms-api-india/ (Transactional: pushsms.aspx?user=...&password=...&msisdn=919898xxxxxx&sid=SenderId&msg=...&fl=0&gwid=2)
// SMS India HUB Configuration
const SMS_INDIA_HUB_DLT_TEMPLATE_ID = process.env.SMS_INDIA_HUB_DLT_TEMPLATE_ID;
// Set this to your EXACT DLT-registered template text, using {OTP} as the placeholder
const SMS_INDIA_HUB_DLT_TEMPLATE_TEXT =
  process.env.SMS_INDIA_HUB_DLT_TEMPLATE_TEXT;
const SMS_INDIA_HUB_API_URL =
  "http://cloud.smsindiahub.in/vendorsms/pushsms.aspx";
const API_TIMEOUT = 30000; // 30 seconds

const DEBUG_SMS = process.env.DEBUG_SMS === "true";
function debugLog(label: string, data: Record<string, unknown>): void {
  if (DEBUG_SMS || process.env.NODE_ENV !== "production") {
    console.log(`[SMS DEBUG] ${label}`, JSON.stringify(data, null, 2));
  }
}

function getSmsApiKey(): string | undefined {
  return process.env.SMS_INDIA_HUB_API_KEY;
}
/** API password: use SMS_INDIA_HUB_PASSWORD (panel login password) if set, else SMS_INDIA_HUB_API_KEY. */
function getSmsPassword(): string | undefined {
  const p = process.env.SMS_INDIA_HUB_PASSWORD?.trim();
  if (p) return p;
  return getSmsApiKey();
}
/** When true, send APIKey= instead of password=. Use when you have API Key from panel (no separate panel password). */
function useApiKeyParam(): boolean {
  if (process.env.SMS_INDIA_HUB_USE_APIKEY === "true") return true;
  if (process.env.SMS_INDIA_HUB_PASSWORD?.trim()) return false;
  return true;
}
function getSmsSenderId(): string | undefined {
  return process.env.SMS_INDIA_HUB_SENDER_ID;
}
function getSmsDltTemplateId(): string | undefined {
  return process.env.SMS_INDIA_HUB_DLT_TEMPLATE_ID;
}
function getSmsUsername(): string {
  return (
    process.env.SMS_INDIA_HUB_USERNAME || process.env.APP_NAME || "DHAKADSNAZZY"
  );
}

if (
  process.env.NODE_ENV === "production" &&
  (!getSmsUsername() || !getSmsPassword() || !getSmsSenderId())
) {
  console.warn(
    "SMS India HUB credentials are not fully set (SMS_INDIA_HUB_USERNAME, SMS_INDIA_HUB_PASSWORD or SMS_INDIA_HUB_API_KEY, SMS_INDIA_HUB_SENDER_ID)",
  );
}

/**
 * Interface for OTP Response
 */
interface OtpResponse {
  success: boolean;
  sessionId?: string;
  message: string;
}

/**
 * SMS India HUB API Response Interface
 */
interface SmsIndiaHubResponse {
  ErrorCode?: string;
  ErrorMessage?: string;
  JobId?: string;
  MessageId?: string;
  MessageData?: Array<{
    Number: string;
    MessageId: string;
    Message: string;
  }>;
}

type UserType = "Customer" | "Delivery" | "Seller" | "Admin";

/**
 * Generate numeric OTP
 */
function generateOTP(length: number = 4): string {
  const digits = "0123456789";
  let otp = "";
  for (let i = 0; i < length; i++) {
    otp += digits[Math.floor(Math.random() * 10)];
  }
  return otp;
}

/**
 * Normalize mobile to 10 digits for DB storage (schema allows only 10 digits).
 * Strips non-digits and removes leading 91 if present.
 */
function normalizeMobileTo10(mobile: string): string {
  const digits = mobile.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) {
    return digits.slice(2);
  }
  if (digits.length === 10) {
    return digits;
  }
  if (digits.length === 11 && digits.startsWith("0")) {
    return digits.slice(1);
  }
  return digits;
}

/**
 * Normalize mobile number for SMS API per official docs:
 * "msisdn: Single mobile number or multiple... (10 digits or +91)"
 * Examples use 919898xxxxxx (91 + 10 digits, no plus sign). No spaces.
 */
function normalizeMobileNumber(mobile: string): string {
  const digitsOnly = String(mobile).replace(/\D/g, "");
  let msisdn: string;
  if (digitsOnly.length === 10 && !digitsOnly.startsWith("0")) {
    msisdn = "91" + digitsOnly;
  } else if (digitsOnly.length === 12 && digitsOnly.startsWith("91")) {
    msisdn = digitsOnly;
  } else {
    throw new Error(
      `Invalid mobile number. Use 10-digit Indian number (e.g. 9755620716). Got: ${mobile}`,
    );
  }
  return msisdn.trim();
}

/**
 * Build DLT-compliant message. Must match approved template exactly (no extra spaces, same punctuation).
 * Use SMS_INDIA_HUB_OTP_APP_NAME in .env if your DLT template uses a different brand name than USERNAME.
 * Build DLT-compliant message
 * Uses SMS_INDIA_HUB_DLT_TEMPLATE_TEXT env var if set (replace {OTP} with the actual code).
 * The template text must EXACTLY match what is registered on the SMS India HUB DLT portal.
 */
function buildOtpMessage(otp: string): string {
  const appName = (
    process.env.SMS_INDIA_HUB_OTP_APP_NAME?.trim() ||
    getSmsUsername() ||
    "Dhakad Snazzy"
  ).trim();
  const otpTrimmed = String(otp).trim().replace(/\s/g, "");

  if (
    SMS_INDIA_HUB_DLT_TEMPLATE_TEXT &&
    SMS_INDIA_HUB_DLT_TEMPLATE_TEXT.trim()
  ) {
    return SMS_INDIA_HUB_DLT_TEMPLATE_TEXT.trim()
      .replace(/\{APP_NAME\}/g, appName)
      .replace(/\{OTP\}/g, otpTrimmed);
  }

  const template =
    process.env.SMS_INDIA_HUB_OTP_TEMPLATE?.trim() ||
    "Welcome to the {APP_NAME} powered by SMSINDIAHUB. Your OTP for registration is {OTP}";
  const msg = template
    .replace(/\{APP_NAME\}/g, appName)
    .replace(/\{OTP\}/g, otpTrimmed)
    .replace(/\s+/g, " ")
    .trim();
  return msg;
}

/**
 * Parse and handle SMS India HUB API response.
 * Gateway may return JSON or plain text (e.g. "Failed#Invalid Login...").
 */
function handleSmsResponse(
  responseData: SmsIndiaHubResponse | string | null | undefined,
): void {
  if (responseData == null) {
    throw new Error("Invalid SMS gateway response: empty body");
  }

  // Plain text response (e.g. "Failed#Invalid LoginThread was being aborted.")
  if (typeof responseData === "string") {
    const s = responseData.trim();
    if (s.toLowerCase().includes("invalid login") || s.startsWith("Failed#")) {
      throw new Error(
        "SMS India HUB: Invalid login. Set SMS_INDIA_HUB_PASSWORD to the password you use at https://cloud.smsindiahub.in (panel login). If you use API Key as password, ensure SMS_INDIA_HUB_API_KEY is correct.",
      );
    }
    throw new Error(
      `SMS India HUB: Unexpected response: ${s.substring(0, 120)}`,
    );
  }

  const errorCode = responseData.ErrorCode || "";
  const errorMsg = responseData.ErrorMessage || "";

  // Success indicators
  if (
    errorCode === "000" ||
    errorMsg === "Done" ||
    responseData.JobId ||
    responseData.MessageData
  ) {
    return; // Success
  }

  // Error handling
  if (errorCode || errorMsg) {
    switch (errorCode) {
      case "001":
        throw new Error("SMS India HUB: Account details cannot be blank.");
      case "006": {
        const fix = [
          "Invalid DLT template (006). Message must match the template in SMS India Hub panel character-for-character.",
          "Fix: 1) In panel, copy the exact template text into .env as SMS_INDIA_HUB_OTP_TEMPLATE (use {APP_NAME} and {OTP}).",
          "2) Set SMS_INDIA_HUB_OTP_APP_NAME to the exact brand name as in DLT (e.g. DHAKADSNAZZY).",
          "3) Try SMS_INDIA_HUB_SKIP_DLT_TE_ID=true to send without template ID.",
          "4) For development use USE_MOCK_OTP=true (OTP will be logged in console).",
        ].join(" ");
        throw new Error(`SMS India HUB: ${fix}`);
      }
      case "007":
        throw new Error("SMS India HUB: Invalid API key or credentials.");
      case "021":
        throw new Error("SMS India HUB: Insufficient credits in your account.");
      default:
        throw new Error(
          `SMS India HUB API Error (Code: ${errorCode}): ${errorMsg}`,
        );
    }
  }
}

/**
 * Send SMS via SMS India HUB API.
 * Official doc: user, password, msisdn (10 digits or 91+10), sid, msg, fl=0, gwid=2 for transactional.
 */
async function sendSmsViaApi(mobile: string, message: string): Promise<void> {
  const username = getSmsUsername()?.trim();
  const password = getSmsPassword();
  const senderId = getSmsSenderId()?.trim();
  if (!username || !password || !senderId) {
    throw new Error(
      "SMS India HUB credentials are missing. Set SMS_INDIA_HUB_USERNAME, SMS_INDIA_HUB_PASSWORD (or SMS_INDIA_HUB_API_KEY), and SMS_INDIA_HUB_SENDER_ID.",
    );
  }

  const mobileStr = String(mobile).trim();
  const msisdn = normalizeMobileNumber(mobileStr);

  const params: Record<string, string> = {
    user: username,
    msisdn,
    sid: senderId,
    msg: message,
    fl: "0",
    gwid: "2",
  };
  if (useApiKeyParam()) {
    // When using APIKey param, use the actual API key (not panel password)
    const apiKey = getSmsApiKey();
    if (!apiKey) {
      throw new Error(
        "SMS India HUB: SMS_INDIA_HUB_API_KEY is not set. Set it to your API key from the SMS India HUB panel.",
      );
    }
    params.APIKey = apiKey;
  } else {
    params.password = password;
  }

  const dltId = getSmsDltTemplateId()?.trim();
  const skipDltId = process.env.SMS_INDIA_HUB_SKIP_DLT_TE_ID === "true";
  if (dltId && !skipDltId) {
    params.DLT_TE_ID = dltId;
  }

  debugLog("SMS request (credentials masked)", {
    url: SMS_INDIA_HUB_API_URL,
    method: "GET",
    authParam: useApiKeyParam() ? "APIKey" : "password",
    msisdn,
    msisdnLength: msisdn.length,
    sid: senderId,
    DLT_TE_ID: params.DLT_TE_ID || "(not set)",
    msgLength: message.length,
    msgPreview: message.substring(0, 50) + (message.length > 50 ? "..." : ""),
    fl: params.fl,
    gwid: params.gwid,
  });

  if (SMS_INDIA_HUB_DLT_TEMPLATE_ID?.trim()) {
    params.DLT_TE_ID = SMS_INDIA_HUB_DLT_TEMPLATE_ID.trim();
  }

  // Add Entity ID (PE ID) if available
  const entityId = process.env.SMS_INDIA_HUB_ENTITY_ID;
  if (entityId?.trim()) {
    params.EntityId = entityId.trim();
  }

  // Debug logging for DLT Template issues
  console.log("--- SMS DLT Debug Info ---");
  console.log("Template ID:", params.DLT_TE_ID);
  console.log("Entity ID (PE ID):", params.EntityId);
  console.log("Message Content:", params.msg);
  console.log("Sender ID:", params.sid);
  console.log("Mobile:", params.msisdn);
  console.log("gwid:", params.gwid);
  console.log("--------------------------");

  const doRequest = (reqParams: Record<string, string>) =>
    axios.get<SmsIndiaHubResponse | string>(SMS_INDIA_HUB_API_URL, {
      params: reqParams,
      paramsSerializer: (p) =>
        Object.keys(p)
          .map(
            (k) =>
              `${encodeURIComponent(k)}=${encodeURIComponent((p as Record<string, string>)[k])}`,
          )
          .join("&"),
      timeout: API_TIMEOUT,
      validateStatus: () => true,
    });

  let response = await doRequest(params);
  let data: SmsIndiaHubResponse | string | undefined = response?.data;

  const isInvalidLogin =
    typeof data === "string" &&
    (data.includes("Invalid Login") || data.startsWith("Failed#"));
  if (isInvalidLogin && !useApiKeyParam()) {
    debugLog("SMS retry with APIKey param", {
      note: "Retrying with APIKey= instead of password=",
    });
    const params2 = { ...params };
    delete params2.password;
    params2.APIKey = getSmsApiKey() || password;
    response = await doRequest(params2);
    data = response?.data;
  }

  const isTemplateError =
    typeof data === "object" &&
    data &&
    (data as SmsIndiaHubResponse).ErrorCode === "006";
  if (isTemplateError && params.DLT_TE_ID) {
    debugLog("SMS retry without DLT_TE_ID", {
      note: "006 - retrying without template ID",
    });
    const paramsNoDlt = { ...params };
    delete paramsNoDlt.DLT_TE_ID;
    response = await doRequest(paramsNoDlt);
    data = response?.data;
  }

  debugLog("SMS response", {
    status: response.status,
    ErrorCode:
      typeof data === "object" && data && "ErrorCode" in data
        ? (data as SmsIndiaHubResponse).ErrorCode
        : undefined,
    ErrorMessage:
      typeof data === "object" && data && "ErrorMessage" in data
        ? (data as SmsIndiaHubResponse).ErrorMessage
        : undefined,
    JobId:
      typeof data === "object" && data && "JobId" in data
        ? (data as SmsIndiaHubResponse).JobId
        : undefined,
    MessageDataCount:
      typeof data === "object" &&
        data &&
        Array.isArray((data as SmsIndiaHubResponse).MessageData)
        ? (data as SmsIndiaHubResponse).MessageData!.length
        : 0,
    raw: data,
  });

  handleSmsResponse(data);
}

/**
 * Save OTP to database (mobile must be normalized to 10 digits for schema)
 */
async function saveOtpToDb(
  mobile: string,
  otp: string,
  userType: UserType,
): Promise<void> {
  const normalizedMobile = normalizeMobileTo10(mobile);
  if (normalizedMobile.length !== 10) {
    throw new Error(
      `Invalid mobile for DB: expected 10 digits, got ${normalizedMobile.length}`,
    );
  }

  await Otp.deleteMany({ mobile: normalizedMobile, userType });
  await Otp.create({
    mobile: normalizedMobile,
    otp: otp.trim(),
    userType,
    expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes expiry
  });
}

/**
 * Verify OTP from database
 */
async function verifyOtpFromDb(
  mobile: string,
  otp: string,
  userType: UserType,
): Promise<boolean> {
  const normalizedMobile = normalizeMobileTo10(mobile);

  const record = await Otp.findOne({
    mobile: normalizedMobile,
    userType,
    otp: otp.trim(),
  });

  if (!record) {
    const count = await Otp.countDocuments({
      mobile: normalizedMobile,
      userType,
    });
    console.error("OTP verification failed - record not found:", {
      mobile: normalizedMobile,
      userType,
      existingRecordsCount: count,
    });
    return false;
  }

  if (record.expiresAt < new Date()) {
    await Otp.deleteOne({ _id: record._id });
    console.error("OTP verification failed - expired:", {
      mobile: normalizedMobile,
      expiresAt: record.expiresAt,
      now: new Date(),
    });
    return false;
  }

  await Otp.deleteOne({ _id: record._id });
  return true;
}

/**
 * Check if special bypass should be used (normalized comparison)
 */
function isSpecialBypass(mobile: string): boolean {
  const digits = mobile.replace(/\D/g, "");
  return (
    digits === "9111966732" || // existing special test number
    digits === "11966732" || // legacy variant
    digits === "6268423926" // requested default OTP number
  );
}

/**
 * Check if mock mode should be used (credentials read at runtime)
 */
function isMockMode(): boolean {
  return (
    process.env.USE_MOCK_OTP === "true" ||
    !getSmsPassword() ||
    !getSmsSenderId()
  );
}

/**
 * Check if developer bypass OTP
 */
function isDeveloperBypass(otp: string): boolean {
  return (
    (process.env.NODE_ENV !== "production" ||
      process.env.USE_MOCK_OTP === "true") &&
    (otp === "999999" || otp === "9999" || otp === process.env.DEFAULT_OTP)
  );
}

// ==========================================
// SMS OTP (Customer / Delivery)
// ==========================================

export async function sendSmsOtp(
  mobile: string,
  userType: "Customer" | "Delivery" = "Delivery",
): Promise<OtpResponse> {
  const mobileStr = String(mobile ?? "").trim();
  debugLog("sendSmsOtp called", {
    mobile: mobileStr,
    mobileLength: mobileStr.length,
    userType,
    isMockMode: isMockMode(),
    isSpecialBypass: isSpecialBypass(mobileStr),
  });

  try {
    const otp = generateOTP(4);

    // Special number bypass
    if (isSpecialBypass(mobileStr)) {
      const specialOtp = "1234";
      await saveOtpToDb(mobileStr, specialOtp, userType);
      return {
        success: true,
        sessionId: "DB_VERIFIED_" + mobileStr,
        message: "OTP sent successfully",
      };
    }

    // Mock mode
    if (isMockMode()) {
      await saveOtpToDb(mobileStr, otp, userType);
      if (process.env.NODE_ENV !== "production" || DEBUG_SMS) {
        console.log(`[SMS] Mock OTP for ${mobileStr}: ${otp}`);
      }
      return {
        success: true,
        sessionId: "MOCK_SESSION_" + mobileStr,
        message: "OTP sent successfully",
      };
    }

    // Real mode - Send via SMS India HUB; rollback saved OTP if send fails
    const normalizedMobile10 = normalizeMobileTo10(mobileStr);
    await saveOtpToDb(mobileStr, otp, userType);
    try {
      const message = buildOtpMessage(otp);
      await sendSmsViaApi(mobileStr, message);
    } catch (sendErr) {
      await Otp.deleteMany({ mobile: normalizedMobile10, userType });
      throw sendErr;
    }

    return {
      success: true,
      sessionId: "OTP_SESSION_" + normalizedMobile10,
      message: "OTP sent successfully",
    };
  } catch (error: any) {
    const errorMessage =
      error.message || "Failed to send OTP. Please try again.";
    console.error("SMS OTP Error (sendSmsOtp):", {
      error: errorMessage,
      mobile: mobileStr,
      userType,
    });
    throw new Error(errorMessage);
  }
}

export async function verifySmsOtp(
  sessionId: string,
  otpInput: string,
  mobile?: string,
  userType: "Customer" | "Delivery" = "Delivery",
): Promise<boolean> {
  if (isDeveloperBypass(otpInput)) {
    return true;
  }

  // Normalize OTP input (remove spaces, ensure it's a string)
  const normalizedOtp = String(otpInput).trim().replace(/\s/g, "");

  if (!normalizedOtp || normalizedOtp.length !== 4) {
    console.error("OTP verification failed - invalid OTP format:", {
      otpInput,
      normalizedOtp,
      length: normalizedOtp.length,
    });
    return false;
  }

  let targetMobile = mobile;
  if (!targetMobile && sessionId) {
    if (sessionId.startsWith("DB_VERIFIED_")) {
      targetMobile = sessionId.replace("DB_VERIFIED_", "");
    } else if (sessionId.startsWith("MOCK_SESSION_")) {
      targetMobile = sessionId.replace("MOCK_SESSION_", "");
    } else if (sessionId.startsWith("OTP_SESSION_")) {
      targetMobile = sessionId.replace("OTP_SESSION_", "");
    }
  }

  if (!targetMobile) {
    console.error("OTP verification failed - no mobile number:", {
      sessionId,
      mobile,
      userType,
    });
    return false;
  }

  const normalizedMobile = normalizeMobileTo10(targetMobile);

  if (normalizedMobile.length !== 10) {
    console.error("OTP verification failed - invalid mobile format:", {
      original: targetMobile,
      normalized: normalizedMobile,
      length: normalizedMobile.length,
    });
    return false;
  }

  return verifyOtpFromDb(normalizedMobile, normalizedOtp, userType);
}

// ==========================================
// SMS OTP (Seller / Admin)
// ==========================================

export async function sendOTP(
  mobile: string,
  userType: "Seller" | "Admin" | "Customer" | "Delivery",
  _isLogin: boolean = true,
): Promise<OtpResponse> {
  try {
    const otp = generateOTP(4);

    // Special number bypass
    if (isSpecialBypass(mobile)) {
      const specialOtp = "1234";
      await saveOtpToDb(mobile, specialOtp, userType);
      return {
        success: true,
        message: "OTP sent successfully",
      };
    }

    // Mock mode
    if (isMockMode()) {
      await saveOtpToDb(mobile, otp, userType);
      return {
        success: true,
        message: "OTP sent successfully",
      };
    }

    // Real mode - Send via SMS India HUB; rollback saved OTP if send fails
    const normalizedMobile10 = normalizeMobileTo10(mobile);
    await saveOtpToDb(mobile, otp, userType);
    try {
      const message = buildOtpMessage(otp);
      await sendSmsViaApi(mobile, message);
    } catch (sendErr) {
      await Otp.deleteMany({ mobile: normalizedMobile10, userType });
      throw sendErr;
    }

    return {
      success: true,
      message: "OTP sent successfully",
    };
  } catch (error: any) {
    const errorMessage =
      error.message || "Failed to send OTP. Please try again.";
    console.error("SMS OTP Error (sendOTP):", {
      error: errorMessage,
      mobile,
      userType,
    });
    throw new Error(errorMessage);
  }
}

export async function verifyOTP(
  mobile: string,
  otpInput: string,
  userType: "Seller" | "Admin" | "Customer" | "Delivery",
): Promise<boolean> {
  if (isDeveloperBypass(otpInput)) {
    return true;
  }

  // Normalize OTP input (remove spaces, ensure it's a string)
  const normalizedOtp = String(otpInput).trim().replace(/\s/g, "");

  if (!normalizedOtp || normalizedOtp.length !== 4) {
    console.error("OTP verification failed - invalid OTP format:", {
      otpInput,
      normalizedOtp,
      length: normalizedOtp.length,
    });
    return false;
  }

  const normalizedMobile = normalizeMobileTo10(mobile);

  if (normalizedMobile.length !== 10) {
    console.error("OTP verification failed - invalid mobile format:", {
      original: mobile,
      normalized: normalizedMobile,
      length: normalizedMobile.length,
    });
    return false;
  }

  return verifyOtpFromDb(normalizedMobile, normalizedOtp, userType);
}
