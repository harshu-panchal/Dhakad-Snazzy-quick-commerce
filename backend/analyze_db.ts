
import mongoose from 'mongoose';
import Category from './src/models/Category';

const MONGODB_URI = "mongodb+srv://dhakadsnazzy_db_user:dhakad123@cluster0.eicbhzi.mongodb.net/dhakadsnazzy";

async function analyze() {
    try {
        console.log("Connecting...");
        await mongoose.connect(MONGODB_URI);

        console.log(`\nSearching Categories for 'Fresh':`);
        const cats = await Category.find({ name: /Fresh/i }).lean();
        if (cats.length > 0) {
            cats.forEach(c => console.log(`[CAT] ${c.name} (${c._id})`));
        } else {
            console.log("No categories found with 'Fresh'");
        }

        mongoose.disconnect();
    } catch (error) {
        console.error(error);
        mongoose.disconnect();
    }
}

analyze();
