import { beforeEach, afterEach, describe, expect, it } from 'bun:test'

import type { BotHandler } from '@towns-protocol/bot'

import commands from '../src/commands'
import { usdCentsToWei } from '../src/helpers'
import cashoutHandler from '../src/handlers/cashout'
import finishHandler from '../src/handlers/finish'
import helpHandler from '../src/handlers/help'
import startHandler from '../src/handlers/start'
import stateHandler from '../src/handlers/state'
import createTipHandler from '../src/handlers/tip'
import { clearSessions, getSession } from '../src/sessionStore'
import { getSessionTotals } from '../src/sessionUtils'
import type { SlashCommandEvent, SlashCommandHandler, TipEvent } from '../src/types'

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
const CHANNEL_ID = 'channel-1'
const SPACE_ID = 'space-1'
const HOST_ID: `0x${string}` = '0x1111111111111111111111111111111111111111'
const PLAYER_A_ID: `0x${string}` = '0x2222222222222222222222222222222222222222'
const PLAYER_B_ID: `0x${string}` = '0x3333333333333333333333333333333333333333'
const BOT_ID: `0x${string}` = '0x4444444444444444444444444444444444444444'

type SentMessage = { channelId: string; message: string }
type TipCall = Parameters<BotHandler['sendTip']>[0]

const commandHandlers: Record<(typeof commands)[number]['name'], SlashCommandHandler> = {
    help: helpHandler,
    start: startHandler,
    state: stateHandler,
    finish: finishHandler,
    cashout: cashoutHandler,
}

let eventCounter = 0
const baseDate = new Date('2024-01-01T00:00:00Z')

function createSlashEvent<TCommand extends (typeof commands)[number]['name']>(
    command: TCommand,
    args: string[],
    userId: `0x${string}`,
): SlashCommandEvent {
    return {
        command,
        args,
        userId,
        channelId: CHANNEL_ID,
        spaceId: SPACE_ID,
        createdAt: new Date(baseDate.getTime()),
        eventId: `${command}-event-${++eventCounter}`,
        mentions: [],
        replyId: undefined,
        threadId: undefined,
    }
}

function createTipEvent(overrides: Partial<TipEvent> = {}): TipEvent {
    return {
        userId: PLAYER_A_ID,
        channelId: CHANNEL_ID,
        spaceId: SPACE_ID,
        createdAt: new Date(baseDate.getTime()),
        eventId: `tip-event-${++eventCounter}`,
        messageId: 'message-1',
        senderAddress: PLAYER_A_ID,
        receiverAddress: BOT_ID,
        receiverUserId: BOT_ID,
        amount: 0n,
        currency: ZERO_ADDRESS,
        ...overrides,
    }
}

function createHandler(): { handler: BotHandler; messages: SentMessage[]; tipCalls: TipCall[] } {
    const messages: SentMessage[] = []
    const tipCalls: TipCall[] = []
    let tipCounter = 0

    const handler = {
        botId: BOT_ID,
        async sendMessage(channelId: string, message: string) {
            messages.push({ channelId, message })
            return { eventId: 'stub', prevMiniblockHash: new Uint8Array() }
        },
        async sendTip(params: TipCall) {
            tipCalls.push(params)
            tipCounter += 1
            return {
                txHash: `0xtx${tipCounter.toString().padStart(4, '0')}`,
                eventId: `tip-${tipCounter}`,
            }
        },
    } as unknown as BotHandler

    return { handler, messages, tipCalls }
}

async function runCommand(
    command: (typeof commands)[number]['name'],
    args: string[],
    userId: `0x${string}`,
    handler: BotHandler,
    messages: SentMessage[],
) {
    const before = messages.length
    const event = createSlashEvent(command, args, userId)
    await commandHandlers[command](handler, event)
    return messages.slice(before).map((m) => m.message)
}

async function sendTip(
    handler: BotHandler,
    messages: SentMessage[],
    overrides: Partial<TipEvent> = {},
) {
    const before = messages.length
    const tipHandler = createTipHandler(BOT_ID)
    await tipHandler(handler, createTipEvent(overrides))
    return messages.slice(before).map((m) => m.message)
}

let originalFetch: typeof globalThis.fetch | undefined

beforeEach(() => {
    clearSessions()
    eventCounter = 0
    originalFetch = globalThis.fetch
    globalThis.fetch = (async () =>
        new Response(JSON.stringify({ ethereum: { usd: 2000 } }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        })) as unknown as typeof globalThis.fetch
})

afterEach(() => {
    clearSessions()
    if (originalFetch) {
        globalThis.fetch = originalFetch
    } else {
        // @ts-expect-error restore to undefined when absent
        delete globalThis.fetch
    }
})

