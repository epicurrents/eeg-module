/**
 * EpiCurrents EEG module tests.
 * Due to the high level of integration, tests must be run sequentially.
 * This file describes the testing sequence and runs the appropriate tests.
 * @package    @epicurrents/eeg-module
 * @copyright  2023 Sampsa Lohi
 * @license    Apache-2.0
 */

import { BiosignalChannel, BiosignalHeaderSignal } from '@epicurrents/core/dist/types'
import { EegRecording } from '../src'
import { EegChannel } from './components/EegChannel'
import { GenericBiosignalHeaders } from '@epicurrents/core'

/*
 * Mocks.
 */
type MessageHandler = (msg: MessageEvent<any>) => void
/** A simple worker mock. */
// @ts-ignore
class Worker {
    url: string;
    onmessage: MessageHandler
    constructor(stringUrl: string) {
        this.url = stringUrl
        this.onmessage = (msg: MessageEvent<any>) => {}
    }
    addEventListener (event: string, hander: ((event: any) => void)) {
        // Possible tests for the event listeners?
    }
    dispatchEvent (ev: Event) {
        return true
    }
    onerror () {

    }
    onmessageerror () {

    }
    postMessage(msg: MessageEvent<any>): void {
        this.onmessage(msg)
    }
    removeEventListener (listener: any) {

    }
    terminate () {

    }
}

let HEADER_INDEX = 0

describe('EpiCurrents EEG module tests', () => {
    const channels = [] as BiosignalChannel[]
    var header: GenericBiosignalHeaders
    test("Create a set of EEG channels", () => {
        for (let i=0; i<10; i++) {
            const chan = new EegChannel(`test-${i}`, `Test channel ${i}`, i, i ? [i-1] : [], false, 100, true)
            expect(chan).toBeDefined()
            channels.push(chan)
        }
    })
    test("Create an EEG header record", () => {
        const sigProps = [] as BiosignalHeaderSignal[]
        for (let i=0; i<10; i++) {
            sigProps.push({
                label: `sig-${i}`,
                name: `Signal ${i}`,
                physicalUnit: "uV",
                prefiltering: { highpass: 0, lowpass: 0, notch: 0 },
                sampleCount: 10_000,
                samplingRate: 100,
                sensitivity: 100,
                type: "eeg",
            })
        }
        header = new GenericBiosignalHeaders(
            "eeg",
            `header-${HEADER_INDEX++}`,
            `patient-${HEADER_INDEX}`,
            100,1, 1, 10,
            sigProps
        )
        expect(header).toBeDefined()
    })
    test("Create an EEG resource", () => {
        const resource = new EegRecording(
            'Test recording', channels, header, new Worker("")
        )
        expect(resource).toBeDefined()
    })
})

//const exports = {}
