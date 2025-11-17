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
}

export interface UserDocument extends Document {
  id: string;
  email: string;
  password: string;
  role: UserRole;
  createdAt?: Date;
}

const userSchema = new Schema<UserDocument>({
  id: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  role: { type: String, enum: Object.values(UserRole), default: UserRole.USER, required: true }
}, {
  timestamps: true
});

export const UserModel = mongoose.model<UserDocument>('User', userSchema);