import mongoose, { Schema, Document } from 'mongoose';

export interface WebhookEvent {
  sessionId: string;
  eventType: string;
  orderId?: string;
  processedAt: Date;
  status: 'success' | 'failed' | 'pending';
  errorMessage?: string;
}

export interface WebhookEventDocument extends Document {
  sessionId: string;
  eventType: string;
  orderId?: string;
  processedAt: Date;
  status: 'success' | 'failed' | 'pending';
  errorMessage?: string;
}

const webhookEventSchema = new Schema<WebhookEventDocument>({
  sessionId: { type: String, required: true, unique: true, index: true },
  eventType: { type: String, required: true },
  orderId: { type: String },
  processedAt: { type: Date, required: true, default: Date.now },
  status: { type: String, enum: ['success', 'failed', 'pending'], required: true },
  errorMessage: { type: String }
});

export const WebhookEventModel = mongoose.model<WebhookEventDocument>('WebhookEvent', webhookEventSchema);
