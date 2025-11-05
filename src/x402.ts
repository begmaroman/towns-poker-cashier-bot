// server.js
// Simple x402-style cashier using Hono (Node.js) for a poker buy-in flow
// POC: generates per-link payment requirements and verifies ERC-20 transfer on-chain (Base USDC)

/**
 * Quick start
 * 1) npm init -y && npm i hono viem uuid dotenv
 * 2) Create a .env file (see bottom) and run: node server.js
 * 3) Create a buy-in link:
 *    curl "http://localhost:8787/cashier/create?amount=25&gameId=table-7&player=roman"
 * 4) Open the returned payUrl in a browser. The server will reply 402 with JSON payment requirements.
 * 5) After sending the on-chain payment, confirm it:
 *    curl -X POST http://localhost:8787/cashier/confirm/<invoiceId> -H 'content-type: application/json' -d '{"txHash":"0x..."}'
 * 6) Check status:
 *    curl http://localhost:8787/cashier/status/<invoiceId>
 */

import 'dotenv/config';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { v4 as uuidv4 } from 'uuid';
import { createPublicClient, http, decodeEventLog, parseAbiItem, getAddress } from 'viem';
import { base } from 'viem/chains';

// ---------- Config ----------
const PORT = process.env.PORT ? Number(process.env.PORT) : 8787;
const MERCHANT_ADDRESS = getAddress(process.env.MERCHANT_ADDRESS || '0x0000000000000000000000000000000000000000');
const RPC_URL = process.env.RPC_URL || 'https://mainnet.base.org';

// Native USDC (Base) — 6 decimals
// Reference: https://docs.circle.com/stablecoins/usdc-on-base  (address may change; verify before prod)
const USDC_BASE = getAddress(process.env.USDC_ADDRESS || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913');
const USDC_DECIMALS = 6;

// viem client
const publicClient = createPublicClient({ chain: base, transport: http(RPC_URL) });

// Minimal ERC20 Transfer event
const TRANSFER_EVENT = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)');

// ---------- In-memory store (replace with Redis/DB in prod) ----------
const invoices = new Map();

/**
 * Invoice shape
 * id: string
 * amount: string (decimal, e.g. "25")
 * amountAtoms: bigint (25 * 10^6)
 * chainId: number
 * token: { symbol, contract, decimals }
 * receiver: string (merchant)
 * player: string
 * gameId: string
 * memo: string
 * createdAt: number (ms)
 * expiresAt: number (ms)
 * status: 'pending'|'paid'|'expired'
 * txHash?: string
 */

function toAtoms(amountStr, decimals) {
  const [whole, frac = ''] = amountStr.split('.');
  const fracPadded = (frac + '0'.repeat(decimals)).slice(0, decimals);
  return BigInt(whole || '0') * BigInt(10 ** decimals) + BigInt(fracPadded || '0');
}

function nowMs() { return Date.now(); }

function makePaymentRequirements(inv) {
  return {
    version: 'x402-1.0',
    chainId: inv.chainId,
    asset: {
      symbol: inv.token.symbol,
      contract: inv.token.contract,
      decimals: inv.token.decimals,
    },
    amount: inv.amount, // human-readable
    receiver: inv.receiver,
    reference: inv.id, // invoice id to bind the on-chain tx via memo/reference
    memo: inv.memo,
    expiresAt: new Date(inv.expiresAt).toISOString(),
    // optional callback clients can use after payment (not part of official spec; handy for POC)
    callbackUrl: `${inv.origin}/cashier/confirm/${inv.id}`,
  };
}

async function verifyPaymentOnChain({ txHash, invoice }) {
  // 1) Fetch tx receipt
  const receipt = await publicClient.getTransactionReceipt({ hash: txHash });
  if (!receipt || receipt.status !== 'success') {
    return { ok: false, reason: 'tx_failed_or_not_found' };
  }

  // 2) Ensure correct chain
  if (receipt.chainId && Number(receipt.chainId) !== invoice.chainId) {
    return { ok: false, reason: 'wrong_chain' };
  }

  // 3) Decode logs and find ERC20 Transfer to merchant for exact amount and correct token
  const found = receipt.logs.some((log) => {
    try {
      if (getAddress(log.address) !== invoice.token.contract) return false;
      const ev = decodeEventLog({ abi: [TRANSFER_EVENT], data: log.data, topics: log.topics });
      if (ev.eventName !== 'Transfer') return false;
      const to = getAddress(ev.args.to);
      const value = ev.args.value;
      return to === invoice.receiver && value === invoice.amountAtoms;
    } catch (_) {
      return false;
    }
  });
  if (!found) return { ok: false, reason: 'transfer_not_found' };

  // 4) Optional: check timestamp vs expiry
  const block = await publicClient.getBlock({ blockHash: receipt.blockHash });
  const tsMs = Number(block.timestamp) * 1000;
  if (tsMs > invoice.expiresAt) {
    return { ok: false, reason: 'payment_after_expiry' };
  }

  return { ok: true };
}

