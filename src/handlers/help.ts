import type { SlashCommandHandler } from '../types'

const helpHandler: SlashCommandHandler = async (handler, { channelId }) => {
    await handler.sendMessage(
        channelId,
        [
            '**Poker Cashier Bot**',
            '',
            '• `/start <minUSD> <maxUSD>` — Host defines the allowed USD tip range.',
            '• Send ETH tips within that range to join or top up.',
            '• `/state` — Show players, deposits, and pot status.',
            '• `/leave` — Mark yourself away (deposit stays for settlement).',
            '• `/finish` — Host ends play; further tips are ignored.',
            '• `/cashout <usd>` — Report your chip value to settle in ETH.',
        ].join('\n'),
    )
}

export default helpHandler
