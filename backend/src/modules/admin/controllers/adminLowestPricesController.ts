import { Request, Response } from "express";
import LowestPricesSection from "../../../models/LowestPricesSection";
import LowestPricesProduct from "../../../models/LowestPricesProduct";
import Product from "../../../models/Product";
import Seller from "../../../models/Seller";
import DeliveryArea from "../../../models/DeliveryArea";
import mongoose from "mongoose";

/**
 * Get all serviceable cities from Sellers, Delivery Areas, and existing sections
 */
export const getServiceableCities = async (_req: Request, res: Response) => {
    try {
        const [sellerCities, deliveryCities, sectionCities] = await Promise.all([
            Seller.distinct("city"),
            DeliveryArea.distinct("city"),
            LowestPricesSection.distinct("city"),
        ]);

        const rawCities = [...sellerCities, ...deliveryCities, ...sectionCities];
        const citySet = new Set<string>();

        // Always include "All Cities" as the global option
        citySet.add("All Cities");

        rawCities.forEach((city) => {
            if (typeof city === "string") {
                const trimmed = city.trim();
                if (trimmed && trimmed.toLowerCase() !== "all cities" && trimmed.toLowerCase() !== "all") {
                    citySet.add(trimmed);
                }
            }
        });

        const sortedCities = Array.from(citySet).sort((a, b) => {
            if (a === "All Cities") return -1;
            if (b === "All Cities") return 1;
            return a.localeCompare(b);
        });

        return res.status(200).json({
            success: true,
            data: sortedCities,
        });
    } catch (error: any) {
        return res.status(500).json({
            success: false,
            message: "Error fetching serviceable cities",
            error: error.message,
        });
    }
};

/**
 * Get all Lowest Prices sections with populated product details
 */
export const getLowestPricesSections = async (req: Request, res: Response) => {
    try {
        const { city } = req.query;

        // Auto-migration check: If no LowestPricesSection exists, check for legacy LowestPricesProduct
        const sectionCount = await LowestPricesSection.countDocuments();
        if (sectionCount === 0) {
            const legacyProducts = await LowestPricesProduct.find().sort({ order: 1 }).lean();
            if (legacyProducts.length > 0) {
                const migratedProducts = legacyProducts
                    .filter((lp: any) => lp.product)
                    .map((lp: any) => ({
                        product: lp.product,
                        order: lp.order ?? 0,
                        isActive: lp.isActive !== undefined ? lp.isActive : true,
                    }));

                const defaultSection = new LowestPricesSection({
                    title: "LOWEST PRICES EVER",
                    city: "All Cities",
                    order: 0,
                    isActive: true,
                    products: migratedProducts,
                });
                await defaultSection.save();
            }
        }

        const filter: any = {};
        if (city && typeof city === "string" && city !== "All") {
            filter.city = { $regex: new RegExp(`^${city}$`, "i") };
        }

        const sections = await LowestPricesSection.find(filter)
            .populate({
                path: "products.product",
                select: "productName mainImage price discPrice compareAtPrice mrp discount status publish seller variations",
                populate: [
                    { path: "seller", select: "storeName sellerName viewCustomerDetails" },
                ],
            })
            .sort({ order: 1, createdAt: -1 })
            .lean();

        return res.status(200).json({
            success: true,
            data: sections,
        });
    } catch (error: any) {
        return res.status(500).json({
            success: false,
            message: "Error fetching lowest prices sections",
            error: error.message,
        });
    }
};

/**
 * Get single Lowest Prices section by ID
 */
export const getLowestPricesSectionById = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid section ID",
            });
        }

        const section = await LowestPricesSection.findById(id)
            .populate({
                path: "products.product",
                select: "productName mainImage price discPrice compareAtPrice mrp discount status publish seller variations",
                populate: [
                    { path: "seller", select: "storeName sellerName viewCustomerDetails" },
                ],
            })
            .lean();

        if (!section) {
            return res.status(404).json({
                success: false,
                message: "Lowest prices section not found",
            });
        }

        return res.status(200).json({
            success: true,
            data: section,
        });
    } catch (error: any) {
        return res.status(500).json({
            success: false,
            message: "Error fetching lowest prices section",
            error: error.message,
        });
    }
};

/**
 * Create a new Lowest Prices section
 */
