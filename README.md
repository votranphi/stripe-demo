# Day 1
TypeScript Project Setup
1. Initialize the Node.js project with TypeScript (tsconfig.json configuration). 
2. Install necessary dependencies (express, stripe, dotenv, and TS type packages: @types/*). 
3. Configure start and build scripts.
4. Create the basic Express server using TS.

Database (DB) Configuration
1. Install DB (e.g., PostgreSQL/MongoDB) and an ORM/ODM tool (e.g., TypeORM or Mongoose). 
2. Set up DB connection and configure .env for the connection string. 
3. Build basic Order & Product Schemas/Models using TS.

Product Service & Route
1. Build the Product Service (or Repository) to perform basic CRUD operations. 
2. Implement the GET /products route to fetch the product list from the DB. 
3. Use Async/Await and Promise in DB functions (ensuring type safety).

Order Creation & Checkout Session
1. Build the POST /orders route to create an Order with PENDING status in the DB. 
2. Check inventory (DB) and tentatively decrement stock. 
3. Call stripe.checkout.sessions.create() and return the session.url. 
4. Ensure Type Annotations are used for input data.

Redirect Handling & Cleanup
1. Create /success and /cancel routes. 
2. In /success, use stripe.checkout.sessions.retrieve() to fetch the order ID (from metadata). 
3. Note: Discuss why this route should not be used to change the Order status (security/reliability). 
4. Refactor code into distinct Controller and Service classes.

# Day 2
Webhook Handler Setup (TS)
1. Set up the Stripe CLI to forward events. 
2. Create the POST /webhook endpoint. 
3. Define type-safe interfaces for critical Stripe events (e.g., Stripe.Checkout.Session interface).

Webhook Security & Fulfillment
1. Implement Stripe Signature Verification (stripe.webhooks.constructEvent()). 
2. Inside the checkout.session.completed event: 
- Check for Idempotency (prevent duplicate processing).
- Use the Order ID from session metadata to find the Order in the DB. 
- Update the Order status to PAID in the DB.

Advanced Type Safety & Validation
1. Implement a validation library (e.g., Zod or Joi) to define Data Transfer Objects (DTOs) with type schemas. 
2. Use Zod/Joi schema to validate the request body in the Controller. 
3. Create Custom Error Classes in TS for consistent error handling (e.g., ProductNotFoundException).

Database Transactions & Rollbacks
1. Implement DB Transactions (e.g., in TypeORM/Prisma) for multi-step operations (e.g., create Order → subtract stock → update Order ID). 
2. Ensure that if any step fails, the entire transaction is rolled back. 
3. Webhook Error: Set up retry logic if the DB update within the Webhook fails.

Review & Go-Live Preparation
1. Code Review: Check overall TypeScript usage (e.g., Generics, Utility Types) and code quality. 
2. Write detailed Documentation (README.md). 
3. Transition to Stripe Live Mode keys and discuss deployment requirements (Production environment, public Webhook URL).