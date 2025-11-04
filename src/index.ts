import { makeTownsBot } from '@towns-protocol/bot'
import { Hono } from 'hono'
import { logger } from 'hono/logger'
import commands from './commands'
import helpHandler from './handlers/help'
import startHandler from './handlers/start'
import stateHandler from './handlers/state'
import finishHandler from './handlers/finish'
import cashoutHandler from './handlers/cashout'
import createTipHandler from './handlers/tip'
import type { SlashCommandHandler } from './types'
import {supportsExecutionMode} from "viem/experimental/erc7821";
import {paymentMiddleware} from "x402-hono";

const bot = await makeTownsBot(process.env.APP_PRIVATE_DATA!, process.env.JWT_SECRET!, {
    commands,
})

const registerSlashCommand = (
    name: (typeof commands)[number]['name'],
    fn: SlashCommandHandler,
) => {
    bot.onSlashCommand(name, async (handler, event) => {
        try {
            await fn(handler, event)
        } catch (error) {
            const message =
                error instanceof Error ? error.message : 'Unexpected error while handling command.'
            await handler.sendMessage(event.channelId, `Command failed: ${message}`)
        }
    })
}

registerSlashCommand('help', helpHandler)
registerSlashCommand('start', startHandler)
registerSlashCommand('state', stateHandler)
registerSlashCommand('finish', finishHandler)
registerSlashCommand('cashout', cashoutHandler)

bot.onTip(createTipHandler(bot.appAddress))
console.log(await supportsExecutionMode(bot.viem, { address: "0xe78258E436e5708e6C14b3f848551fD50161CA61" }))
const { jwtMiddleware, handler } = bot.start()

const app = new Hono()

app.use(logger())

// Implement your route
app.get("/protected-route",
  paymentMiddleware(
    "0xFA9eEc9FBA16303eaE51EB0ef3F7e090035e3e1A", // your receiving wallet address
    {  // Route configurations for protected endpoints
        "/protected-route": {
            price: "$0.10",
            network: "base-sepolia",
            config: {
                description: "Access to premium content",
            }
        }
    },
    {
        url: "https://x402.org/facilitator", // Facilitator URL for Base Sepolia testnet.
    }
  ),
  (c) => {
    return c.json({ message: "This content is behind a paywall" });
});

app.post('/webhook', jwtMiddleware, handler)

export default app
