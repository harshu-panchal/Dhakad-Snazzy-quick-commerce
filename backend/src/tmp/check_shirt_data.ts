import mongoose from 'mongoose';
import Product from '../models/Product';
import dotenv from 'dotenv';
dotenv.config();

async function checkShirt() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/dhakad-snazzy');
  const products = await Product.find({ 
    productName: { $regex: /Shirt/i } 
  }).lean();
  
  console.log(JSON.stringify(products, null, 2));
  await mongoose.disconnect();
}

checkShirt();
