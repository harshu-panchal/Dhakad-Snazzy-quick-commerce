import mongoose, { Schema, Document } from "mongoose";

export interface IBannerMedia {
  _id?: mongoose.Types.ObjectId;
  type: "image" | "video";
  mediaUrl: string;
  thumbnailUrl?: string;
  title?: string;
  subtitle?: string;
  link?: string;
  buttonText?: string;
  order: number;
  isActive: boolean;
}

export interface IPromoStrip extends Document {
  headerCategorySlug: string; // Links to HeaderCategory slug (e.g., "all", "grocery", "fashion")
  banners: IBannerMedia[]; // Carousel banners and videos
  heading?: string; // Optional e.g., "HOUSEFULL SALE"
  saleText?: string; // Optional e.g., "SALE"
  startDate?: Date; // Sale start date
  endDate?: Date; // Sale end date
  categoryCards?: Array<{
    categoryId: mongoose.Types.ObjectId; // Reference to Category
    title: string; // Custom title for the card
    badge: string; // e.g., "Up to 55% OFF"
    discountPercentage: number; // Discount percentage (0-100)
    order: number; // Display order
  }>;
  featuredProducts?: mongoose.Types.ObjectId[]; // Array of Product IDs for "CRAZY DEALS"
  crazyDealsTitle?: string; // Custom title for the CRAZY DEALS section
  isActive: boolean; // Enable/disable the PromoStrip
  order: number; // For sorting if multiple PromoStrips per category
  createdAt: Date;
  updatedAt: Date;
}

const BannerMediaSchema = new Schema(
  {
    type: {
      type: String,
      enum: ["image", "video"],
      default: "image",
    },
    mediaUrl: {
      type: String,
      required: true,
      trim: true,
    },
    thumbnailUrl: {
      type: String,
      trim: true,
      default: "",
    },
    title: {
      type: String,
      trim: true,
      default: "",
    },
    subtitle: {
      type: String,
      trim: true,
      default: "",
    },
    link: {
      type: String,
      trim: true,
      default: "",
    },
    buttonText: {
      type: String,
      trim: true,
      default: "Shop Now",
    },
    order: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { _id: true }
);

const PromoStripSchema = new Schema<IPromoStrip>(
  {
    headerCategorySlug: {
      type: String,
      required: [true, "Header category slug is required"],
      trim: true,
      lowercase: true,
    },
    banners: {
      type: [BannerMediaSchema],
      default: [],
    },
    heading: {
      type: String,
      trim: true,
      maxlength: [50, "Heading cannot exceed 50 characters"],
      default: "SPECIAL DEALS",
    },
    saleText: {
      type: String,
      trim: true,
      maxlength: [20, "Sale text cannot exceed 20 characters"],
      default: "SALE",
    },
    startDate: {
      type: Date,
      default: () => new Date(),
    },
    endDate: {
      type: Date,
      default: () => new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    },
    categoryCards: [
      {
        categoryId: {
          type: Schema.Types.ObjectId,
          ref: "Category",
          required: true,
        },
        title: {
          type: String,
          required: true,
          trim: true,
        },
        badge: {
          type: String,
          required: true,
          trim: true,
        },
        discountPercentage: {
          type: Number,
          required: true,
          min: [0, "Discount percentage cannot be negative"],
          max: [100, "Discount percentage cannot exceed 100"],
        },
        order: {
          type: Number,
          default: 0,
        },
      },
    ],
    featuredProducts: [
      {
        type: Schema.Types.ObjectId,
        ref: "Product",
      },
    ],
    crazyDealsTitle: {
      type: String,
      trim: true,
      maxlength: [30, "Crazy Deals title cannot exceed 30 characters"],
      default: "CRAZY DEALS",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    order: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for better query performance
// Compound index for the most common query: headerCategorySlug + isActive + date range
PromoStripSchema.index({ headerCategorySlug: 1, isActive: 1, startDate: 1, endDate: 1 });
PromoStripSchema.index({ order: 1 });

const PromoStrip = (mongoose.models.PromoStrip as mongoose.Model<IPromoStrip>) || mongoose.model<IPromoStrip>("PromoStrip", PromoStripSchema);

export default PromoStrip;