export const createLowestPricesSection = async (req: Request, res: Response) => {
    try {
        const { title, city, order, isActive } = req.body;

        if (!city || typeof city !== "string" || !city.trim()) {
            return res.status(400).json({
                success: false,
                message: "City / Location is required",
            });
        }

        let sectionOrder = order;
        if (sectionOrder === undefined || sectionOrder === null) {
            const maxOrderSection = await LowestPricesSection.findOne().sort({ order: -1 }).lean();
            sectionOrder = maxOrderSection ? maxOrderSection.order + 1 : 0;
        }

        const newSection = new LowestPricesSection({
            title: title && title.trim() ? title.trim() : "LOWEST PRICES EVER",
            city: city.trim(),
            order: sectionOrder,
            isActive: isActive !== undefined ? isActive : true,
            products: [],
        });

        await newSection.save();

        return res.status(201).json({
            success: true,
            message: "Lowest prices section created successfully",
            data: newSection,
        });
    } catch (error: any) {
        return res.status(500).json({
            success: false,
            message: "Error creating lowest prices section",
            error: error.message,
        });
    }
};

/**
 * Update Lowest Prices section details (title, city, order, isActive)
 */
export const updateLowestPricesSection = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { title, city, order, isActive } = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid section ID",
            });
        }

        const section = await LowestPricesSection.findById(id);
        if (!section) {
            return res.status(404).json({
                success: false,
                message: "Lowest prices section not found",
            });
        }

        if (title !== undefined) section.title = title.trim();
        if (city !== undefined) section.city = city.trim();
        if (order !== undefined) section.order = order;
        if (isActive !== undefined) section.isActive = isActive;

        await section.save();

        const updated = await LowestPricesSection.findById(id)
            .populate({
                path: "products.product",
                select: "productName mainImage price discPrice compareAtPrice mrp discount status publish seller variations",
                populate: [
                    { path: "seller", select: "storeName sellerName viewCustomerDetails" },
                ],
            })
            .lean();

        return res.status(200).json({
            success: true,
            message: "Section updated successfully",
            data: updated,
        });
    } catch (error: any) {
        return res.status(500).json({
            success: false,
            message: "Error updating lowest prices section",
            error: error.message,
        });
    }
};

/**
 * Delete a Lowest Prices section
 */
export const deleteLowestPricesSection = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid section ID",
            });
        }

        const deleted = await LowestPricesSection.findByIdAndDelete(id);
        if (!deleted) {
            return res.status(404).json({
                success: false,
                message: "Section not found",
            });
        }

        return res.status(200).json({
            success: true,
            message: "Section deleted successfully",
        });
    } catch (error: any) {
        return res.status(500).json({
            success: false,
            message: "Error deleting section",
            error: error.message,
        });
    }
};

/**
 * Add a product to a Lowest Prices section
 */
export const addProductToSection = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { product, order, isActive } = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid section ID",
            });
        }

        if (!product || !mongoose.Types.ObjectId.isValid(product)) {
            return res.status(400).json({
                success: false,
                message: "Valid product ID is required",
            });
        }

        const [section, productExists] = await Promise.all([
            LowestPricesSection.findById(id),
            Product.findById(product),
        ]);

        if (!section) {
            return res.status(404).json({
                success: false,
                message: "Section not found",
            });
        }

        if (!productExists) {
            return res.status(404).json({
                success: false,
                message: "Product not found",
            });
        }

        // Check if product is already added to this section
        const alreadyExists = section.products.some(
            (p) => p.product.toString() === product.toString()
        );

        if (alreadyExists) {
            return res.status(400).json({
                success: false,
                message: "Product already exists in this section",
            });
        }

        // Determine product order
        let productOrder = order;
        if (productOrder === undefined || productOrder === null) {
            const maxOrder = section.products.reduce((max, p) => (p.order > max ? p.order : max), -1);
            productOrder = maxOrder + 1;
        }

        section.products.push({
            product: new mongoose.Types.ObjectId(product),
            order: productOrder,
            isActive: isActive !== undefined ? isActive : true,
        } as any);

        // Sort products by order
        section.products.sort((a, b) => a.order - b.order);

        await section.save();

        const updated = await LowestPricesSection.findById(id)
            .populate({
                path: "products.product",
                select: "productName mainImage price discPrice compareAtPrice mrp discount status publish seller variations",
                populate: [
                    { path: "seller", select: "storeName sellerName viewCustomerDetails" },
                ],
            })
            .lean();

        return res.status(200).json({
            success: true,
            message: "Product added to section successfully",
            data: updated,
        });
    } catch (error: any) {
        return res.status(500).json({
            success: false,
            message: "Error adding product to section",
            error: error.message,
        });
    }
};