// ---------- Hono app ----------
const app = new Hono();

// Health
app.get('/health', (c) => c.json({ ok: true }));

// Create a buy-in invoice -> returns a unique pay URL
app.get('/cashier/create', (c) => {
  const url = new URL(c.req.url);
  const amountStr = url.searchParams.get('amount');
  const player = url.searchParams.get('player') || 'unknown';
  const gameId = url.searchParams.get('gameId') || 'default';
  const minutes = Number(url.searchParams.get('ttlMin') || '30');

  if (!amountStr) return c.json({ error: 'amount is required' }, 400);

  const id = uuidv4();
  const origin = `${url.protocol}//${url.host}`;

  const invoice = {
    id,
    amount: amountStr,
    amountAtoms: toAtoms(amountStr, USDC_DECIMALS),
    chainId: base.id,
    token: { symbol: 'USDC', contract: USDC_BASE, decimals: USDC_DECIMALS },
    receiver: MERCHANT_ADDRESS,
    player,
    gameId,
    memo: `Poker buy-in for game ${gameId} by ${player}`,
    createdAt: nowMs(),
    expiresAt: nowMs() + minutes * 60_000,
    status: 'pending',
    origin,
  };
  invoices.set(id, invoice);

  return c.json({
    invoiceId: id,
    payUrl: `${origin}/cashier/pay/${id}`,
    statusUrl: `${origin}/cashier/status/${id}`,
    confirmUrl: `${origin}/cashier/confirm/${id}`,
  });
});

// Show payment requirements (x402-style). If unpaid -> 402 with JSON body.
app.get('/cashier/pay/:id', (c) => {
  const { id } = c.req.param();
  const inv = invoices.get(id);
  if (!inv) return c.json({ error: 'invoice_not_found' }, 404);

  if (inv.status === 'paid') {
    return c.json({ status: 'paid', message: 'Payment already received. You are good to go.' });
  }
  if (nowMs() > inv.expiresAt) {
    inv.status = 'expired';
    return c.json({ status: 'expired', message: 'Invoice expired. Please request a new buy-in link.' }, 410);
  }

  const reqBody = makePaymentRequirements(inv);
  // x402 convention: respond with HTTP 402 and a payment requirement body
  c.header('X-PAYMENT-RESPONSE', 'required');
  return c.json(reqBody, 402);
});

// Client calls this after sending payment. Body: { txHash }
app.post('/cashier/confirm/:id', async (c) => {
  const { id } = c.req.param();
  const inv = invoices.get(id);
  if (!inv) return c.json({ error: 'invoice_not_found' }, 404);
  if (inv.status === 'paid') return c.json({ status: 'paid', txHash: inv.txHash });
  if (nowMs() > inv.expiresAt) {
    inv.status = 'expired';
    return c.json({ status: 'expired', message: 'Invoice expired.' }, 410);
  }

  let body;
  try { body = await c.req.json(); } catch {
    return c.json({ error: 'invalid_json' }, 400);
  }
  const txHash = body?.txHash;
  if (!txHash || typeof txHash !== 'string') {
    return c.json({ error: 'txHash_required' }, 400);
  }

  try {
    const res = await verifyPaymentOnChain({ txHash, invoice: inv });
    if (!res.ok) {
      return c.json({ status: 'pending', verified: false, reason: res.reason }, 422);
    }
    inv.status = 'paid';
    inv.txHash = txHash;
    // TODO: notify your chat/bot backend that funds have been deposited
    return c.json({ status: 'paid', verified: true, txHash });
  } catch (e) {
    return c.json({ error: 'verification_error', details: String(e) }, 500);
  }
});

// Poll payment status (for client-side UX)
app.get('/cashier/status/:id', (c) => {
  const { id } = c.req.param();
  const inv = invoices.get(id);
  if (!inv) return c.json({ error: 'invoice_not_found' }, 404);
  return c.json({ id, status: inv.status, expiresAt: inv.expiresAt, txHash: inv.txHash || null });
});

// (Optional) simple index
app.get('/', (c) => c.text('Hono x402 Poker Cashier POC running'));

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`\n▶ Cashier listening on http://localhost:${info.port}`);
});

/**
 * .env example
 * PORT=8787
 * MERCHANT_ADDRESS=0xYourMerchantAddressHere
 * RPC_URL=https://mainnet.base.org
 * USDC_ADDRESS=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
 */
