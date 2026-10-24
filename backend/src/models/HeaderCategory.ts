import mongoose, { Schema, Document } from 'mongoose';

export interface IHeaderCategory extends Document {
    name: string;
    iconLibrary: string;
    iconName?: string;
    imageUrl?: string; // Optional custom image uploaded by admin; takes precedence over the icon when set
    slug: string;
    relatedCategory?: string; // Links to a product category
    order: number;
    status: 'Published' | 'Unpublished';
    isActive: boolean;
    codEnabled: boolean; // Whether Cash on Delivery is allowed for products under this header category
    createdAt: Date;
    updatedAt: Date;
}

const HeaderCategorySchema: Schema = new Schema(
    {
        name: { type: String, required: true },
        iconLibrary: { type: String, required: true },
        iconName: { type: String, required: false, default: '' },
        imageUrl: { type: String, required: false },
        slug: { type: String, required: true, unique: true },
        relatedCategory: { type: String, required: false },
        order: { type: Number, default: 0 },
        status: { type: String, enum: ['Published', 'Unpublished'], default: 'Published' },
        isActive: { type: Boolean, default: true },
        codEnabled: { type: Boolean, default: true },
    },
    { timestamps: true }
);

const HeaderCategory = (mongoose.models.HeaderCategory as mongoose.Model<IHeaderCategory>) || mongoose.model<IHeaderCategory>('HeaderCategory', HeaderCategorySchema);
export default HeaderCategory;
