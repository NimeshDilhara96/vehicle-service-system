const MOBILE_REGEX = /^(?:0|\+94)7\d{8}$/;
const LICENSE_REGEX = /^[A-Z0-9-]{5,15}$/;
const SAFE_DATA_IMAGE_REGEX =
  /^data:image\/(?:png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/i;

const cleanString = (val) =>
  typeof val === "string"
    ? val
        .replace(/[<>]/g, "")
        // eslint-disable-next-line no-control-regex
        .replace(/[\u0000-\u001F\u007F]/g, "")
        .trim()
    : "";

const isValidPhotoUrl = (url) => {
  if (!url) return true;
  if (url.length > 2048) return false;
  if (url.startsWith("data:")) {
    return SAFE_DATA_IMAGE_REGEX.test(url);
  }
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
};

// Client-side schema mirroring backend/src/validators/driverValidator.js (Zod safeParse contract)
export const driverFormSchema = {
  safeParse(raw) {
    const issues = [];
    const name = cleanString(raw?.name);
    const contactNo = cleanString(raw?.contactNo);
    const licenseNo = cleanString(raw?.licenseNo).toUpperCase();
    const photograph = cleanString(raw?.photograph);
    const isAvailable =
      raw?.isAvailable === undefined ? true : Boolean(raw?.isAvailable);
    const createLoginAccount = Boolean(raw?.createLoginAccount);
    const hasExistingLogin = Boolean(raw?.hasExistingLogin);
    const email = cleanString(raw?.email).toLowerCase();
    const password = typeof raw?.password === "string" ? raw.password : "";

    if (name.length < 2) {
      issues.push({
        path: ["name"],
        message: "Driver full name must be at least 2 characters.",
      });
    } else if (name.length > 100) {
      issues.push({
        path: ["name"],
        message: "Driver name cannot exceed 100 characters.",
      });
    }

    if (!MOBILE_REGEX.test(contactNo)) {
      issues.push({
        path: ["contactNo"],
        message:
          "Invalid contact number. Please use 07XXXXXXXX or +947XXXXXXXX.",
      });
    }

    if (!LICENSE_REGEX.test(licenseNo)) {
      issues.push({
        path: ["licenseNo"],
        message:
          "Invalid license number format. Use 5–15 alphanumeric characters (e.g., B1234567).",
      });
    }

    if (!isValidPhotoUrl(photograph)) {
      issues.push({
        path: ["photograph"],
        message:
          "Invalid photograph URL. Please provide a valid http(s) image link (max 2048 chars) or leave blank.",
      });
    }

    if (createLoginAccount || hasExistingLogin) {
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        issues.push({
          path: ["email"],
          message: "Please enter a valid login email address.",
        });
      }

      if (!hasExistingLogin && (!password || password.length < 6)) {
        issues.push({
          path: ["password"],
          message: "Password must be at least 6 characters long.",
        });
      }

      if (hasExistingLogin && password.length > 0 && password.length < 6) {
        issues.push({
          path: ["password"],
          message: "New password must be at least 6 characters long.",
        });
      }
    }

    if (issues.length > 0) {
      return { success: false, error: { issues } };
    }

    return {
      success: true,
      data: {
        name,
        contactNo,
        licenseNo,
        photograph,
        isAvailable,
        email,
        password,
      },
    };
  },
};
