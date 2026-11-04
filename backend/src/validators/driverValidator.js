const { z } = require("zod");

const MOBILE_REGEX = /^(?:0|\+94)7\d{8}$/;
const LICENSE_REGEX = /^[A-Z0-9-]{5,15}$/;
const OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/;
const SAFE_DATA_IMAGE_REGEX =
  /^data:image\/(?:png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/i;

const cleanString = (val) =>
  typeof val === "string"
    ? val
        .replace(/[<>]/g, "")
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

const baseDriverFields = {
  name: z
    .string({ message: "Driver full name is required." })
    .transform(cleanString)
    .pipe(
      z
        .string()
        .min(2, { message: "Driver full name must be at least 2 characters." })
        .max(100, { message: "Driver name cannot exceed 100 characters." }),
    ),

  contactNo: z
    .string({ message: "Contact number is required." })
    .transform(cleanString)
    .pipe(
      z.string().regex(MOBILE_REGEX, {
        message:
          "Invalid contact number format. Please use 07XXXXXXXX or +947XXXXXXXX.",
      }),
    ),

  licenseNo: z
    .string({ message: "Driving license number is required." })
    .transform((val) => cleanString(val).toUpperCase())
    .pipe(
      z.string().regex(LICENSE_REGEX, {
        message:
          "Invalid license number format. Use 5–15 alphanumeric characters (e.g., B1234567).",
      }),
    ),

  photograph: z
    .string()
    .optional()
    .default("")
    .transform(cleanString)
    .refine(isValidPhotoUrl, {
      message:
        "Invalid photograph URL. Please provide a valid http(s) image link (max 2048 chars) or leave blank.",
    }),

  isAvailable: z.boolean().optional().default(true),

  email: z
    .string()
    .optional()
    .default("")
    .transform((val) => cleanString(val).toLowerCase())
    .refine((val) => !val || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val), {
      message: "Invalid email address format.",
    }),

  password: z.string().optional().default(""),
};

const createDriverSchema = z
  .object(baseDriverFields)
  .superRefine((data, ctx) => {
    if (data.email && (!data.password || data.password.length < 6)) {
      ctx.addIssue({
        code: "custom",
        path: ["password"],
        message:
          "A password of at least 6 characters is required when creating a driver login account.",
      });
    }
  });

const updateDriverSchema = z
  .object(baseDriverFields)
  .superRefine((data, ctx) => {
    if (data.password && data.password.length > 0 && data.password.length < 6) {
      ctx.addIssue({
        code: "custom",
        path: ["password"],
        message: "Password must be at least 6 characters long.",
      });
    }
  });

const toggleAvailabilitySchema = z.object({
  isAvailable: z.boolean().optional(),
});

const assignTaskSchema = z.object({
  appointmentId: z
    .string({ message: "appointmentId is required." })
    .regex(OBJECT_ID_REGEX, { message: "Valid appointmentId is required." }),
  note: z
    .string()
    .optional()
    .default("")
    .transform((val) => cleanString(val).slice(0, 250)),
});

const updateTaskStatusSchema = z.object({
  pickupStatus: z.enum(
    [
      "Pending Assignment",
      "Driver Assigned",
      "En Route to Pickup",
      "Vehicle Picked Up",
      "Delivered to Workshop",
      "Out for Return Delivery",
      "Delivered to Customer",
      "Cancelled",
    ],
    {
      message: "Invalid pickup status selected.",
    },
  ),
  note: z
    .string()
    .optional()
    .default("")
    .transform((val) => cleanString(val).slice(0, 250)),
});

// Helper to extract the readable error message from a ZodError
function formatZodError(error) {
  const issues = error?.issues || error?.errors || [];
  if (issues.length > 0) {
    return issues.map((i) => i.message).join(", ");
  }
  return "Invalid input data.";
}

module.exports = {
  OBJECT_ID_REGEX,
  createDriverSchema,
  updateDriverSchema,
  toggleAvailabilitySchema,
  assignTaskSchema,
  updateTaskStatusSchema,
  formatZodError,
};
