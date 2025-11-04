import type { SlashCommandHandler } from '../types'

const helpHandler: SlashCommandHandler = async (handler, { channelId }) => {
    await handler.sendMessage(
        channelId,
        '**Poker Cashier Bot**\n\n' +
            '• `/start <minUSD> <maxUSD>` — Host starts a session and sets the per-tip deposit bounds (USD).\n' +
            '• Players send ETH tips within the allowed range; deposits are recorded automatically using the live ETH/USD rate.\n' +
            '• `/state` — View current standings, deposits, and outstanding pot balance.\n' +
            '• `/leave` — Mark yourself as away from the table (deposit stays recorded).\n' +
            '• `/finish` — Host closes the session when play ends (tips blocked).\n' +
            '• `/cashout <usd>` — After finish, report your final stack (USD). The bot converts to ETH and tracks payouts.',
    )
}

export default helpHandler
