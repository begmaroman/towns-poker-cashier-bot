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

const bot = await makeTownsBot(process.env.APP_PRIVATE_DATA!, process.env.JWT_SECRET!, {
    commands,
})

bot.onSlashCommand('help', helpHandler)
bot.onSlashCommand('start', startHandler)
bot.onSlashCommand('state', stateHandler)
bot.onSlashCommand('finish', finishHandler)
bot.onSlashCommand('leave', leaveHandler)
bot.onSlashCommand('cashout', cashoutHandler)
bot.onTip(createTipHandler(bot.botId))

const { jwtMiddleware, handler } = bot.start()

const app = new Hono()
app.use(logger())
app.post('/webhook', jwtMiddleware, handler)

export default app
