import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

class Database {
  private static instance: Database;

  private constructor() {}

  public static getInstance(): Database {
    if (!Database.instance) {
      Database.instance = new Database();
    }
    return Database.instance;
  }

  public async connect(): Promise<void> {
    try {
      const { MONGO_ADDRESS, MONGO_USERNAME, MONGO_PASSWORD, MONGO_DATABASE } = process.env;

      if (!MONGO_ADDRESS || !MONGO_USERNAME || !MONGO_PASSWORD || !MONGO_DATABASE) {
        throw new Error('Missing MongoDB environment variables');
      }

      const uri = `mongodb://${MONGO_USERNAME}:${MONGO_PASSWORD}@${MONGO_ADDRESS}/${MONGO_DATABASE}`;
      
      await mongoose.connect(uri);
      
      console.log('Connected to MongoDB successfully');
    } catch (error) {
      console.error('MongoDB connection error:', error);
      throw error;
    }
  }

  public async disconnect(): Promise<void> {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }

  public async startSession() {
    return await mongoose.startSession();
  }
}

export default Database;