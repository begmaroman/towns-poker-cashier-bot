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

    if (session.status !== 'finished') {
        await handler.sendMessage(channelId, 'The session is still in progress. Wait for the host to run `/finish` before cashing out.')
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

    if (cashoutUsdCents <= 0n) {
        await handler.sendMessage(channelId, 'Cashout amount must be greater than zero USD.')
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
    if (cashoutWei <= 0n) {
        await handler.sendMessage(channelId, 'Cashout amount is too small after conversion. Use a larger USD value.')
        return
    }

    player.cashoutWei = cashoutWei
    player.cashoutUsdCents = cashoutUsdCents
    player.isActive = false
    player.lastActionAt = new Date()

    setSession(channelId, session)

    const depositUsdCents = weiToUsdCents(player.totalDepositWei, session.exchangeRate.value)
    const netUsdCents = cashoutUsdCents - depositUsdCents
    const netWei = cashoutWei - player.totalDepositWei

    const totals = getSessionTotals(session)
    const outstandingWei = totals.totalDepositsWei - totals.totalCashoutsWei
    const outstandingUsdCents = weiToUsdCents(outstandingWei, session.exchangeRate.value)

    const netSummary = netUsdCents === 0n
        ? 'Net result: even.'
        : netUsdCents > 0n
          ? `Net result: profit ${formatUsd(netUsdCents)} (~${formatEth(netWei)}).`
          : `Net result: loss ${formatUsd(-netUsdCents)} (~${formatEth(-netWei)}).`

    await handler.sendMessage(
        channelId,
        `${mention(userId)} cashes out ${formatUsd(cashoutUsdCents)} (~${formatEth(cashoutWei)}). ${netSummary}\n` +
            `Outstanding pot balance: ${formatUsd(outstandingUsdCents)} (~${formatEth(outstandingWei)}).`,
    )
}

export default cashoutHandler
