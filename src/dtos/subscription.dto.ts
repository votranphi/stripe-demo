import { z } from 'zod';

export class CreateSubscriptionCheckoutDTO {
  static schema = z.object({
    planId: z.uuid('Invalid plan ID format'),
  });

  planId: string;

  constructor(data: unknown) {
    const parsed = CreateSubscriptionCheckoutDTO.schema.parse(data);
    this.planId = parsed.planId;
  }
}

export class CreateBillingPortalSessionDTO {
  static schema = z.object({
    returnUrl: z.url('Invalid return URL format'),
  });

  returnUrl: string;

  constructor(data: unknown) {
    const parsed = CreateBillingPortalSessionDTO.schema.parse(data);
    this.returnUrl = parsed.returnUrl;
  }
}
