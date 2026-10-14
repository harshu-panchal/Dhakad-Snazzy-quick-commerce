import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "../../.env") });

import LowestPricesProduct from "../models/LowestPricesProduct";
import LowestPricesSection from "../models/LowestPricesSection";

async function migrate() {
    try {
        console.log("Connecting to MongoDB...");
        await mongoose.connect(process.env.MONGODB_URI || "");
        console.log("Connected successfully!");

        // 1. Fetch all legacy lowest prices products
        const legacyProducts = await LowestPricesProduct.find().sort({ order: 1 }).lean();
        console.log(`Found ${legacyProducts.length} legacy lowest prices products.`);

        // 2. Fetch existing sections
        const existingSections = await LowestPricesSection.find().lean();
        console.log(`Found ${existingSections.length} existing LowestPricesSection records.`);

        // 3. Prepare migrated product list
        const productsToMigrate = legacyProducts
            .filter((lp: any) => lp.product)
            .map((lp: any) => ({
                product: lp.product,
                order: lp.order ?? 0,
                isActive: lp.isActive !== undefined ? lp.isActive : true,
            }));

        // 4. Check if a Biaora section already exists
        let biaoraSection = await LowestPricesSection.findOne({
            city: { $regex: /^biaora$/i }
        });

        if (biaoraSection) {
            console.log(`Found existing Biaora section: "${biaoraSection.title}" with ${biaoraSection.products.length} products.`);
            // Merge products without duplicates
            const existingProdIds = new Set(biaoraSection.products.map((p: any) => p.product.toString()));
            let addedCount = 0;
            for (const item of productsToMigrate) {
                if (!existingProdIds.has(item.product.toString())) {
                    biaoraSection.products.push(item as any);
                    addedCount++;
                }
            }
            await biaoraSection.save();
            console.log(`Updated Biaora section with ${addedCount} newly merged products.`);
        } else {
            // Check if there is an "All Cities" section created earlier that we can update or convert to Biaora
            const allCitiesSection = await LowestPricesSection.findOne({
                city: { $regex: /^all cities$/i }
            });

            if (allCitiesSection && allCitiesSection.products.length > 0) {
                console.log(`Found "All Cities" section with ${allCitiesSection.products.length} products. Updating its city to "Biaora"...`);
                allCitiesSection.city = "Biaora";
                allCitiesSection.title = "LOWEST PRICES EVER";
                await allCitiesSection.save();
                biaoraSection = allCitiesSection;
                console.log(`Successfully converted "All Cities" section to "Biaora"!`);
            } else {
                console.log(`Creating new LowestPricesSection for Biaora...`);
                biaoraSection = new LowestPricesSection({
                    title: "LOWEST PRICES EVER",
                    city: "Biaora",
                    order: 0,
                    isActive: true,
                    products: productsToMigrate,
                });
                await biaoraSection.save();
                console.log(`Created new Biaora section with ${productsToMigrate.length} products!`);
            }
        }

        // Print final status
        const allFinalSections = await LowestPricesSection.find().lean();
        console.log("\n=== Current LowestPricesSection in Database ===");
        allFinalSections.forEach((s: any, idx: number) => {
            console.log(`${idx + 1}. Title: "${s.title}", City: "${s.city}", Products: ${s.products?.length || 0}, Active: ${s.isActive}`);
        });

        await mongoose.disconnect();
        console.log("\nMigration completed successfully.");
    } catch (err) {
        console.error("Migration error:", err);
        process.exit(1);
    }
}

migrate();
