import { Request, Response } from "express";
import Seller from "../../../models/Seller";
import Product from "../../../models/Product";
import Category from "../../../models/Category";
import mongoose from "mongoose";
import { calculateDistance } from "../../../utils/locationHelper";

/**
 * Helper to estimate delivery time based on distance in km
 */
function estimateDeliveryTime(distanceKm: number): string {
  if (distanceKm <= 2) return "10-15 mins";
  if (distanceKm <= 5) return "15-25 mins";
  if (distanceKm <= 10) return "25-35 mins";
  if (distanceKm <= 20) return "35-50 mins";
  return "45-60 mins";
}

/**
 * Format distance cleanly (e.g. 800 m or 1.5 km)
 */
function formatDistance(distanceKm: number): string {
  if (distanceKm < 1) {
    return `${Math.round(distanceKm * 1000)} m`;
  }
  return `${distanceKm.toFixed(1)} km`;
}

/**
 * Get nearby shops / stores for customer (Public)
 */
export const getNearbyShops = async (req: Request, res: Response) => {
  try {
    const {
      latitude,
      longitude,
      search,
      category,
      page = 1,
      limit = 20,
      openOnly,
    } = req.query;

    const userLat = latitude ? parseFloat(latitude as string) : null;
    const userLng = longitude ? parseFloat(longitude as string) : null;

    const hasUserLocation =
      userLat !== null &&
      userLng !== null &&
      !isNaN(userLat) &&
      !isNaN(userLng) &&
      userLat >= -90 &&
      userLat <= 90 &&
      userLng >= -180 &&
      userLng <= 180;

    // Base query for approved sellers
    const query: any = {
      status: "Approved",
      showInDiscovery: { $ne: false },
    };

    if (openOnly === "true") {
      query.isShopOpen = true;
    }

    if (search) {
      const searchRegex = new RegExp(search as string, "i");
      query.$or = [
        { storeName: searchRegex },
        { sellerName: searchRegex },
        { category: searchRegex },
        { categories: searchRegex },
        { storeDescription: searchRegex },
        { city: searchRegex },
        { address: searchRegex },
      ];
    }

    if (category && category !== "all") {
      const categoryRegex = new RegExp(category as string, "i");
      query.$or = [
        { category: categoryRegex },
        { categories: categoryRegex },
      ];
    }

    // Fetch candidate sellers
    const sellers = await Seller.find(query)
      .select(
        "_id storeName sellerName logo storeBanner address city category categories storeDescription workingHours isShopOpen latitude longitude location serviceRadiusKm viewCustomerDetails createdAt"
      )
      .lean();

    const resultShops: any[] = [];

    for (const seller of sellers) {
      let sellerLat: number | null = null;
      let sellerLng: number | null = null;

      // Extract coordinates
      if (
        seller.location &&
        seller.location.coordinates &&
        seller.location.coordinates.length === 2
      ) {
        sellerLng = seller.location.coordinates[0];
        sellerLat = seller.location.coordinates[1];
      } else if (seller.latitude && seller.longitude) {
        sellerLat = parseFloat(seller.latitude);
        sellerLng = parseFloat(seller.longitude);
      }

      let distanceKm: number | null = null;
      let isWithinRange = true;

      if (
        hasUserLocation &&
        sellerLat !== null &&
        sellerLng !== null &&
        !isNaN(sellerLat) &&
        !isNaN(sellerLng)
      ) {
        distanceKm = calculateDistance(userLat, userLng, sellerLat, sellerLng);
        const radius = seller.serviceRadiusKm || 10;
        if (distanceKm > radius) {
          isWithinRange = false;
        }
      }

      // Skip sellers that are out of user radius when user location is provided
      if (hasUserLocation && !isWithinRange) {
        continue;
      }

      // Check seller view customer details setting
      const storeName = seller.storeName || seller.sellerName || "Local Store";

      // Fetch preview products for this seller
      const previewProducts = await Product.find({
        seller: seller._id,
        status: "Active",
        publish: true,
      })
        .select("productName mainImage price discPrice compareAtPrice rating")
        .sort({ createdAt: -1 })
        .limit(4)
        .lean();

      // Count total active products
      const productCount = await Product.countDocuments({
        seller: seller._id,
        status: "Active",
        publish: true,
      });

      // Compute average rating from preview products or default rating
      const ratingsArr = previewProducts.map((p) => p.rating || 0).filter((r) => r > 0);
      const avgRating =
        ratingsArr.length > 0
          ? (ratingsArr.reduce((a, b) => a + b, 0) / ratingsArr.length).toFixed(1)
          : "4.2";

      resultShops.push({
        id: seller._id.toString(),
        sellerId: seller._id.toString(),
        storeName,
        logo: seller.logo || seller.storeBanner || "",
        storeBanner: seller.storeBanner || seller.logo || "",
        category: seller.category || "General Store",
        categories: seller.categories || [],
        storeDescription: seller.storeDescription || "",
        address: seller.address || "",
        city: seller.city || "",
        isShopOpen: seller.isShopOpen ?? true,
        workingHours: seller.workingHours || null,
        distanceKm: distanceKm !== null ? Number(distanceKm.toFixed(1)) : null,
        distanceText: distanceKm !== null ? formatDistance(distanceKm) : "Nearby",
        deliveryTimeText: distanceKm !== null ? estimateDeliveryTime(distanceKm) : "15-25 mins",
        rating: Number(avgRating),
        productCount,
        previewProducts: previewProducts.map((p) => ({
          id: p._id.toString(),
          name: p.productName,
          image: p.mainImage,
          price: p.price,
          discPrice: p.discPrice || 0,
        })),
      });
    }

    // Sort by distance if location available, else sort by product count / open status
    if (hasUserLocation) {
      resultShops.sort((a, b) => {
        // Open shops first
        if (a.isShopOpen !== b.isShopOpen) return a.isShopOpen ? -1 : 1;
        // Then by distance
        return (a.distanceKm || 0) - (b.distanceKm || 0);
      });
    } else {
      resultShops.sort((a, b) => {
        if (a.isShopOpen !== b.isShopOpen) return a.isShopOpen ? -1 : 1;
        return b.productCount - a.productCount;
      });
    }

    // Manual pagination
    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.max(1, Number(limit));
    const startIndex = (pageNum - 1) * limitNum;
    const paginatedShops = resultShops.slice(startIndex, startIndex + limitNum);

    return res.status(200).json({
      success: true,
      data: paginatedShops,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: resultShops.length,
        pages: Math.ceil(resultShops.length / limitNum),
      },
    });
  } catch (error: any) {
    console.error("Error in getNearbyShops:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching nearby shops",
      error: error.message,
    });
  }
};

