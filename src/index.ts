import { makeTownsBot } from '@towns-protocol/bot'
import { Hono } from 'hono'
import { logger } from 'hono/logger'
import commands from './commands'
import helpHandler from './handlers/help'
import startHandler from './handlers/start'
import stateHandler from './handlers/state'
import finishHandler from './handlers/finish'
import leaveHandler from './handlers/leave'
import cashoutHandler from './handlers/cashout'
import createTipHandler from './handlers/tip'
import type { SlashCommandEvent, SlashCommandHandler } from './types'

const bot = await makeTownsBot(process.env.APP_PRIVATE_DATA!, process.env.JWT_SECRET!, {
    commands,
})

const commandHandlers: Record<string, SlashCommandHandler> = {
    help: helpHandler,
    start: startHandler,
    state: stateHandler,
    finish: finishHandler,
    leave: leaveHandler,
    cashout: cashoutHandler,
}

bot.onMessage(async (handler, event) => {
    if (event.userId === bot.botId) {
        return
    }

    const trimmed = event.message.trim()
    if (!trimmed.startsWith('/')) {
        return
    }

    const [commandToken, ...args] = trimmed.split(/\s+/)
    const commandName = commandToken.slice(1).toLowerCase()
    const execute = commandHandlers[commandName]

    if (!execute) {
        return
    }

    const commandEvent: SlashCommandEvent = {
        channelId: event.channelId,
        userId: event.userId,
        args,
        command: commandName,
        spaceId: event.spaceId,
        eventId: event.eventId,
        createdAt: event.createdAt,
        rawMessage: event.message,
    }

    try {
        await execute(handler, commandEvent)
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unexpected error while handling command.'
        await handler.sendMessage(event.channelId, `Command failed: ${message}`)
    }
})

bot.onTip(createTipHandler(bot.botId))

const { jwtMiddleware, handler } = bot.start()

const app = new Hono()
app.use(logger())
app.post('/webhook', jwtMiddleware, handler)

export default app
