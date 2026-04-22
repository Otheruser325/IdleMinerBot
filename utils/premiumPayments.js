import http from 'http';
import { getUser, updateUser, withUserLock } from '../dataManager.js';
import sendPremiumDM from './sendPremiumDM.js';
import { logError } from './errorHandling.js';

const PREMIUM_PASS_PRODUCT = 'premium_pass';
let stripeClientPromise = null;
let paymentServer = null;

function getPaymentBaseUrl() {
    return process.env.PAYMENT_BASE_URL || process.env.PUBLIC_BASE_URL || '';
}

function getPremiumPassAmountCents() {
    const configuredAmount = Number(process.env.PREMIUM_PASS_AMOUNT_CENTS || 0);
    return Number.isFinite(configuredAmount) && configuredAmount > 0 ? configuredAmount : 499;
}

function getPremiumPassCurrency() {
    return (process.env.PREMIUM_PASS_CURRENCY || 'usd').toLowerCase();
}

function getPremiumPassDisplayPrice() {
    const amount = getPremiumPassAmountCents();
    const currency = getPremiumPassCurrency().toUpperCase();
    return `${currency} ${(amount / 100).toFixed(2)}`;
}

async function getStripeClient() {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
        return null;
    }

    if (!stripeClientPromise) {
        stripeClientPromise = import('stripe')
            .then(module => new module.default(secretKey))
            .catch(error => {
                stripeClientPromise = null;
                throw error;
            });
    }

    return stripeClientPromise;
}

function buildPremiumInventory(user) {
    const updatedInventory = structuredClone(user.inventory || {});
    updatedInventory.boosters = updatedInventory.boosters || [];

    const rewards = [
        {
            item_id: 2,
            item_name: 'Long x2 Boost',
            active_time: 43200,
            income_factor: 2,
            stock: 1
        },
        {
            item_id: 3,
            item_name: 'x10 Boost',
            active_time: 3600,
            income_factor: 10,
            stock: 1
        }
    ];

    for (const reward of rewards) {
        const existingBooster = updatedInventory.boosters.find(booster => booster.item_id === reward.item_id);
        if (existingBooster) {
            existingBooster.stock = (existingBooster.stock || 0) + reward.stock;
        } else {
            updatedInventory.boosters.push({ ...reward });
        }
    }

    return updatedInventory;
}

async function grantPremiumPassToUser(userId, client = null, paymentReference = '') {
    return withUserLock(userId, async () => {
        const user = await getUser(userId);
        if (!user) {
            return { ok: false, reason: 'user_not_found' };
        }

        if (user.has_premium) {
            return { ok: true, alreadyPremium: true };
        }

        const inventory = buildPremiumInventory(user);
        await updateUser(userId, {
            has_premium: true,
            super_cash: (user.super_cash || 0) + 1000,
            inventory
        });

        if (client?.users?.fetch) {
            try {
                const discordUser = await client.users.fetch(userId);
                if (discordUser) {
                    await sendPremiumDM(discordUser);
                }
            } catch (error) {
                logError('premiumPayments:sendPremiumDM', error, { userId, paymentReference });
            }
        }

        return { ok: true, alreadyPremium: false };
    });
}

async function createPremiumCheckoutSession(user) {
    const stripe = await getStripeClient();
    const paymentBaseUrl = getPaymentBaseUrl();
    if (!stripe || !paymentBaseUrl) {
        return { ok: false, reason: 'not_configured' };
    }

    const metadata = {
        discord_user_id: user.id,
        discord_tag: user.tag || '',
        product: PREMIUM_PASS_PRODUCT
    };

    const params = {
        mode: 'payment',
        success_url: `${paymentBaseUrl}/payments/stripe/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${paymentBaseUrl}/payments/stripe/cancel`,
        client_reference_id: user.id,
        metadata,
        payment_intent_data: {
            metadata
        },
        allow_promotion_codes: true
    };

    if (process.env.STRIPE_PREMIUM_PRICE_ID) {
        params.line_items = [
            {
                price: process.env.STRIPE_PREMIUM_PRICE_ID,
                quantity: 1
            }
        ];
    } else {
        params.line_items = [
            {
                quantity: 1,
                price_data: {
                    currency: getPremiumPassCurrency(),
                    unit_amount: getPremiumPassAmountCents(),
                    product_data: {
                        name: 'Idle Miner Bot Premium Pass',
                        description: 'Premium access for Idle Miner Bot, including permanent premium rewards and monthly benefits.'
                    }
                }
            }
        ];
    }

    const session = await stripe.checkout.sessions.create(params);
    return { ok: true, session };
}

