import { buildGameStateMessage } from '../sessionUtils'
import { getSession } from '../sessionStore'
import type { SlashCommandHandler } from '../types'

const stateHandler: SlashCommandHandler = async (handler, event) => {
    const session = getSession(event.channelId)
    if (!session) {
        await handler.sendMessage(event.channelId, 'No poker session has been started yet. Use `/start <minUSD> <maxUSD>` to begin one.')
        return
    }

    await handler.sendMessage(event.channelId, buildGameStateMessage(session))
}

export default stateHandler
