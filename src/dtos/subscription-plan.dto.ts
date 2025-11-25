import { z } from 'zod';
import { SubscriptionFrequency } from '../models/subscription-plan.model.js';

export class CreateUpdateSubscriptionPlanDTO {
  static schema = z.object({
    stripePriceId: z.string().min(1, 'Stripe Price ID is required'),
    productId: z.string().min(1, 'Product ID is required'),
    frequency: z.enum(SubscriptionFrequency, {
      message: 'Frequency must be either MONTHLY or YEARLY'
    }),
    currency: z.string().min(1, 'Currency is required').default('usd'),
  });

  stripePriceId: string;
  productId: string;
  frequency: SubscriptionFrequency;
  currency: string;

  constructor(data: unknown) {
    const parsed = CreateUpdateSubscriptionPlanDTO.schema.parse(data);
    this.stripePriceId = parsed.stripePriceId;
    this.productId = parsed.productId;
    this.frequency = parsed.frequency;
    this.currency = parsed.currency;
  }
}
