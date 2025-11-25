import { Request, Response } from 'express';
import { SubscriptionPlanService } from '../services/subscription-plan.service.js';
import { CreateUpdateSubscriptionPlanDTO } from '../dtos/subscription-plan.dto.js';
import { asyncHandler } from '../middlewares/error.middleware.js';
import { SubscriptionPlanNotFoundException } from '../errors/CustomError.js';

export class SubscriptionPlanController {
  private subscriptionPlanService: SubscriptionPlanService | null = null;

  // For lazy initialization
  private getSubscriptionPlanService(): SubscriptionPlanService {
    if (!this.subscriptionPlanService) {
      this.subscriptionPlanService = new SubscriptionPlanService();
    }
    return this.subscriptionPlanService;
  }

  // GET /api/v1/subscription-plans
  getAllPlans = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    
    const result = await this.getSubscriptionPlanService().getAllPlans(page, limit);
    res.status(200).json({
      success: true,
      data: result.plans,
      pagination: {
        page: result.page,
        limit: limit,
        total: result.total,
        totalPages: result.totalPages
      }
    });
  });

  // POST /api/v1/subscription-plans
  createPlan = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const dto = new CreateUpdateSubscriptionPlanDTO(req.body);
    const plan = await this.getSubscriptionPlanService().createPlan(dto);
    res.status(201).json({
      success: true,
      data: plan
    });
  });

  // GET /api/v1/subscription-plans/:id
  getPlanById = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const id = req.params.id as string;
    const plan = await this.getSubscriptionPlanService().getPlanById(id);
    if (!plan) {
      throw new SubscriptionPlanNotFoundException(id);
    }
    res.status(200).json({ success: true, data: plan });
  });

  // PUT /api/v1/subscription-plans/:id
  updatePlan = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const id = req.params.id as string;
    // Validate request body using DTO
    const dto = new CreateUpdateSubscriptionPlanDTO(req.body);
    const updated = await this.getSubscriptionPlanService().updatePlan(id, dto);
    if (!updated) {
      throw new SubscriptionPlanNotFoundException(id);
    }
    res.status(200).json({ success: true, data: updated });
  });

  // DELETE /api/v1/subscription-plans/:id
  deletePlan = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const id = req.params.id as string;
    const deleted = await this.getSubscriptionPlanService().deletePlan(id);
    if (!deleted) {
      throw new SubscriptionPlanNotFoundException(id);
    }
    res.status(200).json({ success: true, message: 'Subscription plan deleted' });
  });
}
