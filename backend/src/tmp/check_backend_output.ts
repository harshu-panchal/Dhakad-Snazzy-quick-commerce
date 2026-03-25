import mongoose from 'mongoose';
import Product from '../models/Product';
import HomeSection from '../models/HomeSection';
import Category from '../models/Category'; // Need to register Category
import dotenv from 'dotenv';
dotenv.config();

async function checkHomeContent() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/dhakad-snazzy');
  
  // Just check products directly with the select I used
  const result = await Product.find({ 
    status: "Active",
    publish: true,
  })
  .sort({ createdAt: -1 })
  .select("productName mainImage price discPrice compareAtPrice mrp discount rating reviewsCount pack seller variations")
  .lean();

  const sample = result.filter(p => p.productName.includes("Coffee") || p.productName.includes("Tea")).slice(0, 5);
  
  // Apply the same mapping as the controller
  const mapped = sample.map((p: any) => ({
    name: p.productName,
    price: p.price,
    discPrice: p.discPrice || 0,
    compareAtPrice: p.compareAtPrice || 0,
    mrp: p.compareAtPrice || p.mrp || p.price || 0,
    discount: p.discount || (p.mrp && p.price ? Math.round(((p.mrp - p.price) / p.mrp) * 100) : 0),
  }));

  console.log(JSON.stringify(mapped, null, 2));
  await mongoose.disconnect();
}

checkHomeContent();
