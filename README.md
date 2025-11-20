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

2. **Install dependencies**

```bash
npm install
```

3. **Configure environment variables**

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
```

4. **Set up Stripe CLI for local webhook testing**

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

5. **Run the service**

```bash
npm run start
npm run build
```

## Usage

### 1. Register & Login

- **Register an account**
    - `POST /api/v1/auth/register`
    - Body:
        ```json
        {
            "email": "user@example.com",
            "password": "yourpassword"
        }
        ```
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

---

### 2. Product Management

- **Create product** (Admin required)
    - `POST /api/v1/products`
    - Body:
        ```json
        {
            "name": "Shorts",
            "price": 100,
            "stock": 10000
        }
        ```

- **Get all products**
    - `GET /api/v1/products`

- **Get product details**
    - `GET /api/v1/products/:id`

- **Update product** (Admin required)
    - `PUT /api/v1/products/:id`

- **Delete product** (Admin required)
    - `DELETE /api/v1/products/:id`

---

### 3. Cart Management (Draft Order)

- **View current cart**
    - `GET /api/v1/orders/draft`

- **Add product to cart**
    - `POST /api/v1/orders/draft/items`
    - Body:
        ```json
        {
            "productId": "product_id",
            "quantity": 2
        }
        ```

- **Remove product from cart**
    - `DELETE /api/v1/orders/draft/items/:productId`

- **Update product quantity in cart**
    - `PATCH /api/v1/orders/draft/items/:productId`
    - Body:
        ```json
        {
            "quantity": 3
        }
        ```

---

### 4. Stripe Checkout Payment

- **Create checkout session**
    - `POST /api/v1/orders/checkout/create-session`
    - Returns: `checkoutUrl` for redirecting to Stripe.

- **Successful payment result**
    - `GET /api/v1/orders/checkout/success?session_id=...`

- **Cancel payment**
    - `GET /api/v1/orders/checkout/cancel`

---

### 5. Stripe Webhook

- **Receive webhook from Stripe**
    - `POST /api/v1/webhook`
    - Stripe will send events to this endpoint to update order status.

---

### 6. Order Management (Admin)

- **View all orders**
    - `GET /api/v1/admin/orders`

- **Update order status**
    - `PUT /api/v1/admin/orders/:id/status`
    - Body:
        ```json
        {
            "status": "PAID"
        }
        ```

---

**Notes:**  
- All endpoints (except register/login) require Bearer Token (JWT) in the `Authorization` header.
- `/admin/*` endpoints require the user to have admin privileges.