import { getSession, setSession } from '../sessionStore'
import { mention } from '../helpers'
import type { SlashCommandHandler } from '../types'

const leaveHandler: SlashCommandHandler = async (handler, event) => {
    const { channelId, userId } = event
    const session = getSession(channelId)

    if (!session || session.status !== 'active') {
        await handler.sendMessage(channelId, 'There is no active session to leave.')
        return
    }

    const player = session.players.get(userId)
    if (!player) {
        await handler.sendMessage(channelId, 'You have not deposited into this session yet. Tip the bot within the allowed range to join.')
        return
    }

    if (!player.isActive) {
        await handler.sendMessage(channelId, 'You already marked yourself as away from the table.')
        return
    }

    player.isActive = false
    player.leftAt = new Date()
    player.lastActionAt = player.leftAt

    setSession(channelId, session)

    await handler.sendMessage(channelId, `${mention(userId)} left the table. Their deposit remains recorded for settlement.`)
}

export default leaveHandler
