import type { SlashCommandHandler } from '../types'

const depositHandler: SlashCommandHandler = async (handler, event) => {
    await handler.sendMessage(
        event.channelId,
        'x402 deposit integration is in progress. Please continue using tips to buy in for now.',
        { replyId: event.eventId, threadId: event.threadId ?? event.eventId },
    )
}

export default depositHandler
