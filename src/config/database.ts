import { MongoClient, Db } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

class Database {
  private static instance: Database;
  private client: MongoClient | null = null;
  private db: Db | null = null;

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

      const uri = `mongodb://${MONGO_USERNAME}:${MONGO_PASSWORD}@${MONGO_ADDRESS}`;
      
      this.client = new MongoClient(uri);
      await this.client.connect();
      
      this.db = this.client.db(MONGO_DATABASE);
      
      console.log('Connected to MongoDB successfully');
    } catch (error) {
      console.error('MongoDB connection error:', error);
      throw error;
    }
  }

  public getDb(): Db {
    if (!this.db) {
      throw new Error('Database not initialized. Call connect() first.');
    }
    return this.db;
  }

  public async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
      console.log('Disconnected from MongoDB');
    }
  }
}

export default Database;