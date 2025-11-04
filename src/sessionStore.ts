import type { Session } from './types'

const sessions = new Map<string, Session>()

export function getSession(channelId: string): Session | undefined {
    return sessions.get(channelId)
}

export function setSession(channelId: string, session: Session): void {
    sessions.set(channelId, session)
}

export function deleteSession(channelId: string): void {
    sessions.delete(channelId)
}

export function hasActiveSession(channelId: string): boolean {
    const session = sessions.get(channelId)
    return Boolean(session && session.status === 'active')
}

export function clearSessions(): void {
    sessions.clear()
}

export function getAllSessions(): IterableIterator<Session> {
    return sessions.values()
}
