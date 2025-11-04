import type { SlashCommandHandler } from '../types'

const helpHandler: SlashCommandHandler = async (handler, { channelId }) => {
    await handler.sendMessage(
        channelId,
        '**Poker Cashier Bot**\n\n' +
            '• `/start minUSD maxUSD` — Host defines the allowed USD tip range.\n' +
            '• Send ETH tips within that range to join or top up.\n' +
            '• `/state` — Show players, deposits, and pot status.\n' +
            '• `/leave` — Mark yourself away (deposit stays for settlement).\n' +
            '• `/finish` — Host ends play; further tips are ignored.\n' +
            '• `/cashout usd` — Report your chip value to settle in ETH.\n',
    )
}

export default helpHandler
