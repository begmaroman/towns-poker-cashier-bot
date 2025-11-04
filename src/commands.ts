import type { PlainMessage, SlashCommand } from '@towns-protocol/proto'

const commands = [
    {
        name: 'help',
        description: 'Show available poker management commands',
    },
    {
        name: 'start',
        description: 'Start a new poker session (provide min/max USD deposit)',
    },
    {
        name: 'deposit',
        description: 'Generate an x402 link for a USD deposit',
    },
    {
        name: 'state',
        description: 'Show the current poker session state',
    },
    {
        name: 'finish',
        description: 'Finish the current poker session',
    },
    {
        name: 'cashout',
        description: 'Report your final stack after the game is finished',
    },
] as const satisfies PlainMessage<SlashCommand>[]

export default commands
