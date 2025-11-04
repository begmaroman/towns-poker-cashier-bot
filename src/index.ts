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

const { jwtMiddleware, handler } = bot.start()

const app = new Hono()
app.use(logger())
app.post('/webhook', jwtMiddleware, handler)

export default app
