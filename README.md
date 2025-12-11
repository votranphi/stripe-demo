# Stripe Demo Checkout Service

This is a Node.js/Express (TypeScript) demo service for Stripe Checkout integration. It supports creating orders, handling payments, and processing Stripe webhooks with idempotency and validation.

## Features
- Create new orders and Stripe Checkout sessions from a list of products in the Mongo database
- Store orders and products in MongoDB.
- Webhook endpoint to update order status after successful payment
- Request validation using `Zod`

## Prerequisites
- Node.js >= 22
- npm
- MongoDB account (for MongoDB connection)
- Stripe account (for API keys)
- Stripe CLI (for local webhook testing)


## Create a Stripe Developer Account & Get API Keys

1. Go to [https://dashboard.stripe.com/register](https://dashboard.stripe.com/register) and sign up for a free Stripe account.
2. Skip the account verification step.
3. Navigate to **Developers > API keys** in the left sidebar.
4. Copy the **Secret key** (starts with `sk_test_...`) and use it as `STRIPE_SECRET_KEY` in your `.env` file.

## Create a MongoDB on MongoDB original website
1. Go to [https://www.mongodb.com/products/platform/atlas-database](https://www.mongodb.com/products/platform/atlas-database) and sign up for a free account.
3. Create a Project -> Create a Cluster -> Get the connection string.
4. Change `.env` file to match with the database connection string.

---

## Setup

1. **Clone the repository**

```bash
# Clone this repo and cd into it
cd stripe-demo
```

2.  **Install dependencies**

<!-- end list -->

```bash
npm install
```

3.  **Configure environment variables**

Create a `.env` file in the project root with the content look like the `.env.example`:

```
# NodeJS's secrets
PORT=3000
BASE_URL=http://localhost:3000
STRIPE_SECRET_KEY=sk_test...
STRIPE_WEBHOOK_SECRET=whsec_523d...
NODE_ENV=development

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRES_IN=24h

# Database's secrets
MONGO_ADDRESS=cluster0.0mbmrv7.mongodb.net
MONGO_USERNAME=admin
MONGO_PASSWORD=superlongpassword
MONGO_POSTFIX=?appName=MySuperCluster

# Frontend URL for redirects
FRONTEND_BASE_URL=http://localhost:3000
```

4.  **Set up Stripe CLI for local webhook testing**

<!-- end list -->

  - [Install Stripe CLI](https://docs.stripe.com/stripe-cli/install)
  - Log in:
    ```bash
     stripe login
    ```
  - Forward webhook events to your local server:
    ```bash
     stripe listen --forward-to localhost:3000/api/v1/webhook
    ```
  - Copy the webhook signing secret (`whsec_...`) from the CLI output and put it in your `.env` as `STRIPE_WEBHOOK_SECRET`.

<!-- end list -->

5.  **Run the service**

<!-- end list -->

```bash
npm run start
npm run build
```

## Usage

> **Note:** Most endpoints require authentication. Include the JWT token in the `Authorization` header as `Bearer <token>`.

-----

### 1\. Authentication (`/api/v1/auth`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/v1/auth/register` | ❌ | Register a new account |
| POST | `/api/v1/auth/login` | ❌ | Login to an existing account |

  - **Register an account**

      - `POST /api/v1/auth/register`
      - Body:
        ```json
        {
            "email": "user@example.com",
            "password": "yourpassword",
            "role": "USER"
        }
        ```
      - `role` is optional, defaults to `USER`. Can be `USER` or `ADMIN`.
      - Returns: User info and token.

  - **Login**

      - `POST /api/v1/auth/login`
      - Body:
        ```json
        {
            "email": "user@example.com",
            "password": "yourpassword"
        }
        ```
      - Returns: User info and token.

-----

### 2\. Products (`/api/v1/products`)

| Method | Endpoint | Auth | Admin | Description |
|--------|----------|------|-------|-------------|
| POST | `/api/v1/products` | ✅ | ✅ | Create a new product |
| GET | `/api/v1/products` | ✅ | ❌ | Get all products |
| GET | `/api/v1/products/:id` | ✅ | ❌ | Get product by ID |
| PUT | `/api/v1/products/:id` | ✅ | ✅ | Update a product |
| DELETE | `/api/v1/products/:id` | ✅ | ✅ | Delete a product |

  - **Create a product** (Admin only)

      - `POST /api/v1/products`
      - Body:
        ```json
        {
            "name": "Product Name",
            "price": 29.99,
            "stock": 100,
            "type": "ONE_TIME"
        }
        ```
      - `type` can be `ONE_TIME` or `SUBSCRIPTION`.

  - **Get all products**

      - `GET /api/v1/products?page=1&limit=10`
      - Returns: List of all products with pagination info.

  - **Get product by ID**

      - `GET /api/v1/products/:id`
      - Returns: Product details.

  - **Update a product** (Admin only)

      - `PUT /api/v1/products/:id`
      - Body: Same as create product.

  - **Delete a product** (Admin only)

      - `DELETE /api/v1/products/:id`

-----

### 3\. Orders / Cart (`/api/v1/orders`)

#### Cart/Draft Management

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/v1/orders/draft` | ✅ | Get current draft/cart |
| POST | `/api/v1/orders/draft/items` | ✅ | Add item to cart |
| PATCH | `/api/v1/orders/draft/items/:productId` | ✅ | Update item quantity |
| DELETE | `/api/v1/orders/draft/items/:productId` | ✅ | Remove item from cart |

  - **Get current draft/cart**

      - `GET /api/v1/orders/draft`
      - Returns: Current draft order with items.

  - **Add item to cart**

      - `POST /api/v1/orders/draft/items`
      - Body:
        ```json
        {
            "productId": "uuid-of-product",
            "quantity": 2
        }
        ```

  - **Update item quantity**

      - `PATCH /api/v1/orders/draft/items/:productId`
      - Body:
        ```json
        {
            "quantity": 5
        }
        ```

  - **Remove item from cart**

      - `DELETE /api/v1/orders/draft/items/:productId`

#### Checkout & History

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/v1/orders/checkout/create-session` | ✅ | Create Stripe checkout session |
| GET | `/api/v1/orders` | ✅ | Get my order history |

  - **Create checkout session**

      - `POST /api/v1/orders/checkout/create-session`
      - Creates a Stripe Checkout session for the current draft order.
      - Returns: Stripe checkout URL (`checkoutUrl`) and Order ID.
      - *Note:* Upon success or cancellation, Stripe will redirect to the frontend URLs configured in your environment.

  - **Get my order history**

      - `GET /api/v1/orders?page=1&limit=10`
      - Returns: List of user's past orders (excluding drafts) with pagination.

-----

### 4\. Subscription Plans (`/api/v1/subscription-plans`)

| Method | Endpoint | Auth | Admin | Description |
|--------|----------|------|-------|-------------|
| POST | `/api/v1/subscription-plans` | ✅ | ✅ | Create a subscription plan |
| GET | `/api/v1/subscription-plans` | ✅ | ❌ | Get all subscription plans |
| GET | `/api/v1/subscription-plans/:id` | ✅ | ❌ | Get plan by ID |
| PUT | `/api/v1/subscription-plans/:id` | ✅ | ✅ | Update a plan |
| DELETE | `/api/v1/subscription-plans/:id` | ✅ | ✅ | Delete a plan |

  - **Create a subscription plan** (Admin only)

      - `POST /api/v1/subscription-plans`
      - Body:
        ```json
        {
            "stripePriceId": "price_xxx",
            "productId": "prod_xxx",
            "frequency": "MONTHLY",
            "currency": "usd"
        }
        ```
      - `frequency` can be `MONTHLY` or `YEARLY`.

  - **Get all subscription plans**

      - `GET /api/v1/subscription-plans?page=1&limit=10`
      - Returns: List of all subscription plans.

  - **Get plan by ID**

      - `GET /api/v1/subscription-plans/:id`
      - Returns: Subscription plan details.

  - **Update a plan** (Admin only)

      - `PUT /api/v1/subscription-plans/:id`
      - Body: Same as create plan.

  - **Delete a plan** (Admin only)

      - `DELETE /api/v1/subscription-plans/:id`

-----

### 5\. Subscriptions (`/api/v1/subscriptions`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/v1/subscriptions/checkout/create-session` | ✅ | Create subscription checkout session |
| GET | `/api/v1/subscriptions/me` | ✅ | Get my current subscription |
| POST | `/api/v1/subscriptions/portal-session` | ✅ | Create Stripe billing portal session |
| DELETE | `/api/v1/subscriptions/:id` | ✅ | Cancel a subscription |

  - **Create subscription checkout session**

      - `POST /api/v1/subscriptions/checkout/create-session`
      - Body:
        ```json
        {
            "planId": "uuid-of-subscription-plan"
        }
        ```
      - Returns: Stripe checkout URL (`checkoutUrl`) and Session ID.

  - **Get my subscription**

      - `GET /api/v1/subscriptions/me`
      - Returns: Current user's active subscription.

  - **Create billing portal session**

      - `POST /api/v1/subscriptions/portal-session`
      - Body:
        ```json
        {
            "returnUrl": "[https://your-app.com/dashboard](https://your-app.com/dashboard)"
        }
        ```
      - Returns: Stripe billing portal URL for managing subscription.

  - **Cancel subscription**

      - `DELETE /api/v1/subscriptions/:id`
      - Cancels the specified subscription via Stripe API.

-----

### 6\. Digital Content (`/api/v1/digital-content`)

| Method | Endpoint | Auth | Subscription | Description |
|--------|----------|------|--------------|-------------|
| GET | `/api/v1/digital-content` | ✅ | ✅ | Get premium digital content |

  - **Get digital content** (Requires active subscription)
      - `GET /api/v1/digital-content`
      - Returns: Premium digital content for subscribed users.

-----

### 7\. Webhook (`/api/v1/webhook`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/v1/webhook` | ❌ | Stripe webhook handler |

  - **Stripe webhook handler**
      - `POST /api/v1/webhook`
      - Handles Stripe webhook events (payment success, subscription updates, etc.).
      - This endpoint is called by Stripe, not by your frontend.

-----

### 8\. Admin Endpoints (`/api/v1/admin`)

> **Note:** All admin endpoints require authentication AND admin role.

#### Admin Orders (`/api/v1/admin/orders`)

| Method | Endpoint | Auth | Admin | Description |
|--------|----------|------|-------|-------------|
| GET | `/api/v1/admin/orders` | ✅ | ✅ | Get all orders |
| PUT | `/api/v1/admin/orders/:id/status` | ✅ | ✅ | Update order status |

  - **Get all orders** (Admin only)

      - `GET /api/v1/admin/orders?page=1&limit=10`
      - Returns: List of all orders in the system.

  - **Update order status** (Admin only)

      - `PUT /api/v1/admin/orders/:id/status`
      - Body:
        ```json
        {
            "status": "SHIPPED"
        }
        ```
      - Valid statuses: `DRAFT`, `PENDING`, `PAID`, `SHIPPED`, `DELIVERED`, `CANCELLED`

## License
This project is available under the [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0) license.