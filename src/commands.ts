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
    {
        name: 'leave',
        description: 'Mark yourself as away from the table',
    },
] as const satisfies PlainMessage<SlashCommand>[]

export default commands
