# Stripe Demo Checkout Service

This is a Node.js/Express demo service for Stripe Checkout integration. It supports creating orders, handling payments, and processing Stripe webhooks with idempotency and validation.

## Features
- Create new orders and Stripe Checkout sessions from a list of products
- Store orders and products in a local JSON file (`mockData.json`)
- Webhook endpoint to update order status after successful payment
- Request validation using `express-validator`

## Prerequisites
- Node.js >= 22
- npm
- Stripe account (for API keys)
- Stripe CLI (for local webhook testing)


## Create a Stripe Developer Account & Get API Keys

1. Go to [https://dashboard.stripe.com/register](https://dashboard.stripe.com/register) and sign up for a free Stripe account.
2. Skip the account verification step.
3. Navigate to **Developers > API keys** in the left sidebar.
4. Copy the **Secret key** (starts with `sk_test_...`) and use it as `STRIPE_SECRET_KEY` in your `.env` file.

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

Create a `.env` file in the project root with the following content:

```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
PORT=3000
```
- Get your `STRIPE_SECRET_KEY` from the Stripe Dashboard (Developers > API keys)
- `STRIPE_WEBHOOK_SECRET` will be set up in the next step

4. **Set up Stripe CLI for local webhook testing**

- [Install Stripe CLI](https://docs.stripe.com/stripe-cli/install)
- Log in:
	```bash
	stripe login
	```
- Forward webhook events to your local server:
	```bash
	stripe listen --forward-to localhost:3000/api/v2/checkout/webhook
	```
- Copy the webhook signing secret (`whsec_...`) from the CLI output and put it in your `.env` as `STRIPE_WEBHOOK_SECRET`.

5. **Run the service**

```bash
npm run start:dev
```

## Usage

### Create a Checkout Session
Send a POST request to `/api/v2/checkout/create-session` with an example JSON body:

```
{
    "products": [
        {
            "id": "f1e6e674-383a-4f70-ba14-1988bc12d02e",
            "quantity": 5
        },
        {
            "id": "42895b8f-5f78-43ab-afe6-f635a139fd57",
            "quantity": 1
        }
    ]
}
```
- Product IDs must match those in `mockData.json`.
- The response will include a Stripe Checkout URL and the new order ID.

### Webhook Handling
- The webhook endpoint `/api/v2/checkout/webhook` will update the order status to `PAID` after successful payment.
- Idempotency is ensured: each order is only marked as paid once, even if Stripe retries the webhook.

## Notes
- All order and product data is stored in `mockData.json` (for demo only).
- For production, use a real database and secure your endpoints.