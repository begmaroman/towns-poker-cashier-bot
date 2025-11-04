import { formatEth, formatUsd, mention, weiToUsdCents } from '../helpers'
import { getSession, setSession } from '../sessionStore'
import { getSessionTotals } from '../sessionUtils'
import type { Session, TipHandler } from '../types'

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

export const createTipHandler = (botId: string): TipHandler => async (handler, event) => {
    if (event.receiverAddress.toLowerCase() !== botId.toLowerCase()) {
        return
    }

    if (event.amount <= 0n) {
        return
    }

    /*if (event.currency.toLowerCase() !== ZERO_ADDRESS) {
        await handler.sendMessage(
            event.channelId,
            `${mention(event.userId)} sent a tip in an unsupported token (${event.currency}). Please use ETH for poker deposits.`,
        )
        return
    }*/

    const session = getSession(event.channelId)
    if (!session) {
        await handler.sendMessage(
            event.channelId,
            `${mention(event.userId)} tipped, but no poker session is active. Start one with \`/start <minUSD> <maxUSD>\` to track deposits.`,
        )
        return
    }

    if (session.status !== 'active') {
        trackRejectedTip(session, event.userId, event.amount, 'Session finished')
        setSession(event.channelId, session)

        await handler.sendMessage(
            event.channelId,
            `${mention(event.userId)} tipped, but the session is finished. Hold on to your chips until a new session begins.`,
        )
        return
    }

    const tipUsdCents = weiToUsdCents(event.amount, session.exchangeRate.value)

    if (tipUsdCents < session.minDepositUsdCents || tipUsdCents > session.maxDepositUsdCents) {
        trackRejectedTip(session, event.userId, event.amount, 'Tip outside allowed range', tipUsdCents)
        setSession(event.channelId, session)

        await handler.sendMessage(
            event.channelId,
            `${mention(event.userId)} sent ${formatEth(event.amount)} (~${formatUsd(tipUsdCents)}), which is outside the allowed range ` +
                `(${formatUsd(session.minDepositUsdCents)} - ${formatUsd(session.maxDepositUsdCents)}). Tip not applied—please send an amount within the limits.`,
        )
        return
    }

    const now = new Date()
    let player = session.players.get(event.userId)

    if (!player) {
        player = {
            userId: event.userId,
            totalDepositWei: event.amount,
            isActive: true,
            joinedAt: now,
            lastActionAt: now,
        }
        session.players.set(event.userId, player)
    } else {
        player.totalDepositWei += event.amount
        player.isActive = true
        player.leftAt = undefined
        player.lastActionAt = now
        player.cashoutWei = undefined
        player.cashoutUsdCents = undefined
        player.lastPayoutError = undefined
    }

    setSession(event.channelId, session)

    const totals = getSessionTotals(session)
    const playerDepositUsd = weiToUsdCents(player.totalDepositWei, session.exchangeRate.value)
    const totalDepositsUsd = weiToUsdCents(totals.totalDepositsWei, session.exchangeRate.value)

    // TODO: Remove
    console.log("Sending tip back", event)
    const result = await handler.sendTip({
        userId: event.userId, // The person who tipped you
        channelId: event.channelId, // Same channel
        messageId: event.messageId, // Reference the original message
        amount: event.amount, // Same amount (or adjust as needed)
        currency: event.currency, // Same token
    });
    console.log("Sent tip back", result)

    await handler.sendMessage(
        event.channelId,
        `${mention(event.userId)} deposited ${formatEth(event.amount)} (~${formatUsd(tipUsdCents)}). ` +
            `Their total stack: ${formatEth(player.totalDepositWei)} (~${formatUsd(playerDepositUsd)}). ` +
            `Pot: ${formatEth(totals.totalDepositsWei)} (~${formatUsd(totalDepositsUsd)}).`,
    )
}

function trackRejectedTip(session: Session, userId: string, amountWei: bigint, reason: string, amountUsdCents?: bigint) {
    session.rejectedTips.push({
        userId,
        amountWei,
        amountUsdCents: amountUsdCents ?? weiToUsdCents(amountWei, session.exchangeRate.value),
        receivedAt: new Date(),
        reason,
    })
}

export default createTipHandler