describe('Poker cashier bot e2e coverage', () => {
    it('responds to /help and /state when no session exists', async () => {
        const { handler, messages } = createHandler()

        const [helpMessage] = await runCommand('help', [], HOST_ID, handler, messages)
        expect(helpMessage).toContain('Poker Cashier Bot')

        const [stateMessage] = await runCommand('state', [], HOST_ID, handler, messages)
        expect(stateMessage).toContain('No poker session has been started yet')
    })

    it('supports multi-player lifecycle including mid-game and post-game cashouts', async () => {
        const { handler, messages, tipCalls } = createHandler()

        await runCommand('start', ['20', '200'], HOST_ID, handler, messages)
        const session = getSession(CHANNEL_ID)!
        const rate = session.exchangeRate.value

        // Player A buys in for $20 and tops up $20 (minimum per tip)
        await sendTip(handler, messages, {
            userId: PLAYER_A_ID,
            senderAddress: PLAYER_A_ID,
            amount: usdCentsToWei(2000n, rate),
        })
        await sendTip(handler, messages, {
            userId: PLAYER_A_ID,
            senderAddress: PLAYER_A_ID,
            amount: usdCentsToWei(2000n, rate),
        })

        // Player B buys in for $25
        await sendTip(handler, messages, {
            userId: PLAYER_B_ID,
            senderAddress: PLAYER_B_ID,
            amount: usdCentsToWei(2500n, rate),
        })

        const [stateMessage] = await runCommand('state', [], HOST_ID, handler, messages)
        expect(stateMessage).toContain('Players seated: 2')
        expect(stateMessage).toContain('~USD 40') // Player A total
        expect(stateMessage).toContain('~USD 25') // Player B total
        expect(stateMessage).not.toContain('Ignored Tips')

        const [midGameCashout] = await runCommand('cashout', ['20'], PLAYER_B_ID, handler, messages)
        expect(midGameCashout).toContain('Net result: loss')
        expect(midGameCashout).not.toContain('Tip sent on')

        const [stateAfterCashout] = await runCommand('state', [], HOST_ID, handler, messages)
        expect(stateAfterCashout).toContain('Left table')

        await runCommand('finish', [], HOST_ID, handler, messages)

        const [postFinishTip] = await sendTip(handler, messages, {
            userId: PLAYER_B_ID,
            senderAddress: PLAYER_B_ID,
            amount: usdCentsToWei(2000n, rate),
        })
        expect(postFinishTip).toContain('session is finished')

        const [cashoutA] = await runCommand('cashout', ['45'], PLAYER_A_ID, handler, messages)
        expect(cashoutA).toContain('Net result: profit')
        expect(cashoutA).toContain('Tip sent on\\-chain')

        const [duplicateCashout] = await runCommand('cashout', ['15'], PLAYER_B_ID, handler, messages)
        expect(duplicateCashout).toContain('already been recorded')

        const finalSession = getSession(CHANNEL_ID)!
        const totals = getSessionTotals(finalSession)
        expect(totals.totalDepositsWei).toBe(totals.totalCashoutsWei)

        const [finalState] = await runCommand('state', [], HOST_ID, handler, messages)
        expect(finalState).toContain('Outstanding balance: ETH 0')

        expect(tipCalls).toHaveLength(1)
        expect(tipCalls[0]?.userId).toBe(PLAYER_A_ID)
    })

    it('prevents actions when session state disallows them', async () => {
        const { handler, messages, tipCalls } = createHandler()

        // Cashout before start
        const [cashoutNoSession] = await runCommand('cashout', ['10'], PLAYER_A_ID, handler, messages)
        expect(cashoutNoSession).toContain('No session found')

        await runCommand('start', ['20', '200'], HOST_ID, handler, messages)

        // Cashout without joining should warn
        const [earlyCashout] = await runCommand('cashout', ['10'], PLAYER_A_ID, handler, messages)
        expect(earlyCashout).toContain('did not participate in this session')

        // Start again while active
        const [dupeStart] = await runCommand('start', ['10', '100'], HOST_ID, handler, messages)
        expect(dupeStart).toContain('already active')

        expect(tipCalls).toHaveLength(0)
    })

    it('rejects deposits outside the configured range', async () => {
        const { handler, messages, tipCalls } = createHandler()

        await runCommand('start', ['20', '200'], HOST_ID, handler, messages)
        const session = getSession(CHANNEL_ID)!
        const rate = session.exchangeRate.value

        const [tooSmall] = await sendTip(handler, messages, {
            userId: PLAYER_A_ID,
            senderAddress: PLAYER_A_ID,
            amount: usdCentsToWei(500n, rate),
        })
        expect(tooSmall).toContain('Tip not applied')

        const [tooLarge] = await sendTip(handler, messages, {
            userId: PLAYER_A_ID,
            senderAddress: PLAYER_A_ID,
            amount: usdCentsToWei(25000n, rate),
        })
        expect(tooLarge).toContain('Tip not applied')

        expect(getSession(CHANNEL_ID)!.players.size).toBe(0)
        expect(getSession(CHANNEL_ID)!.rejectedTips).toHaveLength(2)
        expect(tipCalls).toHaveLength(0)
    })
})
