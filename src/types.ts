import type { BotEvents, BotHandler } from '@towns-protocol/bot'
import type commands from './commands'

export type Amount = bigint

export interface PlayerState {
    userId: string
    totalDepositWei: Amount
    cashoutWei?: Amount
    cashoutUsdCents?: bigint
    lastPayoutError?: string
    isActive: boolean
    joinedAt: Date
    leftAt?: Date
    lastActionAt: Date
}

export type SessionStatus = 'active' | 'finished'

export interface RejectedTip {
    userId: string
    amountWei: Amount
    amountUsdCents: bigint
    receivedAt: Date
    reason: string
}

export interface Session {
    channelId: string
    createdBy: string
    createdAt: Date
    status: SessionStatus
    minDepositUsdCents: bigint
    maxDepositUsdCents: bigint
    exchangeRate: EthUsdRate
    players: Map<string, PlayerState>
    rejectedTips: RejectedTip[]
    finishedAt?: Date
}

export interface EthUsdRate {
    value: bigint
    fetchedAt: Date
    source: string
}

type Events = BotEvents<typeof commands>

export type SlashCommandEvent = Parameters<Events['slashCommand']>[1]

export type TipEvent = Parameters<Events['tip']>[1]

export type SlashCommandHandler = (handler: BotHandler, event: SlashCommandEvent) => Promise<void>

export type TipHandler = (handler: BotHandler, event: TipEvent) => Promise<void>
