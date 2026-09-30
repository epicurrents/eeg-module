// Mock of @epicurrents/core/runtime. Only the mutation-logging helper the EEG runtime module reaches
// for is needed; the real one warns through the scoped logger.
import { Log } from '../scoped-event-log'

export const logInvalidMutation = (property: string, value: unknown, scope: string, hint?: string) => {
    Log.warn(`New value '${String(value)}' for property '${property}' is not valid.${hint ? ' ' + hint : ''}`, scope)
}