/**
 * Get shop details by seller ID (Public)
 */
export const getShopDetails = async (req: Request, res: Response) => {
  try {
    const { sellerId } = req.params;
    const { latitude, longitude } = req.query;

    if (!mongoose.Types.ObjectId.isValid(sellerId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid seller ID",
      });
    }

    const seller = await Seller.findOne({
      _id: sellerId,
      status: "Approved",
    })
      .select(
        "_id storeName sellerName logo storeBanner address city category categories storeDescription workingHours isShopOpen fssaiLicNo latitude longitude location serviceRadiusKm viewCustomerDetails"
      )
      .lean();

    if (!seller) {
      return res.status(404).json({
        success: false,
        message: "Shop not found or inactive",
      });
    }

    // Distance calculation
    const userLat = latitude ? parseFloat(latitude as string) : null;
    const userLng = longitude ? parseFloat(longitude as string) : null;
    let distanceKm: number | null = null;

    let sellerLat: number | null = null;
    let sellerLng: number | null = null;

    if (seller.location?.coordinates?.length === 2) {
      sellerLng = seller.location.coordinates[0];
      sellerLat = seller.location.coordinates[1];
    } else if (seller.latitude && seller.longitude) {
      sellerLat = parseFloat(seller.latitude);
      sellerLng = parseFloat(seller.longitude);
    }

    if (
      userLat !== null &&
      userLng !== null &&
      !isNaN(userLat) &&
      !isNaN(userLng) &&
      sellerLat !== null &&
      sellerLng !== null &&
      !isNaN(sellerLat) &&
      !isNaN(sellerLng)
    ) {
      distanceKm = calculateDistance(userLat, userLng, sellerLat, sellerLng);
    }

    // Fetch categories of products available in this store
    const productsInStore = await Product.find({
      seller: seller._id,
      status: "Active",
      publish: true,
    })
      .select("category subcategory rating")
      .populate("category", "name icon image slug")
      .populate("subcategory", "name slug")
      .lean();

    // Extract unique categories
    const categoriesMap = new Map<string, any>();
    let totalRatings = 0;
    let ratingsCount = 0;

    productsInStore.forEach((p: any) => {
      if (p.rating && p.rating > 0) {
        totalRatings += p.rating;
        ratingsCount++;
      }

      if (p.category && typeof p.category === "object" && p.category._id) {
        const catId = p.category._id.toString();
        if (!categoriesMap.has(catId)) {
          categoriesMap.set(catId, {
            id: catId,
            name: p.category.name,
            icon: p.category.icon || "",
            image: p.category.image || "",
            slug: p.category.slug || catId,
          });
        }
      }
    });

    const storeCategories = Array.from(categoriesMap.values());
    const avgRating = ratingsCount > 0 ? (totalRatings / ratingsCount).toFixed(1) : "4.2";

    const storeName = seller.storeName || seller.sellerName || "Local Store";

    return res.status(200).json({
      success: true,
      data: {
        id: seller._id.toString(),
        sellerId: seller._id.toString(),
        storeName,
        logo: seller.logo || seller.storeBanner || "",
        storeBanner: seller.storeBanner || seller.logo || "",
        category: seller.category || "General Store",
        categories: seller.categories || [],
        storeDescription: seller.storeDescription || "",
        address: seller.address || "",
        city: seller.city || "",
        fssaiLicNo: seller.fssaiLicNo || "",
        isShopOpen: seller.isShopOpen ?? true,
        workingHours: seller.workingHours || null,
        distanceKm: distanceKm !== null ? Number(distanceKm.toFixed(1)) : null,
        distanceText: distanceKm !== null ? formatDistance(distanceKm) : "Nearby",
        deliveryTimeText: distanceKm !== null ? estimateDeliveryTime(distanceKm) : "15-25 mins",
        rating: Number(avgRating),
        productCount: productsInStore.length,
        storeCategories,
      },
    });
  } catch (error: any) {
    console.error("Error in getShopDetails:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching shop details",
      error: error.message,
    });
  }
};

