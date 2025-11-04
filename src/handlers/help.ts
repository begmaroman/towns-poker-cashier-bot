import type { SlashCommandHandler } from '../types'

const helpHandler: SlashCommandHandler = async (handler, { channelId }) => {
    await handler.sendMessage(
        channelId,
        '**Poker Cashier Bot**\n\n' +
            '• `/start minUSD maxUSD` — Host defines the allowed USD tip range\n\n' +
            '• Send tips within the game buy-in range to join or top up\n\n' +
            '• `/state` — Show players, deposits, and pot status\n\n' +
            '• `/finish` — Host ends play; further tips are ignored\n\n' +
            '• `/cashout usd` — Leave at any time by reporting your chip value (ETH payout if up)\n\n',
    )
}

export default helpHandler