async function handleStripeWebhook(rawBody, signature, client) {
    const stripe = await getStripeClient();
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!stripe || !webhookSecret) {
        return { statusCode: 503, body: 'Stripe webhook is not configured.' };
    }

    let event;
    try {
        event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (error) {
        logError('premiumPayments:webhook:verify', error);
        return { statusCode: 400, body: 'Webhook signature verification failed.' };
    }

    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const userId = session?.metadata?.discord_user_id || session?.client_reference_id;
        const product = session?.metadata?.product;

        if (userId && product === PREMIUM_PASS_PRODUCT && session?.payment_status === 'paid') {
            try {
                await grantPremiumPassToUser(userId, client, session.id);
            } catch (error) {
                logError('premiumPayments:webhook:grant', error, { userId, sessionId: session?.id });
                return { statusCode: 500, body: 'Failed to grant premium pass.' };
            }
        }
    }

    return { statusCode: 200, body: JSON.stringify({ received: true }) };
}

function writeHtmlResponse(response, statusCode, title, body) {
    response.writeHead(statusCode, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(`<!doctype html><html><head><title>${title}</title></head><body><h1>${title}</h1><p>${body}</p></body></html>`);
}

async function startPremiumPaymentServer(client) {
    const shouldStart = Boolean(process.env.STRIPE_SECRET_KEY && process.env.PAYMENT_BASE_URL);
    if (!shouldStart || paymentServer) {
        return paymentServer;
    }

    const port = Number(process.env.PAYMENT_SERVER_PORT || 8787);

    paymentServer = http.createServer(async (request, response) => {
        try {
            if (request.method === 'POST' && request.url === '/payments/stripe/webhook') {
                const chunks = [];
                for await (const chunk of request) {
                    chunks.push(chunk);
                }

                const rawBody = Buffer.concat(chunks);
                const signature = request.headers['stripe-signature'];
                const result = await handleStripeWebhook(rawBody, signature, client);
                response.writeHead(result.statusCode, { 'Content-Type': 'application/json' });
                response.end(result.body);
                return;
            }

            if (request.method === 'GET' && request.url?.startsWith('/payments/stripe/success')) {
                writeHtmlResponse(response, 200, 'Payment Successful', 'Your Premium Pass purchase was received. You can return to Discord and use Idle Miner Bot.');
                return;
            }

            if (request.method === 'GET' && request.url?.startsWith('/payments/stripe/cancel')) {
                writeHtmlResponse(response, 200, 'Payment Cancelled', 'Your Premium Pass checkout was cancelled. You can return to Discord and try again later.');
                return;
            }

            response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            response.end('Not found');
        } catch (error) {
            logError('premiumPayments:server', error, { method: request.method, url: request.url });
            response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
            response.end('Internal server error');
        }
    });

    paymentServer.listen(port, () => {
        console.log(`Premium payment server listening on port ${port}.`);
    });

    paymentServer.on('error', error => {
        logError('premiumPayments:listen', error, { port });
    });

    return paymentServer;
}

function isPremiumPassItem(item) {
    return item?.Category === 'premium' || item?.ItemName === 'Premium Pass';
}

function isPremiumPaymentsConfigured() {
    return Boolean(process.env.STRIPE_SECRET_KEY && process.env.PAYMENT_BASE_URL);
}

export {
    createPremiumCheckoutSession,
    getPremiumPassDisplayPrice,
    grantPremiumPassToUser,
    isPremiumPassItem,
    isPremiumPaymentsConfigured,
    startPremiumPaymentServer
};
