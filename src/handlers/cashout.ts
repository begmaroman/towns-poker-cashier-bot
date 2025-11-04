import { formatEth, formatUsd, parseUsdAmount, usdCentsToWei, weiToUsdCents } from '../helpers'
import { getSession, setSession } from '../sessionStore'
import { getSessionTotals } from '../sessionUtils'
import { mention } from '../helpers'
import type { SlashCommandHandler } from '../types'

const cashoutHandler: SlashCommandHandler = async (handler, event) => {
    const { channelId, userId, args } = event
    const session = getSession(channelId)

    if (!session) {
        await handler.sendMessage(channelId, 'No session found. Start a new one with `/start <minUSD> <maxUSD>`.')
        return
    }

    const amountInput = args[0]
    if (!amountInput) {
        await handler.sendMessage(channelId, 'Usage: `/cashout <usd>` (example: `/cashout 85` or `/cashout 83.25`).')
        return
    }

    let cashoutUsdCents: bigint
    try {
        cashoutUsdCents = parseUsdAmount(amountInput)
    } catch (error) {
        await handler.sendMessage(channelId, error instanceof Error ? error.message : 'Invalid USD amount supplied.')
        return
    }

    if (cashoutUsdCents < 0n) {
        await handler.sendMessage(channelId, 'Cashout amount must not be negative.')
        return
    }

    const player = session.players.get(userId)
    if (!player) {
        await handler.sendMessage(channelId, 'You did not participate in this session, so there is nothing to cash out.')
        return
    }

    if (player.cashoutWei !== undefined) {
        await handler.sendMessage(channelId, 'Your cashout has already been recorded. Thank you!')
        return
    }

    const cashoutWei = usdCentsToWei(cashoutUsdCents, session.exchangeRate.value)
    if (cashoutWei < 0n) {
        await handler.sendMessage(channelId, 'Cashout amount must not be negative.')
        return
    }

    const depositUsdCents = weiToUsdCents(player.totalDepositWei, session.exchangeRate.value)
    const netUsdCents = cashoutUsdCents - depositUsdCents
    const netWei = cashoutWei - player.totalDepositWei

    const netSummary = netUsdCents === 0n
        ? 'Net result: even.'
        : netUsdCents > 0n
          ? `Net result: profit ${formatUsd(netUsdCents)} (~${formatEth(netWei)}).`
          : `Net result: loss ${formatUsd(-netUsdCents)} (~${formatEth(-netWei)}).`

    let payoutHash: string | undefined
    let payoutError: unknown

    if (cashoutWei > 0n) {
        try {
            const result = await handler.sendTip({
                userId,
                amount: cashoutWei,
                messageId: event.eventId,
                channelId,
                currency: '0x0000000000000000000000000000000000000000'
            })
            payoutHash = result.txHash
        } catch (error) {
            payoutError = error
            player.lastPayoutError = error instanceof Error ? error.message : String(error)
            setSession(channelId, session)
            console.error("Cashout payout error:", { error, userId, cashoutWei, eventId: event.eventId, channelId })
            await handler.sendMessage(
                channelId,
                `${mention(userId)} cash out attempt failed while sending your payout: ${
                    error instanceof Error ? error.message : String(error)
                }. Try running /cashout again once the issue is resolved.`,
            )
            return
        }
    }

    player.cashoutWei = cashoutWei
    player.cashoutUsdCents = cashoutUsdCents
    player.lastPayoutError = undefined
    player.isActive = false
    player.lastActionAt = new Date()

    setSession(channelId, session)

    const totals = getSessionTotals(session)
    const outstandingWei = totals.totalDepositsWei - totals.totalCashoutsWei
    const outstandingUsdCents = weiToUsdCents(outstandingWei, session.exchangeRate.value)

    const payoutNotice = formatPayoutNotice(payoutHash, payoutError)

    await handler.sendMessage(
        channelId,
        `${mention(userId)} cashes out ${formatUsd(cashoutUsdCents)} (~${formatEth(cashoutWei)}).\n\n` +
        `${netSummary}${payoutNotice}\n\n` +
        `Outstanding pot balance: ${formatUsd(outstandingUsdCents)} (~${formatEth(outstandingWei)}).`,
    )
}

export default cashoutHandler

function formatPayoutNotice(payoutHash: string | undefined, payoutError: unknown): string {
    if (payoutHash) {
        return ` Tip sent on\\-chain (tx: ${shortenHash(payoutHash)}).`
    }

    if (payoutError) {
        const message = payoutError instanceof Error ? payoutError.message : String(payoutError)
        return ` Attempted tip transfer failed: ${message}`
    }

    return ''
}

function shortenHash(hash: string): string {
    if (!hash.startsWith('0x') || hash.length <= 18) {
        return hash
    }
    return `${hash.slice(0, 10)}…${hash.slice(-6)}`
}
