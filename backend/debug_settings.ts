
import mongoose from 'mongoose';
import AppSettings from './src/models/AppSettings';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '.env') });

const checkSettings = async () => {
    try {
        console.log("Connecting to:", process.env.MONGODB_URI);
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/dhakad-snazzy');

        const settings = await AppSettings.find({});
        console.log(`Found ${settings.length} settings documents.`);

        settings.forEach((s, i) => {
            console.log(`--- Doc ${i} ---`);
            console.log("deliveryCharges:", s.deliveryCharges);
            console.log("deliveryConfig:", JSON.stringify(s.deliveryConfig, null, 2));
        });

    } catch (error) {
        console.error(error);
    } finally {
        await mongoose.disconnect();
    }
};

checkSettings();