/**
 * Update a product's order or active status within a section
 */
export const updateSectionProduct = async (req: Request, res: Response) => {
    try {
        const { id, productId } = req.params;
        const { order, isActive } = req.body;

        if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(productId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid section or product ID",
            });
        }

        const section = await LowestPricesSection.findById(id);
        if (!section) {
            return res.status(404).json({
                success: false,
                message: "Section not found",
            });
        }

        const targetProduct = section.products.find(
            (p) => p.product.toString() === productId.toString() || (p as any)._id?.toString() === productId.toString()
        );

        if (!targetProduct) {
            return res.status(404).json({
                success: false,
                message: "Product not found in this section",
            });
        }

        if (order !== undefined) targetProduct.order = order;
        if (isActive !== undefined) targetProduct.isActive = isActive;

        section.products.sort((a, b) => a.order - b.order);

        await section.save();

        const updated = await LowestPricesSection.findById(id)
            .populate({
                path: "products.product",
                select: "productName mainImage price discPrice compareAtPrice mrp discount status publish seller variations",
                populate: [
                    { path: "seller", select: "storeName sellerName viewCustomerDetails" },
                ],
            })
            .lean();

        return res.status(200).json({
            success: true,
            message: "Product updated in section successfully",
            data: updated,
        });
    } catch (error: any) {
        return res.status(500).json({
            success: false,
            message: "Error updating product in section",
            error: error.message,
        });
    }
};

/**
 * Remove a product from a Lowest Prices section
 */
export const removeProductFromSection = async (req: Request, res: Response) => {
    try {
        const { id, productId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(productId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid section or product ID",
            });
        }

        const section = await LowestPricesSection.findById(id);
        if (!section) {
            return res.status(404).json({
                success: false,
                message: "Section not found",
            });
        }

        section.products = section.products.filter(
            (p) => p.product.toString() !== productId.toString() && (p as any)._id?.toString() !== productId.toString()
        );

        await section.save();

        const updated = await LowestPricesSection.findById(id)
            .populate({
                path: "products.product",
                select: "productName mainImage price discPrice compareAtPrice mrp discount status publish seller variations",
                populate: [
                    { path: "seller", select: "storeName sellerName viewCustomerDetails" },
                ],
            })
            .lean();

        return res.status(200).json({
            success: true,
            message: "Product removed from section successfully",
            data: updated,
        });
    } catch (error: any) {
        return res.status(500).json({
            success: false,
            message: "Error removing product from section",
            error: error.message,
        });
    }
};

/**
 * Reorder products inside a section
 */
export const reorderSectionProducts = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { products } = req.body; // Array of { id: productId, order: number }

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid section ID",
            });
        }

        if (!Array.isArray(products)) {
            return res.status(400).json({
                success: false,
                message: "Products must be an array of { id, order }",
            });
        }

        const section = await LowestPricesSection.findById(id);
        if (!section) {
            return res.status(404).json({
                success: false,
                message: "Section not found",
            });
        }

        const orderMap = new Map<string, number>();
        products.forEach(({ id: pId, order }) => {
            orderMap.set(pId.toString(), order);
        });

        section.products.forEach((item) => {
            const key1 = item.product.toString();
            const key2 = (item as any)._id?.toString();
            if (orderMap.has(key1)) {
                item.order = orderMap.get(key1)!;
            } else if (key2 && orderMap.has(key2)) {
                item.order = orderMap.get(key2)!;
            }
        });

        section.products.sort((a, b) => a.order - b.order);

        await section.save();

        const updated = await LowestPricesSection.findById(id)
            .populate({
                path: "products.product",
                select: "productName mainImage price discPrice compareAtPrice mrp discount status publish seller variations",
                populate: [
                    { path: "seller", select: "storeName sellerName viewCustomerDetails" },
                ],
            })
            .lean();

        return res.status(200).json({
            success: true,
            message: "Products reordered successfully",
            data: updated,
        });
    } catch (error: any) {
        return res.status(500).json({
            success: false,
            message: "Error reordering products in section",
            error: error.message,
        });
    }
};

