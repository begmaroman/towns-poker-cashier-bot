import type { BotHandler } from '@towns-protocol/bot'

export type Amount = bigint

export interface PlayerState {
    userId: string
    totalDepositWei: Amount
    cashoutWei?: Amount
    cashoutUsdCents?: bigint
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

export interface SlashCommandEvent {
    channelId: string
    userId: string
    args: string[]
    command: string
    spaceId: string
    eventId: string
    createdAt: Date
    rawMessage: string
}

export interface TipEvent {
    channelId: string
    userId: string
    amount: Amount
    currency: string
    receiverAddress: string
}

export type SlashCommandHandler = (handler: BotHandler, event: SlashCommandEvent) => Promise<void>

export type TipHandler = (handler: BotHandler, event: TipEvent) => Promise<void>
