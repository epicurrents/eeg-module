/**
 * EpiCurrents EEG module shims.
 * @package    epicurrents/eeg-module
 * @copyright  2020-2024 Sampsa Lohi
 * @license    Apache-2.0
 */

declare module 'd3-interpolate' {
    function interpolateNumber (a: number, b: number): (c: number) => number
    export { interpolateNumber }
}

declare module 'fili' {
    const Fili: unknown
    export default Fili
}
export {}