/**
 * Get products for a specific seller / shop (Public)
 */
export const getShopProducts = async (req: Request, res: Response) => {
  try {
    const { sellerId } = req.params;
    const {
      category,
      subcategory,
      search,
      sort,
      page = 1,
      limit = 20,
    } = req.query;

    if (!mongoose.Types.ObjectId.isValid(sellerId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid seller ID",
      });
    }

    const query: any = {
      seller: new mongoose.Types.ObjectId(sellerId),
      status: "Active",
      publish: true,
    };

    if (category && category !== "all") {
      if (mongoose.Types.ObjectId.isValid(category as string)) {
        query.category = new mongoose.Types.ObjectId(category as string);
      } else {
        const catDoc = await Category.findOne({ slug: category as string }).select("_id");
        if (catDoc) {
          query.category = catDoc._id;
        }
      }
    }

    if (subcategory) {
      if (mongoose.Types.ObjectId.isValid(subcategory as string)) {
        query.subcategory = new mongoose.Types.ObjectId(subcategory as string);
      }
    }

    if (search) {
      const searchRegex = new RegExp(search as string, "i");
      query.$or = [
        { productName: searchRegex },
        { tags: searchRegex },
        { smallDescription: searchRegex },
      ];
    }

    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.max(1, Number(limit));
    const skip = (pageNum - 1) * limitNum;

    let sortOptions: any = { createdAt: -1 };
    if (sort === "price_asc") sortOptions = { price: 1 };
    if (sort === "price_desc") sortOptions = { price: -1 };
    if (sort === "discount") sortOptions = { discount: -1 };
    if (sort === "popular") sortOptions = { popular: -1, rating: -1 };

    const products = await Product.find(query)
      .populate("category", "name slug")
      .populate("subcategory", "name")
      .populate("seller", "storeName sellerName viewCustomerDetails")
      .sort(sortOptions)
      .skip(skip)
      .limit(limitNum);

    const total = await Product.countDocuments(query);

    return res.status(200).json({
      success: true,
      data: products,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (error: any) {
    console.error("Error in getShopProducts:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching shop products",
      error: error.message,
    });
  }
};
