import mongoose from 'mongoose';
import Product from '../models/Product';
import dotenv from 'dotenv';
dotenv.config();

async function checkProducts() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/dhakad-snazzy');
  const products = await Product.find({ 
    productName: { $in: ['iD Instant Coffee Powder', 'Continental Xtra Instant Coffee', 'Tata Tea Agni Special Blend Tea'] } 
  }).lean();
  
  console.log(JSON.stringify(products, null, 2));
  await mongoose.disconnect();
}

checkProducts();