// ============================================================================
// Legacy compatibility handlers for /lowest-prices-products endpoints
// ============================================================================

export const getLowestPricesProducts = async (_req: Request, res: Response) => {
    try {
        const products = await LowestPricesProduct.find()
            .populate("product", "productName mainImage price mrp discount status publish")
            .sort({ order: 1 })
            .lean();

        return res.status(200).json({
            success: true,
            data: products,
        });
    } catch (error: any) {
        return res.status(500).json({
            success: false,
            message: "Error fetching lowest prices products",
            error: error.message,
        });
    }
};

export const getLowestPricesProductById = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: "Invalid product ID" });
        }
        const lowestPricesProduct = await LowestPricesProduct.findById(id)
            .populate("product", "productName mainImage price mrp discount status publish")
            .lean();

        if (!lowestPricesProduct) {
            return res.status(404).json({ success: false, message: "Lowest prices product not found" });
        }
        return res.status(200).json({ success: true, data: lowestPricesProduct });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: "Error fetching lowest prices product", error: error.message });
    }
};

export const createLowestPricesProduct = async (req: Request, res: Response) => {
    try {
        const { product, order, isActive } = req.body;
        if (!product || !mongoose.Types.ObjectId.isValid(product)) {
            return res.status(400).json({ success: false, message: "Valid Product is required" });
        }
        const existing = await LowestPricesProduct.findOne({ product });
        if (existing) {
            return res.status(400).json({ success: false, message: "Product already exists in lowest prices section" });
        }
        let productOrder = order;
        if (productOrder === undefined || productOrder === null) {
            const maxOrderProduct = await LowestPricesProduct.findOne().sort({ order: -1 }).lean();
            productOrder = maxOrderProduct ? maxOrderProduct.order + 1 : 0;
        }
        const newLowestPricesProduct = new LowestPricesProduct({
            product,
            order: productOrder,
            isActive: isActive !== undefined ? isActive : true,
        });
        await newLowestPricesProduct.save();
        const populated = await LowestPricesProduct.findById(newLowestPricesProduct._id)
            .populate("product", "productName mainImage price mrp discount status publish")
            .lean();
        return res.status(201).json({ success: true, message: "Product added successfully", data: populated });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: "Error adding product", error: error.message });
    }
};

export const updateLowestPricesProduct = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { order, isActive } = req.body;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: "Invalid product ID" });
        }
        const lowestPricesProduct = await LowestPricesProduct.findById(id);
        if (!lowestPricesProduct) {
            return res.status(404).json({ success: false, message: "Lowest prices product not found" });
        }
        if (order !== undefined) lowestPricesProduct.order = order;
        if (isActive !== undefined) lowestPricesProduct.isActive = isActive;
        await lowestPricesProduct.save();
        const updated = await LowestPricesProduct.findById(id)
            .populate("product", "productName mainImage price mrp discount status publish")
            .lean();
        return res.status(200).json({ success: true, message: "Updated successfully", data: updated });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: "Error updating product", error: error.message });
    }
};

export const deleteLowestPricesProduct = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: "Invalid product ID" });
        }
        const deleted = await LowestPricesProduct.findByIdAndDelete(id);
        if (!deleted) {
            return res.status(404).json({ success: false, message: "Product not found" });
        }
        return res.status(200).json({ success: true, message: "Product removed successfully" });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: "Error removing product", error: error.message });
    }
};

export const reorderLowestPricesProducts = async (req: Request, res: Response) => {
    try {
        const { products } = req.body;
        if (!Array.isArray(products)) {
            return res.status(400).json({ success: false, message: "Products must be an array" });
        }
        const updatePromises = products.map(({ id, order }: { id: string; order: number }) =>
            LowestPricesProduct.findByIdAndUpdate(id, { order }, { new: true })
        );
        await Promise.all(updatePromises);
        const updatedProducts = await LowestPricesProduct.find()
            .populate("product", "productName mainImage price mrp discount status publish")
            .sort({ order: 1 })
            .lean();
        return res.status(200).json({ success: true, message: "Products reordered successfully", data: updatedProducts });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: "Error reordering products", error: error.message });
    }
};
