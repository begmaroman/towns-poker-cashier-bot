import { buildGameStateMessage } from '../sessionUtils'
import { getSession, setSession } from '../sessionStore'
import { mention } from '../helpers'
import type { SlashCommandHandler } from '../types'

const finishHandler: SlashCommandHandler = async (handler, event) => {
    const { channelId, userId } = event
    const session = getSession(channelId)

    if (!session) {
        await handler.sendMessage(channelId, 'No session to finish. Start one with `/start <minUSD> <maxUSD>`.')
        return
    }

    if (session.createdBy !== userId) {
        await handler.sendMessage(channelId, `${mention(userId)}, only the session creator can finish the game.`)
        return
    }

    if (session.status === 'finished') {
        await handler.sendMessage(channelId, 'This session is already finished. Players should run `/cashout <usd>` to record their payouts.')
        return
    }

    session.status = 'finished'
    session.finishedAt = new Date()
    for (const player of session.players.values()) {
        player.isActive = false
    }

    setSession(channelId, session)

    await handler.sendMessage(
        channelId,
        'The game is now finished. Each player, please run `/cashout <usd>` with the cash value of your chips so we can settle the pot.\n\n' +
            buildGameStateMessage(session),
    )
}

export default finishHandler
