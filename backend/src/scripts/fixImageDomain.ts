import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

import connectDB from "../config/db";

/**
 * Script to update all /uploads/ image URLs in MongoDB to use the target API server URL.
 * e.g. converts '/uploads/...' or 'https://dhakadsnazzy.com/uploads/...' 
 * to 'https://api.dhakadsnazzy.com/uploads/...'
 */
export async function updateImageUrlsDomain(targetDomain: string = "https://api.dhakadsnazzy.com") {
  console.log("\n=======================================================");
  console.log(` Updating Image URLs Domain to: ${targetDomain} `);
  console.log("=======================================================\n");

  if (mongoose.connection.readyState !== 1) {
    await connectDB();
  }

  const db = mongoose.connection.db;
  if (!db) {
    throw new Error("Failed to connect to MongoDB instance.");
  }

  const collections = await db.listCollections().toArray();
  const cleanTargetDomain = targetDomain.replace(/\/$/, "");

  let totalDocsUpdated = 0;
  let totalUrlsUpdated = 0;

  for (const colInfo of collections) {
    const colName = colInfo.name;
    if (colName.startsWith("system.")) continue;

    console.log(`Processing collection: ${colName}...`);
    let colDocsUpdated = 0;
    try {
      const col = db.collection(colName);
      // Query only documents that contain relative /uploads/ URLs
      const cursor = col.find({
        $or: [
          { image: { $regex: "/uploads/" } },
          { mainImage: { $regex: "/uploads/" } },
          { galleryImages: { $regex: "/uploads/" } },
          { icon: { $regex: "/uploads/" } },
          { bannerImage: { $regex: "/uploads/" } },
          { logo: { $regex: "/uploads/" } },
          { document: { $regex: "/uploads/" } },
          { documents: { $regex: "/uploads/" } },
          { subcategoryImage: { $regex: "/uploads/" } },
          { url: { $regex: "/uploads/" } },
        ],
      });

      for await (const doc of cursor) {
        let docModified = false;
        const updates: Record<string, any> = {};

        function processValue(val: any): any {
          if (!val) return val;

          if (typeof val === "string") {
            // Matches relative '/uploads/...' or wrong domain 'https://dhakadsnazzy.com/uploads/...' or 'http://localhost:5000/uploads/...'
            if (
              val.startsWith("/uploads/") ||
              (val.includes("/uploads/") && !val.startsWith(cleanTargetDomain))
            ) {
              const uploadIndex = val.indexOf("/uploads/");
              const uploadPath = val.substring(uploadIndex); // '/uploads/...'
              const newFullUrl = `${cleanTargetDomain}${uploadPath}`;

              if (newFullUrl !== val) {
                totalUrlsUpdated++;
                docModified = true;
                return newFullUrl;
              }
            }
            return val;
          }

          if (Array.isArray(val)) {
            let arrayModified = false;
            const newArray = val.map((item) => {
              const newItem = processValue(item);
              if (newItem !== item) arrayModified = true;
              return newItem;
            });
            if (arrayModified) docModified = true;
            return newArray;
          }

          if (
            typeof val === "object" &&
            val !== null &&
            !(val instanceof Date) &&
            !(val instanceof mongoose.Types.ObjectId) &&
            !val._bsontype &&
            !Buffer.isBuffer(val) &&
            (val.constructor?.name === "Object" || !val.constructor)
          ) {
            let objModified = false;
            const newObj: Record<string, any> = {};
            for (const key of Object.keys(val)) {
              const newVal = processValue(val[key]);
              newObj[key] = newVal;
              if (newVal !== val[key]) objModified = true;
            }
            if (objModified) docModified = true;
            return newObj;
          }

          return val;
        }

        for (const key of Object.keys(doc)) {
          if (key === "_id") continue;
          const updatedVal = processValue(doc[key]);
          if (updatedVal !== doc[key]) {
            updates[key] = updatedVal;
          }
        }

        if (docModified && Object.keys(updates).length > 0) {
          await col.updateOne({ _id: doc._id }, { $set: updates });
          colDocsUpdated++;
          totalDocsUpdated++;
        }
      }
      console.log(`Finished ${colName}: ${colDocsUpdated} documents updated.`);
    } catch (colErr: any) {
      console.error(`Error processing collection ${colName}:`, colErr?.message || colErr);
    }
  }

  console.log("=======================================================");
  console.log(` Total Documents Updated: ${totalDocsUpdated}`);
  console.log(` Total Image URLs Updated: ${totalUrlsUpdated}`);
  console.log("=======================================================\n");

  return { success: true, totalDocsUpdated, totalUrlsUpdated };
}

if (process.argv.some((arg) => arg.includes("fixImageDomain"))) {
  const domainArg =
    process.argv.find((a) => a.startsWith("http")) ||
    "https://api.dhakadsnazzy.com";
  updateImageUrlsDomain(domainArg)
    .then(() => {
      console.log("Finished domain URL update successfully.");
      process.exit(0);
    })
    .catch((err) => {
      console.error("Error updating image domain:", err?.stack || err);
      process.exit(1);
    });
}
