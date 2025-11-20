import mongoose, { Schema, Document } from 'mongoose';

export enum UserRole {
  USER = 'USER',
  ADMIN = 'ADMIN'
}

export interface User {
  id: string;
  email: string;
  password: string;
  role: UserRole;
  draftOrderId?: string;  // Reference to user's current draft order (shopping cart)
}

export interface UserDocument extends Document {
  id: string;
  email: string;
  password: string;
  role: UserRole;
  draftOrderId?: string;
  createdAt?: Date;
}

const userSchema = new Schema<UserDocument>({
  id: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  role: { type: String, enum: Object.values(UserRole), default: UserRole.USER, required: true },
  draftOrderId: { type: String, required: false }
}, {
  timestamps: true
});

export const UserModel = mongoose.model<UserDocument>('User', userSchema);