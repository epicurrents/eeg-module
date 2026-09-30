/** Stub of the scoped logger. Every level the sources call is present, so a test that reaches a log
 *  line fails on its own assertion rather than on a missing property. */
export const Log = {
    debug: (..._args: any[]) => {},
    error: (..._args: any[]) => {},
    info: (..._args: any[]) => {},
    warn: (..._args: any[]) => {},
}
export default Log
