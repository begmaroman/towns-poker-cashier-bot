import { formatEth, formatRate, formatUsd, weiToUsdCents } from './helpers'
import type { PlayerState, Session } from './types'
import { mention } from './helpers'

export interface SessionTotals {
    totalDepositsWei: bigint
    totalCashoutsWei: bigint
    playerCount: number
}

export function getSessionTotals(session: Session): SessionTotals {
    let totalDepositsWei = 0n
    let totalCashoutsWei = 0n

    for (const player of session.players.values()) {
        totalDepositsWei += player.totalDepositWei
        if (player.cashoutWei !== undefined) {
            totalCashoutsWei += player.cashoutWei
        }
    }

    return {
        totalDepositsWei,
        totalCashoutsWei,
        playerCount: session.players.size,
    }
}

export function buildGameStateMessage(session: Session): string {
    const totals = getSessionTotals(session)
    const totalDepositsUsd = weiToUsdCents(totals.totalDepositsWei, session.exchangeRate.value)
    const totalCashoutsUsd = weiToUsdCents(totals.totalCashoutsWei, session.exchangeRate.value)
    const outstandingWei = totals.totalDepositsWei - totals.totalCashoutsWei
    const outstandingUsd = weiToUsdCents(outstandingWei, session.exchangeRate.value)

    const statusLine = session.status === 'active' ? 'In progress' : 'Finished'
    const baseLines = [
        `**Session Status:** ${statusLine}`,
        `• Started by ${mention(session.createdBy)} on ${session.createdAt.toLocaleString()}`,
        `• Buy-in bounds: ${formatUsd(session.minDepositUsdCents)} – ${formatUsd(session.maxDepositUsdCents)} (${formatRate(session.exchangeRate)})`,
        `• Players seated: ${totals.playerCount}`,
        `• Total deposits: ${formatEth(totals.totalDepositsWei)} (~${formatUsd(totalDepositsUsd)})`,
        `• Recorded cashouts: ${formatEth(totals.totalCashoutsWei)} (~${formatUsd(totalCashoutsUsd)})`,
        `• Outstanding balance: ${formatEth(outstandingWei)} (~${formatUsd(outstandingUsd)})`,
    ]

    const players = Array.from(session.players.values()).sort(
        (a, b) => a.joinedAt.getTime() - b.joinedAt.getTime(),
    )

    if (players.length === 0) {
        const rejectedSection = formatRejectedTips(session)
        return baseLines.join('\n\n') + (rejectedSection ? `\n\n${rejectedSection}` : '')
    }

    const playerLines = players.map((player) => formatPlayerLine(player, session))
    const rejectedSection = formatRejectedTips(session)

    return (
        baseLines.join('\n\n') +
        '\n\n**Players:**\n\n' +
        playerLines.join('\n\n') +
        (rejectedSection ? `\n\n${rejectedSection}` : '')
    )
}

export function formatPlayerLine(player: PlayerState, session: Session): string {
    const depositUsd = weiToUsdCents(player.totalDepositWei, session.exchangeRate.value)
    const cashoutUsd = player.cashoutUsdCents !== undefined
        ? player.cashoutUsdCents
        : player.cashoutWei !== undefined
          ? weiToUsdCents(player.cashoutWei, session.exchangeRate.value)
          : undefined

    const status = session.status === 'finished'
        ? player.cashoutWei !== undefined
            ? 'Settled'
            : 'Awaiting cashout'
        : player.isActive
          ? 'Active'
          : 'Left table'

    const cashoutText = player.cashoutWei !== undefined
        ? `${formatUsd(cashoutUsd!)} (~${formatEth(player.cashoutWei)})`
        : session.status === 'finished'
          ? 'Pending'
          : 'N/A'

    let netText = 'Net: pending'
    if (player.cashoutWei !== undefined) {
        const netWei = player.cashoutWei - player.totalDepositWei
        const netUsd = cashoutUsd! - depositUsd
        if (netUsd === 0n) {
            netText = 'Net: even'
        } else if (netUsd > 0n) {
            netText = `Net: profit ${formatUsd(netUsd)} (~${formatEth(netWei)})`
        } else {
            netText = `Net: loss ${formatUsd(-netUsd)} (~${formatEth(-netWei)})`
        }
    }

    return (
        `• ${mention(player.userId)} — ${status} — Deposit: ${formatEth(player.totalDepositWei)} (~${formatUsd(depositUsd)}) — ` +
        `Cashout: ${cashoutText} — ${netText}`
    )
}

export function formatRejectedTips(session: Session): string {
    if (session.rejectedTips.length === 0) {
        return ''
    }

    const lines = session.rejectedTips
        .slice()
        .sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime())
        .map((item) => {
            return `\\- ${mention(item.userId)} — ${formatEth(item.amountWei)} (~${formatUsd(item.amountUsdCents)}) — ${item.reason} (${item.receivedAt.toLocaleString()})`
        })

    return `**Ignored Tips:**\n${lines.join('\n')}`
}
