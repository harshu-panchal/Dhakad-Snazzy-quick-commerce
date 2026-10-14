import mongoose, { Schema, Document } from "mongoose";

export interface ILowestPricesSectionProduct {
    product: mongoose.Types.ObjectId;
    order: number;
    isActive: boolean;
}

export interface ILowestPricesSection extends Document {
    title: string;
    city: string; // "All Cities" or specific city name like "Indore", "Bhopal"
    order: number;
    isActive: boolean;
    products: ILowestPricesSectionProduct[];
    createdAt: Date;
    updatedAt: Date;
}

const LowestPricesSectionProductSchema = new Schema<ILowestPricesSectionProduct>(
    {
        product: {
            type: Schema.Types.ObjectId,
            ref: "Product",
            required: [true, "Product is required"],
        },
        order: {
            type: Number,
            required: [true, "Display order is required"],
            default: 0,
            min: [0, "Order cannot be negative"],
        },
        isActive: {
            type: Boolean,
            default: true,
        },
    },
    { _id: true }
);

const LowestPricesSectionSchema = new Schema<ILowestPricesSection>(
    {
        title: {
            type: String,
            required: [true, "Section title is required"],
            trim: true,
            default: "LOWEST PRICES EVER",
            maxlength: [100, "Title cannot exceed 100 characters"],
        },
        city: {
            type: String,
            required: [true, "Target location/city is required"],
            trim: true,
            default: "All Cities",
        },
        order: {
            type: Number,
            required: [true, "Display order is required"],
            default: 0,
            min: [0, "Order cannot be negative"],
        },
        isActive: {
            type: Boolean,
            default: true,
        },
        products: {
            type: [LowestPricesSectionProductSchema],
            default: [],
        },
    },
    {
        timestamps: true,
    }
);

// Indexes for query performance
LowestPricesSectionSchema.index({ city: 1, isActive: 1, order: 1 });
LowestPricesSectionSchema.index({ isActive: 1, order: 1 });

const LowestPricesSection =
    (mongoose.models.LowestPricesSection as mongoose.Model<ILowestPricesSection>) ||
    mongoose.model<ILowestPricesSection>("LowestPricesSection", LowestPricesSectionSchema);

export default LowestPricesSection;
