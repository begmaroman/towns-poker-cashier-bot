import { formatRate, formatUsd, parseUsdAmount, resolveEthUsdRate } from '../helpers'
import { getSession, setSession } from '../sessionStore'
import type { Session, SlashCommandHandler } from '../types'

const startHandler: SlashCommandHandler = async (handler, event) => {
    const { channelId, userId, args } = event
    const existingSession = getSession(channelId)

    if (existingSession && existingSession.status === 'active') {
        await handler.sendMessage(channelId, 'A poker session is already active. Use `/finish` before starting another.')
        return
    }

    if (args.length < 2) {
        await handler.sendMessage(channelId, 'Usage: `/start <minUSD> <maxUSD>` (example: `/start 20 200`).')
        return
    }

    let minDepositUsdCents: bigint
    let maxDepositUsdCents: bigint

    try {
        minDepositUsdCents = parseUsdAmount(args[0])
        maxDepositUsdCents = parseUsdAmount(args[1])
    } catch (error) {
        await handler.sendMessage(channelId, error instanceof Error ? error.message : 'Invalid USD amounts.')
        return
    }

    if (minDepositUsdCents <= 0n) {
        await handler.sendMessage(channelId, 'Minimum deposit must be greater than zero USD.')
        return
    }

    if (maxDepositUsdCents < minDepositUsdCents) {
        await handler.sendMessage(channelId, 'Maximum deposit must be greater than or equal to the minimum deposit.')
        return
    }

    let exchangeRate
    try {
        exchangeRate = await resolveEthUsdRate()
    } catch (error) {
        await handler.sendMessage(
            channelId,
            error instanceof Error
                ? `Unable to start session: ${error.message}`
                : 'Unable to start session: failed to resolve ETH/USD rate.',
        )
        return
    }

    const session: Session = {
        channelId,
        createdBy: userId,
        createdAt: new Date(),
        status: 'active',
        minDepositUsdCents,
        maxDepositUsdCents,
        exchangeRate,
        players: new Map(),
        rejectedTips: [],
    }

    setSession(channelId, session)

    await handler.sendMessage(
        channelId,
        `Started a new poker session. Accepted deposit per tip: ${formatUsd(minDepositUsdCents)} to ${formatUsd(maxDepositUsdCents)}.\n\n` +
        `${formatRate(exchangeRate)}\n\n` +
        'Tip the bot within the allowed range to sit down or add to your stack.',
    )
}

export default startHandler
